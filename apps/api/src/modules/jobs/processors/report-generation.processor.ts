import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import {
  JobType,
  ReportGenerationJobData,
  JobResult,
  JobProgress,
} from '../interfaces/job.interface';
import { QuoteOrderData, InvoiceData, AnalyticsData } from '../interfaces/report.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/prisma/prisma.service';

// Import the new services
import { ReportDataLoaderService } from '../services/report-data-loader.service';
import { PdfReportGeneratorService } from '../services/pdf-report-generator.service';
import { ExcelReportGeneratorService } from '../services/excel-report-generator.service';
import { CsvReportGeneratorService } from '../services/csv-report-generator.service';
import { ReportUploaderService, UploadResult } from '../services/report-uploader.service';

interface ReportResult {
  reportId: string;
  reportType: ReportGenerationJobData['reportType'];
  format: ReportGenerationJobData['format'];
  fileUrl: string;
  fileName: string;
  fileSize: number;
  generatedAt: Date;
}

@Processor(JobType.REPORT_GENERATION)
@Injectable()
export class ReportGenerationProcessor {
  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly dataLoader: ReportDataLoaderService,
    private readonly pdfGenerator: PdfReportGeneratorService,
    private readonly excelGenerator: ExcelReportGeneratorService,
    private readonly csvGenerator: CsvReportGeneratorService,
    private readonly uploader: ReportUploaderService,
  ) {}

  @Process()
  async handleReportGeneration(
    job: Job<ReportGenerationJobData>,
  ): Promise<JobResult<ReportResult>> {
    const startTime = Date.now();
    const { reportType, entityId, format, options, tenantId } = job.data;

    try {
      this.logger.log(`Starting ${reportType} report generation`, {
        jobId: job.id,
        tenantId,
        entityId,
        format,
      });

      // Step 1: Load report data
      await this.updateProgress(job, 10, 'Loading data');
      const reportData = await this.dataLoader.loadReportData(reportType, entityId, tenantId);

      // Step 2: Generate report based on format
      await this.updateProgress(job, 30, 'Generating report');
      const { filePath } = await this.generateReport(reportType, reportData, format, options, job);

      // Step 3: Upload to S3
      await this.updateProgress(job, 70, 'Uploading report');
      const uploadResult = await this.uploader.uploadReport(
        filePath,
        tenantId,
        reportType,
        entityId,
      );

      // Step 4: Save report metadata to database
      await this.updateProgress(job, 85, 'Saving metadata');
      const reportRecord = await this.saveReportMetadata(
        reportType,
        entityId,
        tenantId,
        uploadResult,
        options,
      );

      // Step 5: Generate presigned URL for immediate access
      await this.updateProgress(job, 95, 'Finalizing');
      const presignedUrl = await this.uploader.generatePresignedUrl(
        this.extractS3Key(uploadResult.fileUrl),
        3600, // 1 hour expiry
      );

      const processingTime = Date.now() - startTime;
      await this.updateProgress(job, 100, 'Completed');

      this.logger.log(`Report generation completed`, {
        jobId: job.id,
        reportId: reportRecord.id,
        processingTime,
      });

      return {
        success: true,
        data: {
          reportId: reportRecord.id,
          reportType,
          format,
          fileUrl: presignedUrl,
          fileName: uploadResult.fileName,
          fileSize: uploadResult.fileSize,
          generatedAt: new Date(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : String(error);

      this.logger.error(`Report generation failed: ${errorMessage}`, errorStack);

      throw new Error(errorMessage);
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}...`);
  }

  @OnQueueCompleted()
  onComplete(job: Job, result: JobResult<ReportResult>) {
    this.logger.debug(`Job ${job.id} completed`, { result });
  }

  @OnQueueFailed()
  onError(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }

  private async generateReport(
    reportType: ReportGenerationJobData['reportType'],
    data: Record<string, unknown>,
    format: ReportGenerationJobData['format'],
    options: ReportGenerationJobData['options'],
    _job: Job<ReportGenerationJobData>,
  ): Promise<{ filePath: string; fileName: string }> {
    switch (format) {
      case 'pdf':
        return this.pdfGenerator.generateReport(
          reportType,
          data as unknown as QuoteOrderData | InvoiceData | AnalyticsData,
          options,
        );
      case 'excel':
        return this.excelGenerator.generateReport(
          reportType,
          data as unknown as QuoteOrderData | InvoiceData | AnalyticsData,
          options,
        );
      case 'csv':
        return this.csvGenerator.generateReport(
          reportType,
          data as unknown as QuoteOrderData | InvoiceData | AnalyticsData,
          options,
        );
      default:
        throw new Error(`Unsupported report format: ${format}`);
    }
  }

  private async saveReportMetadata(
    reportType: string,
    entityId: string,
    tenantId: string,
    uploadResult: UploadResult,
    options: ReportGenerationJobData['options'],
  ): Promise<{ id: string; type: string; [key: string]: unknown }> {
    return this.prisma.report.create({
      data: {
        tenantId,
        type: reportType,
        entityId,
        // entityType: this.getEntityType(reportType), // Remove if not in schema
        fileName: uploadResult.fileName,
        fileUrl: uploadResult.fileUrl,
        fileSize: uploadResult.fileSize,
        // format: this.getFormatFromContentType(uploadResult.contentType), // Remove if not in schema
        status: 'completed',
        metadata: {
          options,
          contentType: uploadResult.contentType,
          uploadedAt: uploadResult.uploadedAt,
        },
        generatedAt: new Date(),
      },
    });
  }

  // Removed unused helper methods

  private extractS3Key(s3Url: string): string {
    // Extract key from s3://bucket/key format
    const match = s3Url.match(/^s3:\/\/[^/]+\/(.+)$/);
    return match ? match[1] : '';
  }

  private async updateProgress(
    job: Job<ReportGenerationJobData>,
    percentage: number,
    step: string,
  ): Promise<void> {
    const progress: JobProgress = {
      percentage,
      step,
      message: this.getProgressMessage(step),
    };
    await job.progress(progress);
  }

  private getProgressMessage(step: string): string {
    const messages: Record<string, string> = {
      'Loading data': 'Loading report data from database...',
      'Generating report': 'Creating report document...',
      'Uploading report': 'Uploading report to secure storage...',
      'Saving metadata': 'Saving report information...',
      Finalizing: 'Finalizing report generation...',
      Completed: 'Report generation completed successfully',
    };
    return messages[step] || step;
  }
}
