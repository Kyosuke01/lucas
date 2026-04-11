# 🤖 LUCAS

> **L**ocal **U**nified **C**entral **A**utonomous **S**elf-hosted assistant

LUCAS est un assistant personnel de type **JARVIS** — 100 % local, 100 % open source, 100 % gratuit à l'usage. Il fonctionne entièrement sous Docker, sans dépendance obligatoire à Internet une fois installé, sans API payante, sans quota cloud.

[![CI](https://github.com/Kyosuke01/lucas/actions/workflows/ci.yml/badge.svg)](https://github.com/Kyosuke01/lucas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-required-blue)](https://www.docker.com/)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-green)](#)

---

## ✨ Fonctionnalités

> Les fonctionnalités marquées 🔲 font partie de la roadmap — pas encore disponibles.

- 💬 **Chat local** via Open WebUI + Ollama ✅
- 🎙️ **Voix locale** via Whisper (STT) + Piper (TTS) 🔲
- ⚡ **Actions locales** : lancer des apps, scripts, routines 🔲
- 🏠 **Domotique** : intégration services locaux (avec permissions explicites) 🔲
- 🔒 **Sécurité** : liste blanche d'actions, confirmation, journaux d'exécution 🔲
- 🧩 **Modulaire** : chaque brique est indépendante et remplaçable ✅

---

## 🚀 Démarrage rapide

### Prérequis

- [Docker](https://www.docker.com/) & Docker Compose installés
- 8 Go de RAM minimum (16 Go recommandés)

### Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/Kyosuke01/lucas.git
cd lucas

# 2. Lancer le setup (configure .env, télécharge le modèle)
./scripts/setup.sh        # Linux / macOS
# ou
./scripts/setup.ps1       # Windows (PowerShell)

# 3. Démarrer LUCAS
./scripts/start.sh        # Linux / macOS
# ou
./scripts/start.ps1       # Windows (PowerShell)
```

Ouvrir ensuite : **http://localhost:8080**

> ℹ️ Le setup est à faire **une seule fois**. Ensuite, utilise uniquement `start` au quotidien.

---

## 🧱 Architecture

| Brique | Outil | Rôle | Statut |
|--------|-------|------|--------|
| LLM local | Ollama | Sert les modèles via API HTTP locale | ✅ |
| Interface IA | Open WebUI | Interface de chat locale (LUCAS) | ✅ |
| Orchestrateur | Python / FastAPI (`lucas-core`) | Permissions, profils, actions, outils | ✅ (base) |
| STT | Whisper | Transcription vocale locale | 🔲 Phase 2 |
| TTS | Piper | Synthèse vocale locale | 🔲 Phase 2 |
| Orchestration | Docker Compose | Lance et relie les services | ✅ |

---

## 📦 Profils matériels

| Profil | RAM | Modèle par défaut |
|--------|-----|-------------------|
| **LUCAS Lite** | 8 Go | `llama3.2:1b` |
| **LUCAS Standard** | 16 Go | `llama3.1:8b` |
| **LUCAS Plus** | 32 Go | `llama3:13b` |
| **LUCAS Pro Local** | 64 Go+ | `llama3:70b` |

Le profil est sélectionné automatiquement lors du `setup`.

---

## 📋 Roadmap

Consulte [ROADMAP.md](ROADMAP.md) pour le suivi détaillé des phases du projet.

| Phase | Description | Statut |
|-------|-------------|--------|
| Phase 1 | Base locale minimale (chat, Docker, setup) | ✅ Terminée |
| Phase 2 | Voix locale (Whisper STT + Piper TTS) | 🔲 À venir |
| Phase 3 | Actions locales (apps, scripts, routines) | 🔲 À venir |
| Phase 4 | Intégration services locaux / domotique | 🔲 À venir |

---

## 📖 Documentation

- [Roadmap complète](ROADMAP.md)
- [Guide de contribution](CONTRIBUTING.md)
- [Licence MIT](LICENSE)

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Merci de lire [CONTRIBUTING.md](CONTRIBUTING.md) avant de soumettre une PR.

---

## 📄 Licence

Ce projet est sous licence **MIT** — voir [LICENSE](LICENSE) pour plus de détails.
