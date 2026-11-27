//! Titre court d'une discussion, écrit par le modèle à partir du premier message.

use crate::{App, ollama::Failure, providers};
use axum::{Json, extract::State, http::StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};

const MAX_CHARS: usize = 40;
const INSTRUCTION: &str = "Résume le sujet du message suivant en un titre de 2 à 4 mots, \
    dans la langue du message. Réponds uniquement par le titre, sans guillemets ni point. \
    Ne réponds pas au message.";

#[derive(Deserialize)]
pub struct Request {
    model: String,
    message: String,
}

/// Première ligne utile, sans décoration, et courte.
fn clean(answer: &str) -> String {
    // Certains modèles écrivent d'abord leur réflexion.
    let answer = answer.rsplit("</think>").next().unwrap_or_default();
    let line = answer.lines().map(str::trim).find(|l| !l.is_empty());
    let mut title = line.unwrap_or_default();
    for prefix in ["Titre :", "Titre:", "Title:"] {
        title = title.strip_prefix(prefix).unwrap_or(title);
    }
    let decoration = |c: char| c.is_whitespace() || "\"'«»*#.:`“”".contains(c);
    let title = title.trim_matches(decoration);
    if title.chars().count() <= MAX_CHARS {
        return title.to_string();
    }
    let cut: String = title.chars().take(MAX_CHARS).collect();
    let words = cut.rsplit_once(' ').map_or(cut.as_str(), |(head, _)| head);
    format!("{}…", words.trim_end_matches(decoration))
}

pub async fn write(
    State(app): State<App>,
    Json(request): Json<Request>,
) -> Result<Json<Value>, Failure> {
    // Le début du message suffit à en connaître le sujet.
    let message: String = request.message.chars().take(2000).collect();
    let messages = vec![
        json!({ "role": "system", "content": INSTRUCTION }),
        json!({ "role": "user", "content": message }),
    ];
    let answer = match request.model.strip_prefix(providers::PREFIX) {
        Some(target) => providers::complete(&app, target, messages).await?,
        None => {
            let mut body = json!({
                "model": request.model,
                "messages": messages,
                "stream": false,
                "think": false,
                "options": { "temperature": 0.2, "num_predict": 24 },
            });
            // La même fenêtre que la discussion : sinon Ollama recharge le modèle,
            // et les réponses en cours dans d'autres discussions s'attendent.
            if let Some(context) = app.settings.get().context {
                body["options"]["num_ctx"] = json!(context);
            }
            let url = format!("{}/api/chat", app.config.ollama_url);
            let response: Value = crate::ollama::send(app.http.post(url).json(&body))
                .await?
                .json()
                .await
                .map_err(|e| Failure(StatusCode::BAD_GATEWAY, e.to_string()))?;
            response["message"]["content"]
                .as_str()
                .unwrap_or_default()
                .to_string()
        }
    };
    Ok(Json(json!({ "title": clean(&answer) })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_a_short_bare_title() {
        assert_eq!(
            clean("\n  Titre : « Recette de crêpes. »\nVoici"),
            "Recette de crêpes"
        );
        assert_eq!(
            clean("<think>hmm</think>\n**Panne réseau**"),
            "Panne réseau"
        );
        assert_eq!(clean(""), "");
        let long = clean("Comment installer un serveur domestique avec beaucoup de services");
        assert_eq!(long, "Comment installer un serveur domestique…");
        assert!(clean(&"é".repeat(90)).chars().count() <= MAX_CHARS + 1);
    }
}
