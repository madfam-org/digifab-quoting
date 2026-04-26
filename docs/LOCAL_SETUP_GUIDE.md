# Cotiza Studio MVP - Local Setup & Deployment Guide

## Local Development Setup

### Step 1: Prerequisites

Ensure you have:

- Node.js 18+ and npm 9+
- Docker Desktop installed and running
- PostgreSQL client tools (optional)

### Step 2: Environment Configuration

1. **Root .env file**:

```bash
cp .env.example .env
```

2. **API .env file** (`apps/api/.env`):

```env
NODE_ENV=development
PORT=4000

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/madfam_quoting?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT & Auth
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_ACCESS_TOKEN_EXPIRY="15m"
JWT_REFRESH_TOKEN_EXPIRY="7d"

# AWS (for local development)
AWS_REGION="us-east-1"
S3_BUCKET="madfam-quoting-dev"

# Worker
GEOMETRY_SERVICE_URL="http://localhost:8000"

# CORS
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:4000"
```

3. **Web .env file** (`apps/web/.env`):

```env
NEXT_PUBLIC_API_URL="http://localhost:4000/api/v1"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-nextauth-key-change-in-production"
```

### Step 3: Start Database Services

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Wait for services to be healthy
docker-compose ps
```

### Step 4: Initialize Database

```bash
# Navigate to API directory
cd apps/api

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Seed initial data
npx tsx prisma/seed.ts

# Return to root
cd ../..
```

### Step 5: Install Dependencies

```bash
# Install all dependencies
npm install
```

### Step 6: Start Development Servers

**Option 1: Run all services (recommended for full stack)**

```bash
npm run dev
```

**Option 2: Run services individually**

```bash
# Terminal 1 - API
cd apps/api
npm run dev

# Terminal 2 - Web
cd apps/web
npm run dev

# Terminal 3 - Worker (if needed)
cd apps/worker
python -m uvicorn main:app --reload
```

### Step 7: Access Applications

- Web App: http://localhost:3000
- API: http://localhost:4000
- API Docs: http://localhost:4000/api/docs
- Worker: http://localhost:8000

### Default Login Credentials

- **Admin**: admin@cotiza.studio / admin123
- **Customer**: test@example.com / test123

## Common Issues & Solutions

### Issue 1: API not starting on port 4000

**Symptom**: Connection refused on port 4000

**Solutions**:

1. Check if port is already in use:

   ```bash
   lsof -i :4000
   kill -9 <PID>  # Kill process using port
   ```

2. Check API logs:

   ```bash
   cd apps/api
   npm run dev
   ```

3. Ensure database is running:
   ```bash
   docker-compose ps
   ```

### Issue 2: TypeScript errors preventing build

**Symptom**: Build fails with TS errors

**Solutions**:

1. Clear build cache:

   ```bash
   npm run clean
   rm -rf node_modules
   npm install
   ```

2. Fix specific errors:
   - Check `apps/api/src/modules/jobs/jobs.service.ts` line 360
   - Ensure all imports are correct

### Issue 3: Database connection failed

**Symptom**: Can't connect to PostgreSQL

**Solutions**:

1. Ensure Docker is running
2. Check database is up:
   ```bash
   docker-compose logs postgres
   ```
3. Verify connection string in `.env`

## Deployment Issues (404 Error)

### Root Causes of 404 on Vercel

1. **Missing Environment Variables**

   - Ensure all required env vars are set in Vercel dashboard
   - Especially `NEXT_PUBLIC_API_URL`

2. **API Not Deployed**

   - The API needs to be deployed separately
   - Vercel only deploys the Next.js frontend

3. **Incorrect Build Configuration**
   - Update `apps/web/next.config.js`:
   ```javascript
   module.exports = {
     output: 'standalone',
     // ... rest of config
   };
   ```

### Deployment Solution

#### 1. Deploy API Separately

Choose one:

- **Railway**: Easy PostgreSQL + Redis + API hosting
- **Render**: Good free tier
- **AWS ECS**: Production-ready but complex
- **Fly.io**: Good for containers

#### 2. Update Frontend Environment

In Vercel dashboard, set:

```
NEXT_PUBLIC_API_URL=https://your-api-domain.com/api/v1
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=<generate-secure-secret>
```

#### 3. Configure CORS

Update API's `main.ts`:

```typescript
app.enableCors({
  origin: ['https://your-app.vercel.app', 'http://localhost:3000'],
  credentials: true,
});
```

#### 4. Create Vercel Configuration

Create `apps/web/vercel.json`:

```json
{
  "buildCommand": "cd ../.. && npm run build -- --filter=@madfam/web",
  "outputDirectory": "apps/web/.next",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

## Testing the Setup

### 1. Health Check

```bash
# API Health
curl http://localhost:4000/health

# Expected response:
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

### 2. Test Authentication

```bash
# Login
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cotiza.studio","password":"admin123"}'
```

### 3. Test Quote Creation Flow

1. Login to web app
2. Upload a test STL file
3. Select material and options
4. Create quote
5. View quote details

## Production Deployment Checklist

- [ ] Database hosted (PostgreSQL 15+)
- [ ] Redis hosted
- [ ] API deployed and accessible
- [ ] Environment variables configured
- [ ] CORS properly configured
- [ ] SSL certificates active
- [ ] Monitoring configured
- [ ] Backup strategy in place
- [ ] Rate limiting configured
- [ ] Error tracking (Sentry) setup

## Support

If issues persist:

1. Check logs in `apps/*/logs/`
2. Review error messages carefully
3. Ensure all services are running
4. Verify environment variables
5. Check network connectivity
