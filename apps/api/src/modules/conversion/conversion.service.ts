import { Injectable, Logger } from '@nestjs/common';
import { ConversionTrackingService, ConversionStage } from './services/conversion-tracking.service';
import { UpgradePromptService } from './services/upgrade-prompt.service';
import { ConversionAnalyticsService } from './services/conversion-analytics.service';

export interface ConversionInsights {
  totalUsers: number;
  conversionRate: number;
  averageTimeToConversion: number;
  stageDropoffs: Record<ConversionStage, number>;
  topConversionActions: Array<{ action: string; impact: number }>;
  recommendedOptimizations: Array<{
    area: string;
    suggestion: string;
    impact: 'low' | 'medium' | 'high';
  }>;
}

@Injectable()
export class ConversionService {
  private readonly logger = new Logger(ConversionService.name);

  constructor(
    private readonly conversionTracking: ConversionTrackingService,
    private readonly upgradePromptService: UpgradePromptService,
    private readonly conversionAnalytics: ConversionAnalyticsService,
  ) {}

  async getConversionInsights(
    tenantId?: string,
    period: 'day' | 'week' | 'month' = 'month',
  ): Promise<ConversionInsights> {
    return this.conversionAnalytics.getConversionInsights(tenantId, period);
  }

  async optimizeUserExperience(userId: string): Promise<{
    recommendations: Array<{ type: string; priority: number; action: string }>;
    nextBestAction: string;
    conversionProbability: number;
  }> {
    const funnel = await this.conversionTracking.getConversionFunnel(userId);
    if (!funnel) {
      return {
        recommendations: [],
        nextBestAction: 'signup',
        conversionProbability: 0,
      };
    }

    const recommendations = this.generateRecommendations(funnel);
    const nextBestAction = this.determineNextBestAction(funnel);

    return {
      recommendations,
      nextBestAction,
      conversionProbability: funnel.conversionProbability,
    };
  }

  private generateRecommendations(
    funnel: any,
  ): Array<{ type: string; priority: number; action: string }> {
    const recommendations = [];

    if (funnel.stage === ConversionStage.VISITOR) {
      recommendations.push({
        type: 'onboarding',
        priority: 10,
        action: 'Show interactive demo or feature tour',
      });
    }

    if (funnel.stage === ConversionStage.TRIAL && funnel.actions.length < 3) {
      recommendations.push({
        type: 'activation',
        priority: 9,
        action: 'Guide user through first quote creation',
      });
    }

    if (funnel.score > 70 && funnel.stage !== ConversionStage.CONVERTED) {
      recommendations.push({
        type: 'conversion',
        priority: 8,
        action: 'Show personalized upgrade offer',
      });
    }

    return recommendations;
  }

  private determineNextBestAction(funnel: any): string {
    const actionMap = {
      [ConversionStage.VISITOR]: 'encourage_signup',
      [ConversionStage.SIGNUP]: 'complete_onboarding',
      [ConversionStage.TRIAL]: 'create_first_quote',
      [ConversionStage.ENGAGED]: 'explore_advanced_features',
      [ConversionStage.LIMIT_REACHED]: 'show_upgrade_prompt',
      [ConversionStage.CONVERTED]: 'maximize_value',
    };

    return actionMap[funnel.stage] || 'engage_user';
  }
}
