import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3HealthIndicator extends HealthIndicator {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    super();
    this.s3Client = new S3Client({
      region: this.configService.get('S3_REGION', 'us-east-1'),
    });
    this.bucketName = this.configService.get('S3_BUCKET', 'madfam-uploads');
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
      return this.getStatus(key, true, { bucket: this.bucketName });
    } catch (error) {
      throw new HealthCheckError(
        'S3 check failed',
        this.getStatus(key, false, {
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
    }
  }
}
