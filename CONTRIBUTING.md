# Contribuer

## Flux Git

1. Créer une branche depuis `preprod` : `type/description-courte` (`feat`, `fix`, `refactor`, `style`, `perf`, `test`, `docs`, `chore`).
2. Commits : `type(cible): description courte en français`.
3. Ouvrir une pull request vers `preprod`.
4. `main` ne reçoit que des pull requests venant de `preprod`, fusionnées avec un **merge commit** (« Create a merge commit »). Ni squash ni rebase : ils réécrivent les commits et recréent une divergence entre `main` et `preprod`.
5. Les branches de travail sont supprimées après fusion, sur GitHub comme en local. `main` et `preprod` ne sont jamais supprimées.

## Vérifications

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
node --check crates/lucas-core/ui/app.js
node --check crates/lucas-core/ui/companion.js
```
