import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { JobType, FileAnalysisJobData, JobResult, JobProgress } from '../interfaces/job.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { FilesService } from '@/modules/files/files.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { getErrorMessage, toError } from '@/common/utils/error-handling';
import {
  WORKER_ANALYZE_PATH,
  WorkerAnalyzeRequest,
  WorkerAnalyzeResponse,
  deriveProcessType,
  mapSeverity,
  parseWorkerAnalyzeResponse,
} from './worker-analyze.contract';

interface FileAnalysisResult {
  fileId: string;
  geometry: {
    volume?: number;
    surfaceArea?: number;
    boundingBox?: {
      x: number;
      y: number;
      z: number;
    };
    partCount?: number;
    triangleCount?: number;
  };
  dfmAnalysis?: {
    issues: Array<{
      type: string;
      severity: 'critical' | 'warning' | 'info';
      description: string;
      location?: string;
    }>;
    score: number;
    manufacturable: boolean;
  };
  features?: {
    hasUndercuts: boolean;
    hasThinWalls: boolean;
    hasSmallFeatures: boolean;
    complexity: 'simple' | 'moderate' | 'complex';
  };
  metadata: {
    fileFormat: string;
    fileSize: number;
    processingTime: number;
  };
}

@Processor(JobType.FILE_ANALYSIS)
@Injectable()
export class FileAnalysisProcessor {
  private readonly workerServiceUrl: string;
  private readonly workerServiceTimeout: number;
  private readonly progressIntervalMs: number;

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.workerServiceUrl = this.configService.get<string>(
      'WORKER_SERVICE_URL',
      'http://localhost:8000',
    );
    this.workerServiceTimeout = this.configService.get<number>('WORKER_SERVICE_TIMEOUT_MS', 300000);
    this.progressIntervalMs = this.configService.get<number>(
      'FILE_ANALYSIS_PROGRESS_INTERVAL_MS',
      5000,
    );
  }

  @Process()
  async handleFileAnalysis(job: Job<FileAnalysisJobData>): Promise<JobResult<FileAnalysisResult>> {
    const startTime = Date.now();
    const { fileId, fileName, fileType, tenantId } = job.data;

    try {
      this.logger.log(`Starting file analysis for ${fileId}`, {
        jobId: job.id,
        tenantId,
        fileName,
      });

      // Validate file format
      await this.updateProgress(job, 10, 'Validating file');
      if (!this.isValidFileFormat(fileType)) {
        throw new Error(`Unsupported file format: ${fileType}`);
      }

      // Send to worker service for analysis. The worker downloads the file
      // itself from a presigned URL, so we do not stream the bytes here.
      await this.updateProgress(job, 30, 'Sending to analysis service');

      const analysisResult = await this.callWorkerService(job);

      await this.updateProgress(job, 90, 'Analysis complete, saving results');

      // Save analysis results to database
      await this.saveAnalysisResults(fileId, analysisResult, tenantId);

      await this.updateProgress(job, 100, 'File analysis completed');

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          ...analysisResult,
          metadata: {
            ...analysisResult.metadata,
            processingTime: duration,
          },
        },
        duration,
      };
    } catch (error) {
      this.logger.error(`File analysis failed for ${fileId}`, toError(error));

      return {
        success: false,
        error: {
          code: 'FILE_ANALYSIS_FAILED',
          message: getErrorMessage(error),
          details: error,
        },
        duration: Date.now() - startTime,
      };
    }
  }

  @OnQueueActive()
  onActive(job: Job<FileAnalysisJobData>) {
    this.logger.log(`File analysis job ${job.id} started`, {
      fileId: job.data.fileId,
      tenantId: job.data.tenantId,
    });
  }

  @OnQueueCompleted()
  onComplete(job: Job<FileAnalysisJobData>, result: JobResult<FileAnalysisResult>) {
    this.logger.log(`File analysis job ${job.id} completed`, {
      fileId: job.data.fileId,
      tenantId: job.data.tenantId,
      success: result.success,
      duration: result.duration,
    });
  }

  @OnQueueFailed()
  onFailed(job: Job<FileAnalysisJobData>, err: Error) {
    this.logger.error(`File analysis job ${job.id} failed`, toError(err));
  }

  private async updateProgress(
    job: Job<FileAnalysisJobData>,
    percentage: number,
    message: string,
  ): Promise<void> {
    const progress: JobProgress = {
      percentage,
      message,
      step: this.getStepFromPercentage(percentage),
    };

    await job.progress(progress);
    await job.log(`${message} (${percentage}%)`);
  }

  private getStepFromPercentage(percentage: number): string {
    if (percentage <= 10) return 'downloading';
    if (percentage <= 30) return 'validating';
    if (percentage <= 80) return 'analyzing';
    if (percentage <= 90) return 'processing-results';
    return 'saving';
  }

  private isValidFileFormat(fileType: string): boolean {
    const supportedFormats = [
      'stl',
      'obj',
      'step',
      'stp',
      'iges',
      'igs',
      '3mf',
      'dxf',
      'dwg',
      'svg',
      'pdf',
    ];

    return supportedFormats.includes(fileType.toLowerCase());
  }

  private async callWorkerService(job: Job<FileAnalysisJobData>): Promise<FileAnalysisResult> {
    const { fileId, fileType, tenantId, analysisOptions } = job.data;

    // The worker downloads the file itself, so hand it a presigned URL rather
    // than streaming the bytes. This matches the worker's real contract:
    //   POST /analyze  { file_url, file_type, process_type, options, job_id }
    const fileUrl = await this.filesService.getFileUrl(tenantId, fileId);

    const requestBody: WorkerAnalyzeRequest = {
      file_url: fileUrl,
      file_type: fileType.toLowerCase(),
      process_type: deriveProcessType(fileType, analysisOptions),
      options: (analysisOptions as Record<string, unknown>) ?? {},
      job_id: job.id != null ? String(job.id) : undefined,
    };

    // Update progress periodically while waiting for the worker.
    const progressInterval = setInterval(() => {
      void (async () => {
        const currentProgress = job.progress() as JobProgress;
        if (currentProgress && currentProgress.percentage < 80) {
          await this.updateProgress(job, currentProgress.percentage + 5, 'Analyzing geometry...');
        }
      })();
    }, this.progressIntervalMs);

    let rawResponseData: unknown;
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.workerServiceUrl}${WORKER_ANALYZE_PATH}`, requestBody, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: this.workerServiceTimeout,
        }),
      );
      rawResponseData = response.data;
    } catch (error) {
      // A genuine worker failure (unreachable, timeout, 4xx/5xx) is an explicit
      // failure: propagate it so the job is marked failed and NO fabricated
      // no-geometry FileAnalysis row is persisted. Downstream pricing then
      // degrades cleanly because there simply is no geometry to read.
      throw new Error(
        `Worker ${WORKER_ANALYZE_PATH} call failed for file ${fileId}: ${getErrorMessage(error)}`,
      );
    } finally {
      clearInterval(progressInterval);
    }

    // Validate the response against the agreed contract. A shape mismatch (e.g.
    // the worker changed its route/schema) throws loudly here instead of being
    // silently mapped to an empty, volume-less geometry result.
    const workerResult = parseWorkerAnalyzeResponse(rawResponseData);

    return this.mapWorkerResponse(fileId, fileType, workerResult);
  }

  /**
   * Map the worker's real response
   * (`{ metrics: { volume_cm3, surface_area_cm2, bbox_mm, ... }, issues, risk_score }`)
   * onto the {@link FileAnalysisResult} the persistence layer and the pricing
   * resolver expect (`geometry.volume` / `surfaceArea` / `boundingBox`).
   */
  private mapWorkerResponse(
    fileId: string,
    fileType: string,
    worker: WorkerAnalyzeResponse,
  ): FileAnalysisResult {
    const { metrics, issues, risk_score } = worker;

    const dfmIssues = issues.map((issue) => ({
      type: issue.type,
      severity: mapSeverity(issue.severity),
      description: issue.description,
      ...(issue.location ? { location: issue.location } : {}),
    }));

    const hasCritical = dfmIssues.some((issue) => issue.severity === 'critical');
    const triangleCount = metrics.triangle_count ?? undefined;

    return {
      fileId,
      geometry: {
        volume: metrics.volume_cm3,
        surfaceArea: metrics.surface_area_cm2,
        boundingBox: {
          x: metrics.bbox_mm.x,
          y: metrics.bbox_mm.y,
          z: metrics.bbox_mm.z,
        },
        partCount: 1,
        triangleCount: triangleCount ?? undefined,
      },
      dfmAnalysis: {
        issues: dfmIssues,
        // Worker `risk_score` is 0-100 where higher = worse; FileAnalysis
        // `dfmScore` is a health score where higher = better.
        score: Math.max(0, Math.min(100, 100 - risk_score)),
        manufacturable: !hasCritical,
      },
      features: {
        hasUndercuts: issues.some((i) => i.type.toLowerCase().includes('undercut')),
        hasThinWalls: issues.some((i) => i.type.toLowerCase().includes('wall')),
        hasSmallFeatures: issues.some((i) => i.type.toLowerCase().includes('small')),
        complexity:
          triangleCount && triangleCount > 100000
            ? 'complex'
            : triangleCount && triangleCount > 10000
              ? 'moderate'
              : 'simple',
      },
      metadata: {
        fileFormat: fileType,
        fileSize: 0,
        processingTime: worker.processing_time_ms ?? 0,
      },
    };
  }

  private async saveAnalysisResults(
    fileId: string,
    analysis: FileAnalysisResult,
    tenantId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Update file with analysis results
      await tx.file.update({
        where: {
          id: fileId,
          tenantId,
        },
        data: {
          status: 'ANALYZED',
          analysisResult: analysis as unknown as Prisma.InputJsonValue,
          analyzedAt: new Date(),
          metadata: {
            ...(((
              await tx.file.findUnique({
                where: { id: fileId },
                select: { metadata: true },
              })
            )?.metadata as Record<string, unknown>) || {}),
            geometry: analysis.geometry,
            dfmScore: analysis.dfmAnalysis?.score,
            complexity: analysis.features?.complexity,
          },
        },
      });

      // Create file analysis record
      await tx.fileAnalysis.create({
        data: {
          fileId,
          tenantId,
          volume: analysis.geometry.volume,
          surfaceArea: analysis.geometry.surfaceArea,
          boundingBoxX: analysis.geometry.boundingBox?.x,
          boundingBoxY: analysis.geometry.boundingBox?.y,
          boundingBoxZ: analysis.geometry.boundingBox?.z,
          partCount: analysis.geometry.partCount || 1,
          triangleCount: analysis.geometry.triangleCount,
          dfmScore: analysis.dfmAnalysis?.score || 100,
          dfmIssues: analysis.dfmAnalysis?.issues || [],
          manufacturable: analysis.dfmAnalysis?.manufacturable ?? true,
          hasUndercuts: analysis.features?.hasUndercuts || false,
          hasThinWalls: analysis.features?.hasThinWalls || false,
          hasSmallFeatures: analysis.features?.hasSmallFeatures || false,
          complexity: analysis.features?.complexity || 'simple',
          processingTime: analysis.metadata.processingTime,
        },
      });
    });
  }
}
