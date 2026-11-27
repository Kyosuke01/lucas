//! Import d'un fichier de modèle (GGUF) depuis l'ordinateur.

use crate::{App, ollama::Failure};
use axum::{
    body::Body,
    extract::{Query, State},
    http::StatusCode,
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::{fs::File, io::AsyncWriteExt};
use tokio_util::io::ReaderStream;

#[derive(Deserialize)]
pub struct Params {
    name: String,
}

/// Retire les imports interrompus par un arrêt brutal.
pub fn clean(directory: &Path) {
    for entry in std::fs::read_dir(directory).into_iter().flatten().flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("import-") && name.ends_with(".part") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Supprime le fichier temporaire quoi qu'il arrive.
struct Temporary(PathBuf);

impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn failed(error: impl std::fmt::Display) -> Failure {
    Failure(
        StatusCode::INTERNAL_SERVER_ERROR,
        format!("Import impossible : {error}"),
    )
}

/// Écrit le corps sur disque en calculant son empreinte.
async fn receive(body: Body, path: &Path) -> Result<String, Failure> {
    let _ = tokio::fs::remove_file(path).await;
    let mut options = tokio::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(path).await.map_err(failed)?;
    let mut hash = Sha256::new();
    let mut stream = body.into_data_stream();
    let mut header: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(failed)?;
        header.extend(chunk.iter().take(4 - header.len()));
        hash.update(&chunk);
        file.write_all(&chunk).await.map_err(failed)?;
    }
    file.flush().await.map_err(failed)?;
    if header != b"GGUF" {
        let message = "Ce fichier n'est pas un modèle GGUF.";
        return Err(Failure(StatusCode::BAD_REQUEST, message.into()));
    }
    let hex: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
    Ok(format!("sha256:{hex}"))
}

pub async fn upload(
    State(app): State<App>,
    Query(Params { name }): Query<Params>,
    body: Body,
) -> Result<StatusCode, Failure> {
    // Réservé avant de vérifier, pour que rien ne s'intercale.
    let held = app.busy.reserve(&[&name]).ok_or_else(crate::ollama::busy);
    let ready = match held {
        Ok(held) => crate::ollama::check_free(&app, &name).await.map(|()| held),
        Err(failure) => Err(failure),
    };
    let _held = match ready {
        Ok(held) => held,
        // Lire le fichier malgré tout, sinon le navigateur ne voit qu'une coupure.
        Err(failure) => {
            let mut rest = body.into_data_stream();
            while let Some(Ok(_)) = rest.next().await {}
            return Err(failure);
        }
    };
    // Un seul import par nom grâce à la réservation ; le nom est déjà validé.
    let directory = app.config.data.clone().unwrap_or_else(std::env::temp_dir);
    let temporary = Temporary(directory.join(format!(
        "import-{}-{}.part",
        std::process::id(),
        name.replace(':', "_")
    )));
    let digest = receive(body, &temporary.0).await?;

    let file = File::open(&temporary.0).await.map_err(failed)?;
    let length = file.metadata().await.map_err(failed)?.len();
    let url = format!("{}/api/blobs/{digest}", app.config.ollama_url);
    let blob = app
        .http
        .post(url)
        .header("content-length", length)
        .body(reqwest::Body::wrap_stream(ReaderStream::new(file)));
    crate::ollama::send(blob).await?;

    let create = json!({ "model": name, "files": { "model.gguf": digest }, "stream": false });
    let url = format!("{}/api/create", app.config.ollama_url);
    let answer: Value = crate::ollama::send(app.http.post(url).json(&create))
        .await?
        .json()
        .await
        .map_err(failed)?;
    if let Some(error) = answer["error"].as_str() {
        return Err(failed(error));
    }
    // Nouveau contenu : un ancien nom d'affichage ne le concerne pas.
    app.aliases.set(&name, None).map_err(failed)?;
    Ok(StatusCode::NO_CONTENT)
}
