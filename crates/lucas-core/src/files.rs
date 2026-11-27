//! Pièces jointes. LUCAS ne les ouvre jamais : il les écrit sur disque, le bac à
//! sable (`sandbox.rs`) les examine, et seul son rapport revient.

use crate::{
    App,
    ollama::Failure,
    sandbox::{ALIVE, FILE, JOB_PREFIX, REPORT, REQUEST, Report},
};
use axum::{
    Json,
    body::Body,
    extract::{Query, State},
    http::StatusCode,
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::io::AsyncWriteExt;

/// Au-delà, le bac à sable est considéré comme arrêté.
const SILENCE: Duration = Duration::from_secs(20);
/// Durée maximale d'un examen, file d'attente comprise.
const PATIENCE: Duration = Duration::from_secs(30 * 60);
/// Le rapport vient du bac à sable : sa taille est bornée.
const MAX_REPORT: u64 = 256 * 1024;

#[derive(Deserialize)]
pub struct Params {
    name: String,
}

/// Retire les fichiers laissés par un arrêt brutal.
pub fn clean(uploads: &Path) {
    for entry in std::fs::read_dir(uploads).into_iter().flatten().flatten() {
        if entry.file_name().to_string_lossy().starts_with(JOB_PREFIX) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// Efface le fichier reçu quoi qu'il arrive.
struct Temporary(PathBuf);

impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn failed(error: impl std::fmt::Display) -> Failure {
    Failure(
        StatusCode::INTERNAL_SERVER_ERROR,
        format!("Fichier non reçu : {error}"),
    )
}

fn unavailable() -> Failure {
    Failure(
        StatusCode::SERVICE_UNAVAILABLE,
        "Le bac à sable qui examine les fichiers ne répond pas.".into(),
    )
}

fn alive(uploads: &Path) -> bool {
    std::fs::symlink_metadata(uploads.join(ALIVE))
        .and_then(|data| data.modified())
        .is_ok_and(|seen| seen.elapsed().map_or(true, |age| age < SILENCE))
}

fn job_directory(uploads: &Path) -> PathBuf {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let next = NEXT.fetch_add(1, Ordering::Relaxed);
    uploads.join(format!("{JOB_PREFIX}{time}-{next}"))
}

/// Refuse tout fichier déjà là, lien symbolique compris : le dossier est partagé
/// avec le bac à sable, qui pourrait désigner ainsi un fichier de LUCAS.
async fn create(path: &Path) -> Result<tokio::fs::File, Failure> {
    let mut options = tokio::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    options.open(path).await.map_err(failed)
}

/// Écrit le corps sur disque au fil de l'eau, quelle que soit sa taille.
async fn receive(body: Body, path: &Path) -> Result<(), Failure> {
    let mut file = create(path).await?;
    let mut stream = body.into_data_stream();
    while let Some(chunk) = stream.next().await {
        file.write_all(&chunk.map_err(failed)?)
            .await
            .map_err(failed)?;
    }
    file.flush().await.map_err(failed)
}

/// Le bac à sable n'est pas de confiance : un lien symbolique qu'il poserait ne
/// doit pas faire lire un autre fichier, ni un tube nommé bloquer le serveur.
fn read_report(path: &Path) -> Option<Report> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::custom_flags(
        &mut options,
        libc::O_NOFOLLOW | libc::O_NONBLOCK,
    );
    let file = options.open(path).ok()?;
    if !file.metadata().ok()?.is_file() {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(MAX_REPORT).read_to_end(&mut bytes).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub async fn upload(
    State(app): State<App>,
    Query(Params { name }): Query<Params>,
    body: Body,
) -> Result<Json<Report>, Failure> {
    let name: String = name.chars().filter(|c| !c.is_control()).take(200).collect();
    let Some(uploads) = app.config.uploads.clone().filter(|dir| alive(dir)) else {
        // Lire le fichier malgré tout, sinon le navigateur ne voit qu'une coupure.
        let mut rest = body.into_data_stream();
        while let Some(Ok(_)) = rest.next().await {}
        return Err(unavailable());
    };
    let directory = Temporary(job_directory(&uploads));
    tokio::fs::create_dir(&directory.0).await.map_err(failed)?;
    receive(body, &directory.0.join(FILE)).await?;

    // Posée en dernier, d'un coup : le fichier est complet quand elle apparaît.
    let request: Value = json!({ "name": name });
    let temporary = directory.0.join("request.tmp");
    let mut file = create(&temporary).await?;
    file.write_all(request.to_string().as_bytes())
        .await
        .map_err(failed)?;
    file.flush().await.map_err(failed)?;
    tokio::fs::rename(&temporary, directory.0.join(REQUEST))
        .await
        .map_err(failed)?;

    let report = directory.0.join(REPORT);
    let started = Instant::now();
    while started.elapsed() < PATIENCE && alive(&uploads) {
        if tokio::fs::symlink_metadata(&report).await.is_ok() {
            let unreadable = || {
                let message = "Rapport d'examen illisible.";
                Failure(StatusCode::BAD_GATEWAY, message.into())
            };
            return read_report(&report).map(Json).ok_or_else(unreadable);
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    Err(unavailable())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[tokio::test]
    async fn distrusts_what_the_sandbox_leaves() {
        let root = std::env::temp_dir().join(format!("lucas-trap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let real = root.join("real");
        let content = serde_json::to_vec(&Report::default()).unwrap();
        std::fs::write(&real, &content).unwrap();
        assert!(read_report(&real).is_some());

        let link = root.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        assert!(read_report(&link).is_none());
        // Rien n'est écrit à travers un lien.
        assert!(create(&link).await.is_err());
        assert_eq!(std::fs::read(&real).unwrap(), content);

        // Un tube nommé sans écrivain : la lecture rend la main aussitôt.
        let pipe = root.join("pipe");
        let made = std::process::Command::new("mkfifo").arg(&pipe).status();
        assert!(made.unwrap().success());
        assert!(read_report(&pipe).is_none());

        let huge = root.join("huge");
        // Un rapport valide : seule sa taille le fait refuser.
        let mut padded = vec![b' '; MAX_REPORT as usize];
        padded.extend_from_slice(&content);
        std::fs::write(&huge, padded).unwrap();
        assert!(read_report(&huge).is_none());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn keeps_received_files_private_and_only_cleans_its_own() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!("lucas-clean-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("job-1")).unwrap();
        std::fs::create_dir_all(root.join("autre")).unwrap();
        std::fs::write(root.join(ALIVE), "").unwrap();
        create(&root.join("recu")).await.unwrap();
        let mode = std::fs::metadata(root.join("recu")).unwrap().permissions();
        assert_eq!(mode.mode() & 0o077, 0);
        clean(&root);
        assert!(!root.join("job-1").exists());
        for kept in ["autre", ALIVE, "recu"] {
            assert!(root.join(kept).exists(), "{kept}");
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
