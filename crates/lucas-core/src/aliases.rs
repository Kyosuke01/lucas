//! Noms d'affichage des modèles. Le modèle garde son nom dans Ollama : seul
//! LUCAS l'appelle autrement.

use crate::names::canonical;
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

#[derive(Clone, Default)]
pub struct Aliases {
    file: Option<PathBuf>,
    /// Nom du modèle (forme comparable) vers nom d'affichage.
    names: Arc<Mutex<BTreeMap<String, String>>>,
}

impl Aliases {
    /// Sans fichier, les noms ne sont gardés qu'en mémoire.
    pub fn load(file: Option<PathBuf>) -> Self {
        let names = file
            .as_deref()
            .and_then(|path| fs::read(path).ok())
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            file,
            names: Arc::new(Mutex::new(names)),
        }
    }

    pub fn get(&self, model: &str) -> Option<String> {
        self.lock().get(&canonical(model)).cloned()
    }

    /// `None` rend au modèle son propre nom.
    pub fn set(&self, model: &str, alias: Option<&str>) -> io::Result<()> {
        let mut names = self.lock();
        let mut updated = names.clone();
        match alias {
            Some(alias) => updated.insert(canonical(model), alias.to_string()),
            None => updated.remove(&canonical(model)),
        };
        if updated != *names {
            if let Some(path) = &self.file {
                write(path, &updated)?;
            }
            *names = updated;
        }
        Ok(())
    }

    fn lock(&self) -> MutexGuard<'_, BTreeMap<String, String>> {
        self.names.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Écrit à côté puis remplace, pour ne jamais laisser un fichier tronqué.
fn write(path: &Path, names: &BTreeMap<String, String>) -> io::Result<()> {
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, serde_json::to_vec(names)?)?;
    fs::rename(temporary, path)
}
