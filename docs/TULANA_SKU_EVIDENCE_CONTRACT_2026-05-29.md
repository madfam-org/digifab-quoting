# Tulana SKU evidence contract for Cotiza

Date: 2026-05-29

Status: active contract for Tulana commercial-GA readiness

## Direct surfaces

| Surface           | URL                                      | Verification note                         |
| ----------------- | ---------------------------------------- | ----------------------------------------- |
| Cotiza Studio     | `https://cotiza.studio`                  | HTTP 200 verified on 2026-05-29           |
| Cotiza API        | `https://api.cotiza.studio`              | `/health` HTTP 200 verified on 2026-05-29 |
| Legacy quote host | `https://quote.digifab.io`               | DNS did not resolve on 2026-05-29         |
| Tulana dashboard  | `https://tulana-app.madfam.io/dashboard` | HTTP 307 verified on 2026-05-29           |

## SKU family

Tulana should treat Cotiza as the commercial quoting/pricing layer for digital
fabrication. Primavera3D is a Cotiza-powered maker-node showcase and quoting
site unless a separate standalone SKU is explicitly approved later.

Tulana SKU keys must come from the active Dhanam catalogue mirror. Do not create
new Cotiza SKU keys from marketing routes alone.

## Evidence Cotiza must provide or keep current

| Evidence area      | Required source                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Product surface    | Quote flow, API availability, sample quote path, public route evidence                                          |
| SKU identity       | Dhanam catalogue rows and Tulana mirror                                                                         |
| Comparator context | Xometry, Protolabs, Fictiv, SendCutSend, Hubs, local fabrication quoting peers where relevant                   |
| Cost basis         | Material, labor, machine time, setup, post-processing, QA, packaging, shipping, payment fees, platform overhead |
| Quote truth        | Quote inputs, market verification, provenance from Yantra4D/ForgeSight where applicable                         |
| Buyer signal       | Quote starts, accepted quotes, Phynd CRM leads, WTP/PMF, pilot outcomes                                         |
| Claims guardrail   | Do not claim instant manufacturability or guaranteed price without quote proof and market verification          |

## Integration with Tulana

Tulana needs Cotiza evidence in two forms:

1. SKU-level pricing readiness for Cotiza's own commercial tiers.
2. Quote-truth evidence for phygital campaigns where Cotiza output supports a
   client-facing offer.

The second form does not automatically create new Tulana SKUs. It supports
campaign proof points and buyer-signal evidence.

## Definition of done

- Cotiza SKUs exist in Dhanam and Tulana with stable keys.
- Cost components are granular enough for floor-price derivation.
- Comparator observations are fresh or explicitly waived.
- Quote-truth guardrails are available to Selva and Phynd CRM campaign flows.
- Tulana can rank Cotiza SKUs by commercial GA readiness without treating
  Primavera3D as a standalone product.
