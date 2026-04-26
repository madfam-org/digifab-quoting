import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { Role } from '@/common/enums';
import { TenantId } from '@/modules/tenant/decorators/tenant.decorator';
import { EnterpriseService } from './enterprise.service';
import { SSOService, SSOProvider, SSOProviderType } from './services/sso.service';
import { WhiteLabelService, WhiteLabelConfiguration } from './services/white-label.service';
import { ComplianceService } from './services/compliance.service';
import { DedicatedSupportService } from './services/dedicated-support.service';

@Controller('enterprise')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@ApiTags('enterprise')
export class EnterpriseController {
  constructor(
    private readonly enterpriseService: EnterpriseService,
    private readonly ssoService: SSOService,
    private readonly whiteLabelService: WhiteLabelService,
    private readonly complianceService: ComplianceService,
    private readonly dedicatedSupportService: DedicatedSupportService,
  ) {}

  // ==================== SSO MANAGEMENT ====================

  @Post('sso/providers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create SSO provider' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'SSO provider created' })
  async createSSOProvider(
    @TenantId() tenantId: string,
    @Body()
    providerData: {
      name: string;
      type: SSOProviderType;
      configuration: any;
      enabled?: boolean;
    },
  ) {
    const provider = await this.ssoService.createSSOProvider(tenantId, providerData);

    return {
      success: true,
      data: provider,
    };
  }

  @Get('sso/providers')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List SSO providers' })
  @ApiResponse({ status: HttpStatus.OK, description: 'SSO providers list' })
  async getSSOProviders(@TenantId() tenantId: string) {
    const providers = await this.ssoService.getSSOProviders(tenantId);

    return {
      success: true,
      data: providers,
    };
  }

  @Put('sso/providers/:providerId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update SSO provider' })
  @ApiResponse({ status: HttpStatus.OK, description: 'SSO provider updated' })
  async updateSSOProvider(
    @TenantId() tenantId: string,
    @Param('providerId') providerId: string,
    @Body() updates: Partial<SSOProvider>,
  ) {
    const provider = await this.ssoService.updateSSOProvider(tenantId, providerId, updates);

    return {
      success: true,
      data: provider,
    };
  }

  @Delete('sso/providers/:providerId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete SSO provider' })
  @ApiResponse({ status: HttpStatus.OK, description: 'SSO provider deleted' })
  async deleteSSOProvider(@TenantId() tenantId: string, @Param('providerId') providerId: string) {
    await this.ssoService.deleteSSOProvider(tenantId, providerId);

    return {
      success: true,
      message: 'SSO provider deleted',
    };
  }

  @Post('sso/login/:providerId')
  @ApiOperation({ summary: 'Initiate SSO login' })
  @ApiResponse({ status: HttpStatus.OK, description: 'SSO login URL' })
  async initiateSSOLogin(
    @TenantId() tenantId: string,
    @Param('providerId') providerId: string,
    @Body() body: { redirectUrl?: string },
  ) {
    const result = await this.ssoService.initiateSSOLogin(tenantId, providerId, body.redirectUrl);

    return {
      success: true,
      data: result,
    };
  }

  @Post('sso/callback/:providerId')
  @ApiOperation({ summary: 'Handle SSO callback' })
  @ApiResponse({ status: HttpStatus.OK, description: 'SSO login result' })
  async handleSSOCallback(
    @TenantId() tenantId: string,
    @Param('providerId') providerId: string,
    @Body() callbackData: any,
  ) {
    const result = await this.ssoService.handleSSOCallback(tenantId, providerId, callbackData);

    return {
      success: true,
      data: result,
    };
  }

  // ==================== WHITE LABEL MANAGEMENT ====================

  @Post('white-label')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create white-label configuration' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'White-label configuration created' })
  async createWhiteLabelConfiguration(
    @TenantId() tenantId: string,
    @Body() config: Omit<WhiteLabelConfiguration, 'tenantId'>,
  ) {
    const configuration = await this.whiteLabelService.createWhiteLabelConfiguration({
      ...config,
      tenantId,
    });

    return {
      success: true,
      data: configuration,
    };
  }

  @Get('white-label')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get white-label configuration' })
  @ApiResponse({ status: HttpStatus.OK, description: 'White-label configuration' })
  async getWhiteLabelConfiguration(@TenantId() tenantId: string) {
    const configuration = await this.whiteLabelService.getWhiteLabelConfiguration(tenantId);

    return {
      success: true,
      data: configuration,
    };
  }

  @Put('white-label')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update white-label configuration' })
  @ApiResponse({ status: HttpStatus.OK, description: 'White-label configuration updated' })
  async updateWhiteLabelConfiguration(
    @TenantId() tenantId: string,
    @Body() updates: Partial<WhiteLabelConfiguration>,
  ) {
    const configuration = await this.whiteLabelService.updateWhiteLabelConfiguration(
      tenantId,
      updates,
    );

    return {
      success: true,
      data: configuration,
    };
  }

  @Post('white-label/branding/:assetType')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload branding asset' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Branding asset uploaded' })
  async uploadBrandingAsset(
    @TenantId() tenantId: string,
    @Param('assetType') assetType: 'logo' | 'logoSquare' | 'favicon' | 'watermark',
    @UploadedFile() file: Express.Multer.File,
  ) {
    const result = await this.whiteLabelService.uploadBrandingAsset(
      tenantId,
      assetType,
      file.buffer,
      file.mimetype,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Delete('white-label/branding/:assetType')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete branding asset' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Branding asset deleted' })
  async deleteBrandingAsset(
    @TenantId() tenantId: string,
    @Param('assetType') assetType: 'logo' | 'logoSquare' | 'favicon' | 'watermark',
  ) {
    await this.whiteLabelService.deleteBrandingAsset(tenantId, assetType);

    return {
      success: true,
      message: 'Branding asset deleted',
    };
  }

  @Post('white-label/domain/setup')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Setup custom domain' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Domain setup initiated' })
  async setupCustomDomain(@TenantId() tenantId: string) {
    const config = await this.whiteLabelService.getWhiteLabelConfiguration(tenantId);
    if (!config) {
      return {
        success: false,
        error: 'White-label configuration not found',
      };
    }

    const result = await this.whiteLabelService.initiateDomainSetup(tenantId, config.domain);

    return {
      success: true,
      data: result,
    };
  }

  @Post('white-label/domain/verify')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Verify custom domain' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Domain verification result' })
  async verifyCustomDomain(@TenantId() tenantId: string) {
    const result = await this.whiteLabelService.verifyCustomDomain(tenantId);

    return {
      success: true,
      data: result,
    };
  }

  // ==================== COMPLIANCE & AUDIT ====================

  @Get('compliance/audit-logs')
  @Roles(Role.ADMIN, Role.COMPLIANCE)
  @ApiOperation({ summary: 'Get audit logs' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Audit logs' })
  async getAuditLogs(
    @TenantId() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('action') action?: string,
    @Query('user') user?: string,
    @Query('limit') limit: string = '100',
  ) {
    const logs = await this.complianceService.getAuditLogs(tenantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      action,
      user,
      limit: parseInt(limit),
    });

    return {
      success: true,
      data: logs,
    };
  }

  @Get('compliance/data-export')
  @Roles(Role.ADMIN, Role.COMPLIANCE)
  @ApiOperation({ summary: 'Export tenant data for compliance' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Data export initiated' })
  async exportTenantData(
    @TenantId() tenantId: string,
    @Query('format') format: 'json' | 'csv' = 'json',
  ) {
    const exportId = await this.complianceService.initiateDataExport(tenantId, format);

    return {
      success: true,
      data: {
        exportId,
        message: 'Data export initiated. You will receive an email when complete.',
      },
    };
  }

  @Post('compliance/data-retention')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Configure data retention policies' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Data retention policy updated' })
  async configureDataRetention(
    @TenantId() tenantId: string,
    @Body()
    policy: {
      auditLogRetentionDays: number;
      fileRetentionDays: number;
      inactiveUserRetentionDays: number;
      autoDeleteEnabled: boolean;
    },
  ) {
    await this.complianceService.configureDataRetention(tenantId, policy);

    return {
      success: true,
      message: 'Data retention policy updated',
    };
  }

  // ==================== DEDICATED SUPPORT ====================

  @Post('support/tickets')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create support ticket' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Support ticket created' })
  async createSupportTicket(
    @TenantId() tenantId: string,
    @Body()
    ticket: {
      subject: string;
      description: string;
      priority: 'low' | 'medium' | 'high' | 'urgent';
      category: string;
    },
  ) {
    const supportTicket = await this.dedicatedSupportService.createTicket(tenantId, ticket);

    return {
      success: true,
      data: supportTicket,
    };
  }

  @Get('support/tickets')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List support tickets' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Support tickets' })
  async getSupportTickets(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
  ) {
    const tickets = await this.dedicatedSupportService.getTickets(tenantId, { status, priority });

    return {
      success: true,
      data: tickets,
    };
  }

  @Get('support/tickets/:ticketId')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get support ticket details' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Support ticket details' })
  async getSupportTicket(@TenantId() tenantId: string, @Param('ticketId') ticketId: string) {
    const ticket = await this.dedicatedSupportService.getTicket(tenantId, ticketId);

    return {
      success: true,
      data: ticket,
    };
  }

  @Post('support/tickets/:ticketId/messages')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Add message to support ticket' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Message added' })
  async addTicketMessage(
    @TenantId() tenantId: string,
    @Param('ticketId') ticketId: string,
    @Body() message: { content: string; attachments?: string[] },
  ) {
    await this.dedicatedSupportService.addTicketMessage(tenantId, ticketId, message);

    return {
      success: true,
      message: 'Message added to ticket',
    };
  }

  // ==================== ENTERPRISE ANALYTICS ====================

  @Get('analytics/overview')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get enterprise analytics overview' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Enterprise analytics' })
  async getEnterpriseAnalytics(@TenantId() tenantId: string) {
    const analytics = await this.enterpriseService.getEnterpriseAnalytics(tenantId);

    return {
      success: true,
      data: analytics,
    };
  }

  @Get('analytics/users')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get user analytics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'User analytics' })
  async getUserAnalytics(
    @TenantId() tenantId: string,
    @Query('period') period: 'week' | 'month' | 'quarter' = 'month',
  ) {
    const analytics = await this.enterpriseService.getUserAnalytics(tenantId, period);

    return {
      success: true,
      data: analytics,
    };
  }

  @Get('analytics/usage')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get usage analytics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Usage analytics' })
  async getUsageAnalytics(
    @TenantId() tenantId: string,
    @Query('period') period: 'week' | 'month' | 'quarter' = 'month',
  ) {
    const analytics = await this.enterpriseService.getUsageAnalytics(tenantId, period);

    return {
      success: true,
      data: analytics,
    };
  }
}
