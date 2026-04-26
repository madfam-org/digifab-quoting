# Cotiza Studio API Documentation

## Overview

The Cotiza Studio API provides programmatic access to digital fabrication quoting services. This RESTful API supports 3D printing (FFF/SLA), CNC machining, and laser cutting quotes with real-time pricing calculations.

## Base URL

```
Development: http://localhost:4000/api/v1
Staging: https://api-staging.cotiza.studio/v1
Production: https://api.cotiza.studio/v1
```

## Authentication

The API uses JWT Bearer token authentication. Tokens expire after 15 minutes and can be refreshed using the refresh token endpoint.

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 900,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "customer",
      "tenantId": "tenant_123"
    }
  }
}
```

### Using the Token

Include the access token in the Authorization header:

```http
GET /quotes
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Rate Limiting

| Endpoint Type  | Anonymous | Authenticated | Notes       |
| -------------- | --------- | ------------- | ----------- |
| General        | 10/min    | 100/min       | Per IP/user |
| Quote Creation | -         | 20/min        | Per user    |
| File Upload    | -         | 50/day        | Per user    |
| Reports        | -         | 10/hour       | Per tenant  |

Rate limit headers:

- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": ["Specific error details"]
    }
  },
  "meta": {
    "timestamp": "2024-01-20T10:30:00Z",
    "requestId": "req_123456",
    "path": "/api/v1/quotes"
  }
}
```

### Common Error Codes

| Code               | HTTP Status | Description                       |
| ------------------ | ----------- | --------------------------------- |
| `UNAUTHORIZED`     | 401         | Missing or invalid authentication |
| `FORBIDDEN`        | 403         | Insufficient permissions          |
| `NOT_FOUND`        | 404         | Resource not found                |
| `VALIDATION_ERROR` | 400         | Invalid request data              |
| `RATE_LIMITED`     | 429         | Too many requests                 |
| `INTERNAL_ERROR`   | 500         | Server error                      |

## Endpoints

### Files

#### Upload File

Get a presigned URL for direct file upload to S3.

```http
POST /files/upload
Content-Type: application/json
Authorization: Bearer <token>

{
  "filename": "part.stl",
  "contentType": "model/stl",
  "size": 1048576
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/bucket/...",
    "fileId": "file_123456",
    "expiresAt": "2024-01-20T11:00:00Z"
  }
}
```

**Supported File Types:**

- STL (`model/stl`, `.stl`)
- STEP (`model/step`, `.step`, `.stp`)
- IGES (`model/iges`, `.iges`, `.igs`)
- DXF (`application/dxf`, `.dxf`)
- DWG (`application/dwg`, `.dwg`)
- PDF (`application/pdf`, `.pdf`)

**File Size Limits:**

- Maximum file size: 100MB
- Maximum files per quote: 20

### Quotes

#### Create Quote

Create a new quote from uploaded files.

```http
POST /quotes
Content-Type: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "fileId": "file_123456",
      "process": "FFF",
      "material": "PLA",
      "quantity": 10,
      "selections": {
        "layerHeight": 0.2,
        "infill": 20,
        "supportsRequired": false,
        "color": "black"
      }
    }
  ],
  "objective": {
    "cost": 0.5,
    "lead": 0.3,
    "green": 0.2
  },
  "requiredBy": "2024-02-01T00:00:00Z",
  "notes": "Please ensure smooth surface finish"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "quote_789012",
    "status": "processing",
    "items": [
      {
        "id": "item_345678",
        "fileId": "file_123456",
        "status": "analyzing",
        "process": "FFF",
        "quantity": 10
      }
    ],
    "createdAt": "2024-01-20T10:30:00Z"
  }
}
```

**Process Types:**

- `FFF` - Fused Filament Fabrication (3D printing)
- `SLA` - Stereolithography (resin 3D printing)
- `CNC_3AXIS` - 3-axis CNC machining
- `LASER_2D` - 2D laser cutting

#### Get Quote

Retrieve quote details including pricing.

```http
GET /quotes/{id}
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "quote_789012",
    "status": "quoted",
    "currency": "MXN",
    "validUntil": "2024-02-03T23:59:59Z",
    "totals": {
      "subtotal": 1500.0,
      "tax": 240.0,
      "shipping": 150.0,
      "grandTotal": 1890.0
    },
    "items": [
      {
        "id": "item_345678",
        "name": "part.stl",
        "process": "FFF",
        "material": "PLA",
        "quantity": 10,
        "unitPrice": 150.0,
        "totalPrice": 1500.0,
        "leadDays": 3,
        "costBreakdown": {
          "material": 45.0,
          "machine": 35.0,
          "labor": 15.0,
          "overhead": 14.25,
          "margin": 40.75
        },
        "dfmReport": {
          "issues": [],
          "riskScore": 0.1,
          "metrics": {
            "volumeCm3": 25.4,
            "surfaceAreaCm2": 124.6,
            "bboxMm": {
              "x": 50,
              "y": 30,
              "z": 40
            }
          }
        },
        "sustainability": {
          "score": 85,
          "co2eKg": 0.125,
          "wastePercent": 5
        }
      }
    ]
  }
}
```

**Quote Statuses:**

- `draft` - Initial creation
- `processing` - Analyzing files
- `needs_review` - Manual review required
- `quoted` - Pricing complete
- `accepted` - Customer accepted
- `expired` - Validity period passed

#### List Quotes

Get paginated list of quotes.

```http
GET /quotes?page=1&limit=20&status=quoted&sort=-createdAt
Authorization: Bearer <token>
```

**Query Parameters:**

- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20, max: 100)
- `status` (string): Filter by status
- `sort` (string): Sort field with `-` prefix for descending
- `search` (string): Search in quote references
- `dateFrom` (ISO 8601): Filter by creation date
- `dateTo` (ISO 8601): Filter by creation date

**Response:**

```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 150,
    "page": 1,
    "pageSize": 20,
    "totalPages": 8
  }
}
```

#### Accept Quote

Accept a quote and proceed to payment.

```http
POST /quotes/{id}/accept
Content-Type: application/json
Authorization: Bearer <token>

