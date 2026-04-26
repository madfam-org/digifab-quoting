import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as si from 'systeminformation';

export interface ChaosExperiment {
  name: string;
  description: string;
  category: 'network' | 'resource' | 'service' | 'database' | 'state';
  severity: 'low' | 'medium' | 'high' | 'critical';
  inject: (options?: any) => Promise<void>;
  rollback: () => Promise<void>;
  verify?: () => Promise<boolean>;
  preconditions?: () => Promise<boolean>;
}

export interface ChaosOptions {
  duration?: number;
  intensity?: 'low' | 'medium' | 'high';
  targetServices?: string[];
  dryRun?: boolean;
}

export interface ChaosResult {
  experiment: string;
  startTime: Date;
  endTime: Date;
  success: boolean;
  steadyStateBefore: any;
  steadyStateAfter: any;
  errors: any[];
  learnings: string[];
  recommendations: string[];
}

export interface SteadyState {
  cpu: number;
  memory: number;
  errorRate: number;
  responseTime: number;
  throughput: number;
  activeConnections: number;
  queueDepth: number;
}

@Injectable()
export class ChaosMonkeyService extends EventEmitter {
  private readonly logger = new Logger(ChaosMonkeyService.name);
  private readonly experiments = new Map<string, ChaosExperiment>();
  private readonly history: ChaosResult[] = [];
  private isRunning = false;
  private currentExperiment: string | null = null;

  registerExperiment(experiment: ChaosExperiment): void {
    this.experiments.set(experiment.name, experiment);
    this.logger.log(`Registered chaos experiment: ${experiment.name}`);
  }

  async runExperiment(name: string, options: ChaosOptions = {}): Promise<ChaosResult> {
    const experiment = this.experiments.get(name);
    if (!experiment) {
      throw new Error(`Unknown experiment: ${name}`);
    }

    if (this.isRunning) {
      throw new Error(`Another experiment is already running: ${this.currentExperiment}`);
    }

    this.isRunning = true;
    this.currentExperiment = name;

    const result: ChaosResult = {
      experiment: name,
      startTime: new Date(),
      endTime: new Date(),
      success: false,
      steadyStateBefore: null,
      steadyStateAfter: null,
      errors: [],
      learnings: [],
      recommendations: [],
    };

    try {
      // Check preconditions
      if (experiment.preconditions) {
        const canRun = await experiment.preconditions();
        if (!canRun) {
          throw new Error('Preconditions not met');
        }
      }

      // Record steady state before
      result.steadyStateBefore = await this.recordSteadyState();
      this.logger.log(`Steady state before: ${JSON.stringify(result.steadyStateBefore)}`);

      // Dry run mode - don't actually inject chaos
      if (options.dryRun) {
        this.logger.log(`DRY RUN: Would inject ${name} chaos`);
        result.success = true;
        result.steadyStateAfter = result.steadyStateBefore;
        return result;
      }

      // Inject chaos
      this.logger.warn(`CHAOS: Injecting ${name} with options:`, options);
      this.emit('chaos.started', { experiment: name, options });

      await experiment.inject(options);

      // Wait for duration if specified
      if (options.duration) {
        await this.wait(options.duration * 1000);
      }

      // Verify system still functions
      if (experiment.verify) {
        const isHealthy = await experiment.verify();
        if (!isHealthy) {
          result.errors.push('System verification failed during chaos');
        }
      }

      // Record steady state after
      result.steadyStateAfter = await this.recordSteadyState();
      this.logger.log(`Steady state after: ${JSON.stringify(result.steadyStateAfter)}`);

      // Analyze impact
      const impact = this.analyzeImpact(result.steadyStateBefore, result.steadyStateAfter);
      result.learnings = this.extractLearnings(impact);
      result.recommendations = this.generateRecommendations(impact);

      result.success = result.errors.length === 0;

      // Record successful chaos test
      if (result.success) {
        this.logger.log(`CHAOS SUCCESS: System survived ${name}`);
        this.emit('chaos.success', result);
      } else {
        this.logger.warn(`CHAOS FAILURE: System degraded during ${name}`);
        this.emit('chaos.failure', result);
      }
    } catch (error) {
      result.errors.push(error);
      result.success = false;

      this.logger.error(`CHAOS ERROR: Experiment ${name} failed`, error);
      this.emit('chaos.error', { experiment: name, error });

      // Trigger self-healing
      await this.triggerSelfHealing(name, error);
    } finally {
      // Always rollback chaos
      try {
        this.logger.log(`Rolling back chaos: ${name}`);
        await experiment.rollback();
        this.emit('chaos.rollback', { experiment: name });
      } catch (rollbackError) {
        this.logger.error(`Failed to rollback ${name}`, rollbackError);
        result.errors.push({ phase: 'rollback', error: rollbackError });
      }

      result.endTime = new Date();
      this.history.push(result);
      this.isRunning = false;
      this.currentExperiment = null;
    }

    return result;
  }

