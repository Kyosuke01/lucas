//! Ce que LUCAS voit de la machine. Dans Docker Desktop (macOS, Windows), il
//! s'agit de la machine virtuelle de Docker, pas de tout l'ordinateur.

use crate::App;
use axum::{Json, extract::State};
use serde_json::{Value, json};

/// Valeur en octets d'une ligne de `/proc/meminfo`.
fn bytes(meminfo: &str, key: &str) -> Option<u64> {
    let line = meminfo
        .lines()
        .find_map(|l| l.strip_prefix(key)?.strip_prefix(':'))?;
    let kib: u64 = line.split_whitespace().next()?.parse().ok()?;
    Some(kib * 1024)
}

pub async fn info(State(app): State<App>) -> Json<Value> {
    // Absent hors de Linux : les valeurs restent alors inconnues.
    let meminfo = tokio::fs::read_to_string("/proc/meminfo")
        .await
        .unwrap_or_default();
    // Modèles actuellement chargés en mémoire.
    let url = format!("{}/api/ps", app.config.ollama_url);
    let request = app.http.get(url).timeout(std::time::Duration::from_secs(5));
    let loaded = match request.send().await.and_then(|r| r.error_for_status()) {
        Ok(response) => response.json::<Value>().await.ok(),
        Err(_) => None,
    };
    Json(json!({
        "version": crate::VERSION,
        "ram_total": bytes(&meminfo, "MemTotal"),
        "ram_available": bytes(&meminfo, "MemAvailable"),
        "cpus": std::thread::available_parallelism().map(|n| n.get()).ok(),
        "ollama": loaded.is_some(),
        "loaded": loaded.map(|body| body["models"].clone()),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_meminfo_in_bytes() {
        let text = "MemTotal:       16384 kB\nMemFree: 1 kB\nMemAvailable:    8 kB\n";
        assert_eq!(bytes(text, "MemTotal"), Some(16384 * 1024));
        assert_eq!(bytes(text, "MemAvailable"), Some(8 * 1024));
        assert_eq!(bytes(text, "SwapTotal"), None);
    }
}
