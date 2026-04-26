# Cotiza Studio API Reference

> Complete API documentation with examples, schemas, and integration guides
> Version: 1.0.0 | Last Updated: 2025-01-26

## Table of Contents

- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Common Patterns](#common-patterns)
- [API Endpoints](#api-endpoints)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Webhooks](#webhooks)
- [SDKs & Client Libraries](#sdks--client-libraries)

## Getting Started

### Base URLs

| Environment | Base URL                            | API Docs                                     |
| ----------- | ----------------------------------- | -------------------------------------------- |
| Development | `http://localhost:4000`             | `http://localhost:4000/api/docs`             |
| Staging     | `https://api.staging.cotiza.studio` | `https://api.staging.cotiza.studio/api/docs` |
| Production  | `https://api.cotiza.studio`         | `https://api.cotiza.studio/api/docs`         |

### Quick Start

```bash
# 1. Register an account
curl -X POST https://api.cotiza.studio/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "name": "John Doe"
  }'

# 2. Login to get tokens
TOKEN=$(curl -X POST https://api.cotiza.studio/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }' | jq -r '.accessToken')

# 3. Make authenticated requests
curl -X GET https://api.cotiza.studio/quotes \
  -H "Authorization: Bearer $TOKEN"
```

## Authentication

### JWT Bearer Token

All protected endpoints require a JWT Bearer token in the Authorization header.

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Lifecycle

```mermaid
sequenceDiagram
    Client->>API: POST /auth/login (credentials)
    API-->>Client: { accessToken, refreshToken }
    Client->>API: GET /quotes (Bearer accessToken)
    API-->>Client: 200 OK (data)
    Note over Client,API: Access token expires (15 min)
    Client->>API: POST /auth/refresh (refreshToken)
    API-->>Client: { accessToken, refreshToken }
```

### Multi-Tenant Headers

For multi-tenant operations, include the tenant ID:

```http
X-Tenant-ID: tenant-123
```

## Common Patterns

### Pagination

All list endpoints support pagination:

```http
GET /quotes?page=1&limit=20&sortBy=createdAt&sortOrder=desc
```

**Query Parameters:**

- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `sortBy` (string): Field to sort by
- `sortOrder` (string): 'asc' or 'desc'

**Response:**

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Filtering

List endpoints support filtering:

```http
GET /quotes?status=pending&createdAfter=2025-01-01&technology=FFF
```

### Field Selection

Request specific fields only:

```http
GET /quotes/123?fields=id,projectName,totalPrice,status
```

### Expanding Relations

Include related data:

```http
GET /quotes/123?expand=items,customer,payments
```

## API Endpoints

### Authentication Endpoints

#### Register User

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "company": "ACME Corp"
}
```

**Response (201 Created):**

```json
{
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "customer",
    "createdAt": "2025-01-26T10:00:00Z"
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

#### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 900,
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "role": "customer"
  }
}
```

### Quote Management

#### Create Quote

```http
POST /quotes
Authorization: Bearer {token}
Content-Type: application/json

{
  "projectName": "Custom Bracket",
  "description": "Aluminum bracket for machinery",
  "items": [{
    "fileId": "file_xyz789",
    "fileName": "bracket_v2.stl",
    "technology": "CNC",
    "material": "ALUMINUM_6061",
    "quantity": 25,
    "finishType": "ANODIZED",
    "notes": "Black anodizing required"
  }],
  "currency": "USD",
  "requestedDelivery": "2025-02-15"
}
```

**Response (201 Created):**

```json
{
  "id": "quote_def456",
  "projectName": "Custom Bracket",
  "status": "processing",
  "items": [
    {
      "id": "item_ghi789",
      "fileName": "bracket_v2.stl",
      "technology": "CNC",
      "material": "ALUMINUM_6061",
      "quantity": 25,
      "unitPrice": 45.5,
      "totalPrice": 1137.5,
      "leadTime": 7,
      "status": "analyzing"
    }
  ],
  "subtotal": 1137.5,
  "tax": 204.75,
  "totalPrice": 1342.25,
  "currency": "USD",
  "validUntil": "2025-02-09T10:00:00Z",
  "createdAt": "2025-01-26T10:00:00Z"
}
```

#### Get Quote Details

```http
GET /quotes/{quoteId}
Authorization: Bearer {token}
```

**Response (200 OK):**

```json
{
  "id": "quote_def456",
  "projectName": "Custom Bracket",
  "status": "ready",
  "customer": {
    "id": "usr_abc123",
    "name": "John Doe",
    "email": "user@example.com"
  },
  "items": [
    {
      "id": "item_ghi789",
      "fileName": "bracket_v2.stl",
      "technology": "CNC",
      "material": "ALUMINUM_6061",
      "quantity": 25,
      "unitPrice": 45.5,
      "totalPrice": 1137.5,
      "leadTime": 7,
      "status": "priced",
      "manufacturingDetails": {
        "volume": 125.5,
        "boundingBox": {
          "x": 100,
          "y": 50,
          "z": 25
        },
        "machineTime": 180,
        "complexity": "medium"
      }
    }
  ],
  "pricing": {
    "subtotal": 1137.5,
    "discount": 0,
    "tax": 204.75,
    "shipping": 0,
    "totalPrice": 1342.25
  },
  "currency": "USD",
  "exchangeRate": 1.0,
  "validUntil": "2025-02-09T10:00:00Z",
  "createdAt": "2025-01-26T10:00:00Z",
  "updatedAt": "2025-01-26T10:05:00Z"
}
```

#### Update Quote Item

```http
PATCH /quotes/{quoteId}/items/{itemId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "quantity": 50,
  "material": "ALUMINUM_7075",
  "finishType": "POWDER_COAT"
}
```

**Response (200 OK):**

```json
{
  "id": "item_ghi789",
  "quantity": 50,
  "material": "ALUMINUM_7075",
  "unitPrice": 52.0,
  "totalPrice": 2600.0,
  "leadTime": 10,
  "priceBreakdown": {
    "materialCost": 1500.0,
    "machineCost": 800.0,
    "finishCost": 300.0
  }
}
```

### File Management

#### Request Upload URL

```http
POST /files/presign
Authorization: Bearer {token}
Content-Type: application/json

{
  "fileName": "part.stl",
  "fileType": "model/stl",
  "fileSize": 1048576
}
```

**Response (200 OK):**

```json
{
  "fileId": "file_xyz789",
  "uploadUrl": "https://s3.amazonaws.com/bucket/uploads/file_xyz789?...",
  "uploadFields": {
    "key": "uploads/file_xyz789",
    "Content-Type": "model/stl",
    "x-amz-meta-user": "usr_abc123"
  },
  "expiresAt": "2025-01-26T11:00:00Z"
}
```

#### Confirm Upload

```http
POST /files/{fileId}/confirm
Authorization: Bearer {token}
Content-Type: application/json

{
  "uploadComplete": true,
  "fileSize": 1048576,
  "checksum": "md5hash..."
}
```

### Currency & Geo

#### Get Exchange Rates

```http
GET /api/v1/currency/rates?base=USD
```

**Response (200 OK):**

```json
{
  "base": "USD",
  "timestamp": "2025-01-26T10:00:00Z",
  "rates": {
    "EUR": 0.92,
    "MXN": 17.5,
    "GBP": 0.79,
    "JPY": 149.5,
    "CAD": 1.37,
    "BRL": 5.1
  },
  "source": "openexchangerates"
}
```

#### Convert Currency

```http
POST /api/v1/currency/convert
Content-Type: application/json

{
  "amount": 1000,
  "from": "USD",
  "to": "EUR",
  "includeFees": true
}
```

**Response (200 OK):**

```json
{
  "originalAmount": 1000,
  "originalCurrency": "USD",
  "convertedAmount": 918.4,
  "convertedCurrency": "EUR",
  "rate": 0.92,
  "fees": {
    "percentage": 0.5,
    "fixed": 0.3,
    "total": 5.3
  },
  "timestamp": "2025-01-26T10:00:00Z"
}
```

#### Detect Location

```http
GET /api/v1/geo/detect
```

**Response (200 OK):**

```json
{
  "country": "US",
  "countryName": "United States",
  "region": "CA",
  "city": "San Francisco",
  "timezone": "America/Los_Angeles",
  "currency": "USD",
  "locale": "en-US",
  "ipAddress": "192.168.1.1"
}
```

### Payment Processing

#### Create Checkout Session

```http
POST /payments/quotes/{quoteId}/checkout
Authorization: Bearer {token}
Content-Type: application/json

{
  "successUrl": "https://app.cotiza.studio/success",
  "cancelUrl": "https://app.cotiza.studio/quotes/{quoteId}",
  "paymentMethod": "card",
  "customerEmail": "user@example.com"
}
```

**Response (200 OK):**

```json
{
  "checkoutUrl": "https://checkout.stripe.com/pay/cs_live_...",
  "sessionId": "cs_live_...",
  "expiresAt": "2025-01-26T11:00:00Z"
}
```

### Guest Quotes

#### Create Guest Quote

```http
POST /api/v1/guest/quotes
Content-Type: application/json
X-Guest-Session: guest_session_abc123

{
  "email": "guest@example.com",
  "projectName": "Quick Part",
  "items": [{
    "fileUrl": "https://temp.storage/file.stl",
    "technology": "FFF",
    "material": "PLA",
    "quantity": 1
  }]
}
```

**Response (201 Created):**

```json
{
  "id": "guest_quote_xyz",
  "accessUrl": "https://app.cotiza.studio/quote/guest_quote_xyz",
  "projectName": "Quick Part",
  "status": "processing",
  "estimatedPrice": 25.0,
  "currency": "USD",
  "expiresAt": "2025-01-27T10:00:00Z"
}
```

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    },
    "timestamp": "2025-01-26T10:00:00Z",
    "requestId": "req_abc123"
  }
}
```

### Common Error Codes

| Code                  | HTTP Status | Description                         |
| --------------------- | ----------- | ----------------------------------- |
| `VALIDATION_ERROR`    | 400         | Invalid input data                  |
| `UNAUTHORIZED`        | 401         | Missing or invalid authentication   |
| `FORBIDDEN`           | 403         | Insufficient permissions            |
| `NOT_FOUND`           | 404         | Resource not found                  |
| `CONFLICT`            | 409         | Resource conflict (e.g., duplicate) |
| `RATE_LIMITED`        | 429         | Too many requests                   |
| `INTERNAL_ERROR`      | 500         | Server error                        |
| `SERVICE_UNAVAILABLE` | 503         | Service temporarily unavailable     |

### Error Examples

#### Validation Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": {
      "errors": [
        {
          "field": "quantity",
          "message": "Must be greater than 0"
        },
        {
          "field": "material",
          "message": "Invalid material code"
        }
      ]
    }
  }
}
```

#### Authentication Error

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Token expired",
    "details": {
      "expiredAt": "2025-01-26T09:45:00Z"
    }
  }
}
```

