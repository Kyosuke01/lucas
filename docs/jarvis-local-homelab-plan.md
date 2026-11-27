# Plan de projet — LUCAS, assistant maison full local sous Docker

## Origine et inspiration

LUCAS s’inspire directement de l’imaginaire de **JARVIS**, l’assistant de Tony Stark : une IA avec laquelle l’utilisateur interagit **principalement à l’oral**, capable de **comprendre des consignes naturelles**, puis de **déclencher des actions concrètes** sur l’ordinateur et, plus tard, sur l’environnement connecté de la maison, si cela est explicitement autorisé.

L’objectif n’est donc pas simplement de construire un chatbot local, mais un **assistant personnel exécutable**, capable de :

- répondre à la voix ou en chat ;
- exécuter des tâches sur la machine locale ;
- lancer des applications ou des workflows personnalisés ;
- interagir avec des services du home-lab ;
- piloter des appareils connectés si l’utilisateur lui en donne le droit.

Exemples d’usage visés :

- « Démarre mon stream Twitch avec mes préférences de tous les jours. »
- « Ouvre mes outils de travail et prépare ma session. »
- « Éteins les lumières de la cuisine. »
- « Lance le film dans le salon. »
- « Active le mode nuit sur la maison. »

Dans tous les cas, l’exécution doit rester **locale**, **contrôlée**, **autorisée explicitement**, et **sans dépendance obligatoire à un cloud externe**.

***

## Objectif

Construire un assistant personnel de type « Jarvis » qui fonctionne **entièrement en local**, **sous Docker**, **sans dépendance obligatoire à Internet une fois installé**, et **sans coûts d’API ni limites de requêtes imposées par un service cloud**.

Le projet doit rester **scalable**, afin de pouvoir démarrer sur un simple ordinateur personnel puis évoluer plus tard vers un environnement plus riche, sans avoir à repenser toute l’architecture logicielle. L’objectif est également de permettre, plus tard, d’**interfacer l’assistant avec des appareils connectés** (par exemple une ampoule contrôlable via une application).
Si l’utilisateur l’autorise, l’IA peut alors accéder à ces services locaux et ajuster leurs paramètres (état, luminosité, horaires, etc.) sans passer par le cloud.

## LUCAS

LUCAS est le nom de l’assistant et décrit aussi sa philosophie : un seul hub centralisé, local et autonome pour tout ton quotidien numérique.

- **L — Local**  
  Tout tourne en local, sans dépendance obligatoire à un cloud extérieur. L’assistant peut fonctionner hors ligne après installation et téléchargement des modèles.

- **U — Unifié**  
  Un seul point d’accès pour le chat, la voix, les automatisations et (plus tard) le contrôle d’appareils connectés. Tu dialogues avec un même assistant, quel que soit le mode d’interaction.

- **C — Central**  
  LUCAS sert de cœur de ton environnement local, agissant comme point d’entrée pour tes services, scripts et automatisations. C’est le "cœur" de ton système, non seulement de ton homelab, mais de ton espace numérique.

- **A — Autonome**  
  LUCAS peut exécuter des tâches planifiées, lancer des scripts, déclencher des alertes, ou ajuster des paramètres dans tes services locaux, dans les limites de ce que tu lui autorises.

- **S — Self-hosted**  
  100% auto‑hébergé chez toi, sans API payante ni dépendance à un service commercial. Tu contrôles le matériel, le réseau et les données.

Le reste de ce document décrit comment construire concrètement LUCAS, en partant d’un chat local très simple jusqu’à un assistant vocal autonome capable de piloter des appareils connectés si tu le souhaites.

***

## 💡 Les 4 piliers du projet

### 💸 100% Gratuit

Ce projet est **entièrement gratuit à l’usage logiciel**. Aucun abonnement, aucune clé API payante, aucun quota de requêtes imposé par un service tiers. Ollama, Open WebUI, Whisper, Piper et Docker Compose sont tous utilisables sans payer un seul centime à un fournisseur cloud. Le seul coût réel est celui du matériel que vous possédez déjà : électricité, RAM, stockage. Cela signifie que vous pouvez faire tourner votre assistant 24h/24 sans jamais recevoir une facture surprise.

