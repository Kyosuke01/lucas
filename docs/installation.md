# 📦 Guide d'installation — LUCAS

## Prérequis

- [Docker Engine](https://docs.docker.com/engine/install/) ≥ 24.0
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2.20
- 8 Go RAM minimum (16 Go recommandés)
- 20 Go d'espace disque libre (pour les modèles)

## Installation rapide

```bash
git clone https://github.com/Kyosuke01/lucas.git
cd lucas
cp .env.example .env
./scripts/setup.sh
./scripts/start.sh
```

Ouvrir **http://localhost:3000**

## Installation manuelle

```bash
docker compose pull
docker compose up -d
```

## Choisir son profil matériel

Éditer `.env` et adapter `OLLAMA_DEFAULT_MODEL` selon ton profil :

| Profil | Modèle recommandé |
|---|---|
| Lite (8 Go) | `llama3.2:1b` ou `qwen2.5:1.5b` |
| Standard (16 Go) | `llama3.2:3b` ou `mistral:7b` |
| Plus (32 Go) | `llama3.1:8b` ou `mistral:7b` |
| Pro Local (64 Go+) | `llama3.1:70b-q4` ou `mixtral:8x7b` |
