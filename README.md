# LUCAS

Assistant personnel local : chat avec vos modèles via Ollama, sans cloud obligatoire.

## Démarrer

Prérequis : Docker, 8 Go de RAM.

```bash
git clone https://github.com/Kyosuke01/lucas.git
cd lucas
docker compose up -d
```

Ouvrir <http://localhost:8080>. Le premier démarrage télécharge le modèle (environ 5 Go).

Arrêter : `docker compose down`. Mettre à jour : `docker compose up -d --build`.

LUCAS n'a pas d'authentification : il n'est accessible que depuis votre machine.

## Plus

[Plan](docs/jarvis-local-homelab-plan.md) · [Architecture](docs/architecture.md) · [Roadmap](ROADMAP.md) · [Contribuer](CONTRIBUTING.md) · [Licence MIT](LICENSE)
