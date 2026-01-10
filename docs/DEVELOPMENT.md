# Cotiza Studio Development Guide

## Getting Started

This guide covers setting up your development environment, understanding the codebase structure, and following best practices for contributing to the Cotiza Studio system.

## Prerequisites

### Required Software

- **Node.js**: v18.17.0 or higher
- **npm**: v9.0.0 or higher
- **Python**: v3.9 or higher
- **PostgreSQL**: v14 or higher
- **Redis**: v6.2 or higher
- **Docker**: v20.10 or higher
- **Docker Compose**: v2.0 or higher
- **Git**: v2.32 or higher

### Recommended Tools

- **VS Code** with extensions:
  - ESLint
  - Prettier
  - Prisma
  - Thunder Client (API testing)
  - Docker
- **pgAdmin** or **TablePlus** for database management
- **Redis Insight** for Redis debugging
- **Postman** or **Insomnia** for API testing

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/madfam-org/digifab-quoting.git
cd digifab-quoting
```

### 2. Install Dependencies

```bash
# Install Node dependencies
npm install

# Install Python dependencies for worker
cd apps/worker
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

### 3. Environment Configuration

Create `.env` files from examples:

```bash
# Root environment
cp .env.example .env

# API environment
cp apps/api/.env.example apps/api/.env

# Web environment
cp apps/web/.env.example apps/web/.env

# Worker environment
cp apps/worker/.env.example apps/worker/.env
```

### 4. Configure Environment Variables

Edit the `.env` files with your local configuration:

**Root `.env`:**

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/madfam_quoting
REDIS_URL=redis://localhost:6379
```

**API `.env`:**

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/madfam_quoting

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# AWS (use LocalStack for development)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_BUCKET=madfam-quoting-dev
S3_ENDPOINT=http://localhost:4566  # LocalStack

# Stripe (test keys)
STRIPE_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# Email (use MailHog for development)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@madfam.local

# Feature Flags
ENABLE_PAYMENT=true
ENABLE_EMAIL_NOTIFICATIONS=false
ENABLE_WORKER_PROCESSING=true
```

**Web `.env`:**

```env
# API URL
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1

# Auth
NEXTAUTH_URL=http://localhost:3002
NEXTAUTH_SECRET=your-nextauth-secret-change-in-production

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Feature Flags
NEXT_PUBLIC_ENABLE_PAYMENT=true
```

### 5. Start Development Services

```bash
# Start PostgreSQL, Redis, and LocalStack
docker-compose up -d postgres redis localstack mailhog

# Create S3 bucket in LocalStack
aws --endpoint-url=http://localhost:4566 s3 mb s3://madfam-quoting-dev

# Run database migrations
npm run db:migrate

# Seed database with test data
npm run db:seed
```

### 6. Start Development Servers

```bash
# In separate terminals or use tmux/screen

# Terminal 1: Start all services
npm run dev

# Or run services individually:

# Terminal 1: API
npm run dev -- --filter=@madfam/api

# Terminal 2: Web
npm run dev -- --filter=@madfam/web

# Terminal 3: Worker
cd apps/worker
python geometry_analyzer.py
```

### 7. Access Applications

- **Web App**: http://localhost:3002
- **API**: http://localhost:4000
- **API Docs**: http://localhost:4000/api/docs
- **Worker**: http://localhost:8000
- **MailHog**: http://localhost:8025
- **LocalStack**: http://localhost:4566

## Project Structure

### Monorepo Organization

```
digifab-quoting/
├── apps/                    # Applications
│   ├── api/                # NestJS backend
│   ├── web/                # Next.js frontend
│   ├── worker/             # Python worker
│   └── admin/              # Admin dashboard
├── packages/               # Shared packages
│   ├── pricing-engine/     # Core pricing logic
│   ├── shared/            # Shared types/utils
│   └── ui/                # Shared components
├── infrastructure/         # Infrastructure code
│   ├── terraform/         # IaC templates
│   └── docker/            # Docker configs
├── docs/                   # Documentation
├── scripts/               # Build/deploy scripts
└── tools/                 # Development tools
```

