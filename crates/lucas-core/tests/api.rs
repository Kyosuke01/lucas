#[allow(dead_code)]
#[path = "../src/persona.rs"]
mod persona;

use axum::{
    Json, Router,
    body::Body,
    http::{Request, StatusCode},
    routing::{delete, get, post},
};
use lucas_core::{Config, router};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

/// Appelle LUCAS comme le ferait sa page, et renvoie statut et corps.
async fn call(ollama_url: &str, request: Request<Body>) -> (StatusCode, String) {
    let config = Config {
        model: "modele-test".into(),
        ollama_url: ollama_url.into(),
        data: None,
        uploads: None,
    };
    let response = router(config).oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

fn request(method: &str, path: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(path)
        .header("host", "localhost:8080")
        .header("origin", "http://localhost:8080")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

/// Adresse où rien n'écoute.
const NOWHERE: &str = "http://127.0.0.1:1";

async fn get_json(path: &str) -> Value {
    let (status, body) = call(NOWHERE, request("GET", path, Value::Null)).await;
    assert_eq!(status, 200);
    serde_json::from_str(&body).unwrap()
}

#[tokio::test]
async fn health_describes_the_service() {
    let expected = json!({
        "status": "ok",
        "service": "LUCAS Core",
        "version": env!("CARGO_PKG_VERSION"),
    });
    assert_eq!(get_json("/api/health").await, expected);
}

#[tokio::test]
async fn ready_exposes_configured_model() {
    let expected = json!({ "ready": true, "model": "modele-test" });
    assert_eq!(get_json("/api/ready").await, expected);
}

#[tokio::test]
async fn serves_the_interface() {
    let config = Config {
        model: "a".into(),
        ollama_url: NOWHERE.into(),
        data: None,
        uploads: None,
    };
    for (path, kind, marker) in [
        ("/", "text/html", "<title>LUCAS</title>"),
        ("/app.css", "text/css", ":root"),
        ("/app.js", "text/javascript", "/api/models"),
        ("/chat.js", "text/javascript", "/api/chat"),
        ("/history.js", "text/javascript", "renderHistory"),
        ("/previews.js", "text/javascript", "indexedDB"),
        ("/attachments.js", "text/javascript", "/api/files"),
        ("/markdown.js", "text/javascript", "const markdown"),
        ("/favicon.svg", "image/svg+xml", "<svg"),
        ("/companion.js", "text/javascript", "companion"),
    ] {
        let response = router(config.clone())
            .oneshot(request("GET", path, Value::Null))
            .await
            .unwrap();
        assert_eq!(response.status(), 200, "{path}");
        let header = |name: &str| response.headers()[name].to_str().unwrap().to_string();
        assert_eq!(header("content-type"), format!("{kind}; charset=utf-8"));
        assert_eq!(header("cache-control"), "no-cache");
        assert_eq!(
            header("content-security-policy"),
            "default-src 'self'; img-src 'self' blob:; media-src 'self' blob:; \
             frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        );
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        assert!(String::from_utf8_lossy(&bytes).contains(marker), "{path}");
    }
}

/// Statut obtenu avec ces en-têtes.
async fn guarded(method: &str, path: &str, host: Option<&str>, origin: Option<&str>) -> u16 {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if let Some(host) = host {
        builder = builder.header("host", host);
    }
    if let Some(origin) = origin {
        builder = builder.header("origin", origin);
    }
    let body = r#"{"model":"a","messages":[]}"#;
    let (status, _) = call(NOWHERE, builder.body(Body::from(body)).unwrap()).await;
    status.as_u16()
}

#[tokio::test]
async fn every_route_is_guarded() {
    for (method, path) in [
        ("GET", "/"),
        ("GET", "/app.js"),
        ("GET", "/chat.js"),
        ("GET", "/history.js"),
        ("GET", "/attachments.js"),
        ("GET", "/markdown.js"),
        ("GET", "/app.css"),
        ("GET", "/favicon.svg"),
        ("GET", "/companion.js"),
        ("GET", "/api/health"),
        ("GET", "/api/ready"),
        ("GET", "/api/models"),
        ("DELETE", "/api/models"),
        ("POST", "/api/models/pull"),
        ("POST", "/api/models/rename"),
        ("POST", "/api/models/import?name=a"),
        ("GET", "/api/settings"),
        ("PUT", "/api/settings"),
        ("GET", "/api/system"),
        ("POST", "/api/title"),
        ("POST", "/api/chat"),
        ("GET", "/api/chat/a"),
        ("DELETE", "/api/chat/a"),
        ("POST", "/api/files?name=a"),
    ] {
        let foreign_host = guarded(method, path, Some("evil.example"), None).await;
        assert_eq!(foreign_host, 403, "{method} {path}");
        if method != "GET" {
            let origin = Some("https://evil.example");
            let foreign_origin = guarded(method, path, Some("localhost:8080"), origin).await;
            assert_eq!(foreign_origin, 403, "{method} {path}");
        }
    }
}

#[tokio::test]
async fn accepts_only_local_hosts() {
    for host in ["localhost", "localhost:8080", "127.0.0.1:9", "[::1]:8080"] {
        let status = guarded("GET", "/api/health", Some(host), None).await;
        assert_eq!(status, 200, "{host}");
    }
    for host in [
        "localhost.attacker.test",
        "127.0.0.1.attacker.test:8080",
        "localhost:abc",
        "0.0.0.0:8080",
    ] {
        let status = guarded("GET", "/api/health", Some(host), None).await;
        assert_eq!(status, 403, "{host}");
    }
    assert_eq!(guarded("GET", "/api/health", None, None).await, 403);
}

#[tokio::test]
async fn writes_require_the_same_origin() {
    let host = Some("localhost:8080");
    for method in ["POST", "DELETE"] {
        let path = if method == "POST" {
            "/api/chat"
        } else {
            "/api/models"
        };
        // Acceptée par la garde, la requête échoue ensuite faute d'Ollama.
        for origin in [None, Some("http://localhost:8080")] {
            assert_eq!(guarded(method, path, host, origin).await, 502, "{origin:?}");
        }
        for origin in [
            "https://localhost:8080",
            "localhost:8080",
            "http://localhost:9999",
            "http://localhost:8080.attacker.test",
            "null",
        ] {
            let status = guarded(method, path, host, Some(origin)).await;
            assert_eq!(status, 403, "{method} {origin}");
        }
    }
}

#[tokio::test]
async fn explains_when_ollama_is_down() {
    let (status, body) = call(NOWHERE, request("GET", "/api/models", Value::Null)).await;
    assert_eq!(status, 502);
    assert!(body.contains("ne répond pas"));
}

async fn echo(route: &str, body: String) -> String {
    format!("{route} {body}")
}

/// Faux Ollama qui renvoie ce qu'il reçoit.
async fn fake_ollama() -> String {
    let app = Router::new()
        .route(
            "/api/tags",
            get(|| async {
                Json(json!({ "models": [{ "name": "a:1b", "size": 5, "x": 1 }, { "name": "b" }] }))
            }),
        )
        .route("/api/chat", post(|body: String| echo("chat", body)))
        .route("/api/pull", post(|body: String| echo("pull", body)))
        .route(
            "/api/delete",
            delete(|Json(body): Json<Value>| async move {
                if body["model"] == "a:1b" {
                    (StatusCode::OK, Json(json!({})))
                } else {
                    (StatusCode::NOT_FOUND, Json(json!({ "error": "inconnu" })))
                }
            }),
        )
        // La limite à tester est celle de LUCAS, pas celle du faux.
        .layer(axum::extract::DefaultBodyLimit::disable());
    serve(app).await
}

/// Sert `app` sur un port local libre et renvoie son adresse.
async fn serve(app: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await });
    url
}

#[tokio::test]
async fn lists_models_with_default() {
    let url = fake_ollama().await;
    let (status, body) = call(&url, request("GET", "/api/models", Value::Null)).await;
    assert_eq!(status, 200);
    let expected = json!({
        "models": [{ "name": "a:1b", "size": 5 }, { "name": "b", "size": 0 }],
        "default": "modele-test",
        "remote": [],
        "unreachable": [],
    });
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap(), expected);
}