{
  "acceptedItems": ["item_345678", "item_901234"],
  "shippingAddress": {
    "line1": "123 Main St",
    "line2": "Apt 4B",
    "city": "Mexico City",
    "state": "CDMX",
    "postalCode": "06600",
    "country": "MX"
  }
}
```

### Quote Items

#### Update Item Selections

Modify selections for a quote item (triggers recalculation).

```http
PUT /quotes/{quoteId}/items/{itemId}
Content-Type: application/json
Authorization: Bearer <token>

{
  "material": "ABS",
  "selections": {
    "layerHeight": 0.15,
    "infill": 30,
    "color": "red"
  },
  "quantity": 25
}
```

#### Recalculate Item

Force recalculation of an item's pricing.

```http
POST /quotes/{quoteId}/items/{itemId}/recalculate
Authorization: Bearer <token>
```

### Orders

#### List Orders

Get paginated list of orders.

```http
GET /orders?status=IN_PRODUCTION&page=1&limit=20
Authorization: Bearer <token>
```

**Order Statuses:**

- `PENDING` - Awaiting payment confirmation
- `CONFIRMED` - Payment received
- `IN_PRODUCTION` - Manufacturing in progress
- `READY` - Ready for shipping
- `SHIPPED` - In transit
- `DELIVERED` - Completed
- `CANCELLED` - Cancelled by customer or admin

#### Get Order Details

```http
GET /orders/{id}
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "order_123456",
    "quoteId": "quote_789012",
    "status": "IN_PRODUCTION",
    "paymentStatus": "PAID",
    "items": [...],
    "tracking": {
      "carrier": "FedEx",
      "trackingNumber": "1234567890",
      "estimatedDelivery": "2024-01-25"
    },
    "timeline": [
      {
        "status": "CONFIRMED",
        "timestamp": "2024-01-20T14:00:00Z",
        "note": "Payment received"
      },
      {
        "status": "IN_PRODUCTION",
        "timestamp": "2024-01-21T09:00:00Z",
        "note": "Manufacturing started"
      }
    ]
  }
}
```

### Payment

#### Create Payment Session

Create a Stripe checkout session for quote payment.

```http
POST /payment/session
Content-Type: application/json
Authorization: Bearer <token>

{
  "quoteId": "quote_789012",
  "successUrl": "https://app.cotiza.studio/orders/success",
  "cancelUrl": "https://app.cotiza.studio/quotes/quote_789012"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "sessionId": "cs_test_a1b2c3d4",
    "checkoutUrl": "https://checkout.stripe.com/pay/cs_test_a1b2c3d4"
  }
}
```

#### Payment History

Get payment history for the authenticated user.

```http
GET /payment/history?page=1&limit=20
Authorization: Bearer <token>
```

### Admin Endpoints

Admin endpoints require `admin` or `manager` role.

#### Materials Management

**List Materials:**

```http
GET /admin/materials?process=FFF&active=true
Authorization: Bearer <token>
```

**Create Material:**

```http
POST /admin/materials
Content-Type: application/json
Authorization: Bearer <token>