***

### 🔓 100% Open Source

Chaque brique de cette stack est **open source** : le code source est public, auditable, modifiable et redistribuable librement. Ollama, Open WebUI, Whisper, Piper et Docker sont tous des projets publiés sous licences ouvertes. Cela apporte une transparence totale sur ce que fait le logiciel — pas de boîte noire, pas de données envoyées en secret — et garantit la pérennité du projet : même si une entreprise abandonne son produit, la communauté peut continuer à le maintenir.

Le projet LUCAS doit donc être pensé dès le départ comme un projet **forkable**, **lisible** et **portable**, afin que n’importe qui puisse le modifier, l’améliorer et l’adapter à son propre matériel ou à son home-lab.

***

### 🏠 100% Local

L’assistant tourne **entièrement sur votre machine**, sans jamais solliciter un serveur distant pour répondre. L’inférence du LLM, la transcription vocale (Whisper), la synthèse vocale (Piper) et l’interface sont toutes exécutées localement. Cela signifie une **latence réduite**, une **confidentialité forte**, et une **disponibilité hors ligne** une fois les modèles téléchargés.

***

### 🖥️ 100% Self-Hosted

**Self-hosted** signifie que vous hébergez vous-même l’intégralité des services, sur votre propre matériel, dans votre propre réseau. Grâce à Docker Compose, chaque brique (LLM, interface, voix, orchestration) tourne dans un conteneur isolé sur votre machine. Cela vous donne un **contrôle total** : vous décidez quand mettre à jour, quels modèles utiliser, qui peut accéder à l’interface, et où sont stockées les données.

***

## Contraintes du projet

Les contraintes validées pour ce projet sont les suivantes :

- Exécution full local uniquement, sans API cloud payante
- Déploiement sous Docker / Docker Compose
- Fonctionnement hors ligne après installation initiale et téléchargement des modèles
- Utilisation d’outils gratuits et open source à l’usage, sans abonnement
- Évolutivité vers un environnement plus riche et une intégration avec des services locaux (domotique, automatisations, etc.) à moyen terme
- Architecture modifiable facilement par la communauté open source
- Possibilité d’interaction prioritairement vocale, avec exécution d’ordres locaux

## Vision d’ensemble

L’idée est de séparer le projet en plusieurs briques simples et robustes, plutôt que d’essayer de construire un « super assistant » d’un seul bloc dès le départ. Cette approche permet de valider chaque couche indépendamment : moteur LLM, interface, voix, orchestration, exécution d’actions locales, puis éventuellement **intégration avec des services locaux tels que des appareils connectés**.

L’assistant peut donc commencer comme un chat local sur ordinateur, puis évoluer ensuite vers un système vocal, puis enfin vers une plateforme centrale capable de piloter d’autres services locaux.

La cible long terme est un assistant qui :

- comprend des ordres vocaux naturels ;
- prend des décisions dans un cadre défini ;
- exécute des actions locales sur la machine ;
- dialogue avec des API locales du home-lab ;
- demande ou respecte des autorisations pour les actions sensibles.

## Architecture recommandée

### Socle minimal

Le socle recommandé pour démarrer est le suivant :

| Brique | Outil recommandé | Rôle |
|---|---|---|
| LLM local | Ollama | Sert les modèles en local via API HTTP |
| Interface IA | Open WebUI | Fournit une interface de chat locale |
| Orchestrateur LUCAS | Service Python dédié | Coordonne profils, exécutions, permissions, outils |
| Orchestration | Docker Compose | Lance et relie les services localement |
| Stockage | Volumes Docker | Conserve modèles, données et configuration hors redéploiement |
| Configuration | Fichiers `.env` / YAML / JSON | Paramètres lisibles, modifiables, versionnables |