#[tokio::test]
async fn forwards_chat_and_pull() {
    let url = fake_ollama().await;
    let chat = json!({ "model": "a:1b", "messages": [
        { "role": "user", "content": "salut" },
        { "role": "assistant", "content": "bonjour" },
        { "role": "user", "content": "encore" },
    ] });
    for (path, route, sent) in [
        ("/api/chat", "chat", chat),
        ("/api/models/pull", "pull", json!({ "model": "b" })),
    ] {
        let config = Config {
            model: "a".into(),
            ollama_url: url.clone(),
            data: None,
            uploads: None,
        };
        let response = router(config)
            .oneshot(request("POST", path, sent.clone()))
            .await
            .unwrap();
        assert_eq!(response.status(), 200, "{path}");
        assert_eq!(response.headers()["content-type"], "application/x-ndjson");
        let bytes = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap();
        let text = String::from_utf8_lossy(&bytes);
        let (reached, body) = text.split_once(' ').unwrap();
        assert_eq!(reached, route, "{path}");
        let mut received = serde_json::from_str::<Value>(body).unwrap();
        // La conversation arrive précédée du caractère de LUCAS, et de lui seul.
        if let Some(messages) = received.get_mut("messages").and_then(Value::as_array_mut) {
            let system = messages.remove(0);
            assert_eq!(system["role"], "system");
            assert_eq!(system["content"], persona::PERSONA);
        }
        assert_eq!(received, sent, "{path}");
    }
}

/// Faux Ollama défaillant : réponse illisible, ou erreur sans message.
#[tokio::test]
async fn reports_a_misbehaving_ollama() {
    let app = Router::new()
        .route("/api/tags", get(|| async { "pas du JSON" }))
        .route(
            "/api/chat",
            post(|| async { StatusCode::INTERNAL_SERVER_ERROR }),
        );
    let url = serve(app).await;

    let (status, _) = call(&url, request("GET", "/api/models", Value::Null)).await;
    assert_eq!(status, 502);

    let chat = json!({ "model": "a", "messages": [] });
    let (status, body) = call(&url, request("POST", "/api/chat", chat)).await;
    assert_eq!(status, 500);
    assert!(body.contains("Ollama a répondu 500"), "{body}");
}

