# Yantra4D Quote Import Pricing Provenance

Cotiza can create a quote from `POST /api/v1/quotes/from-yantra4d`, but the
quote is only market verified when ForgeSight returns usable market evidence.

## Truth contract

`market_context.market_verified` is `true` only when all of these are true:

1. ForgeSight is configured and reachable.
2. ForgeSight returns quote pricing with `sample_count > 0`.
3. ForgeSight returns a non-empty `updated_at` timestamp.
4. ForgeSight returns positive pricing confidence.
5. ForgeSight does not explicitly mark the pricing as unverified.

Any internal engine price, fallback estimate, missing material, missing machine,
or unavailable ForgeSight response must be labeled with
`market_verified: false` and a specific `fallback_reason`.

## Persistence

Yantra4D import provenance is stored in existing JSON fields:

1. `quote.metadata.market_context`
2. `quote.metadata.pricing_provenance`
3. `quoteItem.costBreakdown.pricing_provenance`

No database migration is required for this provenance layer.

## Agent requirement

When a Selva agent sends `require_market_verified: true`, Cotiza still creates
the quote, but if ForgeSight verification is unavailable the quote is marked
`needs_review` and the response includes a warning. Agents must not present that
quote as market-verified to clients.