### Extension voix

Une fois le socle minimal stable, la couche vocale peut être ajoutée avec :

| Brique | Outil recommandé | Rôle |
|---|---|---|
| Speech-to-Text | Whisper local | Transcrit la voix en texte en local |
| Text-to-Speech | Piper | Génère une voix locale hors ligne |
| Orchestration vocale | Python local | Gère micro, pipeline vocal, wake word futur, permissions |
| Actions locales | Python / scripts système | Lance programmes, workflows, scènes et routines |

### Extension avec services locaux

Pour la suite du projet, l’architecture pourra évoluer vers :

- L’intégration avec des applications locales (par exemple une appli de domotique ou une API maison) qui exposent des appareils connectés
- L’ajout d’une couche d’agents/outils locaux permettant à l’IA de lire et modifier des paramètres (état, luminosité, horaires, etc.) sur ces appareils, **si l’utilisateur l’autorise explicitement**
- Une séparation plus fine des rôles (LLM, interface, voix, automatisations, sécurité, permissions) pour faciliter la maintenance et l’extension future
- Une logique de contrôle par permissions afin d’éviter qu’un modèle exécute librement n’importe quelle commande

## Pourquoi cette stack est adaptée

Ollama est pertinent pour ce projet parce qu’il permet de servir des modèles localement avec une interface simple, une API exploitable depuis d’autres services, et un stockage local des modèles déjà téléchargés. Cela colle parfaitement à l’objectif « pas d’Internet, pas de coût API, pas de limite externe ».

Open WebUI est un bon compagnon pour la partie conversationnelle, mais il ne doit pas porter à lui seul toute l’identité produit de LUCAS. Il doit plutôt jouer le rôle de **front IA principal**, pendant que LUCAS garde son propre cœur d’orchestration, ses permissions, ses profils machine, ses actions et ses intégrations.

Whisper et Piper complètent ensuite l’expérience pour tendre vers un vrai assistant vocal offline.

## Ce que veut dire "full local"

Dans ce projet, "full local" signifie que l’inférence du modèle, l’interface, la voix, l’orchestration et l’exécution des actions tournent tous sur des services hébergés chez soi, sans passer par une API distante au moment de l’utilisation. Une fois les images Docker et les modèles téléchargés, l’assistant continue à fonctionner même sans connexion Internet, tant qu’aucun service externe n’a été intégré volontairement.

En revanche, sans Internet, certaines fonctions restent indisponibles par nature, par exemple la recherche web temps réel, le téléchargement de nouveaux modèles, ou la mise à jour automatique des conteneurs.

## Ce que veut dire "gratuit"

Le projet est gratuit **à l’usage logiciel**, car il n’y a pas de coût de requête API si le LLM tourne sur la machine locale via Ollama. Open WebUI, Whisper, Piper et Docker Compose peuvent aussi être utilisés en auto‑hébergement sans abonnement imposé par un fournisseur cloud.

Le vrai coût éventuel ne vient donc pas d’un service logiciel, mais du matériel : consommation électrique, stockage, RAM, GPU, et éventuellement future machine dédiée si le projet prend de l’ampleur.

## Les limites réelles du système

Le projet n’aura pas de limite de requêtes commerciale, mais il gardera des limites matérielles. Les performances dépendront directement du processeur, du GPU, de la VRAM, de la RAM système et de la taille du modèle choisi.

En pratique, plus le modèle est gros, plus le temps de réponse augmente et plus les ressources consommées montent. Il est donc préférable de viser d’abord un système réactif et simple, puis d’augmenter la complexité une fois l’infrastructure maîtrisée.

## Profils utilisateurs et versions de LUCAS selon la machine

Afin de rendre le projet accessible au plus grand nombre, LUCAS peut être pensé en plusieurs **profils matériels** plutôt qu’en une seule configuration rigide.

### LUCAS Lite

Profil pensé pour :

- PC portables modestes
- petites configurations bureautiques
- machines sans GPU dédié
- utilisateurs qui veulent surtout un assistant simple et réactif