  async runRandomExperiment(options: ChaosOptions = {}): Promise<ChaosResult> {
    const experiments = Array.from(this.experiments.keys());

    // Filter by severity if in production
    const filtered =
      process.env.NODE_ENV === 'production'
        ? experiments.filter((name) => {
            const exp = this.experiments.get(name)!;
            return exp.severity === 'low' || exp.severity === 'medium';
          })
        : experiments;

    if (filtered.length === 0) {
      throw new Error('No suitable experiments available');
    }

    const randomIndex = Math.floor(Math.random() * filtered.length);
    const selectedExperiment = filtered[randomIndex];

    this.logger.warn(`CHAOS: Randomly selected experiment: ${selectedExperiment}`);
    return this.runExperiment(selectedExperiment, options);
  }

  async scheduleGameDay(experiments: string[], interval: number = 3600000): Promise<void> {
    this.logger.warn('CHAOS GAME DAY: Starting scheduled chaos experiments');

    for (const experimentName of experiments) {
      try {
        await this.runExperiment(experimentName, {
          duration: 60,
          intensity: 'medium',
        });

        // Wait between experiments
        await this.wait(interval);
      } catch (error) {
        this.logger.error(`Game day experiment ${experimentName} failed`, error);
      }
    }

    this.logger.warn('CHAOS GAME DAY: Completed');
    this.generateGameDayReport();
  }

  private async recordSteadyState(): Promise<SteadyState> {
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    const network = await si.networkStats();

    return {
      cpu: cpu.currentLoad,
      memory: (mem.used / mem.total) * 100,
      errorRate: await this.getErrorRate(),
      responseTime: await this.getAverageResponseTime(),
      throughput: network[0]?.rx_sec || 0,
      activeConnections: await this.getActiveConnections(),
      queueDepth: await this.getQueueDepth(),
    };
  }

  private analyzeImpact(before: SteadyState, after: SteadyState): any {
    return {
      cpuImpact: ((after.cpu - before.cpu) / before.cpu) * 100,
      memoryImpact: ((after.memory - before.memory) / before.memory) * 100,
      errorRateIncrease: after.errorRate - before.errorRate,
      responseTimeDegradation:
        ((after.responseTime - before.responseTime) / before.responseTime) * 100,
      throughputLoss: ((before.throughput - after.throughput) / before.throughput) * 100,
      connectionIncrease: after.activeConnections - before.activeConnections,
      queueGrowth: after.queueDepth - before.queueDepth,
    };
  }

  private extractLearnings(impact: any): string[] {
    const learnings: string[] = [];

    if (impact.cpuImpact > 50) {
      learnings.push('System is CPU-bound under stress - consider horizontal scaling');
    }

    if (impact.memoryImpact > 30) {
      learnings.push(
        'Memory usage spikes significantly - potential memory leak or inefficient caching',
      );
    }

    if (impact.errorRateIncrease > 0.05) {
      learnings.push('Error rate increased by more than 5% - improve error handling and retries');
    }

    if (impact.responseTimeDegradation > 100) {
      learnings.push('Response time doubled - need better circuit breakers and timeouts');
    }

    if (impact.throughputLoss > 20) {
      learnings.push('Significant throughput loss - consider load balancing improvements');
    }

    if (impact.queueGrowth > 100) {
      learnings.push('Queue backlog growing - need better backpressure handling');
    }

    return learnings;
  }

