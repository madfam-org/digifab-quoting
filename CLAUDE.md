# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cotiza Studio Quoting MVP is a multi-tenant quoting system for digital fabrication services. The system provides automated quoting for:

- 3D printing (FFF and SLA)
- CNC machining (3-axis for aluminum, steel, and plastics)
- 2D laser cutting

## Documentation

### Core Documentation Files

- **[docs/ROUTES.md](docs/ROUTES.md)** - Complete route inventory with auth requirements, rate limits, and caching
- **[docs/API_REFERENCE.md](docs/API_REFERENCE.md)** - Full API documentation with request/response examples
- **[docs/NAVIGATION_AUDIT.md](docs/NAVIGATION_AUDIT.md)** - Navigation audit report with user flows and accessibility
- **[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)** - Developer guide for adding and managing routes

## Commands

### Development Setup

```bash
# Install dependencies
npm install

# Run development server (all apps)
npm run dev

# Run specific app
npm run dev -- --filter=@madfam/api
npm run dev -- --filter=@madfam/web

# Run tests
npm test
npm run test:watch
npm run test:cov
npm run test:e2e

# Linting and formatting
npm run lint
npm run format

# Build for production
npm run build

# Database operations
npm run db:generate  # Generate Prisma client
npm run db:push     # Push schema changes (dev)
npm run db:migrate  # Run migrations
npm run db:seed     # Seed initial data

# Clean build artifacts
npm run clean
```

### Docker Commands

```bash
# Build Docker images
docker build -t madfam-frontend ./frontend
docker build -t madfam-backend ./backend
docker build -t madfam-worker ./worker

# Run with docker-compose
docker-compose up -d
docker-compose down
```

### Infrastructure (Terraform)

```bash
# Initialize Terraform
terraform init

# Plan infrastructure changes
terraform plan

# Apply infrastructure changes
terraform apply

# Destroy infrastructure
terraform destroy
```

## Architecture

### Tech Stack

- **Frontend**: Next.js (App Router) with TypeScript, TailwindCSS, shadcn/ui, i18next (ES/EN), React Query
- **Backend**: NestJS with TypeScript, REST API, OpenAPI docs, Zod validation
- **Worker**: Python microservice (FastAPI) for geometry/DFM analysis (also built and deployed via CI/CD)
- **Database**: PostgreSQL with Prisma ORM
- **Queue/Cache**: AWS SQS for job queuing, Redis for caching
- **Storage**: AWS S3 for file uploads and PDFs
- **Auth**: Janua JWT (consolidated -- `LocalAuthGuard` removed, all auth flows use `JanuaAuthGuard`)
- **Payments**: Stripe for card payments, DhanamRelayService for billing webhook relay

### Project Structure

```
/
├── apps/               # Application workspaces
│   ├── api/           # NestJS API server (port 4000)
│   ├── web/           # Next.js frontend application (port 3002)
│   ├── worker/        # Python geometry analysis service
│   └── admin/         # Admin dashboard (placeholder)
├── packages/          # Shared packages
│   ├── pricing-engine/ # Core pricing calculations
│   ├── shared/        # Shared types and schemas
│   └── ui/            # Shared UI components
├── infrastructure/    # Terraform modules
└── docker-compose.yml # Local development orchestration
```

### Multi-Tenant Architecture

- All database tables include `tenant_id` for row-level security
- Tenant context derived from subdomain or API header
- Per-tenant S3 prefixes and KMS keys
- Prisma middleware enforces tenant isolation

### Key API Endpoints

- `POST /api/v1/quotes/upload` - File upload and presigned URL generation
- `POST /api/v1/quotes` - Create quote from uploaded files
- `GET /api/v1/quotes/{id}` - Get quote details
- `POST /api/v1/quotes/{id}/accept` - Accept quote and proceed to payment
- `GET /api/v1/admin/*` - Admin configuration endpoints (role-protected)

For complete route documentation, see:
- [docs/ROUTES.md](docs/ROUTES.md) - Comprehensive route listing with auth requirements
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) - Full API documentation with examples
- [docs/NAVIGATION_AUDIT.md](docs/NAVIGATION_AUDIT.md) - Navigation audit and user flows
- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) - Guide for adding and managing routes

