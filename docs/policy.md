# Politique de MINT/BURN

Cette politique vise un comportement simple, solide et durable.

## Principes
- `BURN`: toujours autorisé (événements alignés avec ODD et chartes).
- `MINT`: filtré par allowlist de sources (`POLICY_ALLOW_SOURCES`).
- `NEUTRAL`: aucun mouvement on-chain; événement suivi et réévalué.

## Configuration
- `POLICY_ALLOW_SOURCES`: liste CSV des sources normatives autorisées.
  - Défaut: `sdg,un,human_rights,nature_rights`
  - Exemple: `POLICY_ALLOW_SOURCES=sdg,un,human_rights,nature_rights`
- `BURN_SOURCE`: `treasury|ops|payroll` détermine la source des burns.
  - Top-up mint automatique uniquement si `BURN_SOURCE=treasury`.
  - Marge top-up via `AUTO_TOPUP_EXTRA_BPS`.

## Automatisation
- `autoCycle`:
  - Traite `BURN` en priorité; gère top-up si `treasury`.
  - Traite `MINT` uniquement si la source est dans l’allowlist.
- Intervalle, limites, et politique exposés via `GET /auto/status`.

## Endpoints de transparence
- `GET /policy/status`: expose `POLICY_ALLOW_SOURCES` et état strict.
- `GET /auto/status`: inclut `burn_source` et `policy_allow_sources`.

## Gouvernance
- Les changements d’allowlist doivent rester normatifs (ODD/ONU/droits humains/nature).
- Chaque modification est documentée dans `README.md` et changelog des commits.

## Sécurité opérationnelle
- En cas d’incertitude: basculer en `DRY_RUN=true` et/ou désactiver `AUTO_ENABLED`.
- Toujours éviter les décisions au cas par cas non traçables.

## Exemple .env (policy)
```
# Policy and compliance
POLICY_ALLOW_SOURCES="sdg,un,human_rights,nature_rights" # allowlist pour MINT
BURN_SOURCE="ops" # source des burns: treasury|ops|payroll
AUTO_TOPUP_EXTRA_BPS="0" # marge de top-up si BURN_SOURCE=treasury

# Auto-run (exemple)
AUTO_ENABLED="true"
AUTO_INTERVAL_MS="25000"
AUTO_MINT_LIMIT="5"
AUTO_BURN_LIMIT="12"
```