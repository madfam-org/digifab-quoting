# Cotiza Studio System Troubleshooting Guide

## Overview

This guide provides solutions to common issues encountered during development, deployment, and operation of the Cotiza Studio system. Issues are organized by component and severity level.

## Quick Diagnostics

### System Health Check

```bash
# Run comprehensive health check
npm run health:check

# Check individual services
curl http://localhost:4000/health         # API
curl http://localhost:3002/api/health     # Web
curl http://localhost:8000/health         # Worker
```

### Environment Verification

```bash
# Check environment variables
npm run env:check

# Verify database connection
psql $DATABASE_URL -c "SELECT version()"

# Test Redis connection
redis-cli ping

# Check AWS services (LocalStack in dev)
aws --endpoint-url=http://localhost:4566 s3 ls
```

## Development Issues

### Database Problems

#### Connection Refused / Can't Connect

**Symptoms:**

- `ECONNREFUSED` errors
- `Connection terminated unexpectedly`
- `password authentication failed`

**Solutions:**

```bash
# 1. Check if PostgreSQL is running
docker ps | grep postgres

# 2. Start PostgreSQL if stopped
docker-compose up -d postgres

# 3. Verify connection string
echo $DATABASE_URL

# 4. Test direct connection
psql "postgresql://postgres:postgres@localhost:5432/madfam_quoting" -c "SELECT 1"

# 5. Reset database if corrupted
docker-compose down postgres
docker volume rm digifab-quoting_postgres_data
docker-compose up -d postgres
npm run db:migrate
```

**Common Causes:**

- Docker container not running
- Wrong connection credentials
- Port conflict (5432 in use)
- Database doesn't exist

#### Migration Failures

**Symptoms:**

- `Migration failed` errors
- `Column already exists`
- `Relation does not exist`

**Solutions:**

```bash
# 1. Check migration status
npm run db:migrate:status

# 2. Rollback problematic migration
npm run db:migrate:rollback

# 3. Fix migration file and retry
npm run db:migrate

# 4. Reset database (development only)
npm run db:reset
npm run db:seed

# 5. Generate Prisma client
npm run db:generate
```

#### Slow Queries

**Symptoms:**

- Long response times
- Database timeouts
- High CPU usage

**Diagnostics:**

```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check active connections
SELECT * FROM pg_stat_activity
WHERE state = 'active';

-- Check table sizes
SELECT schemaname,tablename,attname,n_distinct,correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY n_distinct DESC;
```

**Solutions:**

```bash
# Add missing indexes
npm run db:indexes:analyze
npm run db:indexes:create

# Update table statistics
psql $DATABASE_URL -c "ANALYZE;"

# Check query plans
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM quotes WHERE status = 'quoted'"
```

### Redis Issues

#### Connection Problems

**Symptoms:**

- `Redis connection failed`
- `ECONNREFUSED` to Redis
- Session/cache misses

**Solutions:**

```bash
# 1. Check Redis status
docker ps | grep redis

# 2. Start Redis
docker-compose up -d redis

# 3. Test connection
redis-cli -h localhost -p 6379 ping

# 4. Check Redis logs
docker logs redis

# 5. Clear Redis data if corrupted
redis-cli FLUSHALL
```

#### Memory Issues

**Symptoms:**

- Redis running out of memory
- `OOM` errors
- Evicted keys

**Diagnostics:**

```bash
# Check memory usage
redis-cli INFO memory

# Check key distribution
redis-cli --bigkeys

# Monitor Redis commands
redis-cli MONITOR
```

**Solutions:**

```bash
# Set memory limit
redis-cli CONFIG SET maxmemory 256mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Clean expired keys
redis-cli CONFIG SET expire-scan-interval 100

# Clear specific patterns
redis-cli --scan --pattern "cache:*" | xargs redis-cli DEL
```

### Application Issues

#### API Server Won't Start

**Symptoms:**

