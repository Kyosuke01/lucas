# Contribuer

## Flux Git

1. Créer une branche depuis `preprod` : `type/description-courte` (`feat`, `fix`, `refactor`, `style`, `perf`, `test`, `docs`, `chore`).
2. Commits : `type(cible): description courte en français`.
3. Ouvrir une pull request vers `preprod`.
4. `main` ne reçoit que des pull requests venant de `preprod`.

## Vérifications

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
node --check crates/lucas-core/ui/app.js
node --check crates/lucas-core/ui/companion.js
```
