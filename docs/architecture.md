# Architecture

```
Navigateur ──► lucas-core :8080 ──► ollama :11434 ◄── ollama-pull (une fois)
                     ├──► API compatibles OpenAI (facultatif)
                     └──► volume `lucas_uploads` ◄── lucas-sandbox (sans réseau)
```

| Service | Port (127.0.0.1) | Volume | Rôle |
|---|---|---|---|
| `ollama` | non publié | `ollama_data` | Sert les modèles |
| `ollama-pull` | aucun | aucun | Télécharge le modèle par défaut, puis s'arrête |
| `lucas-core` | 8080 | `lucas_data`, `lucas_uploads` | Interface et API (Rust) |
| `lucas-sandbox` | aucun réseau | `lucas_uploads` | Examine les fichiers joints |

`crates/lucas-core` contient le serveur (`src/`), l'interface sans dépendance (`ui/`)
et les tests (`tests/`).

## Réponses

Deux réponses peuvent s'écrire en même temps (`OLLAMA_NUM_PARALLEL`, les suivantes
attendent). La réflexion est affichée à
part : celle que le modèle communique, ou sinon un premier passage où LUCAS lui demande de
raisonner par écrit avant de répondre (réponses plus lentes). Pour une API externe, seule
la réflexion qu'elle fournit est montrée. Un seul modèle est gardé en mémoire à la fois.

La réponse s'écrit dans une tâche du serveur, indépendante de la page : après un
rechargement, la page la relit depuis le début. Les réponses sont gardées en mémoire ;
un redémarrage de LUCAS les perd.

## Fichiers joints

LUCAS écrit le fichier dans `lucas_uploads` sans l'ouvrir. `lucas-sandbox` (lecture
seule, sans réseau ni privilège, sans accès à `lucas_data`) le lit sans jamais
l'exécuter et rend un rapport, puis le fichier est effacé. La taille n'est limitée que
par le disque, mais le modèle ne reçoit qu'un extrait du texte (au plus 10 000
caractères). Il lit les PDF (même numérisés) et reconnaît le texte des images et des
vidéos ; la bande-son n'est pas transcrite. Seul un modèle « vision » reçoit les images
elles-mêmes (réduites, et quelques instants des vidéos). Les aperçus sont gardés par le
navigateur (IndexedDB).

## Données

- Les conversations, groupes et extraits de fichiers restent dans le navigateur.
- `lucas_data` garde les réglages, les noms d'affichage et les clés d'API (en clair,
  lisibles par LUCAS seul).
- Les messages envoyés à une API externe quittent la machine.

## Sécurité

Pas d'authentification : le seul port publié l'est sur la machine elle-même, et l'API
refuse les requêtes venant d'un autre site.