### Code Organization

#### API Structure (NestJS)

```typescript
// Module structure
src/modules/quotes/
├── quotes.module.ts       // Module definition
├── quotes.controller.ts   // HTTP endpoints
├── quotes.service.ts      // Business logic
├── dto/                   // Data transfer objects
│   ├── create-quote.dto.ts
│   └── update-quote.dto.ts
├── entities/              // Domain entities
│   └── quote.entity.ts
└── __tests__/            // Tests
    ├── quotes.service.spec.ts
    └── quotes.controller.spec.ts
```

#### Frontend Structure (Next.js)

```typescript
// Component structure
app/[locale]/quotes/
├── page.tsx              // Page component
├── layout.tsx            // Layout wrapper
├── loading.tsx           // Loading state
├── error.tsx             // Error boundary
└── components/           // Page components
    ├── QuoteList.tsx
    ├── QuoteForm.tsx
    └── QuoteCard.tsx
```

## Development Workflow

### Git Workflow

We follow a Git Flow-inspired workflow:

```
main (production)
  ↑
develop (staging)
  ↑
feature/JIRA-123-feature-name
```

### Creating a Feature

1. **Create feature branch:**

```bash
git checkout develop
git pull origin develop
git checkout -b feature/JIRA-123-add-user-notifications
```

2. **Make changes following conventions**

3. **Commit with conventional commits:**

```bash
git add .
git commit -m "feat(api): add email notifications for quote updates

- Add email service with SendGrid integration
- Create notification templates
- Add user notification preferences

Closes JIRA-123"
```

4. **Push and create PR:**

```bash
git push origin feature/JIRA-123-add-user-notifications
```

### Code Style

#### TypeScript/JavaScript

```typescript
// Use explicit types
interface QuoteCreateParams {
  items: QuoteItem[];
  customerId?: string;
  notes?: string;
}

// Use async/await over promises
async function createQuote(params: QuoteCreateParams): Promise<Quote> {
  // Validate input
  if (!params.items.length) {
    throw new BadRequestException('At least one item is required');
  }

  // Use early returns
  const existingQuote = await this.findDraft(params.customerId);
  if (existingQuote) {
    return existingQuote;
  }

  // Business logic
  const quote = await this.quotesRepository.create({
    ...params,
    status: QuoteStatus.DRAFT,
  });

  // Emit events
  await this.eventEmitter.emit('quote.created', quote);

  return quote;
}

// Use functional programming where appropriate
const totalPrice = items
  .map((item) => item.unitPrice * item.quantity)
  .reduce((sum, price) => sum + price, 0);
```

#### Python

```python
# Use type hints
from typing import List, Dict, Optional
from dataclasses import dataclass

@dataclass
class GeometryMetrics:
    """Represents 3D geometry metrics."""
    volume_cm3: float
    surface_area_cm2: float
    bbox_mm: Dict[str, float]

    def validate(self) -> None:
        """Validate geometry metrics."""
        if self.volume_cm3 <= 0:
            raise ValueError("Volume must be positive")

        if any(dim <= 0 for dim in self.bbox_mm.values()):
            raise ValueError("Bounding box dimensions must be positive")

# Use async where appropriate
async def analyze_geometry(file_path: str) -> GeometryMetrics:
    """Analyze 3D file geometry."""
    try:
        mesh = await load_mesh(file_path)
        metrics = calculate_metrics(mesh)
        metrics.validate()
        return metrics
    except Exception as e:
        logger.error(f"Geometry analysis failed: {e}")
        raise
```

### Testing

#### Unit Tests