- `Port already in use`
- `Module not found`
- Compilation errors

**Solutions:**

```bash
# 1. Kill process using port
lsof -ti:4000 | xargs kill -9

# 2. Clear Node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# 3. Clear TypeScript cache
rm -rf dist
npm run build

# 4. Check for TypeScript errors
npm run typecheck

# 5. Start with verbose logging
DEBUG=* npm run start:dev
```

#### Module Resolution Errors

**Symptoms:**

- `Cannot find module '@/...'`
- `Module not found` errors
- Import path issues

**Solutions:**

```bash
# 1. Check tsconfig paths
cat tsconfig.json | jq '.compilerOptions.paths'

# 2. Restart TypeScript server (VS Code)
# Command Palette > TypeScript: Restart TS Server

# 3. Clear module cache
rm -rf node_modules/.cache
rm -rf dist

# 4. Reinstall dependencies
npm ci
```

#### Worker Process Issues

**Symptoms:**

- Jobs stuck in queue
- Python import errors
- Geometry analysis failures

**Solutions:**

```bash
# 1. Check Python environment
cd apps/worker
python --version
pip list

# 2. Reinstall Python dependencies
pip install -r requirements.txt --force-reinstall

# 3. Test worker directly
python geometry_analyzer.py

# 4. Check queue status
aws sqs get-queue-attributes --queue-url $SQS_QUEUE_URL --attribute-names All

# 5. Process stuck jobs manually
python -c "from geometry_analyzer import process_file; process_file('path/to/file.stl')"
```

### Frontend Issues

#### Build Failures

**Symptoms:**

- `next build` fails
- TypeScript errors
- Module not found

**Solutions:**

```bash
# 1. Clear Next.js cache
rm -rf .next
rm -rf out

# 2. Clear node modules
rm -rf node_modules
npm install

# 3. Check TypeScript config
npm run typecheck

# 4. Build with verbose output
npm run build -- --debug

# 5. Check for environment variables
env | grep NEXT_PUBLIC
```

#### Runtime Errors

**Symptoms:**

- White screen of death
- `hydration mismatch` errors
- API connection failures

**Solutions:**

```bash
# 1. Check browser console for errors

# 2. Verify API connection
curl http://localhost:4000/health

# 3. Check environment variables
echo $NEXT_PUBLIC_API_URL

# 4. Clear browser cache and cookies

# 5. Run in development mode for better errors
npm run dev
```

## Production Issues

### Performance Problems

#### High Response Times

**Symptoms:**

- API latency > 1s
- Database connection pool exhaustion
- High CPU usage

**Diagnostics:**

```bash
# Check ECS service metrics
aws cloudwatch get-metric-statistics \
  --namespace ECS/ContainerInsights \
  --metric-name TaskCPUUtilization \
  --dimensions Name=ServiceName,Value=madfam-api \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 300 \
  --statistics Average

# Check database connections
psql $DATABASE_URL -c "SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active';"

# Check slow log entries
aws logs filter-log-events \
  --log-group-name /ecs/madfam-api \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000
```

**Solutions:**

```bash
# 1. Scale ECS service
aws ecs update-service \
  --cluster madfam-prod \
  --service madfam-api \
  --desired-count 5

# 2. Optimize database queries
# Check DEVELOPMENT.md for query optimization

# 3. Add caching layers
redis-cli CONFIG SET maxmemory 1gb

# 4. Enable connection pooling
# Update DATABASE_URL to use pgbouncer
```

#### Memory Leaks

**Symptoms:**

- Gradual memory increase
- OOM kills
- Container restarts

**Diagnostics:**

```bash
# Monitor memory usage
aws cloudwatch get-metric-statistics \
  --namespace ECS/ContainerInsights \
  --metric-name MemoryUtilization \
  --dimensions Name=ServiceName,Value=madfam-api \
  --start-time $(date -d '24 hours ago' +%s)000 \
  --end-time $(date +%s)000 \
  --period 3600 \
  --statistics Average

# Check for heap dumps
ls -la /var/log/heapdump-*

# Profile memory usage
node --inspect apps/api/dist/main.js
```

