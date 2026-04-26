import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class JobMonitoringService {
  private readonly logger = new Logger(JobMonitoringService.name);

  constructor(
    @InjectQueue('quote-calculation') private quoteQueue: Queue,
    @InjectQueue('file-analysis') private fileQueue: Queue,
    @InjectQueue('email-notification') private emailQueue: Queue,
  ) {}

  async getQueueStats() {
    const [quoteStats, fileStats, emailStats] = await Promise.all([
      this.getQueueInfo(this.quoteQueue, 'quote-calculation'),
      this.getQueueInfo(this.fileQueue, 'file-analysis'),
      this.getQueueInfo(this.emailQueue, 'email-notification'),
    ]);

    return {
      queues: [quoteStats, fileStats, emailStats],
      timestamp: new Date(),
    };
  }

  private async getQueueInfo(queue: Queue, name: string) {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
    ]);

    return {
      name,
      counts: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
      },
    };
  }

  async retryFailedJobs(queueName: string) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const failedJobs = await queue.getFailed();
    const retryCount = failedJobs.length;

    for (const job of failedJobs) {
      await job.retry();
    }

    this.logger.log(`Retried ${retryCount} failed jobs in queue ${queueName}`);
    return { retriedCount: retryCount };
  }

  async cleanQueue(queueName: string, olderThan: number = 86400000) {
    const queue = this.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.clean(olderThan, 'completed');
    await queue.clean(olderThan, 'failed');

    this.logger.log(`Cleaned old jobs from queue ${queueName}`);
  }

  private getQueue(name: string): Queue | null {
    switch (name) {
      case 'quote-calculation':
        return this.quoteQueue;
      case 'file-analysis':
        return this.fileQueue;
      case 'email-notification':
        return this.emailQueue;
      default:
        return null;
    }
  }
}
