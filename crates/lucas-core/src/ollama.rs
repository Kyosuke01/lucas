//! Relais vers l'API d'Ollama.

use crate::{App, names::canonical};
use axum::{
    Json,
    body::Body,
    extract::State,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub fn busy() -> Failure {
    Failure(
        StatusCode::CONFLICT,
        "Ce modèle est déjà en cours de téléchargement ou de renommage.".into(),
    )
}

/// Erreur renvoyée à l'interface sous la forme `{"error": "..."}`.
pub struct Failure(pub StatusCode, pub String);

impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

/// Envoie la requête et transforme tout échec en `Failure`.
pub async fn send(request: reqwest::RequestBuilder) -> Result<reqwest::Response, Failure> {
    let response = request.send().await.map_err(|_| {
        Failure(
            StatusCode::BAD_GATEWAY,
            "Le moteur de modèles (Ollama) ne répond pas.".into(),
        )
    })?;
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let message = response
        .json::<Value>()
        .await
        .ok()
        .and_then(|body| body["error"].as_str().map(str::to_string))
        .unwrap_or_else(|| format!("Ollama a répondu {status}"));
    Err(Failure(status, message))
}

/// Relaie la réponse d'Ollama au fil de l'eau (une ligne JSON par étape).
/// `held` n'est libéré qu'à la fin (ou à l'abandon) du flux.
fn stream(response: reqwest::Response, held: impl Send + 'static) -> Response {
    (
        [(header::CONTENT_TYPE, "application/x-ndjson")],
        Body::from_stream(response.bytes_stream().map(move |chunk| {
            let _ = &held;
            chunk
        })),
    )
        .into_response()
}

#[derive(Deserialize, Serialize)]
pub struct Model {
    name: String,
    #[serde(default)]
    size: u64,
    /// Nom d'affichage choisi dans LUCAS.
    #[serde(default, skip_deserializing, skip_serializing_if = "Option::is_none")]
    alias: Option<String>,
}

#[derive(Deserialize)]
struct Tags {
    models: Vec<Model>,
}

async fn installed(app: &App) -> Result<Tags, Failure> {
    let url = format!("{}/api/tags", app.config.ollama_url);
    send(app.http.get(url))
        .await?
        .json()
        .await
        .map_err(|e| Failure(StatusCode::BAD_GATEWAY, e.to_string()))
}

pub async fn list(State(app): State<App>) -> Result<Json<Value>, Failure> {
    let (remote, unreachable) = crate::providers::list(&app).await;
    let mut tags = match installed(&app).await {
        Ok(tags) => tags,
        // Ollama arrêté : les modèles des API restent utilisables.
        Err(_) if !remote.is_empty() => Tags { models: Vec::new() },
        Err(failure) => return Err(failure),
    };
    for model in &mut tags.models {
        model.alias = app.aliases.get(&model.name);
    }
    Ok(Json(json!({
        "models": tags.models,
        "default": app.config.model,
        "remote": remote,
        "unreachable": unreachable,
    })))
}

#[derive(Deserialize, Serialize)]
pub struct Target {
    model: String,
}

pub async fn pull(State(app): State<App>, Json(target): Json<Target>) -> Result<Response, Failure> {
    let url = format!("{}/api/pull", app.config.ollama_url);
    let held = app.busy.reserve(&[&target.model]).ok_or_else(busy)?;
    let response = send(app.http.post(url).json(&target)).await?;
    Ok(stream(response, held))
}

pub async fn remove(
    State(app): State<App>,
    Json(target): Json<Target>,
) -> Result<StatusCode, Failure> {
    let url = format!("{}/api/delete", app.config.ollama_url);
    send(app.http.delete(url).json(&target)).await?;
    // Un modèle réinstallé plus tard repart sous son propre nom.
    if let Err(error) = app.aliases.set(&target.model, None) {
        eprintln!("Nom d'affichage non effacé : {error}");
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct Rename {
    model: String,
    name: String,
}

/// `nom` ou `nom:version`. Sans `/`, qui permettrait de désigner un modèle
/// existant sous une autre écriture.
fn valid_name(name: &str) -> bool {
    let mut parts = name.split(':');
    let valid = |part: &str| {
        part.starts_with(|c: char| c.is_ascii_alphanumeric())
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    };
    name.len() <= 80 && parts.by_ref().take(2).all(valid) && parts.next().is_none()
}

/// Le nom est valide et ne désigne aucun modèle installé.
pub async fn check_free(app: &App, name: &str) -> Result<(), Failure> {
    if !valid_name(name) {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "Nom invalide : lettres, chiffres, points, tirets, et au plus un « : ».".into(),
        ));
    }
    let wanted = canonical(name);
    let taken = installed(app).await?.models;
    if taken.iter().any(|m| canonical(&m.name) == wanted) {
        return Err(Failure(
            StatusCode::CONFLICT,
            format!("Un modèle nommé {name} existe déjà."),
        ));
    }
    Ok(())
}

/// Change le nom d'affichage ; rien n'est modifié dans Ollama.
/// Un nom vide, ou égal au nom du modèle, revient à celui-ci.
pub async fn rename(
    State(app): State<App>,
    Json(Rename { model, name }): Json<Rename>,
) -> Result<StatusCode, Failure> {
    let name = name.trim();
    if name.chars().count() > 40 || name.chars().any(char::is_control) {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "Un nom tient en 40 caractères au plus.".into(),
        ));
    }
    let own = name.is_empty() || canonical(name) == canonical(&model);
    app.aliases
        .set(&model, (!own).then_some(name))
        .map_err(|error| {
            let message = format!("Nom non enregistré : {error}");
            Failure(StatusCode::INTERNAL_SERVER_ERROR, message)
        })?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize, Serialize)]
pub struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize)]
pub struct Chat {
    model: String,
    messages: Vec<Message>,
}

pub async fn chat(State(app): State<App>, Json(chat): Json<Chat>) -> Result<Response, Failure> {
    let settings = app.settings.get();
    let mut messages: Vec<Value> = chat.messages.iter().map(|m| json!(m)).collect();
    if !settings.system_prompt.trim().is_empty() {
        let system = json!({ "role": "system", "content": settings.system_prompt });
        messages.insert(0, system);
    }
    if let Some(target) = chat.model.strip_prefix(crate::providers::PREFIX) {
        return crate::providers::chat(&app, target, messages, settings.temperature).await;
    }
    let mut body = json!({ "model": chat.model, "messages": messages });
    if let Some(temperature) = settings.temperature {
        body["options"]["temperature"] = json!(temperature);
    }
    if let Some(context) = settings.context {
        body["options"]["num_ctx"] = json!(context);
    }
    let url = format!("{}/api/chat", app.config.ollama_url);
    Ok(stream(send(app.http.post(url).json(&body)).await?, ()))
}
