import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable } from '@nestjs/common';
import { JobType, EmailNotificationJobData, JobResult } from '../interfaces/job.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { compile } from 'handlebars';
import { getErrorMessage, toError } from '@/common/utils/error-handling';

/**
 * Centralized email color palette for notification templates.
 * Email clients do not support CSS variables, so inline hex is required.
 * Keep every hex value here so brand changes are a single-file edit.
 */
const EMAIL_COLORS = {
  text: '#333',
  textFooter: '#6c757d',
  backgroundLight: '#f8f9fa',
  border: '#e9ecef',
  // Per-template header backgrounds
  quoteReadyHeader: '#f8f9fa',
  quoteAcceptedHeader: '#28a745',
  quoteExpiredHeader: '#ffc107',
  orderShippedHeader: '#17a2b8',
  // Shared button / accent
  button: '#007bff',
} as const;

interface EmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

type HandlebarsTemplateDelegate = (context: Record<string, unknown>, options?: Record<string, unknown>) => string;

@Processor(JobType.EMAIL_NOTIFICATION)
@Injectable()
export class EmailNotificationProcessor {
  private transporter: nodemailer.Transporter;
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private readonly defaultFrom: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    // Initialize email transporter
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('email.smtp.host'),
      port: this.configService.get('email.smtp.port'),
      secure: this.configService.get('email.smtp.secure', false),
      auth: {
        user: this.configService.get('email.smtp.user'),
        pass: this.configService.get('email.smtp.pass'),
      },
    });

    this.defaultFrom = this.configService.get(
      'email.defaultFrom',
      'Cotiza Studio Quoting <noreply@cotiza.studio>',
    );

    // Load email templates
    this.loadTemplates();
  }

  @Process()
  async handleEmailNotification(
    job: Job<EmailNotificationJobData>,
  ): Promise<JobResult<EmailResult>> {
    const startTime = Date.now();
    const { type, recipientEmail, recipientName, templateData, attachments, tenantId } = job.data;

    try {
      this.logger.log(`Sending ${type} email to ${recipientEmail}`, {
        jobId: job.id,
        tenantId,
        type,
      });

      // Get template
      const template = this.templates.get(type);
      if (!template) {
        throw new Error(`Email template ${type} not found`);
      }

      // Prepare template data with defaults
      const enrichedData = {
        recipientName: recipientName || 'Customer',
        year: new Date().getFullYear(),
        supportEmail: this.configService.get('email.supportEmail', 'support@cotiza.studio'),
        websiteUrl: this.configService.get('app.url', 'https://app.cotiza.studio'),
        ...templateData,
      };

      // Generate HTML content
      const html = template(enrichedData);

      // Prepare email options
      const mailOptions: nodemailer.SendMailOptions = {
        from: this.defaultFrom,
        to: recipientEmail,
        subject: this.getEmailSubject(type, enrichedData),
        html,
        attachments: await this.prepareAttachments(attachments),
      };

      // Send email
      const result = await this.transporter.sendMail(mailOptions);

      this.logger.log(`Email sent successfully`, {
        jobId: job.id,
        messageId: result.messageId,
        recipient: recipientEmail,
        type,
      });

      return {
        success: true,
        data: {
          messageId: result.messageId,
          accepted: result.accepted as string[],
          rejected: result.rejected as string[],
          response: result.response,
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(`Failed to send email`, toError(error));

      return {
        success: false,
        error: {
          code: 'EMAIL_SEND_FAILED',
          message: getErrorMessage(error),
          details: error,
        },
        duration: Date.now() - startTime,
      };
    }
  }

  @OnQueueActive()
  onActive(job: Job<EmailNotificationJobData>) {
    this.logger.log(`Email notification job ${job.id} started`, {
      type: job.data.type,
      recipient: job.data.recipientEmail,
    });
  }

  @OnQueueCompleted()
  onComplete(job: Job<EmailNotificationJobData>, result: JobResult<EmailResult>) {
    this.logger.log(`Email notification job ${job.id} completed`, {
      type: job.data.type,
      recipient: job.data.recipientEmail,
      success: result.success,
    });
  }

  @OnQueueFailed()
  onFailed(job: Job<EmailNotificationJobData>, err: Error) {
    this.logger.error(`Email notification job ${job.id} failed`, toError(err));
  }

  private loadTemplates(): void {
    // In production, these would be loaded from files or a template service
    // For now, using inline templates
    const templates = {
      'quote-ready': `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: ${EMAIL_COLORS.text}; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${EMAIL_COLORS.quoteReadyHeader}; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background-color: ${EMAIL_COLORS.button};
              color: white;
              text-decoration: none;
              border-radius: 4px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid ${EMAIL_COLORS.border};
              text-align: center;
              color: ${EMAIL_COLORS.textFooter};
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Quote is Ready!</h1>
            </div>
            <div class="content">
              <p>Hi {{recipientName}},</p>
              <p>Great news! Your quote #{{quoteNumber}} is ready for review.</p>
              <p><strong>Quote Summary:</strong></p>
              <ul>
                <li>Items: {{itemCount}}</li>
                <li>Total: {{currency}} {{total}}</li>
                <li>Valid until: {{validUntil}}</li>
              </ul>
              <p>Click the button below to view and accept your quote:</p>
              <p style="text-align: center;">
                <a href="{{quoteUrl}}" class="button">View Quote</a>
              </p>
              <p>If you have any questions, feel free to contact us at {{supportEmail}}.</p>
              <p>Best regards,<br>The Cotiza Studio Team</p>
            </div>
            <div class="footer">
              <p>&copy; {{year}} Cotiza Studio. All rights reserved.</p>
              <p>This email was sent to {{recipientEmail}}</p>
            </div>
          </div>
        </body>
        </html>
      `,
      'quote-accepted': `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: ${EMAIL_COLORS.text}; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${EMAIL_COLORS.quoteAcceptedHeader}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .order-details {
              background-color: ${EMAIL_COLORS.backgroundLight};
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid ${EMAIL_COLORS.border};
              text-align: center;
              color: ${EMAIL_COLORS.textFooter};
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Confirmed!</h1>
            </div>
            <div class="content">
              <p>Hi {{recipientName}},</p>
              <p>Thank you for your order! We've received your payment and your order is now being processed.</p>
              <div class="order-details">
                <h3>Order Details:</h3>
                <p><strong>Order Number:</strong> {{orderNumber}}</p>
                <p><strong>Quote Number:</strong> {{quoteNumber}}</p>
                <p><strong>Total Paid:</strong> {{currency}} {{totalPaid}}</p>
                <p><strong>Estimated Delivery:</strong> {{estimatedDelivery}}</p>
              </div>
              <p>We'll send you another email when your order ships with tracking information.</p>
              <p>If you have any questions about your order, please contact us at {{supportEmail}}.</p>
              <p>Thank you for choosing Cotiza Studio!</p>
              <p>Best regards,<br>The Cotiza Studio Team</p>
            </div>
            <div class="footer">
              <p>&copy; {{year}} Cotiza Studio. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      'quote-expired': `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: ${EMAIL_COLORS.text}; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${EMAIL_COLORS.quoteExpiredHeader}; color: ${EMAIL_COLORS.text}; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background-color: ${EMAIL_COLORS.button};
              color: white;
              text-decoration: none;
              border-radius: 4px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid ${EMAIL_COLORS.border};
              text-align: center;
              color: ${EMAIL_COLORS.textFooter};
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Quote Has Expired</h1>
            </div>
            <div class="content">
              <p>Hi {{recipientName}},</p>
              <p>Your quote #{{quoteNumber}} has expired as of {{expirationDate}}.</p>
              <p>Don't worry! You can easily request a new quote with updated pricing.</p>
              <p style="text-align: center;">
                <a href="{{newQuoteUrl}}" class="button">Request New Quote</a>
              </p>
              <p>If you need assistance or have questions, please contact us at {{supportEmail}}.</p>
              <p>Best regards,<br>The Cotiza Studio Team</p>
            </div>
            <div class="footer">
              <p>&copy; {{year}} Cotiza Studio. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      'order-shipped': `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: ${EMAIL_COLORS.text}; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${EMAIL_COLORS.orderShippedHeader}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .tracking-info {
              background-color: ${EMAIL_COLORS.backgroundLight};
              padding: 15px;
              border-radius: 4px;
              margin: 20px 0;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background-color: ${EMAIL_COLORS.button};
              color: white;
              text-decoration: none;
              border-radius: 4px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid ${EMAIL_COLORS.border};
              text-align: center;
              color: ${EMAIL_COLORS.textFooter};
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Order Has Shipped!</h1>
            </div>
            <div class="content">
              <p>Hi {{recipientName}},</p>
              <p>Great news! Your order #{{orderNumber}} has been shipped and is on its way to you.</p>
              <div class="tracking-info">
                <h3>Shipping Information:</h3>
                <p><strong>Carrier:</strong> {{carrier}}</p>
                <p><strong>Tracking Number:</strong> {{trackingNumber}}</p>
                <p><strong>Estimated Delivery:</strong> {{estimatedDelivery}}</p>
              </div>
              <p style="text-align: center;">
                <a href="{{trackingUrl}}" class="button">Track Your Package</a>
              </p>
              <p>If you have any questions about your shipment, please contact us at {{supportEmail}}.</p>
              <p>Thank you for your business!</p>
              <p>Best regards,<br>The Cotiza Studio Team</p>
            </div>
            <div class="footer">
              <p>&copy; {{year}} Cotiza Studio. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    for (const [type, templateHtml] of Object.entries(templates)) {
      this.templates.set(type as EmailNotificationJobData['type'], compile(templateHtml));
    }
  }

  private getEmailSubject(type: EmailNotificationJobData['type'], data: EmailNotificationJobData['templateData']): string {
    const subjects = {
      'quote-ready': `Your Quote #${data.quoteNumber} is Ready!`,
      'quote-accepted': `Order Confirmed - #${data.orderNumber}`,
      'quote-expired': `Quote #${data.quoteNumber} Has Expired`,
      'order-shipped': `Your Order #${data.orderNumber} Has Shipped!`,
    };

    return subjects[type] || 'Cotiza Studio Notification';
  }

  private async prepareAttachments(
    attachments?: EmailNotificationJobData['attachments'],
  ): Promise<nodemailer.SendMailOptions['attachments']> {
    if (!attachments || attachments.length === 0) {
      return [];
    }

    return attachments.map((attachment) => ({
      filename: attachment.filename,
      path: attachment.path,
      content: attachment.content,
    }));
  }
}