**Solutions:**

```bash
# 1. Restart affected services
aws ecs update-service \
  --cluster madfam-prod \
  --service madfam-api \
  --force-new-deployment

# 2. Increase memory allocation
# Update ECS task definition memory from 1024 to 2048

# 3. Implement memory monitoring alerts
aws cloudwatch put-metric-alarm \
  --alarm-name madfam-api-memory \
  --metric-name MemoryUtilization \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold
```

### Database Issues

#### Connection Pool Exhaustion

**Symptoms:**

- `remaining connection slots reserved`
- `too many clients already`
- Connection timeouts

**Solutions:**

```bash
# 1. Check current connections
psql $DATABASE_URL -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# 2. Kill idle connections
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '5 minutes';"

# 3. Tune connection settings
psql $DATABASE_URL -c "ALTER SYSTEM SET max_connections = 200;"
psql $DATABASE_URL -c "SELECT pg_reload_conf();"

# 4. Implement connection pooling
# Update Prisma connection string:
# postgresql://user:pass@host:5432/db?pgbouncer=true&connection_limit=20
```

#### Lock Contention

**Symptoms:**

- Deadlock detected
- Long-running transactions
- Query timeouts

**Diagnostics:**

```sql
-- Check for locks
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_statement,
       blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

**Solutions:**

```bash
# 1. Kill blocking queries
psql $DATABASE_URL -c "SELECT pg_terminate_backend(12345);"  # Use blocking PID

# 2. Optimize transaction scope
# Reduce transaction time in application code

# 3. Add query timeout
psql $DATABASE_URL -c "SET statement_timeout = '30s';"

# 4. Analyze and optimize queries
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT ..."
```

### Authentication Issues

#### JWT Token Problems

**Symptoms:**

- `Invalid token` errors
- Frequent token expiration
- Token verification failures

**Solutions:**

```bash
# 1. Check JWT secret configuration
aws secretsmanager get-secret-value --secret-id madfam/prod/api --query SecretString

# 2. Verify token structure
# Use jwt.io to decode token and check exp, iat claims

# 3. Check server time synchronization
date
# Ensure server time matches expected timezone

# 4. Review token refresh logic
# Check refresh token rotation in application logs
```

#### Session Management

**Symptoms:**

- Users logged out unexpectedly
- Session data lost
- Cross-device session issues

**Solutions:**

```bash
# 1. Check Redis session storage
redis-cli KEYS "sess:*" | wc -l

# 2. Verify session TTL
redis-cli TTL "sess:user_123"

# 3. Check for Redis memory eviction
redis-cli INFO keyspace

# 4. Monitor session creation/destruction
redis-cli MONITOR | grep sess
```

### Payment Processing

#### Stripe Integration Issues

**Symptoms:**

- Payment webhooks failing
- Checkout sessions not created
- Payment status not updating

**Diagnostics:**

```bash
# Check Stripe webhook deliveries
curl -X GET https://api.stripe.com/v1/webhook_endpoints/we_xxx/delivery_attempts \
  -H "Authorization: Bearer $STRIPE_KEY"

# Verify webhook signature
# Check application logs for signature verification errors

# Test webhook endpoint
curl -X POST http://localhost:4000/payment/webhook \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=xxx,v1=xxx" \
  -d '{"type":"payment_intent.succeeded"}'
```

**Solutions:**

```bash
# 1. Re-register webhook endpoint
stripe listen --forward-to localhost:4000/payment/webhook

# 2. Update webhook secret
aws secretsmanager update-secret \
  --secret-id madfam/prod/api \
  --secret-string '{"STRIPE_WEBHOOK_SECRET":"whsec_new_secret"}'

# 3. Retry failed webhooks
# Use Stripe dashboard to resend failed webhooks

