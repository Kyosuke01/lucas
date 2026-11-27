//! Réponses écrites en tâche de fond : elles continuent si la page est rechargée
//! ou fermée, et se relisent depuis le début.

use crate::{App, ollama::Failure};
use axum::{
    body::{Body, Bytes},
    extract::{Path, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::{StreamExt, stream};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    convert::Infallible,
    future::Future,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};
use tokio::{sync::watch, task::AbortHandle};

/// Réponses terminées gardées pour une page qui reviendrait les lire.
const KEEP: usize = 64;
/// Une réponse sans fin ne doit pas remplir la mémoire.
const MAX_OUTPUT: usize = 8 * 1024 * 1024;

#[derive(Default)]
struct Output {
    data: Vec<u8>,
    done: bool,
}

impl Output {
    /// Ajoute une ligne entière, même après un morceau coupé en cours de ligne.
    fn line(&mut self, value: &Value) {
        if self.data.last().is_some_and(|&b| b != b'\n') {
            self.data.push(b'\n');
        }
        self.data.extend_from_slice(format!("{value}\n").as_bytes());
    }
}

struct Job {
    id: String,
    output: watch::Sender<Output>,
    task: Mutex<Option<AbortHandle>>,
}

impl Job {
    /// Rien n'est ajouté à une réponse terminée ou annulée.
    fn update(&self, change: impl FnOnce(&mut Output)) {
        self.output.send_if_modified(|output| {
            let open = !output.done;
            if open {
                change(output);
            }
            open
        });
    }

    fn done(&self) -> bool {
        self.output.borrow().done
    }
}

#[derive(Clone, Default)]
pub struct Jobs(Arc<Mutex<VecDeque<Arc<Job>>>>);

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_".contains(c))
}

impl Jobs {
    fn lock(&self) -> MutexGuard<'_, VecDeque<Arc<Job>>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn find(&self, id: &str) -> Option<Arc<Job>> {
        self.lock().iter().find(|job| job.id == id).cloned()
    }

    /// Lance `work` sans dépendre de la page qui l'a demandé, puis suit sa réponse.
    /// Un identifiant déjà connu n'est pas relancé : on le suit seulement.
    pub fn start(
        &self,
        id: String,
        work: impl Future<Output = Result<Response, Failure>> + Send + 'static,
    ) -> Result<Response, Failure> {
        if !valid_id(&id) {
            let message = "Identifiant de réponse invalide.";
            return Err(Failure(StatusCode::BAD_REQUEST, message.into()));
        }
        let mut jobs = self.lock();
        if let Some(job) = jobs.iter().find(|job| job.id == id) {
            return Ok(follow_job(job));
        }
        let finished = jobs.iter().filter(|job| job.done()).count();
        if finished >= KEEP
            && let Some(oldest) = jobs.iter().position(|job| job.done())
        {
            jobs.remove(oldest);
        }
        let job = Arc::new(Job {
            id,
            output: watch::Sender::default(),
            task: Mutex::default(),
        });
        let response = follow_job(&job);
        let running = job.clone();
        let task = tokio::spawn(async move { produce(&running, work).await });
        *job.task.lock().unwrap_or_else(PoisonError::into_inner) = Some(task.abort_handle());
        jobs.push_back(job);
        Ok(response)
    }
}

async fn produce(job: &Job, work: impl Future<Output = Result<Response, Failure>>) {
    match work.await {
        Ok(response) => {
            let mut chunks = response.into_body().into_data_stream();
            while let Some(chunk) = chunks.next().await {
                let mut stop = false;
                job.update(|output| match &chunk {
                    Ok(bytes) if output.data.len() + bytes.len() <= MAX_OUTPUT => {
                        output.data.extend_from_slice(bytes);
                    }
                    _ => {
                        output.line(&json!({ "error": "La réponse a été interrompue." }));
                        stop = true;
                    }
                });
                if stop {
                    break;
                }
            }
        }
        Err(Failure(_, message)) => job.update(|output| output.line(&json!({ "error": message }))),
    }
    job.update(|output| output.done = true);
}