### Authentication

Auth has been consolidated to **Janua only**. The legacy `LocalAuthGuard` (`local-auth.guard.ts`) was removed. All auth endpoints use `JanuaAuthGuard` for JWT verification via Janua JWKS:

- `POST /auth/login` -- Uses `@UseGuards(JanuaAuthGuard)` (was LocalAuthGuard)
- `GET /auth/me` -- Uses `@UseGuards(JanuaAuthGuard)` for Janua JWT user profiles
- `GET /auth/session` -- Uses `JwtAuthGuard` (internal JWT)
- `POST /auth/logout` -- Uses `JwtAuthGuard`

Key files: `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/auth/guards/janua-auth.guard.ts`, `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`.

### Ecosystem Webhook Integrations

**Forgesight Webhook** (`POST /api/v1/webhooks/forgesight`):
- Receives `price.updated` events from Forgesight pricing feed
- HMAC-SHA256 signature verification via `x-forgesight-signature` header
- Invalidates all cached Forgesight pricing data (4 cache patterns)
- Key files: `apps/api/src/integrations/forgesight/webhook.controller.ts`
- Env: `FORGESIGHT_WEBHOOK_SECRET`

**Yantra4D Webhook Service** (`Yantra4dWebhookService`):
- Fires outbound webhooks to Yantra4D when quotes originated from Yantra4D reach terminal status
- Identifies Yantra4D quotes via `metadata.source === 'yantra4d'` and `metadata.yantra4dProject`
- HMAC-SHA256 signed via `x-cotiza-signature` header
- Fire-and-forget (errors logged, never thrown)
- Key files: `apps/api/src/modules/quotes/services/yantra4d-webhook.service.ts`
- Env: `YANTRA4D_API_URL`, `YANTRA4D_WEBHOOK_SECRET`, `YANTRA4D_WEBHOOK_TIMEOUT`

**Dhanam Billing Relay** (`DhanamRelayService`):
- Relays payment events to Dhanam billing platform
- HMAC-SHA256 signed via `x-cotiza-signature` header
- Key files: `apps/api/src/modules/billing/services/dhanam-relay.service.ts`
- Env: `DHANAM_WEBHOOK_URL`, `DHANAM_WEBHOOK_SECRET`

### Engagement projection (Phase B Consumer)

Cotiza stores a lightweight projection of PhyneCRM's engagement
aggregate in the `Engagement` table (migration
`20260419100000_add_engagements_and_quote_fk`). Purpose:

- group quotes under one engagement (two-quotes-per-engagement is the
  tablaco flow — physical fab + digital services under the same client
  engagement)
- serve portal queries without a round-trip to PhyneCRM on every render

Lifecycle:

- `Quote.engagementId` is a first-class nullable FK. When a quote is
  created with the `engagementId` DTO field, `EngagementsService.ensureProjection`
  auto-materializes the row with `lastSyncedAt = NULL`.
- `POST /api/v1/webhooks/phynecrm/engagements` — inbound HMAC-SHA256
  signed webhook. Handles `engagement.created` / `engagement.updated`
  (upsert + stamp `lastSyncedAt`) and `engagement.archived` (soft-delete).
- `GET /api/v1/engagements/:phynecrmEngagementId` — projection + quote
  type counts.
- `GET /api/v1/engagements/:phynecrmEngagementId/quotes` — quotes
  grouped by `quoteType` for the portal's side-by-side card layout.

Env: `PHYNECRM_INBOUND_SECRET` (separate from outbound `PHYNECRM_ENGAGEMENT_SECRET`).

### Services-mode quoting

Services-mode (`Quote.quoteType === 'services'`) is feature-flag gated per tenant via `Tenant.features.servicesQuotes`. The `QuoteItem.servicesDetails` Json column carries the per-line billable shape (`hourly` / `fixed_fee` / `milestone`). Schema in `packages/shared/src/schemas/services-quote.ts`; types in `packages/shared/src/types/services-quote.ts`. The services-mode branch in `QuotesService.calculate()` sidesteps the fab pricing engine entirely. See `PhyneCrmEngagementService` for how the quote-approval flow pushes lifecycle events + the signed proposal PDF into the client's PhyneCRM engagement timeline.

