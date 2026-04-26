import { Controller, Get, Post, Body, Param, Query, UseGuards, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import {
  ConversionTrackingService,
  ConversionAction,
} from './services/conversion-tracking.service';
import { UpgradePromptService } from './services/upgrade-prompt.service';

@Controller('conversion')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('conversion')
export class ConversionController {
  constructor(
    private readonly conversionTracking: ConversionTrackingService,
    private readonly upgradePromptService: UpgradePromptService,
  ) {}

  @Post('track')
  @ApiOperation({ summary: 'Track user conversion action' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Action tracked successfully',
  })
  async trackAction(
    @CurrentUser('id') userId: string,
    @Body() body: { action: ConversionAction; context?: Record<string, unknown> },
  ) {
    await this.conversionTracking.trackAction(body.action, body.context || {});

    return {
      success: true,
      message: 'Action tracked successfully',
    };
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Get user conversion funnel status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversion funnel data',
  })
  async getFunnel(@CurrentUser('id') userId: string) {
    const funnel = await this.conversionTracking.getConversionFunnel(userId);
    const metrics = await this.conversionTracking.getFunnelMetrics(userId);

    return {
      success: true,
      data: {
        funnel,
        metrics,
      },
    };
  }

  @Get('prompts')
  @ApiOperation({ summary: 'Get upgrade prompts for user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Available upgrade prompts',
  })
  @ApiQuery({
    name: 'context',
    required: false,
    description: 'Context for prompts (dashboard, quotes, files, billing)',
  })
  async getUpgradePrompts(
    @CurrentUser('id') userId: string,
    @Query('context') context: 'dashboard' | 'quotes' | 'files' | 'billing' = 'dashboard',
  ) {
    const prompts = await this.upgradePromptService.getUpgradePrompts(userId, context);

    return {
      success: true,
      data: prompts,
    };
  }

  @Post('prompts/:promptId/shown')
  @ApiOperation({ summary: 'Mark prompt as shown to user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Prompt marked as shown',
  })
  async markPromptShown(
    @CurrentUser('id') userId: string,
    @Param('promptId') promptId: string,
    @Body() body: { prompt: any },
  ) {
    await this.upgradePromptService.markPromptShown(userId, promptId, body.prompt);

    return {
      success: true,
      message: 'Prompt marked as shown',
    };
  }

  @Post('prompts/:promptId/clicked')
  @ApiOperation({ summary: 'Mark prompt as clicked by user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Prompt marked as clicked',
  })
  async markPromptClicked(
    @CurrentUser('id') userId: string,
    @Param('promptId') promptId: string,
    @Body() body: { prompt: any },
  ) {
    await this.upgradePromptService.markPromptClicked(userId, promptId, body.prompt);

    // Track conversion action
    await this.conversionTracking.trackAction(ConversionAction.CLICKED_UPGRADE, {
      promptId,
      promptType: body.prompt.type,
    });

    return {
      success: true,
      message: 'Prompt marked as clicked',
    };
  }

  @Post('prompts/:promptId/dismissed')
  @ApiOperation({ summary: 'Mark prompt as dismissed by user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Prompt marked as dismissed',
  })
  async markPromptDismissed(
    @CurrentUser('id') userId: string,
    @Param('promptId') promptId: string,
    @Body() body: { prompt: any },
  ) {
    await this.upgradePromptService.markPromptDismissed(userId, promptId, body.prompt);

    return {
      success: true,
      message: 'Prompt marked as dismissed',
    };
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get conversion analytics for user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversion analytics data',
  })
  async getAnalytics(@CurrentUser('id') userId: string) {
    const funnel = await this.conversionTracking.getConversionFunnel(userId);
    const triggers = await this.conversionTracking.getUpgradeTriggers(userId, 10);

    const analytics = {
      conversionStage: funnel?.stage || 'visitor',
      conversionScore: funnel?.score || 0,
      conversionProbability: funnel?.conversionProbability || 0,
      daysActive: funnel?.daysActive || 0,
      actionCount: funnel?.actions.length || 0,
      triggerCount: triggers.length,
      lastActivity: funnel?.lastActivity || null,
    };

    return {
      success: true,
      data: analytics,
    };
  }

  @Get('triggers')
  @ApiOperation({ summary: 'Get upgrade triggers for user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Active upgrade triggers',
  })
  async getTriggers(@CurrentUser('id') userId: string) {
    const triggers = await this.conversionTracking.getUpgradeTriggers(userId, 10);

    return {
      success: true,
      data: triggers,
    };
  }

  // Quick action tracking endpoints for common actions
  @Post('track/signup')
  @ApiOperation({ summary: 'Track user signup completion' })
  async trackSignup(@CurrentUser('id') userId: string) {
    await this.conversionTracking.trackAction(ConversionAction.CREATED_ACCOUNT);
    return { success: true };
  }

  @Post('track/first-quote')
  @ApiOperation({ summary: 'Track first quote creation' })
  async trackFirstQuote(@CurrentUser('id') userId: string, @Body() body: { quoteId: string }) {
    await this.conversionTracking.trackAction(ConversionAction.CREATED_FIRST_QUOTE, body);
    return { success: true };
  }

  @Post('track/file-upload')
  @ApiOperation({ summary: 'Track first file upload' })
  async trackFileUpload(
    @CurrentUser('id') userId: string,
    @Body() body: { fileId: string; fileType: string },
  ) {
    await this.conversionTracking.trackAction(ConversionAction.UPLOADED_FIRST_FILE, body);
    return { success: true };
  }

  @Post('track/usage-limit')
  @ApiOperation({ summary: 'Track usage limit hit' })
  async trackUsageLimit(
    @CurrentUser('id') userId: string,
    @Body() body: { eventType: string; limit: number; used: number },
  ) {
    await this.conversionTracking.trackAction(ConversionAction.HIT_USAGE_LIMIT, body);
    return { success: true };
  }

  @Post('track/login')
  @ApiOperation({ summary: 'Track user login (for return users)' })
  async trackLogin(@CurrentUser('id') userId: string, @Body() body: { loginCount?: number }) {
    await this.conversionTracking.trackAction(ConversionAction.LOGGED_IN_AGAIN, body);
    return { success: true };
  }

  @Post('track/pdf-download')
  @ApiOperation({ summary: 'Track PDF quote download' })
  async trackPdfDownload(
    @CurrentUser('id') userId: string,
    @Body() body: { quoteId: string; downloadCount?: number },
  ) {
    await this.conversionTracking.trackAction(ConversionAction.DOWNLOADED_PDF, body);
    return { success: true };
  }

  @Post('track/quote-share')
  @ApiOperation({ summary: 'Track quote sharing' })
  async trackQuoteShare(
    @CurrentUser('id') userId: string,
    @Body() body: { quoteId: string; method: string },
  ) {
    await this.conversionTracking.trackAction(ConversionAction.SHARED_QUOTE, body);
    return { success: true };
  }

  @Post('track/advanced-feature')
  @ApiOperation({ summary: 'Track advanced feature usage' })
  async trackAdvancedFeature(@CurrentUser('id') userId: string, @Body() body: { feature: string }) {
    await this.conversionTracking.trackAction(ConversionAction.USED_ADVANCED_FEATURE, body);
    return { success: true };
  }
}
