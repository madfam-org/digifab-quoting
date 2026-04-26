# Migration Guide - MADFAM to Cotiza Studio

## Overview

This guide covers the migration from the MADFAM branding to Cotiza Studio, including database updates, configuration changes, and deployment adjustments.

## Version Information

- **Previous**: MADFAM Quoting System v1.x
- **Current**: Cotiza Studio Platform v2.0
- **Migration Date**: January 2025

## Major Changes

### 1. Rebranding

- Platform name: MADFAM → Cotiza Studio
- Domain: madfam.io → cotiza.studio
- Package scope: @madfam/_ → @cotiza/_
- Docker images: madfam-_ → cotiza-_
- AWS resources: madfam-_ → cotiza-_

### 2. New Features

#### Multilingual Support

- Spanish (default), English, Portuguese (Brazil)
- Automatic locale detection
- User language preferences
- Localized emails and PDFs

#### Enhanced Guest Experience

- No registration required for quotes
- Guest-to-user conversion flow
- Session persistence

#### DIY vs Professional Tools

- Cost comparison calculator
- Time investment analysis
- Skill requirement assessment

## Migration Steps

### Phase 1: Database Migration

#### 1.1 Backup Current Database

```bash
# Create backup
pg_dump $OLD_DATABASE_URL > backup_$(date +%Y%m%d).sql

# Verify backup
pg_restore --list backup_*.sql | head -20
```

#### 1.2 Add New Schema Elements

```sql
-- Add user language preference
ALTER TABLE users
ADD COLUMN preferred_locale VARCHAR(10) DEFAULT 'es';

-- Create translations table
CREATE TABLE translations (
  id VARCHAR(36) PRIMARY KEY,
  key VARCHAR(255) NOT NULL,
  locale VARCHAR(10) NOT NULL,
  value TEXT NOT NULL,
  namespace VARCHAR(100) DEFAULT 'common',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(key, locale)
);

CREATE INDEX idx_translations_locale ON translations(locale);
CREATE INDEX idx_translations_namespace ON translations(namespace);
CREATE INDEX idx_translations_key ON translations(key);

-- Add guest session support
CREATE TABLE guest_sessions (
  id VARCHAR(36) PRIMARY KEY,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  converted_to_user_id VARCHAR(36)
);

CREATE INDEX idx_guest_sessions_token ON guest_sessions(session_token);
CREATE INDEX idx_guest_sessions_email ON guest_sessions(email);

-- Add quote origin tracking
ALTER TABLE quotes
ADD COLUMN origin VARCHAR(50) DEFAULT 'authenticated',
ADD COLUMN guest_session_id VARCHAR(36);
```

#### 1.3 Run Prisma Migration

```bash
# Generate migration
npx prisma migrate dev --name add_multilingual_support

# Apply to production
npx prisma migrate deploy
```

### Phase 2: Configuration Updates

#### 2.1 Environment Variables

```bash
# Old configuration
DEFAULT_CURRENCY=MXN
SUPPORTED_CURRENCIES=MXN,USD

# New configuration (add)
DEFAULT_LOCALE=es
SUPPORTED_LOCALES=es,en,pt-BR
EMAIL_FROM=noreply@cotiza.studio
FRONTEND_URL=https://www.cotiza.studio
ADMIN_URL=https://admin.cotiza.studio
```

#### 2.2 Update AWS Resources

```bash
# S3 Buckets
aws s3 mb s3://cotiza-files-prod
aws s3 mb s3://cotiza-web-prod
aws s3 mb s3://cotiza-backups

# Copy existing data
aws s3 sync s3://madfam-files-prod s3://cotiza-files-prod

# Update bucket policies
aws s3api put-bucket-policy \
  --bucket cotiza-files-prod \
  --policy file://s3-policy.json

# ECR Repositories
aws ecr create-repository --repository-name cotiza-api
aws ecr create-repository --repository-name cotiza-web
aws ecr create-repository --repository-name cotiza-worker
```

#### 2.3 Update Secrets Manager

```bash
# Create new secrets
aws secretsmanager create-secret \
  --name cotiza/prod/api \
  --secret-string file://secrets.json

# Rotate JWT secret
JWT_SECRET=$(openssl rand -base64 32)
aws secretsmanager update-secret \
  --secret-id cotiza/prod/api \
  --secret-string "{'JWT_SECRET': '$JWT_SECRET'}"
```