```typescript
// API unit test example
describe('QuotesService', () => {
  let service: QuotesService;
  let repository: MockRepository<Quote>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        QuotesService,
        {
          provide: getRepositoryToken(Quote),
          useClass: MockRepository,
        },
      ],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
    repository = module.get(getRepositoryToken(Quote));
  });

  describe('create', () => {
    it('should create a quote with valid input', async () => {
      const input = {
        items: [{ fileId: 'file_123', process: 'FFF' }],
      };

      const result = await service.create(input);

      expect(result).toBeDefined();
      expect(result.status).toBe(QuoteStatus.DRAFT);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: QuoteStatus.DRAFT,
        }),
      );
    });

    it('should throw error for empty items', async () => {
      const input = { items: [] };

      await expect(service.create(input)).rejects.toThrow('At least one item is required');
    });
  });
});
```

#### Integration Tests

```typescript
// API integration test
describe('Quotes API (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get auth token
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password' });

    authToken = response.body.data.accessToken;
  });

  describe('POST /quotes', () => {
    it('should create quote', async () => {
      const response = await request(app.getHttpServer())
        .post('/quotes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [
            {
              fileId: 'file_123',
              process: 'FFF',
              material: 'PLA',
              quantity: 10,
            },
          ],
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.status).toBe('processing');
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### Database Development

#### Creating Migrations

```bash
# Generate migration from schema changes
npm run db:migrate:dev -- --name add_user_preferences

# Apply migrations
npm run db:migrate

# Rollback last migration
npm run db:migrate:rollback
```

#### Prisma Schema

```prisma
// Always include tenant_id for multi-tenancy
model Quote {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  tenant    Tenant   @relation(fields: [tenantId], references: [id])

  // Timestamps
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Fields
  status    QuoteStatus @default(DRAFT)
  items     QuoteItem[]

  // Indexes for performance
  @@index([tenantId, status])
  @@index([createdAt])
  @@map("quotes")
}
```

### API Development

#### Creating a New Endpoint

1. **Define DTO:**

```typescript
// dto/create-material.dto.ts
export class CreateMaterialDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsNumber()
  @Min(0)
  density: number;

  @IsNumber()
  @Min(0)
  pricePerKg: number;

  @IsEnum(ProcessType)
  process: ProcessType;
}
```

2. **Implement Service:**

```typescript
// materials.service.ts
@Injectable()
export class MaterialsService {
  constructor(
    private prisma: PrismaService,
    private tenantContext: TenantContextService,
  ) {}

  async create(dto: CreateMaterialDto): Promise<Material> {
    const tenantId = this.tenantContext.getTenantId();

    // Check for duplicates
    const existing = await this.prisma.material.findFirst({
      where: {
        tenantId,
        code: dto.code,
      },
    });

    if (existing) {
      throw new ConflictException('Material code already exists');
    }

    return this.prisma.material.create({
      data: {
        ...dto,
        tenantId,
      },
    });
  }
}
```

3. **Create Controller:**

```typescript
// materials.controller.ts
@Controller('materials')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@ApiTags('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create material' })
  @ApiResponse({ status: 201, description: 'Material created' })
  async create(@Body() dto: CreateMaterialDto) {
    const material = await this.materialsService.create(dto);
    return {
      success: true,
      data: material,
    };
  }
}
```

### Frontend Development

#### Creating a Component

```typescript
// components/quotes/QuoteCard.tsx
import { Quote } from '@/types/quote';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

interface QuoteCardProps {
  quote: Quote;
  onSelect?: (quote: Quote) => void;
}

