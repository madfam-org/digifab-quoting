import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { SSOService } from './services/sso.service';
import { WhiteLabelService } from './services/white-label.service';
import { ComplianceService } from './services/compliance.service';
import { DedicatedSupportService } from './services/dedicated-support.service';
import {
  EnterpriseAnalyticsService,
  EnterpriseAnalytics,
  UserAnalytics,
  UsageAnalytics,
} from './services/enterprise-analytics.service';
import { AuditTrailService, AuditAction } from './services/audit-trail.service';

export interface EnterpriseFeatures {
  sso: boolean;
  whiteLabel: boolean;
  compliance: boolean;
  dedicatedSupport: boolean;
  analytics: boolean;
  auditTrail: boolean;
  customIntegrations: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
  customReporting: boolean;
  dataExport: boolean;
  sla: boolean;
}

export interface EnterprisePlan {
  id: string;
  name: string;
  features: EnterpriseFeatures;
  limits: {
    users: number;
    storage: number; // in GB
    apiCalls: number;
    supportTickets: number;
  };
  pricing: {
    monthlyPrice: number;
    yearlyPrice: number;
    setupFee?: number;
    customPricing: boolean;
  };
  sla: {
    uptime: number;
    responseTime: number;
    supportResponseTime: number;
  };
}

export interface TenantOnboardingStatus {
  tenantId: string;
  steps: {
    ssoConfiguration: boolean;
    whiteLabelSetup: boolean;
    userProvisioning: boolean;
    integrationTesting: boolean;
    trainingComplete: boolean;
    goLive: boolean;
  };
  progress: number;
  estimatedCompletion: Date;
  assignedCSM: string; // Customer Success Manager
  nextActions: Array<{
    task: string;
    owner: string;
    dueDate: Date;
    priority: 'low' | 'medium' | 'high';
  }>;
}