### Phase 3: Code Updates

#### 3.1 Update Package Names

```json
// package.json
{
  "name": "@cotiza/api", // was @madfam/api
  "version": "2.0.0"
  // ...
}
```

#### 3.2 Update Import Statements

```bash
# Find and replace imports
find . -type f -name "*.ts" -o -name "*.tsx" | \
  xargs sed -i '' 's/@madfam/@cotiza/g'
```

#### 3.3 Update Branding

```typescript
// config/constants.ts
export const APP_NAME = 'Cotiza Studio'; // was 'MADFAM'
export const DOMAIN = 'cotiza.studio'; // was 'madfam.io'
export const SUPPORT_EMAIL = 'support@cotiza.studio';
```

### Phase 4: Deployment

#### 4.1 Build New Images

```bash
# Build with new tags
docker build -t cotiza-api:v2.0.0 -f apps/api/Dockerfile .
docker build -t cotiza-web:v2.0.0 -f apps/web/Dockerfile .
docker build -t cotiza-worker:v2.0.0 -f apps/worker/Dockerfile .

# Push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
docker tag cotiza-api:v2.0.0 $ECR_URL/cotiza-api:v2.0.0
docker push $ECR_URL/cotiza-api:v2.0.0
```

#### 4.2 Update ECS Task Definitions

```json
// task-definition.json
{
  "family": "cotiza-api",
  "containerDefinitions": [
    {
      "name": "cotiza-api",
      "image": "${ECR_URL}/cotiza-api:v2.0.0",
      "environment": [
        { "name": "APP_NAME", "value": "Cotiza Studio" },
        { "name": "DEFAULT_LOCALE", "value": "es" }
      ]
    }
  ]
}
```

#### 4.3 Deploy with Zero Downtime

```bash
# Blue-Green Deployment
# 1. Create new target group
aws elbv2 create-target-group \
  --name cotiza-api-v2 \
  --protocol HTTP \
  --port 4000 \
  --vpc-id $VPC_ID

# 2. Update service with new task definition
aws ecs update-service \
  --cluster cotiza-prod \
  --service cotiza-api \
  --task-definition cotiza-api:v2 \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100"

# 3. Monitor deployment
aws ecs wait services-stable \
  --cluster cotiza-prod \
  --services cotiza-api

# 4. Switch traffic
aws elbv2 modify-listener \
  --listener-arn $LISTENER_ARN \
  --default-actions Type=forward,TargetGroupArn=$NEW_TG_ARN
```

### Phase 5: DNS Migration

#### 5.1 Configure New Domain

```bash
# Route 53 Hosted Zone
aws route53 create-hosted-zone \
  --name cotiza.studio \
  --caller-reference $(date +%s)

# A Records
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch file://dns-records.json
```

#### 5.2 SSL Certificates

```bash
# Request ACM Certificate
aws acm request-certificate \
  --domain-name "*.cotiza.studio" \
  --validation-method DNS \
  --subject-alternative-names "cotiza.studio"

# Validate
aws acm wait certificate-validated \
  --certificate-arn $CERT_ARN
```

#### 5.3 Update CloudFront

```bash
# Update distribution
aws cloudfront update-distribution \
  --id $DISTRIBUTION_ID \
  --distribution-config file://cf-config.json

# Add CNAME
aws cloudfront update-distribution \
  --id $DISTRIBUTION_ID \
  --if-match $ETAG \
  --distribution-config '{
    "Aliases": {"Items": ["www.cotiza.studio", "cotiza.studio"]}
  }'
```

### Phase 6: Data Migration

#### 6.1 Migrate User Preferences

```sql
-- Set default language based on region
UPDATE users
SET preferred_locale = CASE
  WHEN country = 'BR' THEN 'pt-BR'
  WHEN country IN ('US', 'CA') THEN 'en'
  ELSE 'es'
END
WHERE preferred_locale IS NULL;
```

#### 6.2 Initialize Translation Cache

```bash
# Load translations into Redis
node scripts/load-translations.js

# Verify
redis-cli KEYS "i18n:*" | head -10
```

### Phase 7: Testing & Validation

#### 7.1 Smoke Tests