## Rate Limiting

### Rate Limit Headers

All responses include rate limit information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1706268000
Retry-After: 60
```

### Rate Limit Tiers

| Tier       | Requests/Minute | Requests/Hour | Requests/Day |
| ---------- | --------------- | ------------- | ------------ |
| Guest      | 20              | 100           | 500          |
| Free       | 100             | 1,000         | 10,000       |
| Pro        | 500             | 5,000         | 50,000       |
| Enterprise | Custom          | Custom        | Custom       |

### Handling Rate Limits

```javascript
async function makeRequest(url, options) {
  const response = await fetch(url, options);

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    await sleep(parseInt(retryAfter) * 1000);
    return makeRequest(url, options);
  }

  return response;
}
```

## Webhooks

### Webhook Events

| Event               | Description                | Payload                |
| ------------------- | -------------------------- | ---------------------- |
| `quote.created`     | Quote created              | Quote object           |
| `quote.updated`     | Quote updated              | Quote object + changes |
| `quote.approved`    | Quote approved by customer | Quote object           |
| `payment.completed` | Payment successful         | Payment object         |
| `order.created`     | Order created from quote   | Order object           |
| `order.shipped`     | Order shipped              | Order + tracking       |

### Webhook Security

All webhooks include a signature header for verification:

```http
X-Webhook-Signature: sha256=abc123...
```

Verify webhook signatures:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  return `sha256=${hash}` === signature;
}
```

