//! Réservation des noms de modèles : un téléchargement ou un import écrase sans
//! prévenir.

use std::{
    collections::HashSet,
    sync::{Arc, Mutex, PoisonError},
};

#[derive(Clone, Default)]
pub struct Busy(Arc<Mutex<HashSet<String>>>);

/// Libère ses noms quand elle est abandonnée.
pub struct Reservation {
    busy: Busy,
    names: Vec<String>,
}

impl Busy {
    /// Réserve tous les noms, ou aucun si l'un d'eux est déjà pris.
    pub fn reserve(&self, names: &[&str]) -> Option<Reservation> {
        let names: Vec<String> = names.iter().map(|name| canonical(name)).collect();
        let mut busy = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        if names.iter().any(|name| busy.contains(name)) {
            return None;
        }
        busy.extend(names.iter().cloned());
        Some(Reservation {
            busy: self.clone(),
            names,
        })
    }
}

impl Drop for Reservation {
    fn drop(&mut self) {
        let mut busy = self.busy.0.lock().unwrap_or_else(PoisonError::into_inner);
        for name in &self.names {
            busy.remove(name);
        }
    }
}

/// Forme comparable d'un nom : Ollama ignore la casse et sous-entend `:latest`.
pub fn canonical(name: &str) -> String {
    let name = name.to_ascii_lowercase();
    let last = name.rsplit('/').next().unwrap_or_default();
    if last.contains(':') {
        name
    } else {
        format!("{name}:latest")
    }
}
