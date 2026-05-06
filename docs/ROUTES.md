# Cotiza Studio Routes Documentation

> Complete route documentation for frontend and backend navigation audit
> Last Updated: 2025-01-26

## Table of Contents

- [Overview](#overview)
- [Backend API Routes](#backend-api-routes)
- [Frontend Routes](#frontend-routes)
- [Authentication & Authorization](#authentication--authorization)
- [Route Testing Matrix](#route-testing-matrix)
- [Performance Benchmarks](#performance-benchmarks)
- [Navigation Flows](#navigation-flows)

## Overview

This document provides comprehensive documentation of all routes in the Cotiza Studio Quoting MVP system, including authentication requirements, rate limits, caching strategies, and testing coverage.

### Quick Stats

- **Total Backend Routes**: 85+
- **Total Frontend Pages**: 12
- **Public Routes**: 15
- **Protected Routes**: 70+
- **Admin-Only Routes**: 8

## Backend API Routes

### Base Configuration

| Setting        | Value                                           |
| -------------- | ----------------------------------------------- |
| Base URL       | `http://localhost:4000` (dev)                   |
| API Docs       | `/api/docs`                                     |
| Authentication | JWT Bearer Token                                |
| Rate Limit     | 100 req/min (authenticated), 20 req/min (guest) |
| CORS           | Configured per environment                      |
| Multi-tenant   | Via `X-Tenant-ID` header                        |

### Authentication Routes (`/auth`)

| Method | Path             | Description          | Auth          | Rate Limit | Cache |
| ------ | ---------------- | -------------------- | ------------- | ---------- | ----- |
| POST   | `/auth/register` | Register new user    | None          | 5/hour     | None  |
| POST   | `/auth/login`    | User login           | None          | 10/hour    | None  |
| POST   | `/auth/refresh`  | Refresh access token | Refresh Token | 50/hour    | None  |
| POST   | `/auth/logout`   | Logout user          | Bearer        | Standard   | None  |
| GET    | `/auth/session`  | Get current session  | Bearer        | Standard   | 5min  |
| POST   | `/auth/_log`     | Log auth events      | None          | Unlimited  | None  |

**Example: Login**

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'

# Response
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "123",
    "email": "user@example.com",
    "role": "customer"
  }
}
```

### Quote Management Routes (`/quotes`)

| Method | Path                    | Description                            | Auth   | Roles       | Rate Limit | Cache      |
| ------ | ----------------------- | -------------------------------------- | ------ | ----------- | ---------- | ---------- |
| POST   | `/quotes`               | Create quote                           | Bearer | All         | 20/hour    | None       |
| GET    | `/quotes`               | List quotes                            | Bearer | All         | Standard   | 30s        |
| GET    | `/quotes/:id`           | Get quote details                      | Bearer | Owner/Admin | Standard   | 5min       |
| PATCH  | `/quotes/:id`           | Update quote                           | Bearer | Owner/Admin | Standard   | Invalidate |
| POST   | `/quotes/:id/items`     | Add quote item                         | Bearer | Owner/Admin | 50/hour    | Invalidate |
| POST   | `/quotes/:id/calculate` | Calculate pricing                      | Bearer | Owner/Admin | 100/hour   | 1min       |
| POST   | `/quotes/:id/accept`    | Accept quote, mint Dhanam checkout URL | Bearer | Owner       | 10/hour    | Invalidate |
| POST   | `/quotes/:id/cancel`    | Cancel quote                           | Bearer | Owner/Admin | 10/hour    | Invalidate |
| GET    | `/quotes/:id/pdf`       | Generate PDF                           | Bearer | Owner/Admin | 20/hour    | 24hr       |

**Example: Create Quote**

```bash
curl -X POST http://localhost:4000/quotes \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-ID: tenant-123" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "Custom Part",
    "items": [{
      "fileId": "file-123",
      "material": "PLA",
      "technology": "FFF",
      "quantity": 10
    }]
  }'
```

### File Management Routes (`/files`)

| Method | Path                 | Description      | Auth   | Rate Limit | Max Size |
| ------ | -------------------- | ---------------- | ------ | ---------- | -------- |
| POST   | `/files/presign`     | Get upload URL   | Bearer | 100/hour   | N/A      |
| POST   | `/files/:id/confirm` | Confirm upload   | Bearer | 100/hour   | N/A      |
| GET    | `/files/:id/url`     | Get download URL | Bearer | 50/hour    | N/A      |
| DELETE | `/files/:id`         | Delete file      | Bearer | 50/hour    | N/A      |

**Upload Flow:**

1. Request presigned URL
2. Upload to S3 directly
3. Confirm upload completion
4. File ready for processing

### Geo & Currency Routes

| Method | Path                                   | Description     | Auth   | Rate Limit | Cache      |
| ------ | -------------------------------------- | --------------- | ------ | ---------- | ---------- |
| GET    | `/api/v1/geo/detect`                   | Detect location | None   | 100/hour   | 24hr       |
| POST   | `/api/v1/geo/preferences`              | Set preferences | Bearer | Standard   | Invalidate |
| GET    | `/api/v1/currency/rates`               | Get rates       | None   | Standard   | 1hr        |
| POST   | `/api/v1/currency/convert`             | Convert amount  | None   | 1000/hour  | 5min       |
| GET    | `/api/v1/currency/supported`           | List currencies | None   | Standard   | 24hr       |
| POST   | `/api/v1/currency/admin/refresh-rates` | Force refresh   | Admin  | 10/hour    | Invalidate |

### Guest Quote Routes

| Method | Path                          | Description  | Rate Limit | Session  |
| ------ | ----------------------------- | ------------ | ---------- | -------- |
| POST   | `/api/v1/guest/quotes/upload` | Upload files | 10/hour    | Required |
| POST   | `/api/v1/guest/quotes`        | Create quote | 5/hour     | Required |
| GET    | `/api/v1/guest/quotes/:id`    | View quote   | 50/hour    | Required |
| GET    | `/api/v1/guest/quotes`        | List quotes  | 20/hour    | Required |

### Payment Routes (`/payments`)

| Method | Path                            | Description     | Auth      | Security   |
| ------ | ------------------------------- | --------------- | --------- | ---------- |
| POST   | `/payments/quotes/:id/checkout` | Create checkout | Bearer    | PCI DSS    |
| GET    | `/payments/quotes/:id/status`   | Payment status  | Bearer    | Encrypted  |
| POST   | `/payments/webhooks/stripe`     | Stripe webhook  | Signature | HTTPS only |

### Order Management Routes (`/orders`)

| Method | Path                        | Description      | Auth   | Roles          |
| ------ | --------------------------- | ---------------- | ------ | -------------- |
| GET    | `/orders`                   | List orders      | Bearer | All            |
| GET    | `/orders/:id`               | Get order        | Bearer | Owner/Admin    |
| GET    | `/orders/by-number/:number` | Get by number    | Bearer | Owner/Admin    |
| PATCH  | `/orders/:id/status`        | Update status    | Bearer | Admin/Operator |
| POST   | `/orders/:id/invoice`       | Generate invoice | Bearer | Admin          |

### Job Management Routes (`/jobs`)

| Method | Path                   | Description    | Auth     | Roles  |
| ------ | ---------------------- | -------------- | -------- | ------ |
| POST   | `/jobs`                | Create job     | Internal | System |
| GET    | `/jobs/:id`            | Get job status | Bearer   | Admin  |
| POST   | `/jobs/:id/retry`      | Retry job      | Bearer   | Admin  |
| GET    | `/jobs/queues/metrics` | Queue metrics  | Bearer   | Admin  |

### Health & Monitoring Routes

| Method | Path               | Description     | Auth | Response Time |
| ------ | ------------------ | --------------- | ---- | ------------- |
| GET    | `/health`          | Basic health    | None | <50ms         |
| GET    | `/health/ready`    | Readiness check | None | <200ms        |
| GET    | `/health/detailed` | Detailed health | None | <500ms        |

### Engagements (`/api/v1/engagements`)

First-class projection of PhyneCRM's engagement aggregate. Groups quotes under one engagement (e.g. tablaco's physical + digital quotes). See [Engagement projection](../CLAUDE.md#engagement-projection-phase-b-consumer) in CLAUDE.md.

| Method | Path                                               | Description                    | Auth   | Notes                                     |
| ------ | -------------------------------------------------- | ------------------------------ | ------ | ----------------------------------------- |
| GET    | `/api/v1/engagements/:phynecrmEngagementId`        | Projection + quote type counts | Bearer | Tenant-scoped via JWT                     |
| GET    | `/api/v1/engagements/:phynecrmEngagementId/quotes` | Quotes grouped by quoteType    | Bearer | Returns `{ fab: [...], services: [...] }` |

### Webhooks (`/api/v1/webhooks`)

| Method | Path                                    | Description                                                  | Auth | Signature                                                          |
| ------ | --------------------------------------- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------------ |
| POST   | `/api/v1/webhooks/forgesight`           | Forgesight price update relay                                | HMAC | `x-forgesight-signature` (SHA-256)                                 |
| POST   | `/api/v1/webhooks/phynecrm/engagements` | PhyneCRM engagement lifecycle (created / updated / archived) | HMAC | `x-phynecrm-signature` (SHA-256), secret `PHYNECRM_INBOUND_SECRET` |

## Frontend Routes

### Public Pages

| Path             | Component           | Description      | SEO       | Performance |
| ---------------- | ------------------- | ---------------- | --------- | ----------- |
| `/`              | `LocalizedHomePage` | Landing page     | Optimized | <1s FCP     |
| `/demo`          | `DemoPage`          | Interactive demo | Index     | <2s FCP     |
| `/try`           | `TryPage`           | Try service      | Index     | <1.5s FCP   |
| `/auth/login`    | `LoginPage`         | User login       | NoIndex   | <1s FCP     |
| `/auth/register` | `RegisterPage`      | Registration     | NoIndex   | <1s FCP     |

### Protected Pages (Require Auth)

| Path                    | Component         | Description     | Roles | Features                     |
| ----------------------- | ----------------- | --------------- | ----- | ---------------------------- |
| `/dashboard`            | `DashboardPage`   | User dashboard  | All   | Real-time updates            |
| `/quote/new`            | `NewQuotePage`    | Create quote    | All   | File upload, currency select |
| `/quote/[id]`           | `QuoteDetailPage` | View quote      | Owner | Price display, PDF download  |
| `/quote/[id]/configure` | `ConfigurePage`   | Configure items | Owner | Material selection           |

### Admin Pages

| Path              | Component           | Description         | Roles | Features                |
| ----------------- | ------------------- | ------------------- | ----- | ----------------------- |
| `/admin/currency` | `CurrencyAdminPage` | Currency management | Admin | Rate refresh, analytics |

### API Routes (Next.js)

| Path                      | Method   | Description      | Auth    | Rate Limit |
| ------------------------- | -------- | ---------------- | ------- | ---------- |
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handler | Session | Unlimited  |
| `/api/auth/_log`          | POST     | Log auth events  | None    | 100/min    |

## Authentication & Authorization

### JWT Token Structure

```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "customer",
  "tenantId": "tenant-123",
  "iat": 1706284800,
  "exp": 1706285700
}
```

### Role Permissions Matrix

| Role     | Quotes | Orders | Payments | Admin   | Files |
| -------- | ------ | ------ | -------- | ------- | ----- |
| Customer | Own    | Own    | Own      | ❌      | Own   |
| Operator | All    | All    | View     | ❌      | All   |
| Manager  | All    | All    | All      | Partial | All   |
| Admin    | All    | All    | All      | Full    | All   |

### Session Management

| Setting           | Value                      |
| ----------------- | -------------------------- |
| Access Token TTL  | 15 minutes                 |
| Refresh Token TTL | 7 days                     |
| Session Cookie    | httpOnly, secure, sameSite |
| Idle Timeout      | 30 minutes                 |

## Route Testing Matrix

### Backend Coverage

| Controller         | Unit Tests | Integration | E2E | Coverage |
| ------------------ | ---------- | ----------- | --- | -------- |
| AuthController     | ✅         | ✅          | ✅  | 95%      |
| QuotesController   | ✅         | ✅          | ⚠️  | 88%      |
| FilesController    | ✅         | ⚠️          | ⚠️  | 75%      |
| PaymentsController | ✅         | ✅          | ❌  | 82%      |
| OrdersController   | ✅         | ⚠️          | ❌  | 70%      |
| GeoController      | ✅         | ✅          | ✅  | 92%      |
| CurrencyController | ✅         | ✅          | ✅  | 90%      |

### Frontend Coverage

| Page           | Component Tests | Integration | E2E | Accessibility |
| -------------- | --------------- | ----------- | --- | ------------- |
| Home           | ✅              | ✅          | ✅  | WCAG AA       |
| Dashboard      | ✅              | ⚠️          | ⚠️  | WCAG AA       |
| Quote Create   | ✅              | ✅          | ⚠️  | WCAG AA       |
| Quote Detail   | ✅              | ⚠️          | ❌  | WCAG A        |
| Admin Currency | ✅              | ✅          | ❌  | WCAG A        |

## Performance Benchmarks

### API Response Times (p95)

| Endpoint                | Target  | Current | Status |
| ----------------------- | ------- | ------- | ------ |
| `/auth/login`           | <200ms  | 180ms   | ✅     |
| `/quotes` (list)        | <300ms  | 250ms   | ✅     |
| `/quotes/:id`           | <150ms  | 120ms   | ✅     |
| `/quotes/:id/calculate` | <2000ms | 1800ms  | ✅     |
| `/quotes/:id/pdf`       | <5000ms | 4500ms  | ✅     |
| `/files/presign`        | <100ms  | 95ms    | ✅     |
| `/currency/convert`     | <50ms   | 45ms    | ✅     |

### Frontend Performance

| Metric                   | Target | Current | Status |
| ------------------------ | ------ | ------- | ------ |
| First Contentful Paint   | <1.8s  | 1.5s    | ✅     |
| Largest Contentful Paint | <2.5s  | 2.2s    | ✅     |
| Time to Interactive      | <3.8s  | 3.5s    | ✅     |
| Cumulative Layout Shift  | <0.1   | 0.05    | ✅     |
| First Input Delay        | <100ms | 80ms    | ✅     |

## Navigation Flows

### Guest User Flow

```
/ (Landing)
  → /try (Try Service)
    → /api/v1/guest/quotes/upload (Upload Files)
      → /api/v1/guest/quotes (Create Quote)
        → /quote/[id] (View Quote)
          → /auth/register (Convert to Account)
```

### Authenticated User Flow

```
/auth/login
  → /dashboard
    → /quote/new
      → /files/presign (Upload)
        → /quotes (Create)
          → /quote/[id] (View)
            → /quote/[id]/configure (Configure)
              → /payments/checkout (Pay)
                → /orders/[id] (Track)
```

### Admin Flow

```
/auth/login (Admin)
  → /dashboard
    → /admin/currency
      → /api/v1/currency/admin/refresh-rates
        → /api/v1/currency/analytics
```

## Route Guards & Middleware

### Backend Middleware Stack

1. Helmet (Security headers)
2. CORS
3. Rate Limiting
4. Authentication (JWT)
5. Tenant Resolution
6. Role Authorization
7. Request Validation
8. Error Handling

### Frontend Route Protection

```typescript
// Middleware pattern for protected routes
export async function middleware(request: NextRequest) {
  const session = await getToken({ req: request });

  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  if (session?.role !== 'admin' && request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
}
```

## Monitoring & Alerting

### Key Metrics to Track

| Metric               | Threshold | Alert    |
| -------------------- | --------- | -------- |
| API Error Rate       | >5%       | Critical |
| Response Time p99    | >1000ms   | Warning  |
| Auth Failures        | >10/min   | Warning  |
| File Upload Failures | >10%      | Critical |
| Payment Failures     | >5%       | Critical |
| Cache Hit Rate       | <80%      | Info     |

### Logging Standards

```typescript
// Structured logging format
{
  "timestamp": "2025-01-26T10:00:00Z",
  "level": "info",
  "service": "api",
  "route": "/quotes/:id",
  "method": "GET",
  "userId": "user-123",
  "tenantId": "tenant-456",
  "duration": 120,
  "status": 200,
  "message": "Quote retrieved successfully"
}
```

## Development Guidelines

### Adding New Routes

1. **Backend Route Checklist:**

   - [ ] Add route to controller with decorators
   - [ ] Document in Swagger decorators
   - [ ] Add DTOs with validation
   - [ ] Implement auth guard if needed
   - [ ] Add rate limiting if appropriate
   - [ ] Write unit tests
   - [ ] Update this documentation

2. **Frontend Route Checklist:**
   - [ ] Create page.tsx in app directory
   - [ ] Add loading.tsx for loading state
   - [ ] Add error.tsx for error boundary
   - [ ] Implement route guards in middleware
   - [ ] Add to navigation components
   - [ ] Write component tests
   - [ ] Update this documentation

### Testing Requirements

- All new routes must have >80% test coverage
- Critical paths require E2E tests
- Performance benchmarks must be met
- Security scan must pass

## Appendix

### Useful Commands

```bash
# List all backend routes
npm run nest routes

# Generate API client from OpenAPI
npm run generate:api-client

# Test all routes
npm run test:routes

# Performance test
npm run test:perf

# Security audit
npm run audit:security
```

### Related Documentation

- [API Reference](./API_REFERENCE.md)
- [Authentication Guide](./AUTH_GUIDE.md)
- [Navigation Audit](./NAVIGATION_AUDIT.md)
- [Performance Guide](./PERFORMANCE.md)
- [Security Guide](./SECURITY.md)

---

_Last Updated: 2025-01-26 | Version: 1.0.0 | Maintained by: DevOps Team_
