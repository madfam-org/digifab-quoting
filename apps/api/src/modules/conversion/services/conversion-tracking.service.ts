import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { TenantContextService } from '@/modules/tenant/tenant-context.service';

export interface UserAction {
  userId?: string;
  sessionId?: string;
  tenantId?: string;
  action: ConversionAction;
  context: Record<string, unknown>;
  timestamp: Date;
}

export enum ConversionAction {
  // Awareness stage
  VISITED_LANDING = 'visited_landing',
  VIEWED_PRICING = 'viewed_pricing',
  WATCHED_DEMO = 'watched_demo',

  // Interest stage
  STARTED_SIGNUP = 'started_signup',
  CREATED_ACCOUNT = 'created_account',
  VERIFIED_EMAIL = 'verified_email',

  // Trial/Free usage
  UPLOADED_FIRST_FILE = 'uploaded_first_file',
  CREATED_FIRST_QUOTE = 'created_first_quote',
  SHARED_QUOTE = 'shared_quote',
  DOWNLOADED_PDF = 'downloaded_pdf',

  // Engagement signals
  USED_ADVANCED_FEATURE = 'used_advanced_feature',
  HIT_USAGE_LIMIT = 'hit_usage_limit',
  VIEWED_UPGRADE_PAGE = 'viewed_upgrade_page',

  // Conversion
  CLICKED_UPGRADE = 'clicked_upgrade',
  STARTED_CHECKOUT = 'started_checkout',
  COMPLETED_PAYMENT = 'completed_payment',
  UPGRADED_PLAN = 'upgraded_plan',

  // Retention signals
  LOGGED_IN_AGAIN = 'logged_in_again',
  INVITED_TEAM_MEMBER = 'invited_team_member',
  INTEGRATED_API = 'integrated_api',

  // Churn signals
  CANCELLED_SUBSCRIPTION = 'cancelled_subscription',
  ACCOUNT_INACTIVE = 'account_inactive',
}

export interface ConversionFunnel {
  userId: string;
  tenantId?: string;
  stage: ConversionStage;
  score: number; // 0-100 likelihood to convert
  actions: UserAction[];
  triggers: UpgradeTrigger[];
  lastActivity: Date;
  daysActive: number;
  conversionProbability: number;
}

export enum ConversionStage {
  VISITOR = 'visitor',
  SIGNUP = 'signup',
  TRIAL = 'trial',
  ENGAGED = 'engaged',
  LIMIT_REACHED = 'limit_reached',
  CONVERTED = 'converted',
  CHURNED = 'churned',
}

export interface UpgradeTrigger {
  type: TriggerType;
  priority: number;
  message: string;
  cta: string;
  context: Record<string, unknown>;
  createdAt: Date;
  shownAt?: Date;
  clickedAt?: Date;
  dismissedAt?: Date;
}

export enum TriggerType {
  USAGE_LIMIT = 'usage_limit',
  FEATURE_GATE = 'feature_gate',
  TIME_BASED = 'time_based',
  BEHAVIOR_BASED = 'behavior_based',
  VALUE_DEMONSTRATION = 'value_demonstration',
}

