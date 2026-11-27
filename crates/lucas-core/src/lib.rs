//! Cœur de LUCAS : sert l'interface et relaie les demandes vers Ollama.

mod aliases;
mod guard;
mod import;
mod names;
mod ollama;
mod providers;
mod settings;
mod system;
mod title;
mod ui;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    middleware,
    routing::{get, post},
};
use serde_json::{Value, json};

const SERVICE: &str = "LUCAS Core";
const VERSION: &str = env!("CARGO_PKG_VERSION");
/// Tout l'historique est renvoyé à chaque message : la limite par défaut (2 Mo) est trop basse.
const CHAT_LIMIT: usize = 32 * 1024 * 1024;

#[derive(Clone)]
pub struct Config {
    /// Modèle proposé par défaut.
    pub model: String,
    /// Adresse de l'API Ollama, sans barre finale.
    pub ollama_url: String,
    /// Dossier des données (noms d'affichage, réglages, imports) ;
    /// `None` : en mémoire seulement.
    pub data: Option<std::path::PathBuf>,
}

#[derive(Clone)]
struct App {
    config: Config,
    http: reqwest::Client,
    /// Noms en cours d'écriture dans Ollama.
    busy: names::Busy,
    aliases: aliases::Aliases,
    settings: settings::Store,
}

pub fn router(config: Config) -> Router {
    if let Some(data) = &config.data {
        import::clean(data);
    }
    let app = App {
        aliases: aliases::Aliases::load(config.data.as_ref().map(|d| d.join("aliases.json"))),
        settings: settings::Store::load(config.data.as_ref().map(|d| d.join("settings.json"))),
        config,
        busy: names::Busy::default(),
        // Ollama est local : aucun proxy système ne doit s'interposer.
        http: reqwest::Client::builder()
            .no_proxy()
            // Une redirection ne doit pas emmener une clé d'API ailleurs.
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("client HTTP"),
    };
    Router::new()
        .merge(ui::routes())
        .route("/api/health", get(health))
        .route("/api/ready", get(ready))
        .route("/api/models", get(ollama::list).delete(ollama::remove))
        .route("/api/models/pull", post(ollama::pull))
        .route("/api/models/rename", post(ollama::rename))
        .route(
            "/api/models/import",
            post(import::upload).layer(DefaultBodyLimit::disable()),
        )
        .route("/api/settings", get(settings::read).put(settings::write))
        .route("/api/system", get(system::info))
        .route("/api/title", post(title::write))
        .route(
            "/api/chat",
            post(ollama::chat).layer(DefaultBodyLimit::max(CHAT_LIMIT)),
        )
        .layer(middleware::from_fn(guard::local_only))
        .with_state(app)
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": SERVICE, "version": VERSION }))
}

async fn ready(State(app): State<App>) -> Json<Value> {
    Json(json!({ "ready": true, "model": app.config.model }))
}