export function QuoteCard({ quote, onSelect }: QuoteCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => onSelect?.(quote)}
    >
      <CardHeader>
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-semibold">
            Quote #{quote.reference}
          </h3>
          <QuoteStatusBadge status={quote.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {quote.items.length} items
          </p>
          <p className="text-xl font-bold">
            {formatCurrency(quote.totals.grandTotal, quote.currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            Valid until {formatDate(quote.validUntil)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### Using API Client

```typescript
// lib/api/quotes.ts
import { apiClient } from './client';
import { Quote, CreateQuoteDto } from '@/types';

export const quotesApi = {
  async create(data: CreateQuoteDto): Promise<Quote> {
    const response = await apiClient.post('/quotes', data);
    return response.data;
  },

  async get(id: string): Promise<Quote> {
    const response = await apiClient.get(`/quotes/${id}`);
    return response.data;
  },

  async list(params?: QuoteListParams): Promise<PaginatedResponse<Quote>> {
    const response = await apiClient.get('/quotes', { params });
    return response.data;
  },
};

// hooks/useQuotes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quotesApi } from '@/lib/api/quotes';

export function useQuotes(params?: QuoteListParams) {
  return useQuery({
    queryKey: ['quotes', params],
    queryFn: () => quotesApi.list(params),
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: quotesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}
```

## Debugging

### API Debugging

1. **Enable debug logging:**

```typescript
// main.ts
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn', 'log', 'debug', 'verbose'],
});
```

2. **Use VS Code debugger:**

```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug API",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "start:debug", "--", "--filter=@madfam/api"],
  "console": "integratedTerminal",
  "restart": true
}
```

3. **Database query logging:**

```typescript
// Enable Prisma query logging
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

### Frontend Debugging

1. **React Developer Tools**
2. **Redux DevTools** (if using Redux)
3. **Network tab for API calls**
4. **Console logging with context:**

```typescript
const debug = process.env.NODE_ENV === 'development';

if (debug) {
  console.group('Quote Creation');
  console.log('Input:', input);
  console.log('Validation:', errors);
  console.log('Response:', response);
  console.groupEnd();
}
```

## Performance Optimization

### Database Optimization

1. **Use proper indexes:**

```prisma
model Quote {
  // Composite indexes for common queries
  @@index([tenantId, status, createdAt])
  @@index([customerId, createdAt])
}
```

2. **Avoid N+1 queries:**

```typescript
// Bad
const quotes = await prisma.quote.findMany();
for (const quote of quotes) {
  quote.items = await prisma.quoteItem.findMany({
    where: { quoteId: quote.id },
  });
}

// Good
const quotes = await prisma.quote.findMany({
  include: {
    items: true,
  },
});
```

3. **Use pagination:**

```typescript
const quotes = await prisma.quote.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: 'desc' },
});
```

### Frontend Optimization

1. **Code splitting:**

```typescript
const QuoteWizard = dynamic(() => import('./QuoteWizard'), {
  loading: () => <QuoteWizardSkeleton />,
});
```

2. **Image optimization:**

```typescript
import Image from 'next/image';

<Image
  src="/logo.png"
  alt="Logo"
  width={200}
  height={50}
  priority
/>
```

3. **Memoization:**

```typescript
const expensiveCalculation = useMemo(() => {
  return calculateTotalPrice(items);
}, [items]);
```

## Troubleshooting

### Common Issues

#### Database Connection Errors

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

#### Redis Connection Errors

```bash
# Check Redis is running
docker ps | grep redis

# Test connection
redis-cli ping
```

#### Build Errors

```bash
# Clear all caches
npm run clean
rm -rf node_modules
rm -rf .next
rm -rf dist

# Reinstall
npm install

# Rebuild
npm run build
```

#### TypeScript Errors

```bash
# Check for type errors
npm run typecheck

# Generate types from Prisma
npm run db:generate
```

### Debug Commands

```bash
# View API logs
docker logs -f madfam-api

# Database console
npm run db:studio

# Redis console
redis-cli

# View running processes
pm2 list

# Check port usage
lsof -i :4000  # API
lsof -i :3002  # Web
```

## Resources

### Documentation

- [NestJS Docs](https://docs.nestjs.com)
- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

### Internal Resources

- [API Documentation](/docs/API.md)
- [Architecture Guide](/docs/ARCHITECTURE.md)
- [Deployment Guide](/docs/DEPLOYMENT.md)
- [Security Guide](/docs/SECURITY.md)

### Tools

- [Prisma Studio](http://localhost:5555) - Database GUI
- [Swagger UI](http://localhost:4000/api/docs) - API Explorer
- [MailHog](http://localhost:8025) - Email Testing
- [LocalStack](http://localhost:4566) - AWS Services