#[tokio::test]
async fn removes_a_model_and_reports_errors() {
    let url = fake_ollama().await;
    let remove = |name: &str| request("DELETE", "/api/models", json!({ "model": name }));
    assert_eq!(call(&url, remove("a:1b")).await.0, 204);
    let (status, body) = call(&url, remove("z")).await;
    assert_eq!(status, 404);
    assert_eq!(body, r#"{"error":"inconnu"}"#);
}

#[tokio::test]
async fn limits_the_size_of_a_conversation() {
    let url = fake_ollama().await;
    for (megabytes, expected) in [(31, 200), (33, 413)] {
        let content = "a".repeat(megabytes * 1024 * 1024);
        let chat = json!({ "model": "a", "messages": [{ "role": "user", "content": content }] });
        let config = Config {
            model: "a".into(),
            ollama_url: url.clone(),
            data: None,
            uploads: None,
        };
        let response = router(config)
            .oneshot(request("POST", "/api/chat", chat))
            .await
            .unwrap();
        assert_eq!(response.status(), expected, "{megabytes} Mo");
    }
}

fn temporary_data(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("lucas-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// Application de test dont les réglages persistent dans `data`.
fn app_with(ollama_url: &str, data: Option<std::path::PathBuf>) -> Router {
    router(Config {
        model: "a".into(),
        ollama_url: ollama_url.into(),
        data,
        uploads: None,
    })
}

async fn run(app: &Router, request: Request<Body>) -> (StatusCode, String) {
    // Un défaut doit faire échouer le test, pas le bloquer.
    let answer = async {
        let response = app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        (status, String::from_utf8(bytes.to_vec()).unwrap())
    };
    tokio::time::timeout(std::time::Duration::from_secs(10), answer)
        .await
        .expect("pas de réponse")
}

/// Fausse API compatible OpenAI, qui note ce qu'elle reçoit.
async fn fake_api() -> (String, Arc<Mutex<Vec<(String, String)>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    let app = Router::new()
        .route(
            "/models",
            get(|| async { Json(json!({ "data": [{ "id": "grand:v2" }] })) }),
        )
        .route(
            "/chat/completions",
            post(
                move |headers: axum::http::HeaderMap, body: String| async move {
                    let auth = headers
                        .get("authorization")
                        .map(|v| v.to_str().unwrap().to_string())
                        .unwrap_or_default();
                    log.lock().unwrap().push((auth, body));
                    "data: {\"choices\":[{\"delta\":{\"content\":\"sal\"}}]}\n\n\
                 data: {\"choices\":[{\"delta\":{\"content\":\"ut\"}}]}\n\ndata: [DONE]\n\n"
                },
            ),
        );
    (serve(app).await, seen)
}

#[tokio::test]
async fn uses_an_external_api_without_exposing_its_key() {
    let (api, seen) = fake_api().await;
    let data = temporary_data("api");
    let app = app_with(NOWHERE, Some(data.clone()));
    let settings = |url: &str, key: &str| {
        json!({ "system_prompt": "Sois bref.", "temperature": 0.5,
                "providers": [{ "name": "perso", "url": url, "key": key }] })
    };
    let put = |body: Value| request("PUT", "/api/settings", body);

    let (status, text) = run(&app, put(settings(&api, "secret-123"))).await;
    assert_eq!(status, 200);
    assert!(!text.contains("secret-123"), "{text}");
    assert!(text.contains("\"has_key\":true"), "{text}");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(data.join("settings.json"))
            .unwrap()
            .permissions();
        assert_eq!(mode.mode() & 0o777, 0o600);
    }

    // Ollama est arrêté : les modèles de l'API restent proposés.
    let (_, models) = run(&app, request("GET", "/api/models", Value::Null)).await;
    assert!(models.contains("@api:perso:grand:v2"), "{models}");

    let chat = json!({ "model": "@api:perso:grand:v2",
                       "messages": [{ "role": "user", "content": "hello" }] });
    let (_, answer) = run(&app, request("POST", "/api/chat", chat.clone())).await;
    assert_eq!(
        answer,
        "{\"message\":{\"content\":\"sal\"}}\n{\"message\":{\"content\":\"ut\"}}\n{\"done\":true}\n"
    );
    let (auth, body) = seen.lock().unwrap()[0].clone();
    assert_eq!(auth, "Bearer secret-123");
    let body: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(body["model"], "grand:v2");
    assert_eq!(body["temperature"], 0.5);
    assert_eq!(body["messages"][0]["role"], "system");
    let expected = format!(
        "{}\n\nPréférences de la personne, prioritaires sur ton style :\nSois bref.",
        persona::PERSONA
    );
    assert_eq!(body["messages"][0]["content"], expected);
    assert_eq!(body["messages"].as_array().unwrap().len(), 2);

    // Clé non ressaisie : conservée après redémarrage pour la même adresse...
    let app = app_with(NOWHERE, Some(data.clone()));
    let (_, kept) = run(&app, put(settings(&api, ""))).await;
    assert!(kept.contains("\"has_key\":true"), "{kept}");
    // ... mais jamais reportée vers une autre.
    let (_, moved) = run(&app, put(settings("http://ailleurs.invalid", ""))).await;
    assert!(moved.contains("\"has_key\":false"), "{moved}");
    std::fs::remove_dir_all(data).unwrap();
}

#[tokio::test]
async fn refuses_invalid_settings() {
    let app = app_with(NOWHERE, None);
    let provider = |name: &str, url: &str| json!({ "name": name, "url": url });
    for body in [
        json!({ "temperature": 3 }),
        json!({ "context": 10 }),
        json!({ "providers": [provider("a:b", "http://x")] }),
        json!({ "providers": [provider("a", "file:///etc/passwd")] }),
        json!({ "providers": [provider("a", "https://moi:secret@hote/v1")] }),
        json!({ "providers": [{ "name": "a", "url": "http://api.exemple.test", "key": "k" }] }),
        json!({ "providers": [provider("a", "http://x"), provider("a", "http://y")] }),
    ] {
        let (status, _) = run(&app, request("PUT", "/api/settings", body.clone())).await;
        assert_eq!(status, 400, "{body}");
    }
}

#[tokio::test]
async fn applies_settings_to_local_models() {
    let url = fake_ollama().await;
    let app = app_with(&url, None);
    let body = json!({ "temperature": 0.2, "context": 4096 });
    run(&app, request("PUT", "/api/settings", body)).await;
    let chat = json!({ "model": "a:1b", "messages": [] });
    let (_, text) = run(&app, request("POST", "/api/chat", chat)).await;
    let sent: Value = serde_json::from_str(text.split_once(' ').unwrap().1).unwrap();
    assert_eq!(
        sent["options"],
        json!({ "temperature": 0.2, "num_ctx": 4096 })
    );
}

#[tokio::test]
async fn imports_a_gguf_file() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let (blobs, creations) = (calls.clone(), calls.clone());
    let ollama =
        Router::new()
            .route(
                "/api/tags",
                get(|| async { Json(json!({ "models": [{ "name": "pris" }] })) }),
            )
            .route(
                "/api/blobs/{digest}",
                post(
                    move |axum::extract::Path(digest): axum::extract::Path<String>,
                          body: String| async move {
                        blobs.lock().unwrap().push(format!("{digest} {body}"));
                    },
                ),
            )
            .route(
                "/api/create",
                post(move |Json(body): Json<Value>| async move {
                    creations.lock().unwrap().push(body.to_string());
                    Json(json!({ "status": "success" }))
                }),
            );
    let url = serve(ollama).await;
    let data = temporary_data("import");
    let app = app_with(&url, Some(data.clone()));
    let import = |name: &str, content: &'static str| {
        Request::post(format!("/api/models/import?name={name}"))
            .header("host", "localhost:8080")
            .header("content-type", "application/octet-stream")
            .body(Body::from(content))
            .unwrap()
    };

    assert_eq!(run(&app, import("pris", "GGUF")).await.0, 409);
    assert_eq!(run(&app, import("a/b", "GGUF")).await.0, 400);
    assert_eq!(run(&app, import("neuf", "PAS un modele")).await.0, 400);
    assert!(calls.lock().unwrap().is_empty());

    assert_eq!(run(&app, import("neuf", "GGUFdata")).await.0, 204);
    let calls = calls.lock().unwrap();
    assert!(calls[0].starts_with("sha256:"), "{}", calls[0]);
    assert!(calls[0].ends_with(" GGUFdata"));
    let digest = calls[0].split(' ').next().unwrap();
    assert!(calls[1].contains(digest) && calls[1].contains("neuf"));
    // Aucun fichier temporaire ne reste.
    assert_eq!(std::fs::read_dir(&data).unwrap().count(), 0);
    std::fs::remove_dir_all(data).unwrap();
}

