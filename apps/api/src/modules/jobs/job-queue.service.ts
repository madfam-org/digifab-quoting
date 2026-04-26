import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job, JobOptions } from 'bull';

export interface QuoteCalculationJob {
  quoteId: string;
  tenantId: string;
  userId: string;
  items: Array<{
    id: string;
    fileId: string;
    process: string;
    material: string;
    quantity: number;
  }>;
}

export interface FileAnalysisJob {
  fileId: string;
  tenantId: string;
  userId: string;
  filePath: string;
  fileType: string;
}

export interface EmailNotificationJob {
  to: string;
  template: string;
  data: Record<string, unknown>;
  tenantId: string;
}

@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);

  constructor(
    @InjectQueue('quote-calculation') private quoteQueue: Queue,
    @InjectQueue('file-analysis') private fileQueue: Queue,
    @InjectQueue('email-notification') private emailQueue: Queue,
  ) {}

  async addQuoteCalculation(
    data: QuoteCalculationJob,
    options?: JobOptions,
  ): Promise<Job<QuoteCalculationJob>> {
    const job = await this.quoteQueue.add('calculate', data, {
      ...options,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    this.logger.log(`Quote calculation job ${job.id} added for quote ${data.quoteId}`);
    return job;
  }

  async addFileAnalysis(
    data: FileAnalysisJob,
    options?: JobOptions,
  ): Promise<Job<FileAnalysisJob>> {
    const job = await this.fileQueue.add('analyze', data, {
      ...options,
      priority: data.fileType === 'STEP' ? 1 : 2, // Prioritize complex files
    });

    this.logger.log(`File analysis job ${job.id} added for file ${data.fileId}`);
    return job;
  }

  async addEmailNotification(
    data: EmailNotificationJob,
    options?: JobOptions,
  ): Promise<Job<EmailNotificationJob>> {
    const job = await this.emailQueue.add('send', data, {
      ...options,
      delay: options?.delay || 0,
    });

    this.logger.log(`Email notification job ${job.id} added for ${data.to}`);
    return job;
  }

  // Batch operations
  async addBulkQuoteCalculations(jobs: QuoteCalculationJob[]): Promise<Job<QuoteCalculationJob>[]> {
    const bulkJobs = jobs.map((data) => ({
      name: 'calculate',
      data,
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }));

    return this.quoteQueue.addBulk(bulkJobs);
  }

  // Job status tracking
  async getJobStatus(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress();
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      id: job.id,
      state,
      progress,
      result,
      failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  async getQueueMetrics(queueName: string) {
    const queue = this.getQueue(queueName);

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getPausedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      total: waiting + active + delayed,
    };
  }

  // Queue management
  async pauseQueue(queueName: string) {
    const queue = this.getQueue(queueName);
    await queue.pause();
    this.logger.log(`Queue ${queueName} paused`);
  }

  async resumeQueue(queueName: string) {
    const queue = this.getQueue(queueName);
    await queue.resume();
    this.logger.log(`Queue ${queueName} resumed`);
  }

  async cleanQueue(queueName: string, grace: number = 0) {
    const queue = this.getQueue(queueName);
    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
    this.logger.log(`Queue ${queueName} cleaned`);
  }

  private getQueue(name: string): Queue {
    switch (name) {
      case 'quote-calculation':
        return this.quoteQueue;
      case 'file-analysis':
        return this.fileQueue;
      case 'email-notification':
        return this.emailQueue;
      default:
        throw new Error(`Unknown queue: ${name}`);
    }
  }

  // Advanced job control
  async retryFailedJobs(queueName: string, limit: number = 100) {
    const queue = this.getQueue(queueName);
    const failedJobs = await queue.getFailed(0, limit);

    const retryPromises = failedJobs.map((job) => job.retry());
    const results = await Promise.allSettled(retryPromises);

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    this.logger.log(`Retried ${succeeded}/${failedJobs.length} failed jobs in ${queueName}`);

    return { total: failedJobs.length, succeeded };
  }

  async getJobsInState(queueName: string, state: string, limit: number = 100) {
    const queue = this.getQueue(queueName);

    switch (state) {
      case 'waiting':
        return queue.getWaiting(0, limit);
      case 'active':
        return queue.getActive(0, limit);
      case 'completed':
        return queue.getCompleted(0, limit);
      case 'failed':
        return queue.getFailed(0, limit);
      case 'delayed':
        return queue.getDelayed(0, limit);
      default:
        throw new Error(`Unknown job state: ${state}`);
    }
  }
}