{
  "process": "FFF",
  "name": "PETG",
  "code": "PETG-001",
  "density": 1.27,
  "pricePerKg": 35.00,
  "co2eFactor": 3.2,
  "colors": ["clear", "black", "white", "blue"],
  "properties": {
    "printTemp": "230-250°C",
    "bedTemp": "70-80°C",
    "chemical_resistant": true
  }
}
```

**Update Material:**

```http
PUT /admin/materials/{id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "pricePerKg": 32.00,
  "active": true
}
```

#### Machine Management

**List Machines:**

```http
GET /admin/machines?process=CNC_3AXIS&active=true
Authorization: Bearer <token>
```

**Update Machine:**

```http
PUT /admin/machines/{id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "hourlyRate": 85.00,
  "setupMinutes": 30,
  "active": true
}
```

#### Reports

Generate various reports (CSV, Excel, or PDF).

```http
POST /admin/reports
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "quotes",
  "format": "excel",
  "dateFrom": "2024-01-01",
  "dateTo": "2024-01-31",
  "filters": {
    "status": ["quoted", "accepted"],
    "process": ["FFF", "SLA"]
  }
}
```

**Report Types:**

- `quotes` - Quote summary report
- `orders` - Order fulfillment report
- `revenue` - Revenue analysis
- `materials` - Material usage report
- `customers` - Customer activity report

## Webhooks

### Stripe Payment Webhook

Endpoint for Stripe payment notifications.

```http
POST /payment/webhook
Content-Type: application/json
Stripe-Signature: t=1234567890,v1=...

{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_a1b2c3d4",
      "metadata": {
        "quoteId": "quote_789012"
      }
    }
  }
}
```

## Health Checks

### Basic Health

```http
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-20T10:30:00Z"
}
```

### Detailed Health

```http
GET /health/ready
```

**Response:**

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "up"
    },
    "s3": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "up"
    },
    "s3": {
      "status": "up"
    }
  }
}
```

## Code Examples

### JavaScript/TypeScript

```typescript
// Using axios
import axios from 'axios';

const API_BASE = 'https://api.cotiza.studio/v1';
let accessToken: string;

// Login
async function login(email: string, password: string) {
  const response = await axios.post(`${API_BASE}/auth/login`, {
    email,
    password,
  });
  accessToken = response.data.data.accessToken;
  return response.data;
}

// Create quote
async function createQuote(items: QuoteItem[]) {
  const response = await axios.post(
    `${API_BASE}/quotes`,
    { items },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  );
  return response.data;
}

// Upload file
async function uploadFile(file: File) {
  // Get presigned URL
  const urlResponse = await axios.post(
    `${API_BASE}/files/upload`,
    {
      filename: file.name,
      contentType: file.type,
      size: file.size,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  // Upload to S3
  await axios.put(urlResponse.data.data.uploadUrl, file, {
    headers: {
      'Content-Type': file.type,
    },
  });

  return urlResponse.data.data.fileId;
}
```

### Python

```python
import requests
from typing import Dict, List

class Cotiza StudioClient:
    def __init__(self, base_url: str = "https://api.cotiza.studio/v1"):
        self.base_url = base_url
        self.access_token = None

    def login(self, email: str, password: str) -> Dict:
        response = requests.post(
            f"{self.base_url}/auth/login",
            json={"email": email, "password": password}
        )
        response.raise_for_status()
        data = response.json()
        self.access_token = data["data"]["accessToken"]
        return data

    def create_quote(self, items: List[Dict]) -> Dict:
        response = requests.post(
            f"{self.base_url}/quotes",
            json={"items": items},
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        response.raise_for_status()
        return response.json()

    def get_quote(self, quote_id: str) -> Dict:
        response = requests.get(
            f"{self.base_url}/quotes/{quote_id}",
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        response.raise_for_status()
        return response.json()

# Usage
client = Cotiza StudioClient()
client.login("user@example.com", "password123")

# Create quote
quote = client.create_quote([
    {
        "fileId": "file_123456",
        "process": "FFF",
        "material": "PLA",
        "quantity": 10,
        "selections": {
            "layerHeight": 0.2,
            "infill": 20
        }
    }
])

print(f"Quote ID: {quote['data']['id']}")
```

### cURL

```bash
# Login
curl -X POST https://api.cotiza.studio/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Save token
TOKEN="eyJhbGciOiJIUzI1NiIs..."

# Create quote
curl -X POST https://api.cotiza.studio/v1/quotes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{
      "fileId": "file_123456",
      "process": "FFF",
      "material": "PLA",
      "quantity": 10,
      "selections": {
        "layerHeight": 0.2,
        "infill": 20
      }
    }]
  }'

# Get quote
curl -X GET https://api.cotiza.studio/v1/quotes/quote_789012 \
  -H "Authorization: Bearer $TOKEN"
```

## Best Practices

1. **Authentication**

   - Store tokens securely (never in client-side code)
   - Implement token refresh before expiration
   - Handle 401 errors by refreshing token

2. **Error Handling**

   - Always check `success` field in responses
   - Implement exponential backoff for retries
   - Log error details for debugging

3. **File Uploads**

   - Validate file type and size before requesting URL
   - Use multipart upload for files > 5MB
   - Handle S3 upload errors separately

4. **Rate Limiting**

   - Implement client-side rate limiting
   - Cache responses when appropriate
   - Use pagination for list endpoints

5. **Webhooks**
   - Verify webhook signatures
   - Implement idempotent processing
   - Return 200 OK quickly

## Support

For API support:

- Email: api-support@cotiza.studio
- Documentation: https://docs.cotiza.studio/api
- Status Page: https://status.cotiza.studio
