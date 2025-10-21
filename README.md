# CARBON (CBWD) — Agent IA & Token Solana

CARBON est un protocole et un token Solana piloté par un agent IA. Il évalue des décisions et événements à l’aune des ODD (SDG) et des chartes universelles des droits des humains et de la nature, puis agit on-chain.

## Règles Fondamentales
- Aligne avec ODD/Chartes (implémenté et vérifié) → `BURN` des tokens (supply ↓, valeur ↑)
- Régression contraire aux droits/ODD (implémentée) → `MINT` des tokens (supply ↑, valeur ↓)
- Annonce future/conditionnelle/recours → `NEUTRAL` (amount = 0) jusqu’à vérification
- Transparence systémique: sources, hypothèses et clause de faillibilité publiées; réévaluations périodiques

## Supply & Calculs (cohérence)
- Mint canonique: `CBWD_MINT` (décimales `CBWD_DECIMALS`, par défaut 6). La supply lue est l’on-chain sur cette mint.
- Événements comptabilisés si et seulement si `tx_hash` non nul (signé on-chain): totaux `total_minted`/`total_burned` et `total_mints`/`total_burns` dérivés de `carbon_events`.
- Tables Supabase:
  - `carbon_supply`: `upsert(mint_address=current_supply,last_update)` après chaque tx
  - `carbon_overview`: recomptage via `/recount-overview` après chaque tx
- Échelle d’impact indicative (base units CRBN):
  - Local (ville): 1K–10K | Régional: 10K–100K | National: 100K–1M | International: 1M–10M
- Tampon de burn (top-up): auto-mint de couverture uniquement si `BURN_SOURCE=treasury` (paramètre `AUTO_TOPUP_EXTRA_BPS` pour marge). Sinon, aucun top-up.

## Politique & Conformité (automatique)
- Allowlist des sources pour MINT: `POLICY_ALLOW_SOURCES` (par défaut `sdg,un,human_rights,nature_rights`).
- `BURN` est toujours autorisé; `MINT` est filtré par la politique (les événements dont `event_source` n’est pas autorisé sont ignorés).
- `NEUTRAL`: aucun mouvement on-chain; l’événement reste traçable.

## Automatisation
- `autoCycle`:
  - Lit les pending, calcule déficit trésorerie vs burns; top-up mint si `burn_source=treasury`.
  - Traite les `BURN` sans condition.
  - Traite les `MINT` uniquement s’ils passent la politique (`POLICY_ALLOW_SOURCES`).
- Contrôles: `GET /auto/status` expose intervalle, limites, `burn_source`, `policy_allow_sources`; `POST /auto/run` force un cycle.

## API (principales)
- `POST /apply-decision` → applique une décision unique `{decision, amount_crbn, event_id?}`
- `POST /process-pending` → traite la file (MINT/BURN) avec limite
- `GET /pending-summary` → compte et somme des pending, solde trésorerie
- `GET /overview` → adresses, soldes, liens explorer et métriques
- `POST /recount-overview` → recompute l’overview depuis `carbon_events`
- `POST /normalize-pending-mint` → fusionne doublons MINT pending en un seul
- `POST /cleanup-supply-devnet` → garde une seule ligne supply pour la mint Devnet
- `POST /mint-split` → mint réparti (user/treasury/ops/payroll) selon BPS
- `GET /policy/status` → expose l’allowlist et le mode strict

## Configuration (.env)
- Identités & réseau: `SOLANA_RPC_URL`, `CBWD_MINT`, `CBWD_DECIMALS`
- Autorités & comptes: `MINT_AUTHORITY_SECRET_KEY`, `TREASURY_TOKEN_ACCOUNT`, `TREASURY_OWNER_SECRET_KEY`, `OPS_TOKEN_ACCOUNT`, `PAYROLL_TOKEN_ACCOUNT`, `PAYER_SECRET_KEY`
- Politique & exécution: `BURN_SOURCE=treasury|ops|payroll`, `POLICY_ALLOW_SOURCES`, `AUTO_ENABLED`, `AUTO_INTERVAL_MS`, `AUTO_BURN_LIMIT`, `AUTO_MINT_LIMIT`, `AUTO_TOPUP_EXTRA_BPS`
- Split BPS: `OPS_BPS`, `PAYROLL_BPS`, `BURN_BUFFER_BPS` (10000 = 100%)
- Supabase: `SUPABASE_URL`, `SUPABASE_KEY` (service role ou anon selon besoin)

## Démarrage Devnet (rapide)
- Créer une mint + ATA trésorerie et auto-écrire `.env`:
  - `AUTO_WRITE_ENV=true node sync/create_devnet_mint.js`
- Lancer le serveur:
  - `PORT=3334 BURN_SOURCE=ops DRY_RUN=false node sync/mint_burn_server.js`
- Vérifier: `GET /auto/status`, `GET /pending-summary`, `GET /overview`

## Cadre IA (4D)
- Pondérations: Snapshot 25%, Trajectoire 20%, Réévaluation 15%, Prospective 40%.
- Pipeline: collecte → déduplication → normalisation → classification → score 4D → décision (BURN/MINT/NEUTRAL) → on-chain.

## Gouvernance & Réévaluation
- Conseils/validateurs: revue, arbitrage, publication des justifications.
- Triggers de suivi: annonces conditionnelles ⇒ `NEUTRAL` jusqu’à implémentation; réévaluation périodique.

## Sécurité & Opérationnel
- Ne jamais committer les secrets (`.env`).
- `BURN_SOURCE` et la politique garantissent prudence opérationnelle.
- En cas d’anomalie, droit de veto technique: bascule en `DRY_RUN` et/OU suspension auto-run.

## Documentation
- `CONTRIBUTING.md` pour les pratiques et la cohérence.
- `docs/policy.md` pour la politique et l’allowlist.
- `docs/api.md` pour les endpoints et exemples.

---
Ce README définit les règles, la supply, les calculs et la politique par défaut pour assurer simplicité, solidité et durabilité. Toute évolution doit maintenir la cohérence: on-chain comme off-chain.