//! Modèles servis par des API compatibles OpenAI. Leur identifiant est
//! `@api:<nom de l'API>:<modèle>`.
//! `@` est interdit dans un nom Ollama : aucune confusion possible.

use crate::{
    App,
    ollama::{BLIND_MODEL, BLIND_NOTICE, Failure},
    settings::Provider,
};
use axum::{
    body::Body,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::{StreamExt, future::join_all, stream};
use serde_json::{Value, json};
use std::{convert::Infallible, time::Duration};

pub const PREFIX: &str = "@api:";
const MAX_LINE: usize = 1024 * 1024;

fn with_key(request: reqwest::RequestBuilder, key: &str) -> reqwest::RequestBuilder {
    if key.is_empty() {
        request
    } else {
        request.bearer_auth(key)
    }
}

async fn models_of(app: &App, provider: &Provider) -> Option<Vec<Value>> {
    let request = app
        .http
        .get(format!("{}/models", provider.url))
        .timeout(Duration::from_secs(5));
    let response = with_key(request, &provider.key).send().await.ok()?;
    let body: Value = response.error_for_status().ok()?.json().await.ok()?;
    let name = &provider.name;
    Some(
        body["data"]
            .as_array()?
            .iter()
            .filter_map(|m| m["id"].as_str())
            .map(|id| json!({ "id": format!("{PREFIX}{name}:{id}"), "name": id, "provider": name }))
            .collect(),
    )
}

/// Modèles de toutes les API ; une API injoignable est signalée, pas bloquante.
pub async fn list(app: &App) -> (Vec<Value>, Vec<String>) {
    let providers = app.settings.get().providers;
    let answers = join_all(providers.iter().map(|p| models_of(app, p))).await;
    let (mut models, mut unreachable) = (Vec::new(), Vec::new());
    for (provider, answer) in providers.iter().zip(answers) {
        match answer {
            Some(found) => models.extend(found),
            None => unreachable.push(provider.name.clone()),
        }
    }
    (models, unreachable)
}

/// Réponse entière, sans flux (pour les titres).
pub async fn complete(app: &App, target: &str, messages: Vec<Value>) -> Result<String, Failure> {
    let (provider, model) = resolve(app, target)?;
    let body = json!({ "model": model, "messages": messages, "stream": false });
    let request = app
        .http
        .post(format!("{}/chat/completions", provider.url))
        .timeout(Duration::from_secs(60))
        .json(&body);
    let failed = || {
        let message = format!("L'API {} n'a pas répondu.", provider.name);
        Failure(StatusCode::BAD_GATEWAY, message)
    };
    let response = with_key(request, &provider.key).send().await;
    let response = response.and_then(|r| r.error_for_status());
    let answer: Value = response
        .map_err(|_| failed())?
        .json()
        .await
        .map_err(|_| failed())?;
    let content = answer["choices"][0]["message"]["content"].as_str();
    content.map(str::to_string).ok_or_else(failed)
}

/// Découpe `<api>:<modèle>` et retrouve l'API.
fn resolve<'a>(app: &App, target: &'a str) -> Result<(Provider, &'a str), Failure> {
    let unknown = || {
        Failure(
            StatusCode::NOT_FOUND,
            "Cette API n'est plus configurée.".into(),
        )
    };
    let (name, model) = target.split_once(':').ok_or_else(unknown)?;
    let providers = app.settings.get().providers;
    let provider = providers.into_iter().find(|p| p.name == name);
    Ok((provider.ok_or_else(unknown)?, model))
}

/// Traduit une ligne du flux OpenAI (SSE) en ligne comprise par l'interface.
fn translate(line: &str) -> Option<Value> {
    let data = line.strip_prefix("data:")?.trim();
    if data == "[DONE]" {
        return Some(json!({ "done": true }));
    }
    let value: Value = serde_json::from_str(data).ok()?;
    // Le message d'origine n'est pas relayé : il peut citer la clé.
    if !value["error"].is_null() {
        return Some(json!({ "error": "L'API a signalé une erreur." }));
    }
    let delta = &value["choices"][0]["delta"];
    // Le nom du champ de réflexion varie d'un service à l'autre.
    let thinking = delta["reasoning_content"]
        .as_str()
        .or_else(|| delta["reasoning"].as_str())
        .filter(|text| !text.is_empty());
    let content = delta["content"].as_str();
    match (content, thinking) {
        (None, None) => None,
        (content, None) => Some(json!({ "message": { "content": content } })),
        (content, thinking) => Some(json!({ "message": {
            "content": content.unwrap_or_default(), "thinking": thinking } })),
    }
}

