use lucas_core::Config;

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.into())
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let uploads: Option<std::path::PathBuf> = std::env::var_os("LUCAS_UPLOADS_DIR").map(Into::into);
    // `lucas-core sandbox` : le processus isolé qui examine les fichiers joints.
    if std::env::args().nth(1).as_deref() == Some("sandbox") {
        let directory = uploads.ok_or_else(|| std::io::Error::other("LUCAS_UPLOADS_DIR absent"))?;
        return lucas_core::run_sandbox(&directory);
    }
    let config = Config {
        model: env_or("OLLAMA_DEFAULT_MODEL", "llama3.1:8b"),
        ollama_url: env_or("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
            .trim_end_matches('/')
            .to_string(),
        // Défini par l'image Docker, qui monte un volume à cet endroit.
        data: std::env::var_os("LUCAS_DATA_DIR").map(Into::into),
        uploads,
    };
    let addr = env_or("LUCAS_CORE_ADDR", "127.0.0.1:8000");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!("LUCAS écoute sur {addr}");
    axum::serve(listener, lucas_core::router(config))
        .with_graceful_shutdown(shutdown())
        .await
}

/// Attend Ctrl-C ou SIGTERM (envoyé par `docker stop`).
async fn shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        if let Ok(mut term) = signal(SignalKind::terminate()) {
            tokio::select! {
                _ = term.recv() => {}
                _ = tokio::signal::ctrl_c() => {}
            }
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}