```bash
# API Health
curl https://api.cotiza.studio/health

# Frontend
curl -I https://www.cotiza.studio

# Test each locale
for locale in es en pt-BR; do
  curl -H "Accept-Language: $locale" \
    https://api.cotiza.studio/api/v1/test
done
```

#### 7.2 E2E Tests

```bash
# Run full test suite
npm run test:e2e -- --env production

# Test critical paths
npm run test:e2e -- --grep "guest quote"
npm run test:e2e -- --grep "language switch"
npm run test:e2e -- --grep "payment flow"
```

#### 7.3 Performance Validation

```bash
# Load testing
artillery run load-test.yml

# Check metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=$ALB_NAME \
  --statistics Average \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300
```

## Rollback Procedures

If issues arise during migration:

### Quick Rollback (< 5 minutes)

```bash
# Revert ECS services
aws ecs update-service \
  --cluster cotiza-prod \
  --service cotiza-api \
  --task-definition madfam-api:stable

# Switch DNS back
aws route53 change-resource-record-sets \
  --hosted-zone-id $OLD_ZONE_ID \
  --change-batch file://rollback-dns.json
```

### Database Rollback

```bash
# Restore from backup
psql $DATABASE_URL < backup_20250126.sql

# Or use RDS snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier cotiza-prod-rollback \
  --db-snapshot-identifier pre-migration-snapshot
```

## Post-Migration Tasks

### Monitoring

1. **Check Error Rates**

   - API 4xx/5xx responses
   - JavaScript errors in frontend
   - Failed payment transactions

2. **Performance Metrics**

   - API response times
   - Database query performance
   - CDN cache hit rates

3. **User Feedback**
   - Support ticket volume
   - User satisfaction scores
   - Feature adoption rates

### Cleanup

After 30 days of stable operation:

```bash
# Remove old resources
aws s3 rm s3://madfam-files-prod --recursive
aws ecr delete-repository --repository-name madfam-api

# Archive old code
git tag -a v1.0.0-final -m "Final MADFAM version"
git push origin v1.0.0-final
```

## Troubleshooting

### Issue: Locale not detected

```bash
# Check middleware
curl -H "Accept-Language: en" \
  -H "X-Debug: true" \
  https://api.cotiza.studio/test

# Verify Redis cache
redis-cli GET "i18n:en:common"
```

### Issue: Guest sessions not persisting

```sql
-- Check session table
SELECT * FROM guest_sessions
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Verify token generation
SELECT COUNT(*) FROM guest_sessions
WHERE session_token IS NULL;
```

### Issue: Email templates in wrong language

```bash
# Test email service
curl -X POST https://api.cotiza.studio/test/email \
  -H "Content-Type: application/json" \
  -d '{"locale": "en", "template": "welcome"}'

# Check user preferences
SELECT email, preferred_locale
FROM users
WHERE preferred_locale != 'es';
```

## Support

For migration assistance:

- **Documentation**: https://docs.cotiza.studio/migration
- **Support Email**: migration@cotiza.studio
- **Slack Channel**: #migration-support
- **Emergency Hotline**: +1-555-COTIZA-1

## Appendix

### A. Environment Variable Mapping

| Old Variable     | New Variable      | Notes                 |
| ---------------- | ----------------- | --------------------- |
| MADFAM_API_URL   | COTIZA_API_URL    | Update all references |
| DEFAULT_CURRENCY | DEFAULT_CURRENCY  | No change             |
| -                | DEFAULT_LOCALE    | New, defaults to 'es' |
| -                | SUPPORTED_LOCALES | New, 'es,en,pt-BR'    |
| S3_BUCKET        | S3_BUCKET         | Update bucket name    |

### B. API Endpoint Changes

| Old Endpoint | New Endpoint | Changes |
|-------------|--------------|---------||
| /api/v1/_ | /api/v1/_ | No change |
| - | /api/v1/user/preferences | New endpoint |
| - | /api/v1/guest/\* | New guest endpoints |

### C. Database Schema Changes

See [SCHEMA_CHANGES.md](./SCHEMA_CHANGES.md) for detailed schema evolution.

### D. Translation Keys

Complete translation key reference: [TRANSLATION_KEYS.md](./TRANSLATION_KEYS.md)
