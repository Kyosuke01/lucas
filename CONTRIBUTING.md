# 🤝 Guide de contribution — LUCAS

Merci de l'intérêt que tu portes au projet LUCAS ! Toutes les contributions sont les bienvenues : corrections de bugs, nouvelles fonctionnalités, documentation, traductions...

---

## 📋 Avant de contribuer

1. **Vérifie les issues existantes** — une issue ou PR similaire existe peut-être déjà.
2. **Ouvre une issue d'abord** pour les grosses modifications — discutons du design avant que tu ne codes.
3. **Lis la documentation** dans le dossier `docs/` pour comprendre l'architecture.

---

## 🔀 Workflow Git

Ce projet suit le flow **GitHub Flow** :

```
main (stable, protégé)
  └── feature/ma-fonctionnalite
  └── fix/mon-correctif
  └── docs/ma-documentation
  └── chore/ma-tache-technique
```

### Conventions de nommage des branches

| Préfixe | Usage |
|---|---|
| `feature/` | Nouvelle fonctionnalité |
| `fix/` | Correction de bug |
| `docs/` | Documentation uniquement |
| `chore/` | Maintenance, CI, dépendances |
| `refactor/` | Refactoring sans changement de comportement |
| `test/` | Ajout ou modification de tests |

---

## 📝 Conventions de commits

Ce projet utilise la convention **Conventional Commits** :

```
<type>(<scope>): <description courte>

[corps optionnel]

[footer optionnel]
```

### Types valides

| Type | Description |
|---|---|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `docs` | Documentation |
| `style` | Formatage (pas de changement logique) |
| `refactor` | Refactoring |
| `test` | Ajout ou correction de tests |
| `chore` | Build, CI, dépendances |
| `perf` | Amélioration de performances |
| `ci` | Configuration CI/CD |

### Exemples

```bash
git commit -m "feat(voice): add Whisper STT integration"
git commit -m "fix(core): correct permission check for action whitelist"
git commit -m "docs(readme): update installation guide for Windows"
```

---

## 🚀 Soumettre une Pull Request

1. **Fork** le dépôt
2. **Crée une branche** depuis `main` avec le bon préfixe
3. **Commit** tes changements avec des messages Conventional Commits
4. **Pousse** ta branche et **ouvre une PR** vers `main`
5. **Remplis le template** de PR complètement
6. **Attends la review** — au moins 1 approbation est requise

---

## ✅ Checklist PR

- [ ] Le code respecte le style du projet
- [ ] Les tests passent en local
- [ ] La documentation est mise à jour si nécessaire
- [ ] Les commits respectent Conventional Commits
- [ ] La PR description est complète
- [ ] Pas de secrets ni de fichiers sensibles inclus

---

## 🧪 Lancer les tests

```bash
# Tests Python
pip install -r requirements-dev.txt
pytest

# Linting
ruff check .
black --check .
```

---

## 💬 Besoin d'aide ?

Ouvre une [discussion GitHub](https://github.com/Kyosuke01/lucas/discussions) ou une issue avec le label `question`.
