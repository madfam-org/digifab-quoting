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