# 4. Implement webhook retry logic
# Add exponential backoff in webhook handler
```

### File Processing

#### Upload Failures

**Symptoms:**

- S3 upload timeouts
- File corruption
- Permission denied errors

**Solutions:**

```bash
# 1. Check S3 bucket permissions
aws s3api get-bucket-policy --bucket madfam-files-prod

# 2. Test S3 connectivity
aws s3 ls s3://madfam-files-prod/ --region us-east-1

# 3. Verify presigned URL generation
# Check URL expiration and signature

# 4. Monitor S3 CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/S3 \
  --metric-name NumberOfObjects \
  --dimensions Name=BucketName,Value=madfam-files-prod \
  --start-time $(date -d '1 day ago' +%s)000 \
  --end-time $(date +%s)000 \
  --period 3600 \
  --statistics Sum
```

#### Geometry Analysis Failures

**Symptoms:**

- DFM analysis stuck
- Invalid geometry errors
- Worker process crashes

**Solutions:**

```bash
# 1. Check worker service logs
aws logs get-log-events \
  --log-group-name /ecs/madfam-worker \
  --log-stream-name ecs/madfam-worker/latest

# 2. Test file processing locally
cd apps/worker
python geometry_analyzer.py --file test.stl --debug

# 3. Check SQS queue depth
aws sqs get-queue-attributes \
  --queue-url $SQS_QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages

# 4. Clear stuck messages
aws sqs purge-queue --queue-url $SQS_QUEUE_URL

# 5. Scale worker service
aws ecs update-service \
  --cluster madfam-prod \
  --service madfam-worker \
  --desired-count 3
```

## Monitoring and Alerting

### CloudWatch Alarms

#### Set Up Key Alarms

```bash
# API Error Rate
aws cloudwatch put-metric-alarm \
  --alarm-name "madfam-api-error-rate" \
  --alarm-description "API error rate > 1%" \
  --metric-name 4XXError \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 300 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:madfam-alerts

# Database CPU
aws cloudwatch put-metric-alarm \
  --alarm-name "madfam-rds-cpu" \
  --alarm-description "RDS CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# Queue Depth
aws cloudwatch put-metric-alarm \
  --alarm-name "madfam-queue-depth" \
  --alarm-description "SQS queue depth > 1000" \
  --metric-name ApproximateNumberOfMessagesVisible \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --threshold 1000 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

### Health Check Endpoints

```bash
# API Health
curl -f http://localhost:4000/health || echo "API DOWN"

# Database Health
curl -f http://localhost:4000/health/ready || echo "Database DOWN"

# Detailed Health Check
curl http://localhost:4000/health/detailed
```

### Log Analysis

```bash
# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/madfam-api \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000

# Count requests by status
aws logs filter-log-events \
  --log-group-name /ecs/madfam-api \
  --filter-pattern "[timestamp, requestId, level=INFO, message=*status*]" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  | jq '.events[].message' | grep -oP 'status:\s*\K\d+' | sort | uniq -c

# Find slow queries
aws logs filter-log-events \
  --log-group-name /ecs/madfam-api \
  --filter-pattern "[timestamp, requestId, level, message=*duration* > 1000]" \
  --start-time $(date -d '1 hour ago' +%s)000
```

## Emergency Procedures

### Service Restart

```bash
# Restart API service
aws ecs update-service \
  --cluster madfam-prod \
  --service madfam-api \
  --force-new-deployment

# Monitor deployment
aws ecs describe-services \
  --cluster madfam-prod \
  --services madfam-api \
  --query "services[0].deployments"
```

### Database Failover

```bash
# Force failover to read replica (Multi-AZ)
aws rds reboot-db-instance \
  --db-instance-identifier madfam-prod \
  --force-failover

# Monitor failover status
aws rds describe-db-instances \
  --db-instance-identifier madfam-prod \
  --query "DBInstances[0].DBInstanceStatus"
```

### Rollback Deployment