#[tokio::test]
async fn settings_limits_are_exact() {
    let app = app_with(NOWHERE, None);
    let named = |name: &str| json!({ "providers": [{ "name": name, "url": "https://x.test/v1" }] });
    let accepted = [
        json!({ "temperature": 0, "context": 512 }),
        json!({ "temperature": 2, "context": 1_000_000 }),
        named("a-b_c"),
        named(&"a".repeat(40)),
    ];
    let refused = [
        json!({ "temperature": -0.1 }),
        json!({ "temperature": 2.1 }),
        json!({ "context": 511 }),
        json!({ "context": 1_000_001 }),
        named(""),
        named(&"a".repeat(41)),
    ];
    for (bodies, expected) in [(&accepted[..], 200), (&refused[..], 400)] {
        for body in bodies {
            let (status, _) = run(&app, request("PUT", "/api/settings", body.clone())).await;
            assert_eq!(status, expected, "{body}");
        }
    }
}

#[tokio::test]
async fn returns_the_saved_settings_exactly() {
    let app = app_with(NOWHERE, None);
    let body = json!({
        "system_prompt": "Bref.", "temperature": 0.5, "context": 2048,
        "providers": [{ "name": "a", "url": " https://x.test/v1/ " }],
    });
    run(&app, request("PUT", "/api/settings", body)).await;
    let (_, text) = run(&app, request("GET", "/api/settings", Value::Null)).await;
    let expected = json!({
        "system_prompt": "Bref.", "temperature": 0.5, "context": 2048,
        "providers": [{ "name": "a", "url": "https://x.test/v1", "has_key": false }],
    });
    assert_eq!(serde_json::from_str::<Value>(&text).unwrap(), expected);
}

