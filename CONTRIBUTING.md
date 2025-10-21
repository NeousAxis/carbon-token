# CONTRIBUTING

Ce projet vise simplicité, solidité et durabilité. Merci de respecter ces principes.

## Principes
- Cohérence: garder README et docs en phase avec le code et la politique.
- Sécurité: ne jamais committer de secrets (`.env`, clés privées).
- Transparence: documenter les changements de politique et d’API.

## Branches et Commits
- Branche: `main` (flux simple).
- Messages de commit: utiliser types courts (`feat`, `fix`, `docs`, `chore`).
  - Exemple: `docs: Add policy docs and link from README`
- Commits ciblés: éviter les commits mélangeant code, ops et docs.

## Documentation
- Mettre à jour:
  - `README.md` si règles IA/supply/politique/commande changent.
  - `docs/policy.md` pour la politique (`POLICY_ALLOW_SOURCES`, auto-run, burn_source).
  - `docs/api.md` pour les endpoints ou payloads.
- Ajouter des exemples `curl` quand c’est utile.

## Configuration et Secrets
- Utiliser `.env` local (non versionné) et proposer les clés dans `sync/.env.example`.
- Variables critiques: `SOLANA_RPC_URL`, `CBWD_MINT`, `MINT_AUTHORITY_SECRET_KEY`, `TREASURY_TOKEN_ACCOUNT`, `SUPABASE_URL`, `SUPABASE_KEY`.
- Politique: `POLICY_ALLOW_SOURCES` (ex: `sdg,un,human_rights,nature_rights`).

## Politique et Ingestion
- Lors d’ajout de nouvelles sources normatives, tagger `event_source` côté ingestion.
- Adapter l’allowlist (`POLICY_ALLOW_SOURCES`) si nécessaire et documenter le changement.

## Tests et Vérifications
- Lancer le serveur en `DRY_RUN=true` pour vérifier endpoints:
  - `PORT=3334 BURN_SOURCE=ops DRY_RUN=true node sync/mint_burn_server.js`
  - Vérifier `GET /auto/status` et `GET /policy/status`.
- Sur Devnet, préférer des montants faibles pour validations rapides.

## Releases
- Petits incréments, commits propres, push sur `main`.
- Si changement de contrat (future), prévoir migration et plan de communication.