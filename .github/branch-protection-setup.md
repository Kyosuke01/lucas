# 🔒 Branch Protection Rules — Configuration manuelle requise

Les branch protection rules ne peuvent pas être configurées automatiquement via l'API GitHub sans token avec les permissions `administration`. **Voici exactement ce qu'il faut configurer.**

---

## Accès

1. Va sur : https://github.com/Kyosuke01/lucas/settings/branches
2. Clique sur **"Add branch ruleset"** ou **"Add rule"**
3. Applique les paramètres ci-dessous sur la branche **`main`**

---

## Paramètres à activer

### ✔️ Restrict pushes that create matching branches
Nom du pattern : `main`

### ✔️ Require a pull request before merging
- **Required approvals : 1**
- ✔️ Dismiss stale pull request approvals when new commits are pushed
- ✔️ Require approval of the most recent reviewable push

### ✔️ Require status checks to pass before merging
- ✔️ Require branches to be up to date before merging
- **Status checks requis :**
  - `lint`
  - `test (3.11)`
  - `test (3.12)`
  - `docker-validate`
  - `security`

### ✔️ Require conversation resolution before merging

### ✔️ Require linear history (no merge commits — squash ou rebase seulement)

### ✔️ Do not allow force pushes

### ✔️ Do not allow deletions

### ✔️ Include administrators (toi aussi tu dois passer par une PR !)

---

> Une fois configuré, tu peux supprimer ce fichier avec un commit `chore: remove setup guide`.