Recommandations :

- RAM : 8 Go minimum
- Modèles IA : 1B à 3B prioritairement
- Usage : chat simple, ordres courts, petites automatisations locales
- Priorité : rapidité et compatibilité maximale

### LUCAS Standard

Profil pensé pour :

- la majorité des utilisateurs
- PC fixes ou portables modernes
- machines capables de faire tourner un assistant local confortable

Recommandations :

- RAM : 16 Go recommandés
- Modèles IA : 7B comme cible principale
- Usage : assistant quotidien, chat, commandes vocales, routines locales
- Priorité : bon équilibre entre vitesse et qualité

### LUCAS Plus

Profil pensé pour :

- utilisateurs avancés
- machines bien équipées
- usage plus intensif du local AI

Recommandations :

- RAM : 32 Go recommandés
- Modèles IA : 7B à 13B selon quantification et confort machine
- Usage : assistant plus qualitatif, contexte plus large, scénarios plus riches
- Priorité : qualité supérieure tout en restant utilisable au quotidien

### LUCAS Pro Local

Profil pensé pour :

- grosses tours
- homelabs puissants
- utilisateurs experts
- machines avec GPU confortable ou très grosse RAM

Recommandations :

- RAM : 64 Go et plus selon objectifs
- Modèles IA : 13B+ et éventuellement 70B quantifié selon matériel
- Usage : assistant local haut de gamme, orchestration plus dense, multi-services
- Priorité : qualité maximale locale

### Principe produit recommandé

Au lieu d’imposer un seul modèle à tous, LUCAS doit permettre :

- un **profil par défaut** au premier lancement ;
- un **choix guidé selon le matériel détecté** ;
- la possibilité de **changer de modèle plus tard** dans les paramètres ;
- une structure de configuration permettant d’ajouter facilement de nouveaux modèles pris en charge.

## Expérience utilisateur visée

LUCAS ne doit pas être présenté comme un simple ensemble de conteneurs Docker, mais comme un **produit local cohérent**.

L’expérience cible est la suivante :

- l’utilisateur installe LUCAS ;
- LUCAS démarre ses services localement ;
- une interface moderne s’ouvre ;
- l’utilisateur parle à son assistant ou lui écrit ;
- l’utilisateur gère ses paramètres depuis une interface dédiée ;
- les actions locales et domotiques passent par des permissions explicites.

Autrement dit, techniquement, LUCAS repose sur un **serveur web local**, mais pour l’utilisateur, cela doit ressembler à une **application locale moderne**.

## Comment l’utilisateur gère ses paramètres

Le mode de gestion le plus cohérent pour LUCAS est une **interface web locale** accessible dans le navigateur, par exemple via `http://localhost:3000` ou un port défini dans la configuration.

Ce choix a plusieurs avantages :

- compatible Windows, Linux et macOS ;
- cohérent avec Docker et l’auto-hébergement ;
- facile à modifier pour la communauté ;
- simple à rendre responsive pour téléphone, tablette et desktop ;
- plus simple à maintenir qu’une application native spécifique à chaque OS.

### Ce que voit l’utilisateur

L’utilisateur n’a pas besoin de voir Docker, Compose ou les services internes. Il voit une interface avec par exemple :

- une page d’accueil / tableau de bord ;
- une interface de chat ;
- une interface vocale ;
- une section paramètres ;
- une page permissions / appareils ;
- une page système / santé des services / logs.

### Paramètres à prévoir

Les paramètres doivent être gérés dans l’interface, pas à la main dans les fichiers pour l’usage normal.

Sections recommandées :

- **Modèle IA** : profil machine, modèle choisi, température, limites de contexte
- **Voix** : langue, micro, voix, volume, activation vocale
- **Actions locales** : applications autorisées, scripts, routines système
- **Appareils / Home-lab** : services connectés, permissions, scènes, règles
- **Sécurité** : authentification locale, rôles, confirmation pour actions sensibles
- **Système** : ports, démarrage automatique, sauvegardes, logs, santé des services
- **Données** : mémoire, historique, export, purge