/// Tout ce qui est déjà écrit, puis la suite au fil de l'eau.
fn follow_job(job: &Job) -> Response {
    let body = stream::unfold(
        (job.output.subscribe(), 0),
        |(mut receiver, offset)| async move {
            loop {
                let (chunk, done) = {
                    let output = receiver.borrow_and_update();
                    let chunk = Bytes::copy_from_slice(&output.data[offset..]);
                    (chunk, output.done)
                };
                if !chunk.is_empty() {
                    let end = offset + chunk.len();
                    return Some((Ok::<_, Infallible>(chunk), (receiver, end)));
                }
                if done || receiver.changed().await.is_err() {
                    return None;
                }
            }
        },
    );
    (
        [(header::CONTENT_TYPE, "application/x-ndjson")],
        Body::from_stream(body),
    )
        .into_response()
}

fn unknown() -> Failure {
    Failure(StatusCode::NOT_FOUND, "Réponse introuvable.".into())
}

pub async fn follow(State(app): State<App>, Path(id): Path<String>) -> Result<Response, Failure> {
    let job = app.jobs.find(&id).ok_or_else(unknown)?;
    Ok(follow_job(&job))
}

/// Arrête l'écriture : le modèle n'est plus sollicité.
pub async fn cancel(State(app): State<App>, Path(id): Path<String>) -> Result<StatusCode, Failure> {
    let job = app.jobs.find(&id).ok_or_else(unknown)?;
    job.update(|output| {
        output.line(&json!({ "cancelled": true }));
        output.done = true;
    });
    let task = job.task.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some(task) = task.as_ref() {
        task.abort();
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn text(response: Response) -> String {
        let body = axum::body::to_bytes(response.into_body(), 2 * MAX_OUTPUT);
        let bytes = tokio::time::timeout(std::time::Duration::from_secs(5), body).await;
        String::from_utf8(bytes.expect("réponse sans fin").unwrap().to_vec()).unwrap()
    }

    fn answer(body: impl Into<Body>) -> Result<Response, Failure> {
        Ok(Response::new(body.into()))
    }

    #[tokio::test]
    async fn bounds_the_size_of_an_answer() {
        let jobs = Jobs::default();
        let chunks = ["début\n".to_string(), "x".repeat(MAX_OUTPUT)];
        let body = Body::from_stream(stream::iter(chunks.map(Ok::<_, Infallible>)));
        let response = jobs.start("a".into(), async move { answer(body) }).unwrap();
        assert_eq!(
            text(response).await,
            "début\n{\"error\":\"La réponse a été interrompue.\"}\n"
        );
    }

    #[tokio::test]
    async fn puts_an_error_on_its_own_line() {
        let jobs = Jobs::default();
        let chunks = [Ok("{\"coup"), Err(std::io::Error::other("coupure"))];
        let body = Body::from_stream(stream::iter(chunks));
        let response = jobs.start("a".into(), async move { answer(body) }).unwrap();
        let received = text(response).await;
        assert!(received.starts_with("{\"coup\n{\"error\""), "{received}");
    }

    #[tokio::test]
    async fn forgets_only_old_finished_answers() {
        let jobs = Jobs::default();
        let running = std::future::pending::<Result<Response, Failure>>();
        jobs.start("en-cours".into(), running).unwrap();
        for index in 0..KEEP + 2 {
            let id = format!("f{index}");
            let response = jobs.start(id, async { answer("ok") }).unwrap();
            text(response).await;
        }
        assert!(jobs.find("en-cours").is_some());
        assert!(jobs.find("f0").is_none());
        assert!(jobs.find(&format!("f{}", KEEP + 1)).is_some());
        assert!(jobs.lock().len() <= KEEP + 2);
        assert!(valid_id(&"a".repeat(64)));
        assert!(!valid_id(&"a".repeat(65)));
        assert!(!valid_id(""));
    }
}
