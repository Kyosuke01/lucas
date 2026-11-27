# Architecture

```
Navigateur ──► lucas-core :8080 ──► ollama :11434 ◄── ollama-pull (une fois)
                     └──► API compatibles OpenAI (facultatif)
```

| Service | Port (127.0.0.1) | Volume | Rôle |
|---|---|---|---|
| `ollama` | non publié | `ollama_data` | Sert les modèles |
| `ollama-pull` | aucun | aucun | Télécharge le modèle par défaut, puis s'arrête |
| `lucas-core` | 8080 | `lucas_data` | Interface et API (Rust) |

`crates/lucas-core` contient le serveur (`src/`), l'interface sans dépendance (`ui/`)
et les tests (`tests/`).

## Données

- Les conversations restent dans le navigateur.
- `lucas_data` garde les réglages, les noms d'affichage et les clés d'API (en clair,
  lisibles par LUCAS seul).
- Les messages envoyés à une API externe quittent la machine.

## Sécurité

Pas d'authentification : le seul port publié l'est sur la machine elle-même, et l'API
refuse les requêtes venant d'un autre site.