### Règle importante

Pour un usage normal, l’utilisateur ne doit **jamais** être obligé de modifier un `docker-compose.yml` ou des variables techniques à la main.

Les fichiers de configuration doivent exister pour la communauté open source et les utilisateurs avancés, mais le flux standard doit passer par l’interface.

## Langages et cohérence technique

Pour rester cohérent techniquement et garder un projet facilement maintenable, la répartition recommandée est la suivante.

### Backend / orchestration LUCAS

**Python** est le meilleur candidat pour le cœur de LUCAS, car il est particulièrement adapté à :

- l’orchestration locale ;
- les scripts système ;
- les intégrations vocales ;
- les automatisations ;
- les appels vers des API locales ;
- la gestion des permissions et des workflows.

### Interface de gestion

L’interface peut être construite en **web moderne**, idéalement avec :

- TypeScript / JavaScript
- frontend réactif moderne
- interface responsive
- communication HTTP/WebSocket avec le backend local

### Briques conteneurisées

Les services suivants restent dockerisés :

- Ollama
- Open WebUI
- Whisper
- Piper
- services additionnels du home-lab
- backend LUCAS si nécessaire

### Position recommandée

Le plus cohérent est donc :

- **Python** pour le cœur de LUCAS
- **interface web moderne** pour les paramètres et l’usage
- **Docker Compose** pour l’assemblage des briques
- **fichiers de config lisibles** pour les utilisateurs avancés et la communauté

## Installation et démarrage

Puisque le projet est open source et destiné à être modifié par la communauté, il n’est pas nécessaire de baser la distribution principale sur une application compilée type `.exe`.

Le plus cohérent est de prévoir une installation simple, documentée, reproductible, mais **sans enfermer le projet dans un binaire propriétaire ou difficile à maintenir**.

### Ce qu’il faut éviter comme format principal

À éviter comme approche centrale du projet :

- dépendre d’un installeur fermé ;
- imposer un binaire spécifique à un système ;
- masquer toute l’architecture au point de compliquer le fork ;
- rendre difficile la contribution open source.

### Ce qu’il faut viser

L’objectif est une installation :

- simple ;
- lisible ;
- reproductible ;
- cross-platform autant que possible ;
- facilement modifiable ;
- acceptable pour des utilisateurs non experts sans sacrifier l’ouverture du projet.

## Stratégie d’installation recommandée

### Niveau 1 — Base open source simple

Le projet doit pouvoir être lancé avec une structure propre de type :

- dépôt Git
- fichier `docker-compose.yml`
- fichier `.env.example`
- script de préparation
- documentation claire

Exemple de flux :

1. installer Docker ;
2. cloner le dépôt ;
3. copier le fichier d’environnement ;
4. lancer une commande simple de démarrage.

### Niveau 2 — Simplification via scripts

Au lieu de demander aux gens de taper plusieurs commandes manuelles complexes, le projet peut fournir des scripts simples :

- `setup.sh` pour Linux / macOS ;
- `setup.ps1` pour Windows ;
- `start.sh` / `start.ps1` ;
- `stop.sh` / `stop.ps1` ;
- éventuellement `update.sh` / `update.ps1`.

Ainsi, l’utilisateur ne manipule presque jamais Docker directement. Il utilise les scripts du projet.

### Niveau 3 — One-command plutôt que one-click

Le vrai « one-click » universel est compliqué si le projet dépend de Docker sur plusieurs OS. En revanche, un **one-command propre** est réaliste, open source, maintenable, et bien plus cohérent avec le projet.

Exemple d’objectif :

- `./setup.sh`
- puis `./start.sh`

ou sur Windows :

- `./setup.ps1`
- puis `./start.ps1`

Cela reste simple pour l’utilisateur tout en restant excellent pour la communauté open source.

## Ce que doivent faire les scripts

