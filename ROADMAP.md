# Cotiza Studio Roadmap

This file is the single list of pending work for this repository. `AGENTS.md`,
`docs/DEPLOYMENT.md`, `llms.txt` and `llms-full.txt` point here instead of
keeping their own lists.

Priorities: **P0** blocks production use, **P1** should land next, **P2** is
planned, **P3** is cleanup. **Kind** says whether the next step is an
**owner decision** or **engineering work**.

## Pending work (as of 2026-10-02)

| Item                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Why it matters                                                                                                                                                                          | Priority | Kind                                                                                               | Tracking                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pravara dispatch contract drift.** `PravaraDispatchService` POSTs a flat job (`orderId`, `externalId`, `items[]`, …) to `${PRAVARA_API_URL}/api/v1/mes/jobs` with `x-webhook-signature` and `x-webhook-timestamp`. Pravara's `main` serves its Cotiza inbound handler at `/v1/webhooks/cotiza`, verifies `X-Cotiza-Signature` and expects an `event` + `order` envelope; it has no `mes/jobs` route. The HMAC (hex SHA-256 of the raw body) matches. | The dispatch on `ORDERED` is fire-and-forget, so the mismatch is only logged. No order reaches fabrication automatically until both sides agree on one route, header and payload shape. | P1       | Owner decision (which side is canonical), then engineering work with a contract test on both sides | [pravara-mes `ROADMAP.md`, "Pending work and roadmap ahead"](https://github.com/madfam-org/pravara-mes/blob/main/ROADMAP.md); `AGENTS.md`, "Related repositories / contracts" |
| **Dhanam milestone-invoice route drift.** `DhanamMilestoneService` POSTs `${DHANAM_API_URL}/api/v1/invoices` with `x-webhook-signature`. No matching `POST` invoices route was found on Dhanam's `main` on 2026-10-02. The billing relay (`DhanamRelayService` → Dhanam's Cotiza webhook, `x-cotiza-signature`) does match.                                                                                                                            | Milestone invoices are fire-and-forget too, so a missing route fails silently and milestone billing never reaches Dhanam.                                                               | P1       | Engineering work (confirm the intended route with the Dhanam owners first)                         | Details in `AGENTS.md`, "Related repositories / contracts"                                                                                                                    |
| **nodemailer 7 needs an SESv2 transport.** `apps/api` stays on `nodemailer@^6.10.1` because 7.0 removed the aws-sdk v2 `SES` transport that `apps/api/src/modules/email/email.service.ts` builds with `new aws.SES(...)`. The upgrade moves the transport to `@aws-sdk/client-sesv2` (nodemailer's `SES: { sesClient, SendEmailCommand }` shape) and should land as its own change.                                                                    | nodemailer is the last high-severity finding in the lockfile scan; the fixes exist only in 7.x+.                                                                                        | P1       | Engineering work                                                                                   | —                                                                                                                                                                             |
| **`@cotiza/pricing-engine` runs no tests.** All 12 test files are in `testPathIgnorePatterns` in `packages/pricing-engine/jest.config.js` (`passWithNoTests: true`) because the calculator API drifted.                                                                                                                                                                                                                                                | No test pins per-process calculator outputs, so a pricing-formula regression would pass CI. Rewriting them touches pricing formulas, so the revenue rules in `AGENTS.md` apply.         | P2       | Engineering work                                                                                   | `AGENTS.md`, "Tests"                                                                                                                                                          |
| **`apps/worker` and `apps/web` have no unit tests in CI.** The worker has no tests (CI accepts pytest exit code 5); the web app has only the `next.config.js` guard; the Playwright specs in `e2e/` run only from the manual `test.yml`.                                                                                                                                                                                                               | Geometry/DFM and the web UI can regress without a red check.                                                                                                                            | P2       | Engineering work                                                                                   | `AGENTS.md`, "Tests"                                                                                                                                                          |
| **`test.yml` uses the retired `actions/upload-artifact@v3`** (three steps).                                                                                                                                                                                                                                                                                                                                                                            | GitHub fails any job that references v3, so the manual-only `Test Suite` would fail at those jobs if dispatched. `ci.yml`, which gates PRs, already uses `@v4`.                         | P3       | Engineering work (move to `@v4` when the suite is rewritten)                                       | —                                                                                                                                                                             |

Product waves for the Yantra4D quote import follow. Items checked below are
implemented and covered by
`apps/api/src/modules/quotes/__tests__/yantra4d-import.service.spec.ts`.

## Current priority: truthful Yantra4D quote import

Cotiza Studio is the quote authority in the Selva -> Yantra4D -> Cotiza ->
ForgeSight flow. Its production contract is to create client-ready quotes only
when the requested truth requirements are satisfied. The open waves below are
**P2 engineering work** unless marked otherwise.

## Wave 1: Strict Market Verification

- [x] Treat `require_market_verified=true` as a strict contract, not a review hint.
- [x] Return a non-success quote response (`424 market_data_unavailable`) when ForgeSight cannot provide verified pricing; no quote is created.
- [x] Preserve review-mode behavior only when `require_market_verified=false` (review-only warning, `NEEDS_REVIEW`).
- [x] Ensure fallback and internal estimates are recorded with `market_verified=false`.
- [ ] Include `region`, currency and source timestamps next to the `market_verified`, `pricing_source`, `fallback_reason` and `sample_count` fields the response already carries.

## Wave 2: Yantra4D Import Hardening

- [ ] Require tenant context and authenticated identity for every Yantra4D import.
- [ ] Preserve Yantra4D project slug, project version, mode, parameters, geometry metadata, and rendered asset references (slug, name and geometry metadata are stored today).
- [ ] Add a canonical Tablaco import fixture for strict verified quote testing.
- [ ] Distinguish these states explicitly: `VERIFIED_READY`, `NEEDS_REVIEW`, `MARKET_DATA_UNAVAILABLE`, and `DRAFT` (today: `DRAFT`, `NEEDS_REVIEW`, `AUTO_QUOTED`, or a 424).

## Wave 3: ForgeSight Client Contract

- [ ] Normalize ForgeSight success and failure responses without losing provenance.
- [ ] Surface ForgeSight `424 market_data_unavailable` as a hard blocker in strict mode.
- [ ] Keep tenant-safe audit logs for each market-pricing lookup.
- [ ] Add contract tests for verified and unverified ForgeSight responses.

## Wave 4: Production Health

- [ ] Resolve the unhealthy/restarting API replica reported on 2026-05-13 (not re-checked in the 2026-10-02 docs pass; confirm through Enclii before closing).
- [ ] Keep all API replicas ready before declaring the quote path production-stable.
- [ ] Add Enclii-visible smoke checks for authenticated quote import.

## Acceptance Gate

An authenticated Tablaco import with `require_market_verified=true` must either create a client-ready quote with `market_verified=true` and ForgeSight provenance, or fail closed without creating a client-ready quote.
