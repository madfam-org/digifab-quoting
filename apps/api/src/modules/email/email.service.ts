import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { I18nService, Locale } from '../i18n/i18n.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Centralized email color palette for Cotiza Studio templates.
 * Email clients do not support CSS variables, so inline hex is required.
 * Keep every hex value here so brand changes are a single-file edit.
 */
const EMAIL_COLORS = {
  text: '#333',
  textFooter: '#586069',
  border: '#e1e4e8',
  backgroundFooter: '#f6f8fa',
  gradientStart: '#667eea',
  gradientEnd: '#764ba2',
  button: '#667eea',
  buttonHover: '#5a67d8',
} as const;

interface EmailParams {
  [key: string]: string | number;
}

interface EmailOptions {
  to: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer;
    contentType?: string;
  }>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly defaultFrom: string;

  constructor(
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
    private readonly prisma: PrismaService,
  ) {
    this.defaultFrom = this.config.get('EMAIL_FROM') || 'noreply@cotiza.studio';

    // Configure email transporter
    const emailProvider = this.config.get('EMAIL_PROVIDER', 'smtp');

    if (emailProvider === 'sendgrid') {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: this.config.get('SENDGRID_API_KEY'),
        },
      });
    } else if (emailProvider === 'ses') {
      // AWS SES configuration
      const aws = require('aws-sdk');
      aws.config.update({
        accessKeyId: this.config.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY'),
        region: this.config.get('AWS_REGION', 'us-east-1'),
      });
      this.transporter = nodemailer.createTransport({
        SES: new aws.SES({ apiVersion: '2010-12-01' }),
      });
    } else {
      // Default SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: this.config.get('SMTP_HOST', 'localhost'),
        port: this.config.get('SMTP_PORT', 587),
        secure: this.config.get('SMTP_SECURE', false),
        auth: {
          user: this.config.get('SMTP_USER'),
          pass: this.config.get('SMTP_PASS'),
        },
      });
    }
  }

  /**
   * Send a localized email template
   */
  async sendTemplate(
    templateName: string,
    options: EmailOptions,
    params?: EmailParams,
    locale: Locale = 'es',
  ): Promise<void> {
    try {
      // Get localized email content
      const { subject, body } = await this.i18n.translateEmail(templateName, locale, params);

      // Get HTML template with localized content
      const html = await this.renderEmailTemplate(templateName, body, locale);

      // Send email
      await this.send({
        ...options,
        subject,
        html,
      });

      this.logger.log(`Email sent: ${templateName} to ${options.to} in ${locale}`);
    } catch (error) {
      this.logger.error(`Failed to send email template: ${templateName}`, error);
      throw error;
    }
  }

  /**
   * Send quote created notification
   */
  async sendQuoteCreated(quoteId: string, userEmail: string, locale: Locale = 'es'): Promise<void> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { items: true },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    const params = {
      quoteNumber: quote.number,
      itemCount: String(quote.items.length),
      total: this.i18n.formatCurrency(Number(quote.total), locale, quote.currency),
      validUntil: this.i18n.formatDate(quote.validUntil, locale),
      viewUrl: `${this.config.get('FRONTEND_URL')}/quote/${quoteId}`,
    };

    await this.sendTemplate('quote.created', { to: userEmail }, params, locale);
  }

  /**
   * Send quote accepted notification
   */
  async sendQuoteAccepted(
    quoteId: string,
    userEmail: string,
    locale: Locale = 'es',
  ): Promise<void> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: true,
        orders: { take: 1 },
      },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    const order = quote.orders[0];
    const params = {
      quoteNumber: quote.number,
      orderNumber: order?.orderNumber || 'N/A',
      total: this.i18n.formatCurrency(Number(quote.total), locale, quote.currency),
      trackingUrl: `${this.config.get('FRONTEND_URL')}/orders/${order?.id}`,
    };

    await this.sendTemplate('quote.accepted', { to: userEmail }, params, locale);
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(
    userEmail: string,
    resetToken: string,
    locale: Locale = 'es',
  ): Promise<void> {
    const params = {
      resetUrl: `${this.config.get('FRONTEND_URL')}/auth/reset-password?token=${resetToken}`,
      expiresIn: '1', // hours
    };

    await this.sendTemplate('auth.passwordReset', { to: userEmail }, params, locale);
  }

  /**
   * Send welcome email
   */
  async sendWelcome(userEmail: string, userName: string, locale: Locale = 'es'): Promise<void> {
    const params = {
      userName,
      loginUrl: `${this.config.get('FRONTEND_URL')}/auth/login`,
      helpUrl: `${this.config.get('FRONTEND_URL')}/help`,
    };

    await this.sendTemplate('auth.welcome', { to: userEmail }, params, locale);
  }

  /**
   * Send order status update
   */
  async sendOrderStatusUpdate(
    orderId: string,
    userEmail: string,
    newStatus: string,
    locale: Locale = 'es',
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Translate status
    const statusKey = `order.status.${newStatus.toLowerCase()}`;
    const translatedStatus = await this.i18n.translate(statusKey, locale);

    const params = {
      orderNumber: order.orderNumber,
      status: translatedStatus,
      trackingUrl: `${this.config.get('FRONTEND_URL')}/orders/${orderId}`,
    };

    await this.sendTemplate('order.statusUpdate', { to: userEmail }, params, locale);
  }

  /**
   * Render email HTML template
   */
  private async renderEmailTemplate(
    templateName: string,
    content: string,
    locale: Locale,
  ): Promise<string> {
    // Get localized footer and header
    const [header, footer] = await Promise.all([
      this.i18n.translate('email.header', locale, {
        companyName: 'Cotiza Studio',
      }),
      this.i18n.translate('email.footer', locale, {
        year: String(new Date().getFullYear()),
        companyName: 'Cotiza Studio',
        unsubscribeUrl: `${this.config.get('FRONTEND_URL')}/unsubscribe`,
      }),
    ]);

    // Basic email template
    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cotiza Studio</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: ${EMAIL_COLORS.text};
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, ${EMAIL_COLORS.gradientStart} 0%, ${EMAIL_COLORS.gradientEnd} 100%);
      color: white;
      padding: 30px;
      border-radius: 10px 10px 0 0;
      text-align: center;
    }
    .content {
      background: white;
      padding: 30px;
      border: 1px solid ${EMAIL_COLORS.border};
      border-top: none;
    }
    .footer {
      background: ${EMAIL_COLORS.backgroundFooter};
      padding: 20px;
      border-radius: 0 0 10px 10px;
      text-align: center;
      font-size: 12px;
      color: ${EMAIL_COLORS.textFooter};
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: ${EMAIL_COLORS.button};
      color: white;
      text-decoration: none;
      border-radius: 5px;
      margin: 10px 0;
    }
    .button:hover {
      background: ${EMAIL_COLORS.buttonHover};
    }
  </style>
</head>
<body>
  <div class="header">
    ${header}
  </div>
  <div class="content">
    ${content}
  </div>
  <div class="footer">
    ${footer}
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Send raw email
   */
  private async send(options: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
    attachments?: any[];
  }): Promise<void> {
    const mailOptions = {
      from: options.from || this.defaultFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
      cc: options.cc,
      bcc: options.bcc,
      attachments: options.attachments,
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Get user's preferred locale
   */
  async getUserLocale(userEmail: string): Promise<Locale> {
    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
      select: { preferredLocale: true },
    });

    return (user?.preferredLocale as Locale) || 'es';
  }

  /**
   * Send email with auto-detected locale
   */
  async sendTemplateAuto(
    templateName: string,
    userEmail: string,
    params?: EmailParams,
  ): Promise<void> {
    const locale = await this.getUserLocale(userEmail);
    await this.sendTemplate(templateName, { to: userEmail }, params, locale);
  }
}