Les scripts doivent idéalement :

- vérifier que Docker est installé ;
- vérifier que Docker fonctionne ;
- créer les dossiers nécessaires ;
- générer les fichiers de configuration manquants ;
- lancer les conteneurs ;
- afficher l’URL locale d’accès à LUCAS ;
- éventuellement proposer le téléchargement du ou des modèles de base ;
- vérifier que les services répondent correctement.

## Démarrage au quotidien

Une fois installé, l’utilisateur ne doit pas relancer l’assistant par une suite de commandes techniques.

Le flux visé doit être :

- il lance un script simple ou un raccourci vers ce script ;
- LUCAS démarre ses conteneurs ;
- le serveur local se lance ;
- l’interface s’ouvre dans le navigateur ;
- l’utilisateur interagit avec son assistant.

Sur une machine personnelle, cela peut ensuite être couplé à un démarrage automatique optionnel.

## Implémentation recommandée par phases

### Phase 1 — Base locale minimale

Objectif : obtenir rapidement un premier assistant local utilisable.

Étapes recommandées :

1. Installer Docker sur la machine hôte
2. Déployer Ollama dans un conteneur avec volume persistant
3. Déployer Open WebUI et le relier à Ollama
4. Ajouter le service backend LUCAS minimal
5. Télécharger à l’avance un ou deux modèles adaptés au matériel disponible
6. Vérifier qu’un chat local fonctionne totalement sans cloud

Résultat attendu : une base stable, simple à comprendre, et déjà utile au quotidien.

### Phase 2 — Ajout de la voix

Objectif : transformer le chat local en assistant vocal.

Étapes recommandées :

1. Ajouter un service local de transcription basé sur Whisper
2. Ajouter un service local de synthèse vocale basé sur Piper
3. Écrire un orchestrateur Python pour piloter la chaîne micro → transcription → LLM → voix
4. Ajouter plus tard un mot-clé d’activation si nécessaire
5. Ajouter l’exécution de commandes locales autorisées

Résultat attendu : un premier « Jarvis » vocal local qui répond et agit sans cloud.

### Phase 3 — Exécution d’actions locales

Objectif : faire de LUCAS un assistant réellement exécutable sur la machine.

Étapes recommandées :

1. Définir un registre des actions locales autorisées
2. Créer une couche de permissions
3. Mapper des ordres naturels vers des actions concrètes
4. Ajouter des profils d’usage : gaming, travail, stream, multimédia, maison
5. Permettre l’exécution de routines complètes

Exemples :

- lancer une scène de stream ;
- ouvrir plusieurs applications ;
- régler un environnement de travail ;
- fermer ou démarrer certains outils ;
- exécuter des scripts système préautorisés.

### Phase 4 — Intégration avec services locaux

Objectif : rendre le projet maintenable, évolutif, et capable d’interagir avec des appareils connectés si l’utilisateur le souhaite.

Étapes recommandées :

1. Séparer les services dans une architecture Docker Compose propre
2. Préparer une couche d’API ou d’agents locaux qui permettent à l’IA de lire et ajuster des paramètres sur des services locaux
3. Conserver les mêmes interfaces réseau internes pour éviter les refontes
4. Préparer l’ajout ultérieur d’autres briques locales
5. Ajouter un système d’autorisations détaillé pour les appareils et services

Résultat attendu : une architecture scalable, lisible et facile à faire évoluer vers un assistant qui peut, **si autorisé**, piloter des appareils et services locaux.

## Prérequis techniques

### Logiciels

Les prérequis logiciels les plus importants sont :

- Docker
- Docker Compose
- un système capable d’exécuter les conteneurs localement
- Python si une couche vocale ou des scripts de pilotage sont ajoutés
- un espace disque suffisant pour stocker les modèles téléchargés
- une application ou API locale permettant de contrôler des appareils connectés

### Compétences

Les compétences utiles pour démarrer sereinement sont :

