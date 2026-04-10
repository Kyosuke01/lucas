# 🏗️ Architecture — LUCAS

## Vue d'ensemble

```
┌─────────────────────────────────────────────────┐
│                 Interface LUCAS                  │
│           http://localhost:3000                  │
│  (Dashboard / Chat / Voix / Paramètres)          │
└────────────────────┬────────────────────────────┘
                     │ HTTP / WebSocket
┌────────────────────▼────────────────────────────┐
│              lucas-core (Python)                 │
│   Orchestration / Permissions / Actions          │
└──────┬────────────┬──────────────┬──────────────┘
       │            │              │
  ┌────▼───┐  ┌─────▼────┐  ┌─────▼──────┐
  │ Ollama │  │ Whisper  │  │   Piper    │
  │  LLM  │  │   STT    │  │    TTS     │
  └────────┘  └──────────┘  └────────────┘
```

## Services Docker

| Service | Port | Description |
|---|---|---|
| `lucas-dashboard` | 3000 | Interface web LUCAS |
| `lucas-core` | 8000 | Backend Python (API interne) |
| `ollama` | 11434 | Serveur LLM local |
| `open-webui` | 8080 | Interface chat Ollama |
| `whisper` | 9000 | Speech-to-Text |
| `piper` | 5000 | Text-to-Speech |

## Volumes Docker

| Volume | Contenu |
|---|---|
| `ollama_data` | Modèles téléchargés |
| `webui_data` | Configuration Open WebUI |
| `lucas_config` | Configuration LUCAS |
| `lucas_logs` | Journaux d'exécution |
