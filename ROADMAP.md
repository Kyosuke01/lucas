# 🤖 LUCAS — Suivi du projet

> **L**ocal **U**nified **C**entral **A**utonomous **S**elf-hosted assistant

---

## 📋 Vue d'ensemble des phases

| Phase | Nom | Statut |
|-------|-----|--------|
| Phase 1 | Base locale minimale | ✅ Terminée |
| Phase 2 | Ajout de la voix | 🔲 À faire |
| Phase 3 | Exécution d'actions locales | 🔲 À faire |
| Phase 4 | Intégration avec services locaux | 🔲 À faire |

---

## ✅ Phase 1 — Base locale minimale

> Objectif : obtenir rapidement un premier assistant local utilisable.

| Étape | Description | Statut |
|-------|-------------|--------|
| 1 | Installer Docker sur la machine hôte | ✅ |
| 2 | Déployer Ollama dans un conteneur avec volume persistant | ✅ |
| 3 | Déployer Open WebUI et le relier à Ollama | ✅ |
| 4 | Ajouter le service backend `lucas-core` minimal (FastAPI) | ✅ |
| 5 | Télécharger un modèle adapté au matériel (sélection guidée par `setup`) | ✅ |
| 6 | Vérifier qu'un chat local fonctionne totalement sans cloud | ✅ |

**Bonus réalisés :**

| Élément | Statut |
|---------|--------|
| Scripts `setup.sh` / `setup.ps1` avec génération automatique des secrets | ✅ |
| Scripts `start.sh` / `start.ps1` / `stop.sh` / `stop.ps1` | ✅ |
| Sélection guidée du profil matériel (Lite / Standard / Plus / Pro) | ✅ |
| Protection re-download si modèle déjà configuré | ✅ |
| Healthcheck Ollama avec retry HTTP (`/api/tags`) | ✅ |
| Création du compte administrateur par l'utilisateur sur Open WebUI | ✅ |
| Personnalisation Open WebUI (nom LUCAS, locale fr) | ✅ |
| `.env.example` documenté avec toutes les variables | ✅ |
| `WEBUI_SECRET_KEY` généré automatiquement | ✅ |
| CI GitHub Actions | ✅ |
| README avec badges, architecture, profils matériels | ✅ |

---

## 🔲 Phase 2 — Ajout de la voix

> Objectif : transformer le chat local en assistant vocal.

| Étape | Description | Statut |
|-------|-------------|--------|
| 1 | Ajouter un service local de transcription basé sur **Whisper** | 🔲 |
| 2 | Ajouter un service local de synthèse vocale basé sur **Piper** | 🔲 |
| 3 | Écrire un orchestrateur Python pour piloter la chaîne micro → transcription → LLM → voix | 🔲 |
| 4 | Ajouter un mot-clé d'activation (wake word) | 🔲 |
| 5 | Ajouter l'exécution de commandes locales autorisées | 🔲 |

---

## 🔲 Phase 3 — Exécution d'actions locales

> Objectif : faire de LUCAS un assistant réellement exécutable sur la machine.

| Étape | Description | Statut |
|-------|-------------|--------|
| 1 | Définir un registre des actions locales autorisées | 🔲 |
| 2 | Créer une couche de permissions (liste blanche, confirmation) | 🔲 |
| 3 | Mapper des ordres naturels vers des actions concrètes | 🔲 |
| 4 | Ajouter des profils d'usage : gaming, travail, stream, multimédia, maison | 🔲 |
| 5 | Permettre l'exécution de routines complètes | 🔲 |

**Exemples de routines visées :**
- Lancer une scène de stream
- Ouvrir plusieurs applications
- Régler un environnement de travail
- Fermer ou démarrer certains outils
- Exécuter des scripts système préautorisés

---

## 🔲 Phase 4 — Intégration avec services locaux

> Objectif : rendre le projet maintenable, évolutif, et capable d'interagir avec des appareils connectés.

| Étape | Description | Statut |
|-------|-------------|--------|
| 1 | Séparer les services dans une architecture Docker Compose propre | 🔲 |
| 2 | Créer une couche d'API / agents locaux pour lire et ajuster des services locaux | 🔲 |
| 3 | Conserver les mêmes interfaces réseau internes pour éviter les refontes | 🔲 |
| 4 | Préparer l'ajout de nouvelles briques locales | 🔲 |
| 5 | Ajouter un système d'autorisations détaillé pour appareils et services | 🔲 |

---

## 🧱 Architecture actuelle (Phase 1)

| Brique | Outil | Rôle | Statut |
|--------|-------|------|--------|
| LLM local | Ollama | Sert les modèles via API HTTP locale | ✅ |
| Interface IA | Open WebUI | Interface de chat locale (personnalisée LUCAS) | ✅ |
| Orchestrateur | Python / FastAPI (`lucas-core`) | Permissions, profils, actions, outils | ✅ (base) |
| STT | Whisper | Transcription vocale locale | 🔲 Phase 2 |
| TTS | Piper | Synthèse vocale locale | 🔲 Phase 2 |
| Orchestration | Docker Compose | Lance et relie les services | ✅ |

---

## 📦 Profils matériels

| Profil | RAM | Modèle par défaut | Statut |
|--------|-----|-------------------|--------|
| **LUCAS Lite** | 8 Go | `llama3.2:1b` | ✅ Disponible |
| **LUCAS Standard** | 16 Go | `llama3.1:8b` | ✅ Disponible |
| **LUCAS Plus** | 32 Go | `llama3:13b` | ✅ Disponible |
| **LUCAS Pro Local** | 64 Go+ | `llama3:70b` | ✅ Disponible |

---

## 🔐 Sécurité

| Élément | Statut |
|---------|--------|
| `WEBUI_SECRET_KEY` généré automatiquement | ✅ |
| `ENABLE_SIGNUP=true` par défaut (l'utilisateur crée son propre compte) | ✅ |
| `.env` exclu du dépôt Git (`.gitignore`) | ✅ |
| Liste blanche d'actions (`LUCAS_ACTION_WHITELIST`) | 🔲 Phase 3 |
| Confirmation pour actions sensibles (`LUCAS_ACTION_CONFIRM`) | 🔲 Phase 3 |
| Journaux d'exécution | 🔲 Phase 3 |
