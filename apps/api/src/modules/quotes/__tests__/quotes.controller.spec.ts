import { QuotesController } from '../quotes.controller';
import { QuotesService } from '../quotes.service';
import { Role } from '@cotiza/shared';
import { AuthenticatedRequest } from '../../../types/auth-request';

// The controller is a thin delegation layer over QuotesService. These tests
// assert the exact tenant-scoped delegation contract (tenantId-first service
// signatures) and the first-view side effect on findOne. The service itself is
// covered end-to-end by quote-lifecycle-ops.spec.ts and quotes-calculate.spec.ts.

describe('QuotesController', () => {
  let controller: QuotesController;
  let service: jest.Mocked<
    Pick<
      QuotesService,
      | 'create'
      | 'findAll'
      | 'findOne'
      | 'update'
      | 'addItem'
      | 'calculate'
      | 'approve'
      | 'cancel'
      | 'reject'
      | 'generatePdf'
      | 'recordCustomerView'
    >
  >;

  const tenantId = 'tenant-123';
  const userId = 'user-123';

  const customerReq = {
    user: {
      id: userId,
      tenantId,
      email: 'customer@example.com',
      roles: [Role.CUSTOMER],
    },
  } as unknown as AuthenticatedRequest;

  const staffReq = {
    user: {
      id: 'staff-1',
      tenantId,
      email: 'ops@example.com',
      roles: [Role.OPERATOR],
    },
  } as unknown as AuthenticatedRequest;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      addItem: jest.fn(),
      calculate: jest.fn(),
      approve: jest.fn(),
      cancel: jest.fn(),
      reject: jest.fn(),
      generatePdf: jest.fn(),
      recordCustomerView: jest.fn(),
    } as unknown as typeof service;

    controller = new QuotesController(service as unknown as QuotesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('delegates to service.create(tenantId, userId, dto)', async () => {
      const dto = { currency: 'MXN' } as any;
      const created = { id: 'quote-1' };
      service.create.mockResolvedValue(created as any);

      const result = await controller.create(customerReq, dto);

      expect(result).toBe(created);
      expect(service.create).toHaveBeenCalledWith(tenantId, userId, dto);
    });
  });

  describe('findAll', () => {
    it('maps pagination + filters into the tenant-scoped filter object', async () => {
      const page = { data: [], meta: {} };
      service.findAll.mockResolvedValue(page as any);

      const result = await controller.findAll(
        customerReq,
        { page: 2, limit: 25 } as any,
        'quoted' as any,
        'cust-9',
      );

      expect(result).toBe(page);
      expect(service.findAll).toHaveBeenCalledWith(tenantId, {
        status: 'quoted',
        customerId: 'cust-9',
        page: 2,
        limit: 25,
      });
    });
  });

  describe('findOne', () => {
    it('returns the quote scoped to the tenant', async () => {
      const quote = { id: 'quote-1', customerId: 'someone-else' };
      service.findOne.mockResolvedValue(quote as any);

      const result = await controller.findOne(staffReq, 'quote-1');

      expect(result).toBe(quote);
      expect(service.findOne).toHaveBeenCalledWith(tenantId, 'quote-1');
    });

    it('records a customer first-view when the owning customer opens the quote', async () => {
      service.findOne.mockResolvedValue({ id: 'quote-1', customerId: userId } as any);

      await controller.findOne(customerReq, 'quote-1');

      expect(service.recordCustomerView).toHaveBeenCalledWith(tenantId, 'quote-1', {
        id: userId,
        email: 'customer@example.com',
      });
    });

    it('does NOT record a view for staff/admin roles', async () => {
      service.findOne.mockResolvedValue({ id: 'quote-1', customerId: userId } as any);

      await controller.findOne(staffReq, 'quote-1');

      expect(service.recordCustomerView).not.toHaveBeenCalled();
    });

    it('does NOT record a view when a customer opens a quote they do not own', async () => {
      service.findOne.mockResolvedValue({ id: 'quote-1', customerId: 'other' } as any);

      await controller.findOne(customerReq, 'quote-1');

      expect(service.recordCustomerView).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('delegates to service.update(tenantId, id, dto)', async () => {
      const dto = { objective: {} } as any;
      service.update.mockResolvedValue({ id: 'quote-1' } as any);

      await controller.update(customerReq, 'quote-1', dto);

      expect(service.update).toHaveBeenCalledWith(tenantId, 'quote-1', dto);
    });
  });

  describe('addItem', () => {
    it('delegates to service.addItem(tenantId, id, dto)', async () => {
      const dto = { fileId: 'file-1' } as any;
      service.addItem.mockResolvedValue({ id: 'item-1' } as any);

      await controller.addItem(customerReq, 'quote-1', dto);

      expect(service.addItem).toHaveBeenCalledWith(tenantId, 'quote-1', dto);
    });
  });

  describe('calculate', () => {
    it('delegates to service.calculate(tenantId, id, dto)', async () => {
      const dto = {} as any;
      service.calculate.mockResolvedValue({ quote: { id: 'quote-1' } } as any);

      await controller.calculate(customerReq, 'quote-1', dto);

      expect(service.calculate).toHaveBeenCalledWith(tenantId, 'quote-1', dto);
    });
  });

  describe('accept', () => {
    it('delegates to service.approve(tenantId, id, userId) (route renamed /approve -> /accept)', async () => {
      const approved = { quote: { id: 'quote-1' }, checkoutUrl: 'https://pay', sessionId: 'cs_1' };
      service.approve.mockResolvedValue(approved as any);

      const result = await controller.accept(customerReq, 'quote-1');

      expect(result).toBe(approved);
      expect(service.approve).toHaveBeenCalledWith(tenantId, 'quote-1', userId);
    });
  });

  describe('cancel', () => {
    it('delegates to service.cancel(tenantId, id)', async () => {
      service.cancel.mockResolvedValue({ id: 'quote-1', status: 'cancelled' } as any);

      await controller.cancel(customerReq, 'quote-1');

      expect(service.cancel).toHaveBeenCalledWith(tenantId, 'quote-1');
    });
  });

  describe('reject', () => {
    it('delegates to service.reject(tenantId, id, userId, reason)', async () => {
      service.reject.mockResolvedValue({ id: 'quote-1', status: 'rejected' } as any);

      await controller.reject(customerReq, 'quote-1', { reason: 'too expensive' } as any);

      expect(service.reject).toHaveBeenCalledWith(tenantId, 'quote-1', userId, 'too expensive');
    });
  });

  describe('generatePdf', () => {
    it('delegates to service.generatePdf(tenantId, id)', async () => {
      service.generatePdf.mockResolvedValue({ url: 'https://s3/quote.pdf' } as any);

      const result = await controller.generatePdf(customerReq, 'quote-1');

      expect(result).toEqual({ url: 'https://s3/quote.pdf' });
      expect(service.generatePdf).toHaveBeenCalledWith(tenantId, 'quote-1');
    });
  });
});
