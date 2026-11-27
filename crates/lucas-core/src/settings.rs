//! Réglages, enregistrés dans le volume de données. Les clés d'API n'en sortent
//! jamais vers le navigateur.

use crate::{App, ollama::Failure};
use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs, io,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, PoisonError},
};

/// Service compatible avec l'API OpenAI.
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Provider {
    pub name: String,
    /// Adresse de base, par exemple `http://hote:1234/v1`.
    pub url: String,
    #[serde(default)]
    pub key: String,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Consigne donnée au modèle avant chaque conversation.
    pub system_prompt: String,
    pub temperature: Option<f64>,
    /// Taille du contexte, en jetons (modèles locaux).
    pub context: Option<u32>,
    pub providers: Vec<Provider>,
}

#[derive(Clone, Default)]
pub struct Store {
    file: Option<PathBuf>,
    current: Arc<Mutex<Settings>>,
}

impl Store {
    pub fn load(file: Option<PathBuf>) -> Self {
        let current = file.as_deref().map(read_file).unwrap_or_default();
        Self {
            file,
            current: Arc::new(Mutex::new(current)),
        }
    }

    pub fn get(&self) -> Settings {
        self.current
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// Valide, complète les clés conservées puis enregistre.
    fn replace(&self, mut new: Settings) -> Result<(), Failure> {
        let invalid = |message: &str| Failure(StatusCode::BAD_REQUEST, message.into());
        if new.temperature.is_some_and(|t| !(0.0..=2.0).contains(&t)) {
            return Err(invalid("La température va de 0 à 2."));
        }
        if new.context.is_some_and(|c| !(512..=1_000_000).contains(&c)) {
            return Err(invalid("Le contexte va de 512 à 1 000 000 jetons."));
        }
        let mut current = self.current.lock().unwrap_or_else(PoisonError::into_inner);
        let mut seen = Vec::new();
        for provider in &mut new.providers {
            provider.url = provider.url.trim().trim_end_matches('/').to_string();
            let name = &provider.name;
            let valid_name = !name.is_empty()
                && name.len() <= 40
                && name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_".contains(c));
            if !valid_name || seen.contains(name) {
                return Err(invalid(
                    "Chaque API a un nom unique : lettres, chiffres et tirets.",
                ));
            }
            seen.push(name.clone());
            if !(provider.url.starts_with("http://") || provider.url.starts_with("https://")) {
                return Err(invalid(
                    "L'adresse d'une API commence par http:// ou https://.",
                ));
            }
            let url = reqwest::Url::parse(&provider.url)
                .map_err(|_| invalid("Adresse d'API illisible."))?;
            // Un mot de passe dans l'adresse serait réaffiché avec elle.
            if !url.username().is_empty() || url.password().is_some() {
                return Err(invalid("Saisissez la clé à part, pas dans l'adresse."));
            }
            // Clé laissée vide : on garde l'ancienne, mais seulement pour la même
            // adresse, pour ne jamais l'envoyer à un autre serveur.
            if provider.key.is_empty() {
                let old = current
                    .providers
                    .iter()
                    .find(|old| old.name == provider.name);
                if let Some(old) = old.filter(|old| old.url == provider.url) {
                    provider.key = old.key.clone();
                }
            }
        }
        let exposed = |p: &Provider| !p.key.is_empty() && !private_transport(&p.url);
        if new.providers.iter().any(exposed) {
            return Err(invalid(
                "Avec une clé, une API distante doit être en https://.",
            ));
        }
        if let Some(path) = &self.file {
            write_private(path, &new).map_err(|e| {
                let message = format!("Réglages non enregistrés : {e}");
                Failure(StatusCode::INTERNAL_SERVER_ERROR, message)
            })?;
        }
        *current = new;
        Ok(())
    }
}

/// Chiffré, ou ne quittant pas la machine ni le réseau local.
fn private_transport(url: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(url) else {
        return false;
    };
    let host = url.host_str().unwrap_or_default();
    url.scheme() == "https"
        || host == "localhost"
        || host == "host.docker.internal"
        || host
            .parse::<std::net::Ipv4Addr>()
            .is_ok_and(|ip| ip.is_loopback() || ip.is_private())
}

/// Un fichier illisible est mis de côté, pour ne pas écraser les clés.
fn read_file(path: &Path) -> Settings {
    let Ok(bytes) = fs::read(path) else {
        return Settings::default();
    };
    serde_json::from_slice(&bytes).unwrap_or_else(|error| {
        eprintln!("Réglages illisibles, mis de côté : {error}");
        let _ = fs::rename(path, path.with_extension("bak"));
        Settings::default()
    })
}

/// Fichier lisible par LUCAS seul (il contient les clés), remplacé d'un coup.
fn write_private(path: &Path, settings: &Settings) -> io::Result<()> {
    let temporary = path.with_extension("tmp");
    let _ = fs::remove_file(&temporary);
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    options
        .open(&temporary)?
        .write_all(&serde_json::to_vec(settings)?)?;
    fs::rename(temporary, path)
}

/// Les réglages sans les clés : seulement leur présence.
fn public(settings: &Settings) -> Value {
    let providers: Vec<Value> = settings
        .providers
        .iter()
        .map(|p| json!({ "name": p.name, "url": p.url, "has_key": !p.key.is_empty() }))
        .collect();
    json!({
        "system_prompt": settings.system_prompt,
        "temperature": settings.temperature,
        "context": settings.context,
        "providers": providers,
    })
}

pub async fn read(State(app): State<App>) -> Json<Value> {
    Json(public(&app.settings.get()))
}

pub async fn write(
    State(app): State<App>,
    Json(new): Json<Settings>,
) -> Result<Json<Value>, Failure> {
    app.settings.replace(new)?;
    Ok(Json(public(&app.settings.get())))
}
