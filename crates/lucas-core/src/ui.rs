//! Interface web, embarquée dans le binaire : aucun fichier à déployer.

use crate::App;
use axum::{Router, http::header, routing::get};

/// Interdit tout chargement hors de LUCAS : l'interface fonctionne hors ligne.
const CSP: &str = "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

pub fn routes() -> Router<App> {
    Router::new()
        .route("/", asset("text/html", include_str!("../ui/index.html")))
        .route("/app.css", asset("text/css", include_str!("../ui/app.css")))
        .route(
            "/app.js",
            asset("text/javascript", include_str!("../ui/app.js")),
        )
        .route(
            "/companion.js",
            asset("text/javascript", include_str!("../ui/companion.js")),
        )
        .route(
            "/favicon.svg",
            asset("image/svg+xml", include_str!("../ui/favicon.svg")),
        )
}

fn asset(kind: &'static str, body: &'static str) -> axum::routing::MethodRouter<App> {
    get(move || async move {
        (
            [
                (header::CONTENT_TYPE, format!("{kind}; charset=utf-8")),
                (header::CONTENT_SECURITY_POLICY, CSP.to_string()),
                (header::CACHE_CONTROL, "no-cache".to_string()),
            ],
            body,
        )
    })
}