@Injectable()
export class EnterpriseService {
  private readonly logger = new Logger(EnterpriseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ssoService: SSOService,
    private readonly whiteLabelService: WhiteLabelService,
    private readonly complianceService: ComplianceService,
    private readonly supportService: DedicatedSupportService,
    private readonly analyticsService: EnterpriseAnalyticsService,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async getEnterprisePlans(): Promise<EnterprisePlan[]> {
    return [
      {
        id: 'enterprise-starter',
        name: 'Enterprise Starter',
        features: {
          sso: true,
          whiteLabel: false,
          compliance: true,
          dedicatedSupport: false,
          analytics: true,
          auditTrail: true,
          customIntegrations: false,
          apiAccess: true,
          prioritySupport: false,
          customReporting: false,
          dataExport: true,
          sla: true,
        },
        limits: {
          users: 100,
          storage: 500,
          apiCalls: 50000,
          supportTickets: 50,
        },
        pricing: {
          monthlyPrice: 2500,
          yearlyPrice: 25000,
          setupFee: 5000,
          customPricing: false,
        },
        sla: {
          uptime: 99.5,
          responseTime: 500,
          supportResponseTime: 4,
        },
      },
      {
        id: 'enterprise-professional',
        name: 'Enterprise Professional',
        features: {
          sso: true,
          whiteLabel: true,
          compliance: true,
          dedicatedSupport: true,
          analytics: true,
          auditTrail: true,
          customIntegrations: true,
          apiAccess: true,
          prioritySupport: true,
          customReporting: true,
          dataExport: true,
          sla: true,
        },
        limits: {
          users: 500,
          storage: 2000,
          apiCalls: 200000,
          supportTickets: 200,
        },
        pricing: {
          monthlyPrice: 7500,
          yearlyPrice: 75000,
          setupFee: 10000,
          customPricing: false,
        },
        sla: {
          uptime: 99.9,
          responseTime: 300,
          supportResponseTime: 2,
        },
      },
      {
        id: 'enterprise-custom',
        name: 'Enterprise Custom',
        features: {
          sso: true,
          whiteLabel: true,
          compliance: true,
          dedicatedSupport: true,
          analytics: true,
          auditTrail: true,
          customIntegrations: true,
          apiAccess: true,
          prioritySupport: true,
          customReporting: true,
          dataExport: true,
          sla: true,
        },
        limits: {
          users: -1, // Unlimited
          storage: -1, // Unlimited
          apiCalls: -1, // Unlimited
          supportTickets: -1, // Unlimited
        },
        pricing: {
          monthlyPrice: 0, // Custom pricing
          yearlyPrice: 0, // Custom pricing
          customPricing: true,
        },
        sla: {
          uptime: 99.99,
          responseTime: 200,
          supportResponseTime: 1,
        },
      },
    ];
  }

  async getTenantPlan(tenantId: string): Promise<EnterprisePlan | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        billing: {
          include: {
            plan: true,
          },
        },
      },
    });

    if (!tenant?.billing?.plan) return null;

    const plans = await this.getEnterprisePlans();
    return plans.find((p) => p.id === tenant.billing.plan.id) || null;
  }

  async getEnterpriseAnalytics(tenantId: string): Promise<EnterpriseAnalytics> {
    await this.auditTrail.logSystemEvent(
      tenantId,
      AuditAction.SYSTEM_MAINTENANCE,
      'analytics',
      'enterprise_overview',
      { action: 'view_analytics' },
    );

    return this.analyticsService.getEnterpriseAnalytics(tenantId);
  }

  async getUserAnalytics(
    tenantId: string,
    period: 'week' | 'month' | 'quarter',
  ): Promise<UserAnalytics> {
    await this.auditTrail.logSystemEvent(
      tenantId,
      AuditAction.SYSTEM_MAINTENANCE,
      'analytics',
      'user_analytics',
      { period },
    );

    return this.analyticsService.getUserAnalytics(tenantId, period);
  }

  async getUsageAnalytics(
    tenantId: string,
    period: 'week' | 'month' | 'quarter',
  ): Promise<UsageAnalytics> {
    await this.auditTrail.logSystemEvent(
      tenantId,
      AuditAction.SYSTEM_MAINTENANCE,
      'analytics',
      'usage_analytics',
      { period },
    );

    return this.analyticsService.getUsageAnalytics(tenantId, period);
  }

  async initiateTenantOnboarding(
    tenantId: string,
    plan: EnterprisePlan,
    requirements: {
      ssoRequired: boolean;
      whiteLabelRequired: boolean;
      customIntegrations: string[];
      trainingRequired: boolean;
      migrationRequired: boolean;
    },
  ): Promise<TenantOnboardingStatus> {
    const csmId = await this.assignCustomerSuccessManager(tenantId, plan);

    const onboarding: TenantOnboardingStatus = {
      tenantId,
      steps: {
        ssoConfiguration: false,
        whiteLabelSetup: false,
        userProvisioning: false,
        integrationTesting: false,
        trainingComplete: false,
        goLive: false,
      },
      progress: 0,
      estimatedCompletion: this.calculateEstimatedCompletion(requirements),
      assignedCSM: csmId,
      nextActions: this.generateOnboardingTasks(requirements),
    };

    // Store onboarding status
    await this.redis.set(
      `enterprise_onboarding:${tenantId}`,
      JSON.stringify(onboarding),
      86400 * 30, // 30 days
    );

    // Schedule onboarding checkpoints
    await this.scheduleOnboardingCheckpoints(tenantId);

    // Log audit trail
    await this.auditTrail.logSystemEvent(
      tenantId,
      AuditAction.SYSTEM_MAINTENANCE,
      'onboarding',
      'enterprise_onboarding',
      { plan: plan.id, requirements },
    );

    this.logger.log(`Initiated enterprise onboarding for tenant ${tenantId} with plan ${plan.id}`);

    return onboarding;
  }

  async updateOnboardingStatus(
    tenantId: string,
    step: keyof TenantOnboardingStatus['steps'],
    completed: boolean,
  ): Promise<TenantOnboardingStatus> {
    const cached = await this.redis.get(`enterprise_onboarding:${tenantId}`);
    if (!cached) {
      throw new Error('Onboarding status not found');
    }

    const onboarding: TenantOnboardingStatus = JSON.parse(cached);
    onboarding.steps[step] = completed;

    // Recalculate progress
    const totalSteps = Object.keys(onboarding.steps).length;
    const completedSteps = Object.values(onboarding.steps).filter((s) => s).length;
    onboarding.progress = (completedSteps / totalSteps) * 100;

    // Update next actions
    onboarding.nextActions = this.updateNextActions(onboarding);

    // Save updated status
    await this.redis.set(
      `enterprise_onboarding:${tenantId}`,
      JSON.stringify(onboarding),
      86400 * 30, // 30 days
    );

    // Log audit trail
    await this.auditTrail.logSystemEvent(
      tenantId,
      AuditAction.SYSTEM_MAINTENANCE,
      'onboarding',
      'step_completed',
      { step, completed, progress: onboarding.progress },
    );

    // Notify CSM of progress
    if (completed && onboarding.progress === 100) {
      await this.notifyOnboardingComplete(tenantId, onboarding.assignedCSM);
    }

    return onboarding;
  }

  async getTenantOnboardingStatus(tenantId: string): Promise<TenantOnboardingStatus | null> {
    const cached = await this.redis.get(`enterprise_onboarding:${tenantId}`);
    return cached ? JSON.parse(cached) : null;
  }

  async generateEnterpriseHealthCheck(tenantId: string): Promise<{
    score: number;
    categories: Record<
      string,
      {
        score: number;
        issues: string[];
        recommendations: string[];
      }
    >;
    overallRecommendations: string[];
  }> {
    const [ssoHealth, complianceHealth, usageHealth, supportHealth] = await Promise.all([
      this.assessSSOHealth(tenantId),
      this.assessComplianceHealth(tenantId),
      this.assessUsageHealth(tenantId),
      this.assessSupportHealth(tenantId),
    ]);

    const categories = {
      sso: ssoHealth,
      compliance: complianceHealth,
      usage: usageHealth,
      support: supportHealth,
    };

    const overallScore =
      Object.values(categories).reduce((sum, cat) => sum + cat.score, 0) /
      Object.keys(categories).length;

    const overallRecommendations: string[] = [];
    if (overallScore < 80) {
      overallRecommendations.push('Schedule enterprise health review meeting');
      overallRecommendations.push('Consider additional training resources');
    }

    if (categories.compliance.score < 90) {
      overallRecommendations.push('Prioritize compliance improvements');
    }

    return {
      score: overallScore,
      categories,
      overallRecommendations,
    };
  }

  private async assignCustomerSuccessManager(
    tenantId: string,
    plan: EnterprisePlan,
  ): Promise<string> {
    // Mock implementation - would integrate with CRM/staffing system
    const csms = [
      { id: 'csm-1', name: 'Alice Johnson', maxAccounts: 15, currentAccounts: 8 },
      { id: 'csm-2', name: 'Bob Smith', maxAccounts: 12, currentAccounts: 11 },
      { id: 'csm-3', name: 'Carol Davis', maxAccounts: 10, currentAccounts: 6 },
    ];

    // Assign to CSM with lowest utilization
    const availableCSMs = csms.filter((csm) => csm.currentAccounts < csm.maxAccounts);
    const assignedCSM = availableCSMs.sort((a, b) => a.currentAccounts - b.currentAccounts)[0];

    return assignedCSM?.id || 'csm-1';
  }

  private calculateEstimatedCompletion(requirements: any): Date {
    let days = 14; // Base onboarding time

    if (requirements.ssoRequired) days += 7;
    if (requirements.whiteLabelRequired) days += 10;
    if (requirements.customIntegrations.length > 0)
      days += requirements.customIntegrations.length * 3;
    if (requirements.trainingRequired) days += 5;
    if (requirements.migrationRequired) days += 14;

    const completion = new Date();
    completion.setDate(completion.getDate() + days);
    return completion;
  }

  private generateOnboardingTasks(requirements: any): TenantOnboardingStatus['nextActions'] {
    const tasks: TenantOnboardingStatus['nextActions'] = [
      {
        task: 'Initial kickoff meeting',
        owner: 'CSM',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        priority: 'high',
      },
    ];

    if (requirements.ssoRequired) {
      tasks.push({
        task: 'Configure SSO integration',
        owner: 'Technical',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        priority: 'high',
      });
    }

    if (requirements.whiteLabelRequired) {
      tasks.push({
        task: 'Setup white-label configuration',
        owner: 'Design',
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        priority: 'medium',
      });
    }

    return tasks;
  }

  private updateNextActions(
    onboarding: TenantOnboardingStatus,
  ): TenantOnboardingStatus['nextActions'] {
    // Filter out completed tasks and add new ones based on progress
    return onboarding.nextActions.filter((action) => {
      const now = new Date();
      return action.dueDate > now;
    });
  }

  private async scheduleOnboardingCheckpoints(tenantId: string): Promise<void> {
    // Mock implementation - would schedule automated check-ins
    this.logger.log(`Should schedule onboarding checkpoints for tenant ${tenantId}`);
  }

  private async notifyOnboardingComplete(tenantId: string, csmId: string): Promise<void> {
    // Mock implementation - would send notifications
    this.logger.log(`Onboarding completed for tenant ${tenantId}, CSM: ${csmId}`);
  }

  private async assessSSOHealth(
    tenantId: string,
  ): Promise<{ score: number; issues: string[]; recommendations: string[] }> {
    const providers = await this.ssoService.getSSOProviders(tenantId);
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (providers.length === 0) {
      issues.push('No SSO providers configured');
      recommendations.push('Configure at least one SSO provider');
    }

    const activeProviders = providers.filter((p) => p.enabled);
    if (activeProviders.length === 0 && providers.length > 0) {
      issues.push('All SSO providers are disabled');
      recommendations.push('Enable at least one SSO provider');
    }

    const score = providers.length > 0 && activeProviders.length > 0 ? 100 : 50;

    return { score, issues, recommendations };
  }

  private async assessComplianceHealth(
    tenantId: string,
  ): Promise<{ score: number; issues: string[]; recommendations: string[] }> {
    const policy = await this.complianceService.getDataRetentionPolicy(tenantId);
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!policy) {
      issues.push('No data retention policy configured');
      recommendations.push('Configure data retention policies');
    }

    if (policy && !policy.autoDeleteEnabled) {
      issues.push('Automatic data deletion is disabled');
      recommendations.push('Enable automatic data deletion for compliance');
    }

    const score = policy && policy.autoDeleteEnabled ? 100 : policy ? 75 : 25;

    return { score, issues, recommendations };
  }

  private async assessUsageHealth(
    tenantId: string,
  ): Promise<{ score: number; issues: string[]; recommendations: string[] }> {
    const analytics = await this.analyticsService.getUsageAnalytics(tenantId, 'month');
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (analytics.limits.exceeded.length > 0) {
      issues.push(`Usage limits exceeded for: ${analytics.limits.exceeded.join(', ')}`);
      recommendations.push('Consider upgrading your plan');
    }

    if (analytics.limits.approaching.length > 0) {
      recommendations.push('Monitor usage closely as you approach limits');
    }

    const score =
      analytics.limits.exceeded.length === 0
        ? analytics.limits.approaching.length === 0
          ? 100
          : 80
        : 50;

    return { score, issues, recommendations };
  }

  private async assessSupportHealth(
    tenantId: string,
  ): Promise<{ score: number; issues: string[]; recommendations: string[] }> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    const metrics = await this.supportService.getSupportMetrics(tenantId, startDate, new Date());

    const issues: string[] = [];
    const recommendations: string[] = [];

    if (metrics.metrics.averageResponseTime > 8) {
      issues.push('Support response times are above target');
      recommendations.push('Consider priority support upgrade');
    }

    if (metrics.metrics.escalationRate > 0.2) {
      issues.push('High ticket escalation rate');
      recommendations.push('Review common issues and improve documentation');
    }

    const score =
      metrics.metrics.averageResponseTime <= 4 && metrics.metrics.escalationRate <= 0.1
        ? 100
        : metrics.metrics.averageResponseTime <= 8 && metrics.metrics.escalationRate <= 0.2
          ? 80
          : 60;

    return { score, issues, recommendations };
  }
}
