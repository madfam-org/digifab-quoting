import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaymentStatus, OrderStatus, QuoteStatus } from '@cotiza/shared';
// import { OrdersService } from '../orders/orders.service'; // Removed to avoid circular dependency
import Stripe from 'stripe';
import { QuoteItem } from '@prisma/client';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly frontendUrl: string;

  private readonly dhanamWebhookUrl: string | undefined;
  private readonly dhanamWebhookSecret: string | undefined;

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
    private configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3002');
    this.dhanamWebhookUrl = this.configService.get<string>('DHANAM_BILLING_WEBHOOK_URL');
    this.dhanamWebhookSecret = this.configService.get<string>('DHANAM_BILLING_WEBHOOK_SECRET');
  }

  async createPaymentSession(quoteId: string, tenantId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: {
        customer: true,
        items: {
          include: {
            // part: true, // Remove if not in schema
          },
        },
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    if (quote.status !== QuoteStatus.APPROVED) {
      throw new BadRequestException('Quote must be approved before payment');
    }

    // Calculate line items for Stripe
    const lineItems = quote.items.map((item: QuoteItem) => ({
      name: item.name || 'Quote Item',
      description: `${item.process} - ${item.material} - Qty: ${item.quantity}`,
      amount: Math.round(Number(item.unitPrice || 0) * 100), // Convert to cents
      currency: quote.currency.toLowerCase(),
      quantity: item.quantity,
    }));

    // Create checkout session
    const session = await this.stripe.createCheckoutSession({
      quoteId: quote.id,
      customerEmail: quote.customer?.email || '',
      lineItems,
      successUrl: `${this.frontendUrl}/quotes/${quote.id}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${this.frontendUrl}/quotes/${quote.id}`,
      metadata: {
        tenantId,
        customerId: quote.customerId || '',
      },
    });

    // Create payment intent record
    await this.prisma.paymentIntent.create({
      data: {
        stripePaymentIntentId: session.payment_intent as string,
        stripeSessionId: session.id,
        amount: quote.totalPrice || 0,
        currency: quote.currency,
        status: PaymentStatus.PENDING,
        quoteId: quote.id,
        tenantId,
      },
    });

    return {
      sessionId: session.id,
      paymentUrl: session.url || '',
    };
  }

  async handleWebhookEvent(event: Stripe.Event, tenantId: string) {
    this.logger.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
          tenantId,
        );
        break;

      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
          tenantId,
        );
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent, tenantId);
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session, tenantId: string) {
    const paymentIntent = await this.prisma.paymentIntent.findUnique({
      where: { stripeSessionId: session.id },
      include: { quote: true },
    });

    if (!paymentIntent) {
      this.logger.warn(`Payment intent not found for session ${session.id}`);
      return;
    }

    // Create order from quote directly using Prisma
    // This avoids circular dependency with OrdersService
    const order = await this.createOrderFromQuote(paymentIntent.quoteId, tenantId, {
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent as string,
    });

    this.logger.log(`Order ${order.id} created from quote ${paymentIntent.quoteId}`);
  }

  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    tenantId: string,
  ) {
    await this.prisma.paymentIntent.updateMany({
      where: {
        stripePaymentIntentId: paymentIntent.id,
        tenantId,
      },
      data: {
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      },
    });

    // Update order status
    const order = await this.prisma.order.findFirst({
      where: {
        paymentIntents: {
          some: {
            stripePaymentIntentId: paymentIntent.id,
          },
        },
        tenantId,
      },
    });

    if (order) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
        },
      });

      // Update quote status
      await this.prisma.quote.updateMany({
        where: {
          id: order.quoteId,
          tenantId,
        },
        data: {
          status: QuoteStatus.ORDERED,
        },
      });

      // Relay payment event to Dhanam for unified revenue reporting
      this.relayPaymentToDhanam({
        quoteId: order.quoteId,
        orderId: order.id,
        amount: Number(order.totalAmount),
        currency: order.currency,
        tenantId,
      }).catch(() => {}); // fire-and-forget
    }
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent, tenantId: string) {
    await this.prisma.paymentIntent.updateMany({
      where: {
        stripePaymentIntentId: paymentIntent.id,
        tenantId,
      },
      data: {
        status: PaymentStatus.FAILED,
        errorMessage: paymentIntent.last_payment_error?.message,
      },
    });

    // Update order status if exists
    const order = await this.prisma.order.findFirst({
      where: {
        paymentIntents: {
          some: {
            stripePaymentIntentId: paymentIntent.id,
          },
        },
        tenantId,
      },
    });

    if (order) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED, // Use existing enum value
          paymentStatus: PaymentStatus.FAILED,
        },
      });
    }
  }

  async getPaymentStatus(quoteId: string, tenantId: string) {
    const paymentIntents = await this.prisma.paymentIntent.findMany({
      where: {
        quoteId,
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 1,
    });

    if (paymentIntents.length === 0) {
      return null;
    }

    const paymentIntent = paymentIntents[0];

    // Refresh status from Stripe if pending
    if (paymentIntent.status === PaymentStatus.PENDING && paymentIntent.stripePaymentIntentId) {
      const stripeIntent = await this.stripe.retrievePaymentIntent(
        paymentIntent.stripePaymentIntentId,
      );

      if (stripeIntent.status === 'succeeded') {
        await this.handlePaymentIntentSucceeded(stripeIntent, tenantId);
      }
    }

    return {
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      paidAt: paymentIntent.paidAt,
    };
  }

  private async createOrderFromQuote(
    quoteId: string,
    tenantId: string,
    paymentInfo?: {
      stripeSessionId?: string;
      stripePaymentIntentId?: string;
    },
  ) {
    // Basic order creation logic - simplified version
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: {
        items: true, // Use correct relation name
        customer: true,
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    // Check if order already exists
    const existingOrder = await this.prisma.order.findFirst({
      where: { quoteId, tenantId },
    });

    if (existingOrder) {
      return existingOrder;
    }

    // Create order number
    const orderNumber = `ORD-${Date.now()}`; // Simple order number generation

    // Create the order
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        quoteId,
        customerId: quote.customerId || '',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: quote.subtotal || 0,
        tax: quote.tax || 0,
        shipping: quote.shipping || 0,
        totalAmount: quote.totalPrice || 0,
        currency: quote.currency,
        tenantId,
      },
    });

    // Link payment intent if provided
    if (paymentInfo?.stripePaymentIntentId) {
      await this.prisma.paymentIntent.update({
        where: {
          stripePaymentIntentId: paymentInfo.stripePaymentIntentId,
        },
        data: {
          orderId: order.id,
        },
      });
    }

    // Update quote status
    await this.prisma.quote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.ORDERED },
    });

    return order;
  }

  /**
   * Fire-and-forget billing event relay to Dhanam for unified revenue reporting.
   * Non-blocking — failures are logged but never thrown.
   */
  private async relayPaymentToDhanam(event: {
    quoteId: string;
    orderId?: string;
    amount: number;
    currency: string;
    tenantId: string;
    customerEmail?: string;
  }): Promise<void> {
    if (!this.dhanamWebhookUrl) return;

    try {
      const payload = JSON.stringify({
        source: 'cotiza-studio',
        event_type: 'payment.succeeded',
        data: event,
        timestamp: new Date().toISOString(),
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.dhanamWebhookSecret) {
        const signature = createHmac('sha256', this.dhanamWebhookSecret)
          .update(payload)
          .digest('hex');
        headers['X-Cotiza-Signature'] = signature;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await fetch(this.dhanamWebhookUrl, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      this.logger.log(`Billing event relayed to Dhanam for quote ${event.quoteId}`);
    } catch (error) {
      this.logger.warn(`Failed to relay billing event to Dhanam: ${error.message}`);
    }
  }
}
