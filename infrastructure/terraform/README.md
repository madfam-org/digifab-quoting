# Cotiza Studio Infrastructure as Code

This directory contains Terraform configurations for deploying the Cotiza Studio Quoting Platform on AWS.

## Architecture Overview

The infrastructure includes:

- **Networking**: Multi-AZ VPC with public/private subnets, NAT gateways, and VPC endpoints
- **Compute**: ECS Fargate for containerized API and Worker services with auto-scaling
- **Database**: RDS PostgreSQL Multi-AZ with read replicas and automated backups
- **Caching**: ElastiCache Redis cluster for session storage and job queues
- **Storage**: S3 buckets with encryption and lifecycle policies
- **CDN**: CloudFront distribution for static assets
- **Security**: WAF, Security Groups, KMS encryption, Secrets Manager
- **Monitoring**: CloudWatch logs, metrics, and alarms

## Directory Structure

```
terraform/
├── modules/                 # Reusable Terraform modules
│   ├── vpc/                # Network infrastructure
│   ├── rds/                # PostgreSQL database
│   ├── ecs/                # Container orchestration
│   ├── s3/                 # Object storage
│   └── elasticache/        # Redis cache
├── environments/           # Environment-specific configurations
│   ├── dev/               # Development environment
│   ├── staging/           # Staging environment
│   └── prod/              # Production environment
└── README.md              # This file
```

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** >= 1.0
3. **S3 bucket** for Terraform state (create manually):
   ```bash
   aws s3 mb s3://madfam-terraform-state --region us-east-1
   ```
4. **DynamoDB table** for state locking:
   ```bash
   aws dynamodb create-table \
     --table-name madfam-terraform-locks \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
   ```

## Deployment

### 1. Initialize Terraform

```bash
cd environments/prod
terraform init
```

### 2. Plan Changes

```bash
terraform plan -out=tfplan
```

### 3. Apply Configuration

```bash
terraform apply tfplan
```

### 4. Configure Secrets

After initial deployment, update these secrets in AWS Secrets Manager:

- `madfam-prod-stripe-keys`: Add your Stripe API keys
- `madfam-prod-jwt-secret`: Already generated, optionally update

## Environment Variables

The following environment variables are automatically configured:

- `NODE_ENV`: Environment name (production/staging/development)
- `DATABASE_URL`: PostgreSQL connection string (from Secrets Manager)
- `REDIS_URL`: Redis connection URL with auth token
- `S3_BUCKET`: S3 bucket for file uploads
- `JWT_SECRET`: JWT signing secret (from Secrets Manager)
- `STRIPE_SECRET_KEY`: Stripe API key (from Secrets Manager)

## Cost Optimization

### Production Environment (Estimated Monthly Cost)

- **VPC & Networking**: ~$100 (NAT Gateways)
- **ECS Fargate**: ~$300 (3 API + 2 Worker tasks)
- **RDS PostgreSQL**: ~$200 (db.t3.large Multi-AZ)
- **ElastiCache Redis**: ~$100 (cache.t3.medium cluster)
- **S3 & CloudFront**: ~$50 (varies with usage)
- **Load Balancer**: ~$25
- **Total**: ~$775/month

### Cost Saving Tips

1. **Development/Staging**: Use smaller instance sizes and single AZ
2. **Schedule-based scaling**: Reduce capacity during off-hours
3. **S3 Lifecycle**: Move old files to Glacier
4. **Reserved Instances**: Purchase for predictable workloads

## Security Best Practices

1. **Encryption**: All data encrypted at rest and in transit
2. **Network Isolation**: Private subnets for databases and containers
3. **Secrets Management**: All sensitive data in AWS Secrets Manager
4. **Access Control**: IAM roles with least privilege
5. **Monitoring**: CloudWatch alarms for security events

## Monitoring & Alerts

### Key Metrics

- **API Response Time**: < 200ms p95
- **Database CPU**: < 70%
- **Redis Memory**: < 80%
- **ECS Task Health**: 100% healthy

### CloudWatch Dashboards

Create custom dashboards for:

- Application performance
- Infrastructure health
- Cost tracking
- Security events

## Disaster Recovery

### Backup Strategy

- **RDS**: Automated daily backups with 30-day retention
- **S3**: Versioning enabled with cross-region replication
- **Redis**: Daily snapshots with 5-day retention
- **Code**: Stored in Git with tags for each deployment

### Recovery Procedures

1. **Database Failure**: Promote read replica or restore from backup
2. **Region Failure**: Deploy to alternate region using same Terraform
3. **Data Corruption**: Restore from S3 versioning or RDS snapshots

## Maintenance

### Regular Tasks

- Review CloudWatch logs and metrics
- Update container images
- Apply security patches
- Review and optimize costs
- Test disaster recovery procedures

### Terraform State Management

- State is stored in S3 with versioning
- Use `terraform state` commands carefully
- Always backup state before major changes

## Troubleshooting

### Common Issues

1. **Terraform Init Fails**

   - Check AWS credentials
   - Verify S3 bucket exists
   - Ensure DynamoDB table is created

2. **ECS Tasks Not Starting**

   - Check CloudWatch logs
   - Verify security groups
   - Ensure secrets are properly configured

3. **Database Connection Issues**
   - Verify security group rules
   - Check VPC routing
   - Validate credentials in Secrets Manager

## Clean Up

To destroy all resources:

```bash
terraform destroy
```

⚠️ **Warning**: This will delete all infrastructure including databases. Ensure backups are taken first.

## Support

For infrastructure issues:

- Check CloudWatch logs first
- Review Terraform state
- Contact DevOps team