/// Renommer ne touche pas à Ollama : seuls la liste et la suppression y vont.
#[tokio::test]
async fn a_rename_only_changes_the_displayed_name() {
    let ollama = Router::new()
        .route(
            "/api/tags",
            get(|| async { Json(json!({ "models": [{ "name": "a:1b" }] })) }),
        )
        .route("/api/delete", delete(|| async {}));
    let url = serve(ollama).await;
    let data = temporary_data("alias");
    // Chaque appel repart d'une application neuve, comme après un redémarrage.
    let send = |method: &'static str, path: &'static str, body: Value| {
        let app = app_with(&url, Some(data.clone()));
        async move { run(&app, request(method, path, body)).await }
    };
    let rename = |name: &str| {
        let body = json!({ "model": "a:1b", "name": name });
        send("POST", "/api/models/rename", body)
    };
    let listed = || async {
        let (_, text) = send("GET", "/api/models", Value::Null).await;
        let model = serde_json::from_str::<Value>(&text).unwrap()["models"][0].clone();
        (model["name"].clone(), model["alias"].clone())
    };

    assert_eq!(rename("  Jarvis, l'assistant ").await.0, 204);
    assert_eq!(
        listed().await,
        (json!("a:1b"), json!("Jarvis, l'assistant"))
    );

    for refused in ["a".repeat(41), "a\nb".into()] {
        assert_eq!(rename(&refused).await.0, 400, "{refused:?}");
    }
    assert_eq!(listed().await.1, "Jarvis, l'assistant");
    assert_eq!(rename(&"é".repeat(40)).await.0, 204);

    // Champ vide ou nom du modèle : retour au nom d'origine.
    for own in ["", "A:1B"] {
        rename("Jarvis").await;
        assert_eq!(rename(own).await.0, 204);
        assert_eq!(listed().await.1, Value::Null, "{own:?}");
    }

    rename("Jarvis").await;
    send("DELETE", "/api/models", json!({ "model": "a:1b" })).await;
    assert_eq!(listed().await.1, Value::Null);
    std::fs::remove_dir_all(data).unwrap();
}

