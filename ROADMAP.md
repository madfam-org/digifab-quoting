# Cotiza Studio Roadmap

## Current Priority: Truthful Yantra4D Quote Import

Cotiza Studio is the quote authority in the Selva -> Yantra4D -> Cotiza -> ForgeSight flow. Its production contract is to create client-ready quotes only when the requested truth requirements are satisfied.

## Wave 1: Strict Market Verification

- [ ] Treat `require_market_verified=true` as a strict contract, not a review hint.
- [ ] Return a non-success quote response, preferably `424 market_data_unavailable`, when ForgeSight cannot provide verified pricing.
- [ ] Preserve review-mode behavior only when `require_market_verified=false`.
- [ ] Ensure synthetic, fallback, inferred, stale, or manually estimated prices cannot become client-ready verified quotes.
- [ ] Include `market_verified`, `pricing_source`, `fallback_reason`, `sample_count`, `region`, currency, and source timestamps in quote responses.

## Wave 2: Yantra4D Import Hardening

- [ ] Require tenant context and authenticated identity for every Yantra4D import.
- [ ] Preserve Yantra4D project slug, project version, mode, parameters, geometry metadata, and rendered asset references.
- [ ] Add a canonical Tablaco import fixture for strict verified quote testing.
- [ ] Distinguish these states explicitly: `VERIFIED_READY`, `NEEDS_REVIEW`, `MARKET_DATA_UNAVAILABLE`, and `DRAFT`.

## Wave 3: ForgeSight Client Contract

- [ ] Normalize ForgeSight success and failure responses without losing provenance.
- [ ] Surface ForgeSight `424 market_data_unavailable` as a hard blocker in strict mode.
- [ ] Keep tenant-safe audit logs for each market-pricing lookup.
- [ ] Add contract tests for verified and unverified ForgeSight responses.

## Wave 4: Production Health

- [ ] Resolve the unhealthy/restarting API replica.
- [ ] Keep all API replicas ready before declaring the quote path production-stable.
- [ ] Add Enclii-visible smoke checks for authenticated quote import.

## Acceptance Gate

An authenticated Tablaco import with `require_market_verified=true` must either create a client-ready quote with `market_verified=true` and ForgeSight provenance, or fail closed without creating a client-ready quote.
