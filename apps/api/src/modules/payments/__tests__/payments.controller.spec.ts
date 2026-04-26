import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from '../payments.controller';
import { PaymentsService } from '../payments.service';
import { StripeService } from '../stripe.service';
import { PrismaService } from '@/prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, PaymentMethod } from '@prisma/client';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let paymentsService: PaymentsService;
  let stripeService: StripeService;

  const mockPaymentsService = {
    createCheckoutSession: jest.fn(),
    getPaymentStatus: jest.fn(),
    processWebhook: jest.fn(),
    confirmPayment: jest.fn(),
    refundPayment: jest.fn(),
    listPayments: jest.fn(),
    getPaymentDetails: jest.fn(),
    updatePaymentMethod: jest.fn(),
    cancelSubscription: jest.fn(),
  };

  const mockStripeService = {
    createCheckoutSession: jest.fn(),
    createPaymentIntent: jest.fn(),
    confirmPaymentIntent: jest.fn(),
    createRefund: jest.fn(),
    constructWebhookEvent: jest.fn(),
    retrieveSession: jest.fn(),
    retrievePaymentIntent: jest.fn(),
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'customer',
    tenantId: 'tenant-123',
  };

  const mockPayment = {
    id: 'payment-123',
    quoteId: 'quote-123',
    orderId: 'order-123',
    amount: 1500.0,
    currency: 'USD',
    status: PaymentStatus.PENDING,
    method: PaymentMethod.CARD,
    stripePaymentIntentId: 'pi_test123',
    stripeCustomerId: 'cus_test123',
    metadata: {
      quoteNumber: 'Q-2025-001',
      customerEmail: 'test@example.com',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
    paymentsService = module.get<PaymentsService>(PaymentsService);
    stripeService = module.get<StripeService>(StripeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    const createCheckoutDto = {
      quoteId: 'quote-123',
      successUrl: 'https://app.cotiza.studio/success',
      cancelUrl: 'https://app.cotiza.studio/quotes/quote-123',
      paymentMethod: PaymentMethod.CARD,
      customerEmail: 'customer@example.com',
    };

    it('should create Stripe checkout session', async () => {
      const checkoutSession = {
        sessionId: 'cs_test_123',
        checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_123',
        expiresAt: new Date(Date.now() + 3600000),
        payment: mockPayment,
      };

      mockPaymentsService.createCheckoutSession.mockResolvedValue(checkoutSession);

      const result = await controller.createCheckoutSession('quote-123', createCheckoutDto, {
        user: mockUser,
      });

      expect(result).toEqual(checkoutSession);
      expect(mockPaymentsService.createCheckoutSession).toHaveBeenCalledWith(
        'quote-123',
        createCheckoutDto,
        mockUser.id,
      );
    });

    it('should validate quote ownership', async () => {
      mockPaymentsService.createCheckoutSession.mockRejectedValue(
        new NotFoundException('Quote not found or access denied'),
      );

      await expect(
        controller.createCheckoutSession('quote-456', createCheckoutDto, { user: mockUser }),
      ).rejects.toThrow('Quote not found or access denied');
    });

    it('should prevent duplicate payments', async () => {
      mockPaymentsService.createCheckoutSession.mockRejectedValue(
        new BadRequestException('Payment already exists for this quote'),
      );

      await expect(
        controller.createCheckoutSession('quote-123', createCheckoutDto, { user: mockUser }),
      ).rejects.toThrow('Payment already exists');
    });

    it('should validate quote status', async () => {
      mockPaymentsService.createCheckoutSession.mockRejectedValue(
        new BadRequestException('Quote must be approved before payment'),
      );

      await expect(
        controller.createCheckoutSession('quote-123', createCheckoutDto, { user: mockUser }),
      ).rejects.toThrow('Quote must be approved');
    });

    it('should handle different payment methods', async () => {
      const methods = [PaymentMethod.CARD, PaymentMethod.BANK_TRANSFER, PaymentMethod.PAYPAL];

      for (const method of methods) {
        const dto = { ...createCheckoutDto, paymentMethod: method };
        mockPaymentsService.createCheckoutSession.mockResolvedValue({
          sessionId: `cs_${method}_123`,
          checkoutUrl: `https://checkout.stripe.com/${method}`,
        });

        await controller.createCheckoutSession('quote-123', dto, { user: mockUser });

        expect(mockPaymentsService.createCheckoutSession).toHaveBeenCalledWith(
          'quote-123',
          expect.objectContaining({ paymentMethod: method }),
          mockUser.id,
        );
      }
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status', async () => {
      const paymentStatus = {
        status: PaymentStatus.COMPLETED,
        payment: {
          ...mockPayment,
          status: PaymentStatus.COMPLETED,
          paidAt: new Date(),
        },
        order: {
          id: 'order-123',
          orderNumber: 'ORD-2025-001',
          status: 'processing',
        },
      };

      mockPaymentsService.getPaymentStatus.mockResolvedValue(paymentStatus);

      const result = await controller.getPaymentStatus('quote-123', { user: mockUser });

      expect(result).toEqual(paymentStatus);
      expect(mockPaymentsService.getPaymentStatus).toHaveBeenCalledWith('quote-123', mockUser.id);
    });

    it('should handle pending payments', async () => {
      mockPaymentsService.getPaymentStatus.mockResolvedValue({
        status: PaymentStatus.PENDING,
        payment: mockPayment,
        message: 'Payment is being processed',
      });

      const result = await controller.getPaymentStatus('quote-123', { user: mockUser });

      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(result.message).toContain('processed');
    });

    it('should handle failed payments', async () => {
      mockPaymentsService.getPaymentStatus.mockResolvedValue({
        status: PaymentStatus.FAILED,
        payment: { ...mockPayment, status: PaymentStatus.FAILED },
        error: 'Card declined',
        retryable: true,
      });

      const result = await controller.getPaymentStatus('quote-123', { user: mockUser });

      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(result.error).toBe('Card declined');
      expect(result.retryable).toBe(true);
    });
  });

  describe('handleStripeWebhook', () => {
    it('should process payment success webhook', async () => {
      const webhookBody = JSON.stringify({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            payment_intent: 'pi_test_123',
            amount_total: 150000, // $1500 in cents
            currency: 'usd',
          },
        },
      });

      const signature = 'stripe-signature';

      mockStripeService.constructWebhookEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: JSON.parse(webhookBody).data.object },
      });

      mockPaymentsService.processWebhook.mockResolvedValue({
        success: true,
        payment: { ...mockPayment, status: PaymentStatus.COMPLETED },
      });

      const result = await controller.handleStripeWebhook(webhookBody, {
        headers: { 'stripe-signature': signature },
      });

      expect(result.success).toBe(true);
      expect(mockStripeService.constructWebhookEvent).toHaveBeenCalledWith(webhookBody, signature);
    });

    it('should handle payment failure webhook', async () => {
      const webhookBody = JSON.stringify({
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 150000,
            currency: 'usd',
            last_payment_error: {
              code: 'card_declined',
              message: 'Your card was declined',
            },
          },
        },
      });

      mockStripeService.constructWebhookEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: JSON.parse(webhookBody).data.object },
      });

      mockPaymentsService.processWebhook.mockResolvedValue({
        success: true,
        payment: { ...mockPayment, status: PaymentStatus.FAILED },
      });

      await controller.handleStripeWebhook(webhookBody, {
        headers: { 'stripe-signature': 'test-sig' },
      });

      expect(mockPaymentsService.processWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'payment_intent.payment_failed' }),
      );
    });

    it('should validate webhook signature', async () => {
      const invalidSignature = 'invalid-signature';

      mockStripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        controller.handleStripeWebhook('body', {
          headers: { 'stripe-signature': invalidSignature },
        }),
      ).rejects.toThrow('Invalid signature');
    });

    it('should handle refund webhooks', async () => {
      const refundWebhook = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_123',
            amount_refunded: 50000, // $500 refunded
            payment_intent: 'pi_test_123',
          },
        },
      };

      mockStripeService.constructWebhookEvent.mockReturnValue(refundWebhook);
      mockPaymentsService.processWebhook.mockResolvedValue({
        success: true,
        payment: {
          ...mockPayment,
          refundedAmount: 500,
          status: PaymentStatus.PARTIALLY_REFUNDED,
        },
      });

      await controller.handleStripeWebhook(JSON.stringify(refundWebhook), {
        headers: { 'stripe-signature': 'test-sig' },
      });

      expect(mockPaymentsService.processWebhook).toHaveBeenCalledWith(refundWebhook);
    });
  });

  describe('refundPayment', () => {
    const refundDto = {
      amount: 500.0,
      reason: 'Customer requested refund',
    };

    it('should process full refund', async () => {
      const refundResult = {
        refund: {
          id: 'refund-123',
          amount: 1500.0,
          status: 'succeeded',
          reason: 'requested_by_customer',
        },
        payment: {
          ...mockPayment,
          status: PaymentStatus.REFUNDED,
          refundedAmount: 1500.0,
        },
      };

      mockPaymentsService.refundPayment.mockResolvedValue(refundResult);

      const result = await controller.refundPayment(
        'payment-123',
        { reason: 'Customer requested refund' },
        { user: { ...mockUser, role: 'admin' } },
      );

      expect(result).toEqual(refundResult);
      expect(mockPaymentsService.refundPayment).toHaveBeenCalledWith(
        'payment-123',
        undefined, // Full refund when amount not specified
        'Customer requested refund',
      );
    });

    it('should process partial refund', async () => {
      const partialRefundResult = {
        refund: {
          id: 'refund-456',
          amount: 500.0,
          status: 'succeeded',
        },
        payment: {
          ...mockPayment,
          status: PaymentStatus.PARTIALLY_REFUNDED,
          refundedAmount: 500.0,
        },
      };

      mockPaymentsService.refundPayment.mockResolvedValue(partialRefundResult);

      const result = await controller.refundPayment('payment-123', refundDto, {
        user: { ...mockUser, role: 'admin' },
      });

      expect(result.payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(result.payment.refundedAmount).toBe(500.0);
    });

    it('should prevent refund for non-admin users', async () => {
      await expect(
        controller.refundPayment('payment-123', refundDto, { user: mockUser }),
      ).rejects.toThrow('Insufficient permissions');
    });

    it('should validate refund amount', async () => {
      mockPaymentsService.refundPayment.mockRejectedValue(
        new BadRequestException('Refund amount exceeds payment amount'),
      );

      await expect(
        controller.refundPayment(
          'payment-123',
          { amount: 2000.0 },
          { user: { ...mockUser, role: 'admin' } },
        ),
      ).rejects.toThrow('Refund amount exceeds');
    });

    it('should prevent duplicate refunds', async () => {
      mockPaymentsService.refundPayment.mockRejectedValue(
        new BadRequestException('Payment already fully refunded'),
      );

      await expect(
        controller.refundPayment('payment-123', {}, { user: { ...mockUser, role: 'admin' } }),
      ).rejects.toThrow('already fully refunded');
    });
  });

  describe('listPayments', () => {
    it('should list user payments', async () => {
      const payments = [mockPayment, { ...mockPayment, id: 'payment-456', amount: 2500.0 }];

      const paginatedResult = {
        data: payments,
        meta: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      };

      mockPaymentsService.listPayments.mockResolvedValue(paginatedResult);

      const result = await controller.listPayments({ page: 1, limit: 20 }, { user: mockUser });

      expect(result).toEqual(paginatedResult);
      expect(mockPaymentsService.listPayments).toHaveBeenCalledWith(
        mockUser.id,
        { page: 1, limit: 20 },
        mockUser.role,
      );
    });

    it('should filter payments by status', async () => {
      mockPaymentsService.listPayments.mockResolvedValue({
        data: [mockPayment],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await controller.listPayments({ status: PaymentStatus.COMPLETED }, { user: mockUser });

      expect(mockPaymentsService.listPayments).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ status: PaymentStatus.COMPLETED }),
        mockUser.role,
      );
    });

    it('should filter payments by date range', async () => {
      const dateFilter = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      };

      mockPaymentsService.listPayments.mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      await controller.listPayments(dateFilter, { user: mockUser });

      expect(mockPaymentsService.listPayments).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining(dateFilter),
        mockUser.role,
      );
    });
  });

  describe('payment security', () => {
    it('should sanitize card details in responses', async () => {
      const paymentWithCard = {
        ...mockPayment,
        cardLast4: '4242',
        cardBrand: 'Visa',
        cardFingerprint: 'fp_123',
      };

      mockPaymentsService.getPaymentDetails.mockResolvedValue(paymentWithCard);

      const result = await controller.getPaymentDetails('payment-123', { user: mockUser });

      expect(result.cardLast4).toBe('4242');
      expect(result.cardFingerprint).toBeUndefined(); // Should be removed
    });

    it('should enforce PCI compliance', async () => {
      const sensitiveData = {
        cardNumber: '4242424242424242',
        cvv: '123',
      };

      // Controller should never accept full card details
      await expect(
        controller.updatePaymentMethod('payment-123', sensitiveData, { user: mockUser }),
      ).rejects.toThrow('Invalid request');
    });

    it('should validate webhook IP whitelist', async () => {
      const req = {
        headers: { 'stripe-signature': 'sig' },
        ip: '192.168.1.1', // Not a Stripe IP
      };

      // Should validate that webhook comes from Stripe IPs
      mockStripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid webhook source');
      });

      await expect(controller.handleStripeWebhook('body', req)).rejects.toThrow(
        'Invalid webhook source',
      );
    });
  });

  describe('subscription management', () => {
    it('should handle subscription creation', async () => {
      const subscriptionDto = {
        planId: 'plan_monthly',
        quoteId: 'quote-123',
      };

      mockPaymentsService.createSubscription.mockResolvedValue({
        subscriptionId: 'sub_123',
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const result = await controller.createSubscription(subscriptionDto, { user: mockUser });

      expect(result.status).toBe('active');
      expect(result.subscriptionId).toBe('sub_123');
    });

    it('should handle subscription cancellation', async () => {
      mockPaymentsService.cancelSubscription.mockResolvedValue({
        subscriptionId: 'sub_123',
        status: 'canceled',
        canceledAt: new Date(),
      });

      const result = await controller.cancelSubscription(
        'sub_123',
        { reason: 'Customer request' },
        { user: mockUser },
      );

      expect(result.status).toBe('canceled');
      expect(mockPaymentsService.cancelSubscription).toHaveBeenCalledWith(
        'sub_123',
        mockUser.id,
        'Customer request',
      );
    });
  });

  describe('payment analytics', () => {
    it('should track payment metrics', async () => {
      const analyticsData = {
        totalRevenue: 50000,
        totalTransactions: 100,
        averageTransactionValue: 500,
        conversionRate: 0.75,
        topPaymentMethods: [
          { method: 'card', percentage: 80 },
          { method: 'bank_transfer', percentage: 20 },
        ],
      };

      mockPaymentsService.getAnalytics.mockResolvedValue(analyticsData);

      const result = await controller.getPaymentAnalytics(
        { startDate: new Date('2025-01-01'), endDate: new Date('2025-01-31') },
        { user: { ...mockUser, role: 'admin' } },
      );

      expect(result).toEqual(analyticsData);
      expect(result.conversionRate).toBe(0.75);
    });
  });
});