/// Met les images au format OpenAI.
fn with_images(message: &Value) -> Value {
    let Some(images) = message["images"].as_array() else {
        return message.clone();
    };
    let mut parts = vec![json!({ "type": "text", "text": message["content"] })];
    parts.extend(images.iter().filter_map(Value::as_str).map(|data| {
        let url = format!("data:image/jpeg;base64,{data}");
        json!({ "type": "image_url", "image_url": { "url": url } })
    }));
    json!({ "role": message["role"], "content": parts })
}

pub async fn chat(
    app: &App,
    target: &str,
    messages: Vec<Value>,
    temperature: Option<f64>,
) -> Result<Response, Failure> {
    let (provider, model) = resolve(app, target)?;
    let name = &provider.name;

    let pictured = messages.iter().any(|m| m["images"].is_array());
    let shown: Vec<Value> = messages.iter().map(with_images).collect();
    let mut body = json!({ "model": model, "messages": shown, "stream": true });
    if let Some(temperature) = temperature {
        body["temperature"] = json!(temperature);
    }
    let post = |body: &Value| {
        let url = format!("{}/chat/completions", provider.url);
        with_key(app.http.post(url).json(body), &provider.key).send()
    };
    let unreachable = |_| {
        Failure(
            StatusCode::BAD_GATEWAY,
            format!("L'API {name} ne répond pas."),
        )
    };
    let mut response = post(&body).await.map_err(unreachable)?;
    // Un modèle sans vision refuse les images : nouvel essai avec le seul texte.
    let refused = [400, 415, 422].contains(&response.status().as_u16());
    let blind = pictured && refused;
    if blind {
        let plain = messages.iter().map(|m| {
            let mut content = m["content"].as_str().unwrap_or_default().to_string();
            if m["images"].is_array() {
                content = format!("{content}\n\n{BLIND_MODEL}");
            }
            json!({ "role": m["role"], "content": content })
        });
        body["messages"] = plain.collect();
        response = post(&body).await.map_err(unreachable)?;
    }
    if !response.status().is_success() {
        // Le corps n'est pas relayé : certaines API y recopient une partie de la clé.
        let message = format!("L'API {name} a répondu {}.", response.status());
        return Err(Failure(StatusCode::BAD_GATEWAY, message));
    }

    let mut buffer = Vec::new();
    let mut finished = false;
    let mut notice = blind.then(|| format!("{}\n", json!({ "info": BLIND_NOTICE })));
    // `None` marque la fin du flux.
    let chunks = response
        .bytes_stream()
        .map(Some)
        .chain(stream::iter([None]));
    let lines = chunks.map(move |chunk| {
        let mut out = notice.take().unwrap_or_default();
        let end_of_stream = chunk.is_none();
        match chunk {
            Some(Ok(bytes)) => buffer.extend_from_slice(&bytes),
            Some(Err(_)) => buffer.clear(),
            None if !buffer.is_empty() => buffer.push(b'\n'),
            None => {}
        }
        while let Some(end) = buffer.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buffer.drain(..=end).collect();
            if let Some(value) = translate(String::from_utf8_lossy(&line).trim()) {
                finished |= value["done"] == true || !value["error"].is_null();
                out += &format!("{value}\n");
            }
        }
        // Une ligne sans fin ne doit pas remplir la mémoire.
        let too_long = buffer.len() > MAX_LINE;
        if too_long {
            buffer.clear();
        }
        if !finished && (too_long || end_of_stream) {
            finished = true;
            out += &format!("{}\n", json!({ "error": "Réponse de l'API incomplète." }));
        }
        Ok::<_, Infallible>(out)
    });
    Ok((
        [(header::CONTENT_TYPE, "application/x-ndjson")],
        Body::from_stream(lines),
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_reasoning_apart_from_the_answer() {
        let delta = |delta: Value| {
            translate(&format!(
                "data: {}",
                json!({ "choices": [{ "delta": delta }] })
            ))
        };
        for field in ["reasoning_content", "reasoning"] {
            assert_eq!(
                delta(json!({ field: "hmm" })),
                Some(json!({ "message": { "content": "", "thinking": "hmm" } })),
                "{field}"
            );
        }
        assert_eq!(
            delta(json!({ "content": "oui", "reasoning": "" })),
            Some(json!({ "message": { "content": "oui" } }))
        );
        assert_eq!(delta(json!({})), None);
    }
}
