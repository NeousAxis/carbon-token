# API

Endpoints principaux avec exemples d’usage.

## apply-decision
- `POST /apply-decision`
- Payload: `{ "decision": "BURN|MINT|NEUTRAL", "amount_crbn": 300000, "event_id": "optional" }`
- Exemple:
```
curl -s -X POST http://localhost:3334/apply-decision \
  -H 'Content-Type: application/json' \
  -d '{"decision":"MINT","amount_crbn":300000,"event_id":"evt-123"}'
```

## process-pending
- `POST /process-pending`
- Payload: `{ "limit": 5 }`
- Exemple: `curl -s -X POST http://localhost:3334/process-pending -H 'Content-Type: application/json' -d '{"limit":5}'`

## pending-summary
- `GET /pending-summary`
- Exemple: `curl -s http://localhost:3334/pending-summary | jq` 

## overview
- `GET /overview`
- Exemple: `curl -s http://localhost:3334/overview | jq`

## recount-overview
- `POST /recount-overview`
- Exemple: `curl -s -X POST http://localhost:3334/recount-overview | jq`

## normalize-pending-mint
- `POST /normalize-pending-mint`
- Exemple: `curl -s -X POST http://localhost:3334/normalize-pending-mint | jq`

## cleanup-supply-devnet
- `POST /cleanup-supply-devnet`
- Payload: `{ "mint": "<MINT_ADDRESS>" }`
- Exemple:
```
curl -s -X POST http://localhost:3334/cleanup-supply-devnet \
  -H 'Content-Type: application/json' \
  -d '{"mint":"6nNnyTJfAGNnYgLoTR6y41BkU7RS6r5TJs8N7TjL5VaF"}' | jq
```

## mint-split
- `POST /mint-split`
- Payload: `{ "amount_crbn": 100000, "ops_bps": 500, "payroll_bps": 500 }`
- Exemple:
```
curl -s -X POST http://localhost:3334/mint-split \
  -H 'Content-Type: application/json' \
  -d '{"amount_crbn":100000,"ops_bps":500,"payroll_bps":500}' | jq
```

## policy/status
- `GET /policy/status`
- Exemple: `curl -s http://localhost:3334/policy/status | jq`

## auto/status
- `GET /auto/status`
- Exemple: `curl -s http://localhost:3334/auto/status | jq`

## auto/run
- `POST /auto/run`
- Exemple: `curl -s -X POST http://localhost:3334/auto/run | jq`