### Webhook Payload Example

```json
{
  "id": "evt_abc123",
  "type": "quote.approved",
  "timestamp": "2025-01-26T10:00:00Z",
  "data": {
    "quote": {
      "id": "quote_def456",
      "projectName": "Custom Bracket",
      "status": "approved",
      "totalPrice": 1342.25,
      "currency": "USD"
    }
  },
  "metadata": {
    "tenantId": "tenant_123",
    "userId": "usr_abc123"
  }
}
```

## SDKs & Client Libraries

### JavaScript/TypeScript SDK

```bash
npm install @cotiza-studio/sdk
```

```typescript
import { CotizaClient } from '@cotiza-studio/sdk';

const client = new CotizaClient({
  apiKey: 'your-api-key',
  environment: 'production',
});

// Create a quote
const quote = await client.quotes.create({
  projectName: 'Custom Part',
  items: [
    {
      fileId: 'file_xyz789',
      technology: 'FFF',
      material: 'PLA',
      quantity: 10,
    },
  ],
});

// Get quote details
const details = await client.quotes.get(quote.id);
```

### Python SDK

```bash
pip install cotiza-studio
```

```python
from cotiza_studio import CotizaClient

client = CotizaClient(
    api_key='your-api-key',
    environment='production'
)

# Create a quote
quote = client.quotes.create(
    project_name='Custom Part',
    items=[{
        'file_id': 'file_xyz789',
        'technology': 'FFF',
        'material': 'PLA',
        'quantity': 10
    }]
)

# Get quote details
details = client.quotes.get(quote.id)
```

