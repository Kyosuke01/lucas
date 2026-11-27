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
    };
    for (path, kind, marker) in [
        ("/", "text/html", "<title>LUCAS</title>"),
        ("/app.css", "text/css", ":root"),
        ("/app.js", "text/javascript", "/api/chat"),
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
            "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; \
             form-action 'self'"
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
        assert_eq!(serde_json::from_str::<Value>(body).unwrap(), sent, "{path}");
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
    })
}

async fn run(app: &Router, request: Request<Body>) -> (StatusCode, String) {
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
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
    assert_eq!(
        body["messages"][0],
        json!({ "role": "system", "content": "Sois bref." })
    );

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
