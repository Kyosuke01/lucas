//! L'API n'a pas d'authentification : elle ne répond qu'à sa propre page.

use axum::{
    extract::Request,
    http::{HeaderMap, Method, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};

/// Bloque les requêtes venant d'un autre site (CSRF et DNS rebinding).
pub async fn local_only(request: Request, next: Next) -> Response {
    if allowed(request.method(), request.headers()) {
        next.run(request).await
    } else {
        StatusCode::FORBIDDEN.into_response()
    }
}

fn allowed(method: &Method, headers: &HeaderMap) -> bool {
    let text = |name| headers.get(name).map(|v| v.to_str().unwrap_or(""));
    let Some(host) = text(header::HOST) else {
        return false;
    };
    // Le port publié par Docker est libre : seul le nom d'hôte est imposé.
    let name = match host.rsplit_once(':') {
        Some((name, port)) if port.parse::<u16>().is_ok() => name,
        _ => host,
    };
    let local_host = matches!(name, "localhost" | "127.0.0.1" | "[::1]");
    let same_origin = *method == Method::GET
        || text(header::ORIGIN).is_none_or(|o| o.strip_prefix("http://") == Some(host));
    local_host && same_origin
}