#[tokio::test]
async fn writes_a_title_with_the_chosen_model() {
    let seen = Arc::new(Mutex::new(Value::Null));
    let log = seen.clone();
    let ollama = Router::new().route(
        "/api/chat",
        post(move |Json(body): Json<Value>| async move {
            *log.lock().unwrap() = body;
            Json(json!({ "message": { "content": "\"Crêpes bretonnes.\"" } }))
        }),
    );
    let url = serve(ollama).await;
    let body = json!({ "model": "a:1b", "message": "x".repeat(5000) });
    let (status, text) = call(&url, request("POST", "/api/title", body)).await;
    assert_eq!(status, 200);
    assert_eq!(text, r#"{"title":"Crêpes bretonnes"}"#);
    let sent = seen.lock().unwrap().clone();
    assert_eq!(sent["model"], "a:1b");
    assert_eq!(sent["stream"], false);
    assert_eq!(sent["messages"][1]["content"].as_str().unwrap().len(), 2000);
}

/// Faux Ollama qui écrit un premier morceau, puis attend qu'on le libère.
async fn slow_ollama() -> (String, Arc<tokio::sync::Notify>, Arc<Mutex<Vec<Value>>>) {
    let release = Arc::new(tokio::sync::Notify::new());
    let seen = Arc::new(Mutex::new(Vec::new()));
    let (gate, log) = (release.clone(), seen.clone());
    let app = Router::new().route(
        "/api/chat",
        post(move |Json(body): Json<Value>| async move {
            log.lock().unwrap().push(body);
            let parts = futures_util::stream::unfold(0, move |step| {
                let gate = gate.clone();
                async move {
                    let part = match step {
                        0 => "{\"message\":{\"content\":\"un\"}}\n",
                        1 => {
                            gate.notified().await;
                            "{\"message\":{\"content\":\"deux\"},\"done\":true}\n"
                        }
                        _ => return None,
                    };
                    Some((Ok::<_, std::convert::Infallible>(part), step + 1))
                }
            });
            Body::from_stream(parts)
        }),
    );
    (serve(app).await, release, seen)
}

const FIRST: &str = "{\"message\":{\"content\":\"un\"}}\n";
const SECOND: &str = "{\"message\":{\"content\":\"deux\"},\"done\":true}\n";

fn detached(id: &str) -> Request<Body> {
    let body =
        json!({ "id": id, "model": "a", "messages": [{ "role": "user", "content": "salut" }] });
    request("POST", "/api/chat", body)
}

/// Lit le corps jusqu'à y trouver `until`.
async fn read_until(body: &mut Body, until: &str) -> String {
    use http_body_util::BodyExt;
    let mut text = String::new();
    while !text.contains(until) {
        let frame = tokio::time::timeout(std::time::Duration::from_secs(5), body.frame()).await;
        let frame = frame.expect("rien reçu").expect("flux terminé").unwrap();
        text += &String::from_utf8_lossy(frame.data_ref().unwrap());
    }
    text
}

#[tokio::test]
async fn keeps_writing_after_the_page_leaves() {
    let (url, release, seen) = slow_ollama().await;
    let app = app_with(&url, None);
    let mut body = app
        .clone()
        .oneshot(detached("r1"))
        .await
        .unwrap()
        .into_body();
    assert_eq!(read_until(&mut body, "un").await, FIRST);
    // La page est rechargée : sa connexion disparaît en pleine réponse.
    drop(body);
    release.notify_one();
    let follow = || request("GET", "/api/chat/r1", Value::Null);
    let (status, text) = run(&app, follow()).await;
    assert_eq!(status, 200);
    assert_eq!(text, format!("{FIRST}{SECOND}"));
    // Relue autant qu'on veut, et jamais redemandée au modèle.
    assert_eq!(run(&app, detached("r1")).await.1, text);
    assert_eq!(run(&app, follow()).await.1, text);
    assert_eq!(seen.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn cancels_a_detached_answer() {
    let (url, release, _) = slow_ollama().await;
    let app = app_with(&url, None);
    let mut body = app
        .clone()
        .oneshot(detached("r2"))
        .await
        .unwrap()
        .into_body();
    read_until(&mut body, "un").await;
    let cancel = request("DELETE", "/api/chat/r2", Value::Null);
    assert_eq!(run(&app, cancel).await.0, 204);
    assert_eq!(
        read_until(&mut body, "cancelled").await,
        "{\"cancelled\":true}\n"
    );
    // Le modèle n'est plus écouté : sa connexion est fermée.
    let dropped = async {
        while Arc::strong_count(&release) > 2 {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    };
    tokio::time::timeout(std::time::Duration::from_secs(5), dropped)
        .await
        .expect("le modèle est encore sollicité");
    let (_, text) = run(&app, request("GET", "/api/chat/r2", Value::Null)).await;
    assert_eq!(text, format!("{FIRST}{{\"cancelled\":true}}\n"));
}

#[tokio::test]
async fn reports_failures_of_detached_answers() {
    let app = app_with(NOWHERE, None);
    let (status, text) = run(&app, detached("r3")).await;
    assert_eq!(status, 200);
    assert!(
        text.contains("\"error\"") && text.contains("ne répond pas"),
        "{text}"
    );
    assert_eq!(run(&app, detached("../x")).await.0, 400);
    for method in ["GET", "DELETE"] {
        let unknown = request(method, "/api/chat/inconnu", Value::Null);
        assert_eq!(run(&app, unknown).await.0, 404, "{method}");
    }
}

#[tokio::test]
async fn compacts_without_the_persona() {
    let (url, release, seen) = slow_ollama().await;
    release.notify_one();
    let app = app_with(&url, None);
    run(
        &app,
        request(
            "PUT",
            "/api/settings",
            json!({ "system_prompt": "Sois X." }),
        ),
    )
    .await;
    let body = json!({ "model": "a", "compact": true, "messages": [
        { "role": "user", "content": "Je m'appelle Zoé." },
        { "role": "assistant", "content": "Enchanté." },
        { "role": "system", "content": "Note." },
        { "role": "user", "content": "é".repeat(30_000) },
    ] });
    let (status, _) = run(&app, request("POST", "/api/chat", body)).await;
    assert_eq!(status, 200);
    let sent = seen.lock().unwrap()[0].clone();
    let system = sent["messages"][0]["content"].as_str().unwrap();
    assert!(system.starts_with("Tu résumes"), "{system}");
    assert!(!system.contains("Sois X"));
    assert_eq!(sent["messages"].as_array().unwrap().len(), 2);
    let transcript = sent["messages"][1]["content"].as_str().unwrap();
    assert!(transcript.starts_with("Personne : Je m'appelle Zoé.\n\nLUCAS : Enchanté."));
    assert!(transcript.contains("\n\nContexte : Note.\n\n"));
    assert!(transcript.ends_with("\n\nRésume la conversation ci-dessus."));
    // La fenêtre s'agrandit pour tout relire.
    assert_eq!(sent["options"]["num_ctx"], transcript.len() / 3 + 1024);
    assert_eq!(sent["options"]["temperature"], 0.2);

    // Trop longue pour être relue en entier : refusée, jamais tronquée.
    let long = json!({ "model": "a", "compact": true,
                       "messages": [{ "role": "user", "content": "x".repeat(200_000) }] });
    let (status, _) = run(&app, request("POST", "/api/chat", long)).await;
    assert_eq!(status, 413);
    assert_eq!(seen.lock().unwrap().len(), 1);
}

fn upload(name: &str, content: &'static str) -> Request<Body> {
    Request::post(format!("/api/files?name={name}"))
        .header("host", "localhost:8080")
        .header("content-type", "application/octet-stream")
        .body(Body::from(content))
        .unwrap()
}

fn app_with_uploads(uploads: std::path::PathBuf) -> Router {
    router(Config {
        model: "a".into(),
        ollama_url: NOWHERE.into(),
        data: None,
        uploads: Some(uploads),
    })
}

#[tokio::test]
async fn refuses_files_without_a_sandbox() {
    assert_eq!(run(&app_with(NOWHERE, None), upload("a", "x")).await.0, 503);
    // Dossier partagé présent, mais personne derrière.
    let uploads = temporary_data("seul");
    let (status, body) = run(&app_with_uploads(uploads.clone()), upload("a", "x")).await;
    assert_eq!(status, 503);
    assert!(body.contains("bac à sable"), "{body}");
    assert_eq!(std::fs::read_dir(&uploads).unwrap().count(), 0);
    std::fs::remove_dir_all(uploads).unwrap();
}

#[tokio::test]
async fn returns_the_sandbox_report_and_removes_the_file() {
    let uploads = temporary_data("examen");
    std::fs::create_dir_all(uploads.join("job-oublie")).unwrap();
    let app = app_with_uploads(uploads.clone());
    // Les restes d'un arrêt brutal sont effacés au démarrage.
    assert!(!uploads.join("job-oublie").exists());
    let directory = uploads.clone();
    std::thread::spawn(move || lucas_core::run_sandbox(&directory));
    while !uploads.join("alive").exists() {
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    let (status, body) = run(&app, upload("notes.txt", "à lire\n")).await;
    assert_eq!(status, 200, "{body}");
    let report: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(report["kind"], "fichier texte");
    assert_eq!(report["excerpt"], "à lire\n");
    assert_eq!(report["size"], 8);
    let left: Vec<_> = std::fs::read_dir(&uploads)
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(left, ["alive"]);
}

/// Faux Ollama dont les capacités dépendent du nom du modèle.
async fn capable_ollama() -> (String, Arc<Mutex<Vec<Value>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    let app = Router::new()
        .route(
            "/api/show",
            post(|Json(body): Json<Value>| async move {
                let model = body["model"].as_str().unwrap_or_default();
                let known: Vec<&str> = model.split('-').collect();
                Json(json!({ "capabilities": known }))
            }),
        )
        .route(
            "/api/chat",
            post(move |Json(body): Json<Value>| async move {
                log.lock().unwrap().push(body);
                "{\"done\":true}\n"
            }),
        );
    (serve(app).await, seen)
}

fn pictured(model: &str) -> Request<Body> {
    let body = json!({ "model": model, "messages": [
        { "role": "user", "content": "vois", "images": ["QUJD", "REVG"] },
        { "role": "user", "content": "texte" },
    ] });
    request("POST", "/api/chat", body)
}

#[tokio::test]
async fn images_only_reach_models_that_see_them() {
    let (url, seen) = capable_ollama().await;
    let (_, answer) = call(&url, pictured("vision")).await;
    assert_eq!(answer, "{\"done\":true}\n");
    let sent = seen.lock().unwrap().pop().unwrap();
    assert_eq!(sent["messages"][1]["images"], json!(["QUJD", "REVG"]));
    assert_eq!(sent["messages"][1]["content"], "vois");
    assert!(sent.get("think").is_none());

    let (_, answer) = call(&url, pictured("completion")).await;
    let first: Value = serde_json::from_str(answer.lines().next().unwrap()).unwrap();
    assert!(first["info"].as_str().unwrap().contains("ne voit pas"));
    assert!(answer.ends_with("{\"done\":true}\n"), "{answer}");
    let sent = seen.lock().unwrap().pop().unwrap();
    assert!(sent["messages"][1].get("images").is_none());
    let content = sent["messages"][1]["content"].as_str().unwrap();
    assert!(content.starts_with("vois\n\n"), "{content}");
    assert!(content.contains("ne peux pas voir"), "{content}");
    // Un message sans image n'est pas touché.
    assert_eq!(sent["messages"][2]["content"], "texte");
}

#[tokio::test]
async fn asks_thinking_models_to_show_their_reasoning() {
    let (url, seen) = capable_ollama().await;
    let chat = json!({ "model": "thinking", "messages": [] });
    call(&url, request("POST", "/api/chat", chat)).await;
    assert_eq!(seen.lock().unwrap().pop().unwrap()["think"], true);
}

#[tokio::test]
async fn titles_keep_the_chat_window_so_ollama_does_not_reload() {
    let (url, seen) = capable_ollama().await;
    let app = app_with(&url, None);
    let settings = json!({ "system_prompt": "", "context": 8192, "providers": [] });
    let (status, _) = run(&app, request("PUT", "/api/settings", settings)).await;
    assert_eq!(status, 200);
    let body = json!({ "model": "a", "message": "salut" });
    run(&app, request("POST", "/api/title", body)).await;
    let sent = seen.lock().unwrap().pop().unwrap();
    assert_eq!(sent["options"]["num_ctx"], 8192);
    assert_eq!(sent["think"], false);

    let app = app_with(&url, None);
    let body = json!({ "model": "a", "message": "salut" });
    run(&app, request("POST", "/api/title", body)).await;
    let sent = seen.lock().unwrap().pop().unwrap();
    assert!(sent["options"].get("num_ctx").is_none());
}

#[tokio::test]
async fn an_external_api_without_vision_gets_the_text_alone() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    let api = Router::new().route(
        "/chat/completions",
        post(move |Json(body): Json<Value>| async move {
            let pictured = body["messages"].to_string().contains("image_url");
            log.lock().unwrap().push(body);
            if pictured {
                (StatusCode::BAD_REQUEST, "")
            } else {
                (StatusCode::OK, "data: [DONE]\n\n")
            }
        }),
    );
    let url = serve(api).await;
    let app = app_with(NOWHERE, None);
    let settings = json!({ "system_prompt": "",
                           "providers": [{ "name": "p", "url": url, "key": "" }] });
    run(&app, request("PUT", "/api/settings", settings)).await;
    let (status, answer) = run(&app, pictured("@api:p:m")).await;
    assert_eq!(status, 200);
    let first: Value = serde_json::from_str(answer.lines().next().unwrap()).unwrap();
    assert!(first["info"].as_str().unwrap().contains("ne voit pas"));
    assert!(answer.ends_with("\n{\"done\":true}\n"), "{answer}");
    let seen = seen.lock().unwrap();
    assert_eq!(seen.len(), 2);
    assert_eq!(
        seen[0]["messages"][1]["content"],
        json!([
            { "type": "text", "text": "vois" },
            { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,QUJD" } },
            { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,REVG" } },
        ])
    );
    let retried = seen[1]["messages"][1]["content"].as_str().unwrap();
    assert!(retried.starts_with("vois\n\n"), "{retried}");
    assert!(retried.contains("ne peux pas voir"), "{retried}");
    assert_eq!(seen[1]["messages"][2]["content"], "texte");
    // Seul le contenu illustré change : les rôles et la consigne restent.
    assert_eq!(seen[1]["messages"][0], seen[0]["messages"][0]);
    assert_eq!(seen[1]["messages"][1]["role"], "user");
    assert_eq!(seen[1]["messages"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn an_external_api_is_asked_again_only_when_it_refuses_images() {
    for (code, pictured_chat, requests, expected) in [
        (200, true, 1, 200),
        (500, true, 1, 502),
        (401, true, 1, 502),
        (400, false, 1, 502),
        (415, true, 2, 502),
        (422, true, 2, 502),
    ] {
        let count = Arc::new(Mutex::new(0));
        let log = count.clone();
        let api = Router::new().route(
            "/chat/completions",
            post(move || async move {
                *log.lock().unwrap() += 1;
                (StatusCode::from_u16(code).unwrap(), "data: [DONE]\n\n")
            }),
        );
        let url = serve(api).await;
        let app = app_with(NOWHERE, None);
        let settings = json!({ "system_prompt": "",
                               "providers": [{ "name": "p", "url": url, "key": "" }] });
        run(&app, request("PUT", "/api/settings", settings)).await;
        let chat = if pictured_chat {
            pictured("@api:p:m")
        } else {
            let body = json!({ "model": "@api:p:m", "messages": [] });
            request("POST", "/api/chat", body)
        };
        let (status, answer) = run(&app, chat).await;
        assert_eq!(status, expected, "{code} {answer}");
        assert_eq!(*count.lock().unwrap(), requests, "{code}");
        if code == 200 {
            assert_eq!(answer, "{\"done\":true}\n");
        }
    }
}

/// Un modèle qui réfléchit envoie sa réflexion à part, ligne après ligne, sans rien ajouter.
#[tokio::test]
async fn native_thinking_is_relayed_as_it_arrives() {
    let parts = "{\"message\":{\"content\":\"\",\"thinking\":\"je \"}}\n\
        {\"message\":{\"content\":\"\",\"thinking\":\"pense\"}}\n\
        {\"message\":{\"content\":\"oui\"},\"done\":true}\n";
    let (url, seen) = capable_ollama_with(parts).await;
    let chat = json!({ "model": "thinking", "messages": [{ "role": "user", "content": "salut" }] });
    let (status, answer) = call(&url, request("POST", "/api/chat", chat)).await;
    assert_eq!(status, 200);
    assert_eq!(answer, parts);
    assert_eq!(seen.lock().unwrap().len(), 1);
}

/// Un modèle sans réflexion native ne reçoit qu'une seule demande, sans consigne ajoutée.
#[tokio::test]
async fn models_without_reasoning_get_one_plain_request() {
    let (url, seen) = capable_ollama_with("{\"done\":true}\n").await;
    let chat =
        json!({ "model": "completion", "messages": [{ "role": "user", "content": "salut" }] });
    call(&url, request("POST", "/api/chat", chat)).await;
    let sent = seen.lock().unwrap();
    assert_eq!(sent.len(), 1);
    assert!(sent[0].get("think").is_none());
    assert_eq!(sent[0]["messages"].as_array().unwrap().len(), 2);
    assert_eq!(sent[0]["messages"][1]["content"], "salut");
}

/// Faux Ollama dont la réponse est fixe, et dont le modèle ne dit pas réfléchir.
async fn capable_ollama_with(answer: &'static str) -> (String, Arc<Mutex<Vec<Value>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    let app = Router::new()
        .route(
            "/api/show",
            post(|Json(body): Json<Value>| async move {
                let model = body["model"].as_str().unwrap_or_default();
                let known: Vec<&str> = model.split('-').collect();
                Json(json!({ "capabilities": known }))
            }),
        )
        .route(
            "/api/chat",
            post(move |Json(body): Json<Value>| async move {
                log.lock().unwrap().push(body);
                answer
            }),
        );
    (serve(app).await, seen)
}
