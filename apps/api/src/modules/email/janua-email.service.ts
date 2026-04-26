/**
 * Janua Email Service
 *
 * Wrapper service for centralized email delivery via Janua's Resend integration.
 * This provides a unified email service across all MADFAM applications.
 *
 * Benefits:
 * - Centralized email templates and branding
 * - Single Resend API key management
 * - Consistent logging and analytics
 * - Better deliverability through shared domain reputation
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

// ============================================================================
// Types
// ============================================================================

export interface JanuaEmailResponse {
  success: boolean;
  message_id?: string;
  error?: string;
}

export interface JanuaBatchEmailResponse {
  success: boolean;
  sent_count: number;
  failed_count: number;
  results: JanuaEmailResponse[];
}

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded
  content_type?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from_email?: string;
  from_name?: string;
  reply_to?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
  tags?: Record<string, string>;
}

export interface SendTemplateEmailOptions {
  to: string | string[];
  template: string;
  variables: Record<string, any>;
  subject?: string;
  from_email?: string;
  from_name?: string;
  reply_to?: string;
  tags?: Record<string, string>;
}

export interface BatchEmailItem {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  tags?: Record<string, string>;
}

// ============================================================================
// Template Constants (matching Janua's registry)
// ============================================================================

export const JANUA_TEMPLATES = {
  // Authentication
  AUTH_WELCOME: 'auth/welcome',
  AUTH_PASSWORD_RESET: 'auth/password-reset',
  AUTH_EMAIL_VERIFICATION: 'auth/email-verification',
  AUTH_MAGIC_LINK: 'auth/magic-link',

  // Billing
  BILLING_INVOICE: 'billing/invoice',
  BILLING_PAYMENT_SUCCESS: 'billing/payment-success',
  BILLING_PAYMENT_FAILED: 'billing/payment-failed',
  BILLING_SUBSCRIPTION_CREATED: 'billing/subscription-created',
  BILLING_SUBSCRIPTION_CANCELED: 'billing/subscription-canceled',

  // Invitations
  INVITATION_TEAM: 'invitation/team',
  INVITATION_ORGANIZATION: 'invitation/organization',

  // Notifications
  NOTIFICATION_ALERT: 'notification/alert',
  NOTIFICATION_UPDATE: 'notification/update',

  // Transactional (Digifab-specific)
  TRANSACTIONAL_QUOTE_READY: 'transactional/quote-ready',
  TRANSACTIONAL_ORDER_CONFIRMATION: 'transactional/order-confirmation',
} as const;

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class JanuaEmailService implements OnModuleInit {
  private readonly logger = new Logger(JanuaEmailService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly sourceApp = 'digifab-quoting';
  private isAvailable = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>('JANUA_API_URL', 'https://api.janua.dev');
    this.apiKey = this.configService.get<string>('JANUA_INTERNAL_API_KEY', '');
  }

  async onModuleInit() {
    await this.checkHealth();
  }

  /**
   * Check if Janua email service is available
   */
  async checkHealth(): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn('JANUA_INTERNAL_API_KEY not configured, Janua email service disabled');
      this.isAvailable = false;
      return false;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/api/v1/internal/email/health`, {
          headers: this.getHeaders(),
          timeout: 5000,
        }),
      );

      this.isAvailable = response.data?.status === 'healthy';
      this.logger.log(`Janua email service: ${this.isAvailable ? 'available' : 'unavailable'}`);
      return this.isAvailable;
    } catch (error) {
      this.logger.warn('Janua email service health check failed, will use fallback');
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Check if Janua email is available (for conditional routing)
   */
  get available(): boolean {
    return this.isAvailable;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': this.apiKey,
    };
  }

  /**
   * Send a custom HTML email
   */
  async sendEmail(
    options: SendEmailOptions,
    sourceType: string = 'notification',
  ): Promise<JanuaEmailResponse> {
    try {
      const recipients = Array.isArray(options.to) ? options.to : [options.to];

      const payload = {
        to: recipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
        from_email: options.from_email,
        from_name: options.from_name,
        reply_to: options.reply_to,
        cc: options.cc,
        bcc: options.bcc,
        attachments: options.attachments,
        tags: options.tags,
        source_app: this.sourceApp,
        source_type: sourceType,
      };

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v1/internal/email/send`, payload, {
          headers: this.getHeaders(),
          timeout: 30000,
        }),
      );

      if (response.data.success) {
        this.logger.log(`Email sent via Janua: to=${recipients.join(',')}, type=${sourceType}`);
      }

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const errorMessage =
        axiosError.response?.data?.['detail'] || axiosError.message || 'Unknown error';

      this.logger.error(`Failed to send email via Janua: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send email using a registered template
   */
  async sendTemplateEmail(
    options: SendTemplateEmailOptions,
    sourceType: string = 'notification',
  ): Promise<JanuaEmailResponse> {
    try {
      const recipients = Array.isArray(options.to) ? options.to : [options.to];

      const payload = {
        to: recipients,
        template: options.template,
        variables: options.variables,
        subject: options.subject,
        from_email: options.from_email,
        from_name: options.from_name,
        reply_to: options.reply_to,
        tags: options.tags,
        source_app: this.sourceApp,
        source_type: sourceType,
      };

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v1/internal/email/send-template`, payload, {
          headers: this.getHeaders(),
          timeout: 30000,
        }),
      );

      if (response.data.success) {
        this.logger.log(
          `Template email sent via Janua: to=${recipients.join(',')}, template=${options.template}`,
        );
      }

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const errorMessage =
        axiosError.response?.data?.['detail'] || axiosError.message || 'Unknown error';

      this.logger.error(`Failed to send template email via Janua: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send multiple emails in batch
   */
  async sendBatchEmails(
    emails: BatchEmailItem[],
    sourceType: string = 'batch',
  ): Promise<JanuaBatchEmailResponse> {
    try {
      const payload = {
        emails,
        source_app: this.sourceApp,
        source_type: sourceType,
      };

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/v1/internal/email/send-batch`, payload, {
          headers: this.getHeaders(),
          timeout: 60000,
        }),
      );

      this.logger.log(
        `Batch emails sent via Janua: sent=${response.data.sent_count}, failed=${response.data.failed_count}`,
      );

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const errorMessage =
        axiosError.response?.data?.['detail'] || axiosError.message || 'Unknown error';

      this.logger.error(`Failed to send batch emails via Janua: ${errorMessage}`);
      return {
        success: false,
        sent_count: 0,
        failed_count: emails.length,
        results: emails.map(() => ({ success: false, error: errorMessage })),
      };
    }
  }

  // ============================================================================
  // Digifab-Quoting-specific convenience methods
  // ============================================================================

  /**
   * Send quote ready notification
   */
  async sendQuoteReadyEmail(
    email: string,
    quoteNumber: string,
    totalAmount: number,
    currency: string,
    validUntil?: string,
    itemCount?: number,
  ): Promise<JanuaEmailResponse> {
    const viewUrl = `${this.configService.get('WEB_URL', 'https://app.digifab.mx')}/quotes/${quoteNumber}`;

    return this.sendTemplateEmail(
      {
        to: email,
        template: JANUA_TEMPLATES.TRANSACTIONAL_QUOTE_READY,
        variables: {
          quote_number: quoteNumber,
          total_amount: `${currency} ${totalAmount.toFixed(2)}`,
          view_url: viewUrl,
          valid_until: validUntil,
          item_count: itemCount,
        },
      },
      'quote',
    );
  }

  /**
   * Send order confirmation
   */
  async sendOrderConfirmationEmail(
    email: string,
    orderNumber: string,
    totalAmount: number,
    currency: string,
    trackingUrl?: string,
    deliveryDate?: string,
  ): Promise<JanuaEmailResponse> {
    return this.sendTemplateEmail(
      {
        to: email,
        template: JANUA_TEMPLATES.TRANSACTIONAL_ORDER_CONFIRMATION,
        variables: {
          order_number: orderNumber,
          total_amount: `${currency} ${totalAmount.toFixed(2)}`,
          tracking_url: trackingUrl,
          delivery_date: deliveryDate,
        },
      },
      'order',
    );
  }

  /**
   * Send invoice notification
   */
  async sendInvoiceEmail(
    email: string,
    invoiceNumber: string,
    amount: number,
    currency: string,
    dueDate: string,
    invoiceUrl?: string,
  ): Promise<JanuaEmailResponse> {
    return this.sendTemplateEmail(
      {
        to: email,
        template: JANUA_TEMPLATES.BILLING_INVOICE,
        variables: {
          invoice_number: invoiceNumber,
          amount: `${currency} ${amount.toFixed(2)}`,
          due_date: dueDate,
          invoice_url:
            invoiceUrl || `${this.configService.get('WEB_URL')}/invoices/${invoiceNumber}`,
          company_name: 'Digifab',
        },
      },
      'billing',
    );
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentSuccessEmail(
    email: string,
    amount: number,
    currency: string,
    transactionId: string,
    receiptUrl?: string,
  ): Promise<JanuaEmailResponse> {
    return this.sendTemplateEmail(
      {
        to: email,
        template: JANUA_TEMPLATES.BILLING_PAYMENT_SUCCESS,
        variables: {
          amount: `${currency} ${amount.toFixed(2)}`,
          transaction_id: transactionId,
          receipt_url: receiptUrl,
        },
      },
      'billing',
    );
  }

  /**
   * Send payment failed notification
   */
  async sendPaymentFailedEmail(
    email: string,
    amount: number,
    currency: string,
    reason: string,
  ): Promise<JanuaEmailResponse> {
    return this.sendTemplateEmail(
      {
        to: email,
        template: JANUA_TEMPLATES.BILLING_PAYMENT_FAILED,
        variables: {
          amount: `${currency} ${amount.toFixed(2)}`,
          reason,
          retry_url: `${this.configService.get('WEB_URL')}/billing`,
          support_email: 'soporte@digifab.mx',
        },
      },
      'billing',
    );
  }

  /**
   * Send team invitation
   */
  async sendTeamInvitationEmail(
    email: string,
    inviterName: string,
    teamName: string,
    invitationLink: string,
    role?: string,
    message?: string,
  ): Promise<JanuaEmailResponse> {
    return this.sendTemplateEmail(
      {
        to: email,
        template: JANUA_TEMPLATES.INVITATION_TEAM,
        variables: {
          inviter_name: inviterName,
          team_name: teamName,
          invitation_link: invitationLink,
          role: role || 'member',
          message,
          expires_in: '7 days',
        },
      },
      'invitation',
    );
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, userName: string): Promise<JanuaEmailResponse> {
    return this.sendTemplateEmail(
      {
        to: email,
        template: JANUA_TEMPLATES.AUTH_WELCOME,
        variables: {
          user_name: userName,
          app_name: 'Digifab',
          login_url: this.configService.get('WEB_URL', 'https://app.digifab.mx'),
          support_email: 'soporte@digifab.mx',
        },
      },
      'auth',
    );
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    userName: string,
    resetToken: string,
  ): Promise<JanuaEmailResponse> {
    const resetUrl = `${this.configService.get('WEB_URL')}/reset-password?token=${resetToken}`;

    return this.sendTemplateEmail(
      {
        to: email,
        template: JANUA_TEMPLATES.AUTH_PASSWORD_RESET,
        variables: {
          user_name: userName,
          reset_link: resetUrl,
          expires_in: '1 hora',
          app_name: 'Digifab',
        },
      },
      'auth',
    );
  }
}