@Injectable()
export class ConversionTrackingService {
  private readonly logger = new Logger(ConversionTrackingService.name);
  private readonly FUNNEL_KEY_PREFIX = 'conversion_funnel';
  private readonly TRIGGER_KEY_PREFIX = 'upgrade_triggers';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async trackAction(
    action: ConversionAction,
    context: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      const tenantId = this.tenantContext.getContext()?.tenantId;
      const userId = this.tenantContext.getContext()?.userId;

      if (!userId) return; // Skip tracking for anonymous users

      const userAction: UserAction = {
        userId,
        tenantId,
        action,
        context,
        timestamp: new Date(),
      };

      // Store action in Redis for real-time analysis
      await this.storeActionInRedis(userAction);

      // Update conversion funnel
      await this.updateConversionFunnel(userId, action, context);

      // Check for trigger conditions
      await this.evaluateUpgradeTriggers(userId, action, context);

      this.logger.debug(`Tracked conversion action: ${action} for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to track conversion action: ${error.message}`, error.stack);
    }
  }

  private async storeActionInRedis(action: UserAction): Promise<void> {
    const key = `actions:${action.userId}`;
    await this.redis.lpush(key, JSON.stringify(action));
    await this.redis.ltrim(key, 0, 99); // Keep last 100 actions
    await this.redis.expire(key, 30 * 24 * 60 * 60); // 30 days
  }

  private async updateConversionFunnel(
    userId: string,
    action: ConversionAction,
    context: Record<string, unknown>,
  ): Promise<void> {
    const funnelKey = `${this.FUNNEL_KEY_PREFIX}:${userId}`;

    let funnel = await this.getConversionFunnel(userId);
    if (!funnel) {
      funnel = this.initializeConversionFunnel(userId);
    }

    // Update stage based on action
    const newStage = this.calculateStage(action, funnel.stage);
    if (newStage !== funnel.stage) {
      funnel.stage = newStage;
      this.logger.debug(`User ${userId} progressed to stage: ${newStage}`);
    }

    // Update score and probability
    funnel.score = this.calculateConversionScore(funnel.actions, action);
    funnel.conversionProbability = this.calculateConversionProbability(funnel);
    funnel.lastActivity = new Date();

    // Add action to history
    funnel.actions.push({
      userId,
      tenantId: funnel.tenantId,
      action,
      context,
      timestamp: new Date(),
    });

    // Keep only last 50 actions
    if (funnel.actions.length > 50) {
      funnel.actions = funnel.actions.slice(-50);
    }

    // Store updated funnel
    await this.redis.set(funnelKey, JSON.stringify(funnel), 30 * 24 * 60 * 60);

    // Store key metrics in separate Redis keys for analytics
    await this.updateFunnelMetrics(userId, funnel);
  }

  private initializeConversionFunnel(userId: string): ConversionFunnel {
    return {
      userId,
      tenantId: this.tenantContext.getContext()?.tenantId,
      stage: ConversionStage.VISITOR,
      score: 0,
      actions: [],
      triggers: [],
      lastActivity: new Date(),
      daysActive: 0,
      conversionProbability: 0,
    };
  }

  private calculateStage(action: ConversionAction, currentStage: ConversionStage): ConversionStage {
    const stageMap: Record<ConversionAction, ConversionStage> = {
      [ConversionAction.CREATED_ACCOUNT]: ConversionStage.SIGNUP,
      [ConversionAction.VERIFIED_EMAIL]: ConversionStage.SIGNUP,
      [ConversionAction.UPLOADED_FIRST_FILE]: ConversionStage.TRIAL,
      [ConversionAction.CREATED_FIRST_QUOTE]: ConversionStage.TRIAL,
      [ConversionAction.SHARED_QUOTE]: ConversionStage.ENGAGED,
      [ConversionAction.USED_ADVANCED_FEATURE]: ConversionStage.ENGAGED,
      [ConversionAction.HIT_USAGE_LIMIT]: ConversionStage.LIMIT_REACHED,
      [ConversionAction.COMPLETED_PAYMENT]: ConversionStage.CONVERTED,
      [ConversionAction.UPGRADED_PLAN]: ConversionStage.CONVERTED,
      [ConversionAction.ACCOUNT_INACTIVE]: ConversionStage.CHURNED,
    };

    const newStage = stageMap[action];

    // Only allow forward progression (except to churned)
    if (
      newStage &&
      (this.getStageOrder(newStage) > this.getStageOrder(currentStage) ||
        newStage === ConversionStage.CHURNED)
    ) {
      return newStage;
    }

    return currentStage;
  }

  private getStageOrder(stage: ConversionStage): number {
    const order = {
      [ConversionStage.VISITOR]: 0,
      [ConversionStage.SIGNUP]: 1,
      [ConversionStage.TRIAL]: 2,
      [ConversionStage.ENGAGED]: 3,
      [ConversionStage.LIMIT_REACHED]: 4,
      [ConversionStage.CONVERTED]: 5,
      [ConversionStage.CHURNED]: -1,
    };
    return order[stage] || 0;
  }

  private calculateConversionScore(actions: UserAction[], newAction: ConversionAction): number {
    const actionScores: Record<ConversionAction, number> = {
      [ConversionAction.VISITED_LANDING]: 5,
      [ConversionAction.VIEWED_PRICING]: 10,
      [ConversionAction.WATCHED_DEMO]: 15,
      [ConversionAction.STARTED_SIGNUP]: 20,
      [ConversionAction.CREATED_ACCOUNT]: 30,
      [ConversionAction.VERIFIED_EMAIL]: 35,
      [ConversionAction.UPLOADED_FIRST_FILE]: 45,
      [ConversionAction.CREATED_FIRST_QUOTE]: 55,
      [ConversionAction.SHARED_QUOTE]: 65,
      [ConversionAction.DOWNLOADED_PDF]: 60,
      [ConversionAction.USED_ADVANCED_FEATURE]: 70,
      [ConversionAction.HIT_USAGE_LIMIT]: 80,
      [ConversionAction.VIEWED_UPGRADE_PAGE]: 85,
      [ConversionAction.CLICKED_UPGRADE]: 90,
      [ConversionAction.STARTED_CHECKOUT]: 95,
      [ConversionAction.COMPLETED_PAYMENT]: 100,
      [ConversionAction.LOGGED_IN_AGAIN]: 40,
      [ConversionAction.INVITED_TEAM_MEMBER]: 75,
      [ConversionAction.INTEGRATED_API]: 85,
    };

    // Calculate cumulative score with decay for older actions
    let score = 0;
    const now = new Date();

    actions.forEach((action) => {
      const actionScore = actionScores[action.action] || 0;
      const daysSince = Math.floor(
        (now.getTime() - new Date(action.timestamp).getTime()) / (1000 * 60 * 60 * 24),
      );
      const decay = Math.max(0.1, 1 - daysSince / 30); // Decay over 30 days, minimum 10%
      score += actionScore * decay;
    });

    // Add current action score
    score += actionScores[newAction] || 0;

    return Math.min(100, score);
  }

  private calculateConversionProbability(funnel: ConversionFunnel): number {
    // ML model would go here - for now, use heuristics
    let probability = funnel.score / 100;

    // Adjust based on stage
    const stageMultipliers = {
      [ConversionStage.VISITOR]: 0.1,
      [ConversionStage.SIGNUP]: 0.2,
      [ConversionStage.TRIAL]: 0.4,
      [ConversionStage.ENGAGED]: 0.7,
      [ConversionStage.LIMIT_REACHED]: 0.9,
      [ConversionStage.CONVERTED]: 1.0,
      [ConversionStage.CHURNED]: 0.0,
    };

    probability *= stageMultipliers[funnel.stage] || 0.1;

    // Adjust based on activity recency
    const daysSinceLastActivity = Math.floor(
      (new Date().getTime() - funnel.lastActivity.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceLastActivity > 7) {
      probability *= 0.5; // 50% reduction if inactive for 7+ days
    }

    return Math.min(1, Math.max(0, probability));
  }

  private async evaluateUpgradeTriggers(
    userId: string,
    action: ConversionAction,
    context: Record<string, unknown>,
  ): Promise<void> {
    const triggers: UpgradeTrigger[] = [];

    // Usage limit trigger
    if (action === ConversionAction.HIT_USAGE_LIMIT) {
      triggers.push({
        type: TriggerType.USAGE_LIMIT,
        priority: 10,
        message: "You've reached your monthly limit! Upgrade to continue creating quotes.",
        cta: 'Upgrade Now',
        context: { ...context, limitType: context.eventType },
        createdAt: new Date(),
      });
    }

    // Feature gate trigger
    if (action === ConversionAction.USED_ADVANCED_FEATURE) {
      triggers.push({
        type: TriggerType.FEATURE_GATE,
        priority: 8,
        message: 'Unlock advanced features like custom branding and API access.',
        cta: 'See Pro Features',
        context,
        createdAt: new Date(),
      });
    }

    // Value demonstration trigger
    if (action === ConversionAction.DOWNLOADED_PDF) {
      const downloadCount = (context.downloadCount as number) || 1;
      if (downloadCount >= 3) {
        triggers.push({
          type: TriggerType.VALUE_DEMONSTRATION,
          priority: 7,
          message: `You've downloaded ${downloadCount} quotes. Save time with unlimited quotes and faster processing.`,
          cta: 'Upgrade to Pro',
          context,
          createdAt: new Date(),
        });
      }
    }

    // Time-based trigger for engaged users
    if (action === ConversionAction.LOGGED_IN_AGAIN) {
      const loginCount = (context.loginCount as number) || 1;
      if (loginCount === 7) {
        // After 7 logins
        triggers.push({
          type: TriggerType.TIME_BASED,
          priority: 6,
          message: "You're getting great value from Cotiza Studio! Upgrade for unlimited access.",
          cta: 'Upgrade Now',
          context,
          createdAt: new Date(),
        });
      }
    }

    // Store triggers
    if (triggers.length > 0) {
      await this.storeUpgradeTriggers(userId, triggers);
    }
  }

  private async storeUpgradeTriggers(userId: string, triggers: UpgradeTrigger[]): Promise<void> {
    const key = `${this.TRIGGER_KEY_PREFIX}:${userId}`;

    for (const trigger of triggers) {
      await this.redis.lpush(key, JSON.stringify(trigger));
    }

    await this.redis.ltrim(key, 0, 9); // Keep last 10 triggers
    await this.redis.expire(key, 7 * 24 * 60 * 60); // 7 days
  }

  async getConversionFunnel(userId: string): Promise<ConversionFunnel | null> {
    const key = `${this.FUNNEL_KEY_PREFIX}:${userId}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      return JSON.parse(data as string);
    } catch {
      return null;
    }
  }

  async getUpgradeTriggers(userId: string, limit: number = 5): Promise<UpgradeTrigger[]> {
    const key = `${this.TRIGGER_KEY_PREFIX}:${userId}`;
    const triggers = await this.redis.lrange(key, 0, limit - 1);

    return triggers.map((t) => JSON.parse(t)).sort((a, b) => b.priority - a.priority);
  }

  async markTriggerShown(userId: string, triggerType: TriggerType): Promise<void> {
    // Implementation would update the trigger's shownAt timestamp
    this.logger.debug(`Marked trigger ${triggerType} as shown for user ${userId}`);
  }

  async markTriggerClicked(userId: string, triggerType: TriggerType): Promise<void> {
    // Track trigger click for conversion analysis
    await this.trackAction(ConversionAction.CLICKED_UPGRADE, { triggerType });
    this.logger.debug(`Marked trigger ${triggerType} as clicked for user ${userId}`);
  }

  private async updateFunnelMetrics(userId: string, funnel: ConversionFunnel): Promise<void> {
    const metrics = {
      stage: funnel.stage,
      score: funnel.score,
      probability: funnel.conversionProbability,
      lastActivity: funnel.lastActivity.toISOString(),
    };

    await this.redis.hset(`funnel_metrics:${userId}`, metrics);
    await this.redis.expire(`funnel_metrics:${userId}`, 30 * 24 * 60 * 60);
  }

  async getFunnelMetrics(userId: string): Promise<Record<string, any> | null> {
    return this.redis.hgetall(`funnel_metrics:${userId}`);
  }
}
