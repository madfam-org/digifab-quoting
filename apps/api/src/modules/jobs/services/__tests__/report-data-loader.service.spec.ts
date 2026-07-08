import { Test, TestingModule } from '@nestjs/testing';
import { ReportDataLoaderService } from '../report-data-loader.service';
import { PrismaService } from '@/prisma/prisma.service';
import { LoggerService } from '@/common/logger/logger.service';

describe('ReportDataLoaderService', () => {
  let service: ReportDataLoaderService;
  let prismaService: jest.Mocked<PrismaService>;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportDataLoaderService,
        {
          provide: PrismaService,
          useValue: {
            quote: {
              findUnique: jest.fn(),
              aggregate: jest.fn(),
              findMany: jest.fn(),
              groupBy: jest.fn(),
            },
            order: {
              findUnique: jest.fn(),
              groupBy: jest.fn(),
            },
            invoice: {
              findUnique: jest.fn(),
            },
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReportDataLoaderService>(ReportDataLoaderService);
    prismaService = module.get(PrismaService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loadReportData', () => {
    const tenantId = 'tenant-123';

    it('should load quote data', async () => {
      const mockQuote = {
        id: 'quote-123',
        number: 'Q-2024-001',
        tenantId,
        status: 'active',
        items: [],
        customer: { id: 'customer-123', name: 'John Doe' },
        tenant: { name: 'Cotiza Studio Inc.' },
      };

      (prismaService.quote.findUnique as jest.Mock).mockResolvedValue(mockQuote as any);

      const result = await service.loadReportData('quote', 'quote-123', tenantId);

      expect(result).toEqual(mockQuote);
      expect(prismaService.quote.findUnique).toHaveBeenCalledWith({
        where: { id: 'quote-123', tenantId },
        include: expect.objectContaining({
          items: expect.any(Object),
          customer: true,
          tenant: expect.any(Object),
        }),
      });
      expect(loggerService.log).toHaveBeenCalledWith('Loading data for quote report', {
        entityId: 'quote-123',
        tenantId,
      });
    });

    it('should load order data', async () => {
      const mockOrder = {
        id: 'order-123',
        number: 'O-2024-001',
        tenantId,
        status: 'completed',
        quote: { id: 'quote-123' },
        customer: { id: 'customer-123' },
        paymentIntents: [],
      };

      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(mockOrder as any);

      const result = await service.loadReportData('order', 'order-123', tenantId);

      expect(result).toEqual(mockOrder);
      expect(prismaService.order.findUnique).toHaveBeenCalledWith({
        where: { id: 'order-123', tenantId },
        include: expect.objectContaining({
          quote: expect.any(Object),
          customer: expect.any(Object),
          paymentIntents: expect.any(Object),
          orderItems: expect.any(Object),
        }),
      });
    });

    it('should load invoice data', async () => {
      const mockInvoice = {
        id: 'inv-123',
        number: 'INV-2024-001',
        tenantId,
        status: 'paid',
        order: { id: 'order-123' },
        customer: { id: 'customer-123' },
        tenant: { name: 'Cotiza Studio Inc.' },
      };

      (prismaService.invoice.findUnique as jest.Mock).mockResolvedValue(mockInvoice as any);

      const result = await service.loadReportData('invoice', 'inv-123', tenantId);

      expect(result).toEqual(mockInvoice);
      expect(prismaService.invoice.findUnique).toHaveBeenCalledWith({
        where: { id: 'inv-123', tenantId },
        include: expect.objectContaining({
          order: expect.any(Object),
          customer: expect.any(Object),
        }),
      });
    });

    it('should load analytics data', async () => {
      const criteria = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        groupBy: 'day' as const,
      };
      const criteriaJson = JSON.stringify(criteria);

      const mockQuoteStats = [
        { status: 'accepted', _count: 10, _sum: { total: 10000 }, _avg: { total: 1000 } },
      ];
      const mockOrderStats = [
        { status: 'completed', _count: 8, _sum: { totalPaid: 8000 }, _avg: { totalPaid: 1000 } },
      ];
      const mockRevenue = [
        { period: '2024-01-01', order_count: 3, revenue: 3000, avg_order_value: 1000 },
      ];
      const mockMaterials = [
        {
          material_name: 'PLA',
          material_code: 'PLA',
          usage_count: 5,
          total_quantity: 50,
          total_revenue: 5000,
        },
      ];
      const mockProcesses = [
        {
          process_name: '3D Printing',
          process_code: '3D',
          category: 'additive',
          usage_count: 5,
          total_quantity: 50,
          total_revenue: 5000,
        },
      ];

      (prismaService.quote.groupBy as jest.Mock).mockResolvedValue(mockQuoteStats as any);
      (prismaService.order.groupBy as jest.Mock).mockResolvedValue(mockOrderStats as any);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce(mockRevenue);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce(mockMaterials);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce(mockProcesses);
      (prismaService.quote.aggregate as jest.Mock).mockResolvedValue({
        _count: 10,
        _avg: { total: 1000 },
        _sum: { total: 10000 },
      } as any);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          total_quotes: 10,
          converted_quotes: 5,
          avg_hours_to_convert: 24,
        },
      ]);
      (prismaService.quote.findMany as jest.Mock).mockResolvedValue([
        { customerId: 'customer-1' },
        { customerId: 'customer-2' },
      ] as any);

      const result: any = await service.loadReportData('analytics', criteriaJson, tenantId);

      expect(result).toHaveProperty('criteria', criteria);
      expect(result).toHaveProperty('quotes', mockQuoteStats);
      expect(result).toHaveProperty('orders', mockOrderStats);
      expect(result).toHaveProperty('revenue', mockRevenue);
      expect(result).toHaveProperty('materials', mockMaterials);
      expect(result).toHaveProperty('processes', mockProcesses);
      expect(result).toHaveProperty('metrics');
      expect(result.metrics).toEqual({
        totalQuotes: 10,
        averageQuoteValue: 1000,
        totalQuoteValue: 10000,
        conversionRate: 50,
        averageTimeToConvert: 24,
        uniqueCustomers: 2,
      });
    });

    it('should throw error for unknown report type', async () => {
      await expect(service.loadReportData('unknown' as any, 'id', tenantId)).rejects.toThrow(
        'Unknown report type: unknown',
      );
    });

    it('should throw error when quote not found', async () => {
      (prismaService.quote.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.loadReportData('quote', 'quote-123', tenantId)).rejects.toThrow(
        'Quote quote-123 not found',
      );
    });

    it('should throw error when order not found', async () => {
      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.loadReportData('order', 'order-123', tenantId)).rejects.toThrow(
        'Order order-123 not found',
      );
    });

    it('should throw error when invoice not found', async () => {
      (prismaService.invoice.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.loadReportData('invoice', 'inv-123', tenantId)).rejects.toThrow(
        'Invoice inv-123 not found',
      );
    });
  });

  describe('analytics calculations', () => {
    const tenantId = 'tenant-123';
    const startDate = '2024-01-01';
    const endDate = '2024-01-31';

    it('should calculate conversion rate correctly', async () => {
      const criteria = { startDate, endDate };
      const criteriaJson = JSON.stringify(criteria);

      // Mock all required calls
      (prismaService.quote.groupBy as jest.Mock).mockResolvedValue([]);
      (prismaService.order.groupBy as jest.Mock).mockResolvedValue([]);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // revenue
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // materials
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // processes
      (prismaService.quote.aggregate as jest.Mock).mockResolvedValue({
        _count: 20,
        _avg: { total: 1000 },
        _sum: { total: 20000 },
      } as any);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          total_quotes: 20,
          converted_quotes: 10,
          avg_hours_to_convert: 48.5,
        },
      ]);
      (prismaService.quote.findMany as jest.Mock).mockResolvedValue([]);

      const result: any = await service.loadReportData('analytics', criteriaJson, tenantId);

      expect(result.metrics.conversionRate).toBe(50); // 10/20 * 100
      expect(result.metrics.averageTimeToConvert).toBe(48.5);
    });

    it('should handle zero quotes in conversion rate', async () => {
      const criteria = { startDate, endDate };
      const criteriaJson = JSON.stringify(criteria);

      // Mock all required calls
      (prismaService.quote.groupBy as jest.Mock).mockResolvedValue([]);
      (prismaService.order.groupBy as jest.Mock).mockResolvedValue([]);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // revenue
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // materials
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // processes
      (prismaService.quote.aggregate as jest.Mock).mockResolvedValue({
        _count: 0,
        _avg: { total: null },
        _sum: { total: null },
      } as any);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          total_quotes: 0,
          converted_quotes: 0,
          avg_hours_to_convert: null,
        },
      ]);
      (prismaService.quote.findMany as jest.Mock).mockResolvedValue([]);

      const result: any = await service.loadReportData('analytics', criteriaJson, tenantId);

      expect(result.metrics.conversionRate).toBe(0);
      expect(result.metrics.averageTimeToConvert).toBe(0);
    });

    it('should count unique customers correctly', async () => {
      const criteria = { startDate, endDate };
      const criteriaJson = JSON.stringify(criteria);

      // Mock all required calls
      (prismaService.quote.groupBy as jest.Mock).mockResolvedValue([]);
      (prismaService.order.groupBy as jest.Mock).mockResolvedValue([]);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // revenue
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // materials
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // processes
      (prismaService.quote.aggregate as jest.Mock).mockResolvedValue({
        _count: 0,
        _avg: { total: null },
        _sum: { total: null },
      } as any);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          total_quotes: 0,
          converted_quotes: 0,
          avg_hours_to_convert: null,
        },
      ]);
      (prismaService.quote.findMany as jest.Mock).mockResolvedValue([
        { customerId: 'customer-1' },
        { customerId: 'customer-2' },
        { customerId: 'customer-3' },
      ] as any);

      const result: any = await service.loadReportData('analytics', criteriaJson, tenantId);

      expect(result.metrics.uniqueCustomers).toBe(3);
    });

    it('should use correct groupBy parameter in revenue query', async () => {
      const criteria = { startDate, endDate, groupBy: 'month' as const };
      const criteriaJson = JSON.stringify(criteria);

      // Mock all required calls with minimal data
      (prismaService.quote.groupBy as jest.Mock).mockResolvedValue([]);
      (prismaService.order.groupBy as jest.Mock).mockResolvedValue([]);
      (prismaService.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prismaService.quote.aggregate as jest.Mock).mockResolvedValue({
        _count: 0,
        _avg: { total: null },
        _sum: { total: null },
      } as any);
      (prismaService.quote.findMany as jest.Mock).mockResolvedValue([]);

      await service.loadReportData('analytics', criteriaJson, tenantId);

      // Check that the revenue query was called with 'month' groupBy
      expect(prismaService.$queryRaw).toHaveBeenCalledWith(
        expect.any(Array), // Template literal parts
        'month',
        tenantId,
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('error handling', () => {
    const tenantId = 'tenant-123';

    it('should handle invalid JSON in analytics criteria', async () => {
      await expect(service.loadReportData('analytics', 'invalid-json', tenantId)).rejects.toThrow();
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      (prismaService.quote.findUnique as jest.Mock).mockRejectedValue(dbError);

      await expect(service.loadReportData('quote', 'quote-123', tenantId)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should log errors for analytics data loading', async () => {
      const criteria = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const criteriaJson = JSON.stringify(criteria);

      const error = new Error('Query failed');
      (prismaService.quote.groupBy as jest.Mock).mockRejectedValue(error);

      await expect(service.loadReportData('analytics', criteriaJson, tenantId)).rejects.toThrow(
        'Query failed',
      );
    });
  });
});