On ORDERED (post-payment) transitions, `QuotesService.handleOrdered(tenantId, quoteId)` fans out three fire-and-forget outbound integrations via `Promise.allSettled` from `OrdersService.createOrderFromQuote`:

**Karafiel CFDI/NOM-151 Compliance** (`KarafielComplianceService`):
- POSTs `/api/v1/cfdi/issue/` with conceptos mapped from quote items (one concepto per QuoteItem, `tipo_comprobante='I'`)
- Auth: Janua-minted bearer (`KARAFIEL_SERVICE_TOKEN`), not HMAC — Karafiel sits behind Janua OIDC
- Skips when `receptorRfc` (from `quote.metadata.receptorRfc` or `tenant.settings.receptorRfc`) is missing
- Key files: `apps/api/src/integrations/karafiel/karafiel-compliance.service.ts`
- Env: `KARAFIEL_API_URL`, `KARAFIEL_SERVICE_TOKEN`, `KARAFIEL_EMISOR_RFC`, `KARAFIEL_CREDENTIAL_ID`, `KARAFIEL_WEBHOOK_TIMEOUT` (default 15000)

**Dhanam Milestone Invoicing** (`DhanamMilestoneService`):
- Iterates `servicesDetails.milestones[]` for each `billableType='milestone'` QuoteItem and POSTs one invoice per milestone to `/api/v1/invoices`
- HMAC-SHA256 signed (same pattern as PhyneCRM) + stable `Idempotency-Key: dhanam-milestone:<quoteItemId>:<milestoneId>` header
- Per-milestone fire-and-forget (one failure doesn't stop siblings)
- Key files: `apps/api/src/integrations/dhanam/dhanam-milestone.service.ts`
- Env: `DHANAM_API_URL`, `DHANAM_BILLING_SECRET`, `DHANAM_WEBHOOK_TIMEOUT` (default 10000)

**Pravara MES Dispatch** (`PravaraDispatchService`):
- POSTs a job spec to `/api/v1/mes/jobs` with every QuoteItem that has no `servicesDetails` (i.e. fab items)
- Includes `engagement_id` so Pravara's status-webhook writes back with the right engagement linkage
- HMAC-SHA256 signed; skips when the quote is services-only
- Key files: `apps/api/src/integrations/pravara/pravara-dispatch.service.ts`
- Env: `PRAVARA_API_URL`, `PRAVARA_DISPATCH_SECRET`, `PRAVARA_WEBHOOK_TIMEOUT` (default 15000)

### Environment Variables

Key environment variables required:

```
NODE_ENV
DATABASE_URL
REDIS_URL
S3_BUCKET
S3_REGION
KMS_KEY_ID
JWT_SECRET
NEXTAUTH_SECRET
STRIPE_KEY
STRIPE_WEBHOOK_SECRET
DEFAULT_CURRENCY=MXN
SUPPORTED_CURRENCIES=MXN,USD
DEFAULT_LOCALES=es,en
FX_SOURCE=openexchangerates
FORGESIGHT_WEBHOOK_SECRET
YANTRA4D_API_URL
YANTRA4D_WEBHOOK_SECRET
DHANAM_WEBHOOK_URL
DHANAM_WEBHOOK_SECRET
# Phase D outbound integrations (fire on ORDERED)
KARAFIEL_API_URL
KARAFIEL_SERVICE_TOKEN
KARAFIEL_EMISOR_RFC
KARAFIEL_CREDENTIAL_ID
KARAFIEL_WEBHOOK_TIMEOUT
DHANAM_API_URL
DHANAM_BILLING_SECRET
DHANAM_WEBHOOK_TIMEOUT
PRAVARA_API_URL
PRAVARA_DISPATCH_SECRET
PRAVARA_WEBHOOK_TIMEOUT
```

### Deployment

- **Branches**: `main` (production), `develop` (staging)
- **CI/CD**: GitHub Actions -> Docker -> ECR -> ECS Fargate. Worker build job included in `build-deploy.yml` (builds and deploys the Python worker alongside the API and web apps)
- **Environments**: `dev`, `staging`, `prod`
- PR checks include: lint, unit tests, E2E smoke tests

### Performance Targets

- p95 API latency < 400ms
- Auto-quote completion: <60s for 3D/laser, <120s for CNC
- 99.9% availability SLO

### Security Considerations

- RBAC with roles: Admin, Manager, Operator, Support, Customer
- All API endpoints require authentication except public quote viewing
- Audit logging for all configuration changes and sensitive operations
- Encryption in transit (TLS 1.2+) and at rest (S3/KMS)
- Support for NDA acceptance tracking
- All webhook endpoints use HMAC-SHA256 with timing-safe comparison

### Testing Strategy

- Unit tests for pricing calculations, margin enforcement, FX conversion
- Integration tests for file upload -> DFM -> pricing pipeline
- E2E tests (Playwright) for critical user journeys
- Performance tests for concurrent quote processing
- Route testing coverage >80% for all endpoints
- Component testing for currency and pricing displays

### Development Notes

- Use Prisma migrations for database schema changes
- Feature flags configured in database (e.g., `features.supplier_portal`)
- Bilingual support (ES/EN) using i18next
- Sustainability scoring integrated into all quotes
- Quote validity default: 14 days

### Frontend Updates

- Enhanced quote detail page with expanded information display
- New quote history page for tracking past quotes
- Dashboard KPIs for business metrics overview
- Updated navbar with improved navigation
- 3-locale translation support (ES, EN, and additional locale)

### Recent Features

- **Multicurrency System**: 30+ currencies with geo-detection and automatic conversion
- **Performance Monitoring**: MetricsService with Redis-backed distributed metrics
- **Admin Dashboard**: Currency management interface at `/admin/currency`
- **Comprehensive Testing**: 90+ tests for currency components and services
- **Auth Consolidation**: Migrated from dual auth (Local + Janua) to Janua-only
- **Worker CI/CD**: Python worker now built and deployed alongside API/web in `build-deploy.yml`
- **Forgesight Webhook**: Inbound price update webhook with cache invalidation
- **Yantra4D Webhook**: Outbound quote lifecycle notifications to Yantra4D platform
- **Dhanam Billing Relay**: Payment event relay to centralized billing platform

## Pricing + PMF

- **Pricing source-of-truth**: `internal-devops/decisions/2026-04-25-tulana-ecosystem-pricing.md`. Cotiza tiers per Tulana intel: Maker $0 / Creator Pro 399 MXN / Business 1,699 MXN / Enterprise 8,499 MXN. **Confidence: low** — landing currently shows USD ($0/$19/$99/$499); operator decision pending whether to flip to Tulana MXN ladder or maintain USD positioning. See decisions log.
- **PMF measurement**: per RFC 0013 (`internal-devops/rfcs/0013-pmf-via-coforma-and-tulana.md`), NPS + Sean Ellis + retention via `@madfam/pmf-widget` → Tulana `/v1/pmf/*` endpoints. Composite PMF Score informs `recommended_action` (enable_paywall / measure_more / sunset / keep_measuring).
- **5 audience pages live** (post-overhaul cotiza#32 + #33): `/for/fabricators`, `/for/consultants`, `/for/makerspaces`, `/for/procurement`, plus DIY routed via `/try`. Each page source-tagged via `?source=<persona>` query param for conversion attribution.

## Known Issues — Audit 2026-04-23

See `/Users/aldoruizluna/labspace/claudedocs/ECOSYSTEM_AUDIT_2026-04-23.md` for the full ecosystem audit.

- ~~**🔴 R3: Three unauthenticated admin geo endpoints**~~ — Fixed 2026-04-23: all three (`GET /geo/analytics`, `GET /currency/analytics`, `POST /currency/admin/refresh-rates`) now require `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` (pattern from `enterprise.controller.ts`).
- **🟡 H13: `.env` committed to git** — move to `.env.example`, rotate any real secrets.