### cURL Examples

```bash
# Set your token
TOKEN="your-jwt-token"

# Create a quote
curl -X POST https://api.cotiza.studio/quotes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "Test Part",
    "items": [{
      "fileId": "file_123",
      "technology": "FFF",
      "material": "PLA",
      "quantity": 1
    }]
  }'

# Get quote list
curl -X GET "https://api.cotiza.studio/quotes?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### Postman Collection

Import our Postman collection for easy API testing:

[Download Postman Collection](https://api.cotiza.studio/postman-collection.json)

## API Versioning

### Version Strategy

- Current version: `v1`
- Version in URL path: `/api/v1/`
- Header-based version override: `X-API-Version: 2`

### Deprecation Policy

- Deprecated endpoints marked with `Deprecation` header
- Minimum 6 months notice before removal
- Migration guides provided

Example deprecation header:

```http
Deprecation: true
Sunset: Sat, 31 Jul 2025 23:59:59 GMT
Link: <https://docs.cotiza.studio/migrations/v2>; rel="migration"
```

## Testing

### Test Environment

| Environment | Base URL                            | Purpose                |
| ----------- | ----------------------------------- | ---------------------- |
| Sandbox     | `https://sandbox.api.cotiza.studio` | Testing with fake data |
| Staging     | `https://staging.api.cotiza.studio` | Pre-production testing |

### Test Credentials

```json
{
  "email": "test@cotiza.studio",
  "password": "TestPassword123!",
  "apiKey": "test_key_abc123"
}
```

### Test Card Numbers (Stripe)

| Card Number         | Scenario           |
| ------------------- | ------------------ |
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 0002 | Card declined      |
| 4000 0000 0000 9995 | Insufficient funds |

## Support

### Contact

- **Email**: api-support@cotiza.studio
- **Slack**: [Join our Slack](https://cotiza-studio.slack.com)
- **GitHub**: [Report issues](https://github.com/cotiza-studio/api/issues)

### Resources

- [API Status Page](https://status.cotiza.studio)
- [Developer Blog](https://blog.cotiza.studio/developers)
- [API Changelog](https://docs.cotiza.studio/changelog)
- [Developer Forum](https://forum.cotiza.studio)

---

_API Version: 1.0.0 | Last Updated: 2025-01-26_