  private generateRecommendations(impact: any): string[] {
    const recommendations: string[] = [];

    if (impact.cpuImpact > 30) {
      recommendations.push('Implement CPU-based autoscaling with threshold at 70%');
    }

    if (impact.memoryImpact > 20) {
      recommendations.push('Add memory monitoring alerts and implement graceful degradation');
    }

    if (impact.errorRateIncrease > 0.01) {
      recommendations.push('Implement circuit breakers for all external service calls');
    }

    if (impact.responseTimeDegradation > 50) {
      recommendations.push('Add caching layer and optimize database queries');
    }

    if (impact.connectionIncrease > 50) {
      recommendations.push('Implement connection pooling with proper limits');
    }

    return recommendations;
  }

  private async triggerSelfHealing(experiment: string, error: any): Promise<void> {
    this.logger.log(`Triggering self-healing for ${experiment}`);

    // Implement self-healing strategies based on experiment type
    const exp = this.experiments.get(experiment);
    if (!exp) return;

    switch (exp.category) {
      case 'network':
        // Reset network configurations
        this.emit('heal.network', { experiment, error });
        break;
      case 'resource':
        // Free up resources
        this.emit('heal.resources', { experiment, error });
        break;
      case 'service':
        // Restart failed services
        this.emit('heal.service', { experiment, error });
        break;
      case 'database':
        // Reset database connections
        this.emit('heal.database', { experiment, error });
        break;
    }
  }

  private generateGameDayReport(): void {
    const report = {
      date: new Date(),
      experimentsRun: this.history.length,
      successRate: this.history.filter((r) => r.success).length / this.history.length,
      topLearnings: this.aggregateLearnings(),
      criticalRecommendations: this.prioritizeRecommendations(),
      systemWeaknesses: this.identifyWeaknesses(),
    };

    this.logger.log('GAME DAY REPORT:', report);
    this.emit('gameday.report', report);
  }

  private aggregateLearnings(): string[] {
    const allLearnings = this.history.flatMap((r) => r.learnings);
    const frequency = new Map<string, number>();

    for (const learning of allLearnings) {
      frequency.set(learning, (frequency.get(learning) || 0) + 1);
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([learning]) => learning);
  }

  private prioritizeRecommendations(): string[] {
    const allRecommendations = this.history.flatMap((r) => r.recommendations);
    const frequency = new Map<string, number>();

    for (const rec of allRecommendations) {
      frequency.set(rec, (frequency.get(rec) || 0) + 1);
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rec]) => rec);
  }

  private identifyWeaknesses(): string[] {
    return this.history
      .filter((r) => !r.success)
      .map((r) => `${r.experiment}: ${r.errors[0]?.message || 'Unknown failure'}`)
      .slice(0, 5);
  }

  // Helper methods (these would connect to actual monitoring systems)
  private async getErrorRate(): Promise<number> {
    // Connect to metrics system
    return Math.random() * 0.05; // Placeholder
  }

  private async getAverageResponseTime(): Promise<number> {
    // Connect to APM
    return 100 + Math.random() * 50; // Placeholder
  }

  private async getActiveConnections(): Promise<number> {
    // Connect to database/redis
    return Math.floor(Math.random() * 100); // Placeholder
  }

  private async getQueueDepth(): Promise<number> {
    // Connect to queue system
    return Math.floor(Math.random() * 50); // Placeholder
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Get chaos history for analysis
  getHistory(): ChaosResult[] {
    return [...this.history];
  }

  // Clear chaos history
  clearHistory(): void {
    this.history.length = 0;
  }

  // Check if safe to run chaos
  async isSafeToRunChaos(): Promise<boolean> {
    const state = await this.recordSteadyState();

    // Don't run chaos if system is already degraded
    if (state.errorRate > 0.1) return false;
    if (state.cpu > 80) return false;
    if (state.memory > 85) return false;
    if (state.responseTime > 1000) return false;

    // Check business hours (avoid peak times)
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 17) return false;

    return true;
  }
}