- comprendre les bases de Docker, images, conteneurs, volumes et ports
- savoir lire et modifier un fichier `docker-compose.yml`
- avoir des bases en ligne de commande
- avoir quelques notions de Python si une interface vocale ou une logique d’automatisation maison doit être ajoutée

Aucune expertise ML avancée n’est indispensable pour la première phase du projet, ce qui en fait un bon chantier progressif.

## Rôle des volumes Docker

Les volumes Docker sont essentiels, car ils garantissent la persistance des modèles, de la configuration et des données même si les conteneurs sont recréés ou mis à jour. Sans eux, il faudrait retélécharger ou reconfigurer inutilement l’environnement.

Pour un projet de ce type, il faut au minimum prévoir des volumes pour Ollama, Open WebUI et la configuration propre à LUCAS. Des volumes supplémentaires peuvent être ajoutés plus tard pour les profils vocaux, les logs ou des mémoires locales spécifiques.

## Choix des modèles

Le choix du modèle doit être dicté par le matériel disponible et par la priorité donnée soit à la vitesse, soit à la qualité de réponse. Pour un démarrage propre, il vaut mieux privilégier un modèle raisonnable et réactif plutôt qu’un très gros modèle trop lent pour un usage quotidien.

Le bon réflexe est de télécharger quelques modèles en amont, de les garder localement dans le volume Ollama, puis de comparer leur confort d’usage hors ligne sur les tâches réelles visées par le projet.

## Sécurité et isolation

Une architecture locale sous Docker aide à mieux contrôler l’exposition réseau et les dépendances. Pour aller plus loin, une approche intéressante consiste à distinguer un environnement de téléchargement / mise à jour et un environnement d’exécution, afin que l’assistant principal puisse rester isolé d’Internet la plupart du temps.

Cette logique est particulièrement cohérente si le projet évolue ensuite vers une intégration poussée avec des appareils et services locaux, où chaque service doit être clairement segmenté et autorisé explicitement par l’utilisateur.

Pour les actions sensibles, il est recommandé de prévoir :

- des listes blanches d’actions ;
- des confirmations avant exécution ;
- des rôles / permissions ;
- des journaux d’exécution ;
- une séparation claire entre conversation et exécution.

## Feuille de route conseillée

### Démarrage immédiat

- Monter un stack minimal `ollama + open-webui + lucas-core`
- Télécharger un petit nombre de modèles avant toute utilisation offline
- Vérifier les performances locales et la stabilité
- Préparer les profils Lite / Standard / Plus / Pro

### Après validation

- Ajouter Whisper pour l’entrée vocale locale
- Ajouter Piper pour la sortie vocale locale
- Créer une couche de pilotage Python
- Ajouter les premières actions locales autorisées

### Plus tard

- Ajouter une couche d’API / agents locaux pour interagir avec des services locaux
- Étendre l’assistant pour qu’il puisse ajuster des paramètres sur des appareils connectés
- Prévoir une architecture plus segmentée et sécurisée pour gérer les autorisations et les accès aux services locaux
- Ajouter des scènes complexes orientées travail, stream, multimédia et maison connectée

## Recommandation finale

La meilleure manière de lancer ce projet est de **commencer petit, mais avec une architecture déjà propre**. Le point d’entrée le plus logique reste un stack Docker minimal, entièrement local, avec Ollama et Open WebUI, complété par un cœur LUCAS en Python, puis une extension vocale dans un second temps avec Whisper et Piper.

Cette approche respecte toutes les contraintes fixées : full local, gratuit à l’usage, hors ligne après préparation initiale, sans API payante, sans quotas externes, et facilement extensible vers un assistant capable, **si l’utilisateur le souhaite**, de contrôler des appareils et services locaux connectés.

LUCAS ne doit pas être pensé comme un simple chatbot local, mais comme un **assistant personnel open source, vocal, exécutable, auto-hébergé et extensible**, inspiré de JARVIS, capable à terme de devenir le centre d’orchestration intelligent du quotidien numérique et domestique de son utilisateur.