```bash
# Get previous task definition
PREVIOUS_VERSION=$(aws ecs describe-services \
  --cluster madfam-prod \
  --services madfam-api \
  --query "services[0].taskDefinition" \
  --output text | sed 's/:.*$//')

echo "Previous version: $PREVIOUS_VERSION"

# Rollback to previous version
aws ecs update-service \
  --cluster madfam-prod \
  --service madfam-api \
  --task-definition "$PREVIOUS_VERSION:$(($(echo $PREVIOUS_VERSION | cut -d: -f2) - 1))"
```

### Scale Down (Emergency)

```bash
# Reduce service to minimum
aws ecs update-service \
  --cluster madfam-prod \
  --service madfam-api \
  --desired-count 1

# Scale down RDS
aws rds modify-db-instance \
  --db-instance-identifier madfam-prod \
  --db-instance-class db.t3.small \
  --apply-immediately
```

## Tools and Scripts

### Diagnostic Scripts

Create these helper scripts in `scripts/troubleshooting/`:

**`check-health.sh`:**

```bash
#!/bin/bash
set -e

echo "=== Cotiza Studio System Health Check ==="

# Check API
echo -n "API Health: "
curl -sf http://localhost:4000/health > /dev/null && echo "OK" || echo "FAIL"

# Check Database
echo -n "Database: "
psql $DATABASE_URL -c "SELECT 1" > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# Check Redis
echo -n "Redis: "
redis-cli ping > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# Check Worker
echo -n "Worker: "
curl -sf http://localhost:8000/health > /dev/null && echo "OK" || echo "FAIL"

echo "=== Health Check Complete ==="
```

**`analyze-performance.sh`:**

```bash
#!/bin/bash
set -e

echo "=== Performance Analysis ==="

# Database connections
echo "Database Connections:"
psql $DATABASE_URL -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Redis memory
echo "Redis Memory Usage:"
redis-cli INFO memory | grep used_memory_human

# API response times
echo "API Response Times (last hour):"
aws logs filter-log-events \
  --log-group-name /ecs/madfam-api \
  --filter-pattern "[timestamp, requestId, level, message=*duration*]" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  | jq -r '.events[].message' | grep -oP 'duration:\s*\K\d+' | sort -n | tail -10

echo "=== Analysis Complete ==="
```

### Useful Aliases

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
# Cotiza Studio shortcuts
alias mf-logs='aws logs tail /ecs/madfam-api --follow'
alias mf-health='curl -s http://localhost:4000/health | jq'
alias mf-db='psql $DATABASE_URL'
alias mf-redis='redis-cli'
alias mf-restart='aws ecs update-service --cluster madfam-prod --service madfam-api --force-new-deployment'
```

## Getting Help

### Internal Resources

1. **Check Documentation:**

   - [API Documentation](/docs/API.md)
   - [Architecture Guide](/docs/ARCHITECTURE.md)
   - [Development Guide](/docs/DEVELOPMENT.md)

2. **Check Logs:**

   - Application logs in CloudWatch
   - Database logs in RDS console
   - Load balancer logs in S3

3. **Monitor Dashboards:**
   - CloudWatch dashboard
   - Application performance monitoring
   - Custom business metrics

### External Support

1. **AWS Support:**

   - Check AWS Health Dashboard
   - Open support case for infrastructure issues

2. **Third-Party Services:**

   - Stripe Dashboard for payment issues
   - SendGrid logs for email delivery

3. **Community Resources:**
   - NestJS Discord/GitHub
   - Next.js discussions
   - Stack Overflow (tag with relevant frameworks)

### Escalation Process

1. **Level 1:** Check this troubleshooting guide
2. **Level 2:** Review logs and metrics
3. **Level 3:** Contact team lead or senior developer
4. **Level 4:** Engage external support (AWS, Stripe, etc.)

---

_This troubleshooting guide is maintained by the development team. Please update it when you discover new issues or solutions._
