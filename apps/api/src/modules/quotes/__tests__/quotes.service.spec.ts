import { Test, TestingModule } from '@nestjs/testing';
import { QuotesService } from '../quotes.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CacheService } from '@/cache/cache.service';
import { FilesService } from '@/modules/files/files.service';
import { PricingService } from '@/modules/pricing/pricing.service';
import { JobsService } from '@/modules/jobs/jobs.service';
import { MetricsService } from '@/common/services/metrics.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { QuoteStatus, Technology, Material } from '@prisma/client';

describe('QuotesService', () => {
  let service: QuotesService;
  let prismaService: PrismaService;
  let cacheService: CacheService;
  let filesService: FilesService;
  let pricingService: PricingService;
  let jobsService: JobsService;
  let metricsService: MetricsService;

  const mockPrismaService = {
    quote: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    quoteItem: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  };

  const mockFilesService = {
    getFile: jest.fn(),
    validateFile: jest.fn(),
    getFileMetadata: jest.fn(),
  };

  const mockPricingService = {
    calculatePrice: jest.fn(),
    calculateItemPrice: jest.fn(),
    calculateQuoteTotal: jest.fn(),
    getMargin: jest.fn(),
  };

  const mockJobsService = {
    createJob: jest.fn(),
    getJobStatus: jest.fn(),
  };

  const mockMetricsService = {
    recordApiLatency: jest.fn(),
    incrementApiCall: jest.fn(),
    recordError: jest.fn(),
  };

  const mockQuote = {
    id: 'quote-123',
    projectName: 'Test Project',
    description: 'Test description',
    customerId: 'user-123',
    status: QuoteStatus.DRAFT,
    items: [],
    subtotal: 0,
    tax: 0,
    discount: 0,
    shipping: 0,
    totalPrice: 0,
    currency: 'USD',
    exchangeRate: 1,
    validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    tenantId: 'tenant-123',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: FilesService,
          useValue: mockFilesService,
        },
        {
          provide: PricingService,
          useValue: mockPricingService,
        },
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
    prismaService = module.get<PrismaService>(PrismaService);
    cacheService = module.get<CacheService>(CacheService);
    filesService = module.get<FilesService>(FilesService);
    pricingService = module.get<PricingService>(PricingService);
    jobsService = module.get<JobsService>(JobsService);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto = {
      projectName: 'New Project',
      description: 'Project description',
      items: [
        {
          fileId: 'file-456',
          technology: Technology.FFF,
          material: Material.PLA,
          quantity: 5,
        },
      ],
      currency: 'USD',
    };

    it('should create a new quote with items', async () => {
      const fileMetadata = {
        id: 'file-456',
        fileName: 'part.stl',
        fileSize: 1024000,
        geometry: {
          volume: 125.5,
          boundingBox: { x: 100, y: 50, z: 25 },
        },
      };

      mockFilesService.getFileMetadata.mockResolvedValue(fileMetadata);
      mockPricingService.calculateItemPrice.mockResolvedValue({
        unitPrice: 25.5,
        totalPrice: 127.5,
        leadTime: 3,
        breakdown: {
          material: 50,
          machine: 60,
          labor: 17.5,
        },
      });

      mockPrismaService.quote.create.mockResolvedValue({
        ...mockQuote,
        ...createDto,
        items: [
          {
            id: 'item-123',
            ...createDto.items[0],
            unitPrice: 25.5,
            totalPrice: 127.5,
          },
        ],
        subtotal: 127.5,
        tax: 22.95,
        totalPrice: 150.45,
      });

      const result = await service.create(createDto, 'user-123', 'tenant-123');

      expect(result).toHaveProperty('id');
      expect(result.projectName).toBe('New Project');
      expect(result.items).toHaveLength(1);
      expect(mockFilesService.getFileMetadata).toHaveBeenCalledWith('file-456');
      expect(mockPricingService.calculateItemPrice).toHaveBeenCalled();
      expect(mockJobsService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'QUOTE_PROCESSING',
          data: expect.objectContaining({
            quoteId: expect.any(String),
          }),
        }),
      );
    });

    it('should validate file ownership', async () => {
      mockFilesService.getFileMetadata.mockRejectedValue(
        new NotFoundException('File not found or access denied'),
      );

      await expect(service.create(createDto, 'user-123', 'tenant-123')).rejects.toThrow(
        'File not found or access denied',
      );
    });

    it('should handle pricing calculation errors', async () => {
      mockFilesService.getFileMetadata.mockResolvedValue({ id: 'file-456' });
      mockPricingService.calculateItemPrice.mockRejectedValue(
        new Error('Unable to calculate price'),
      );

      await expect(service.create(createDto, 'user-123', 'tenant-123')).rejects.toThrow(
        'Unable to calculate price',
      );

      expect(mockMetricsService.recordError).toHaveBeenCalled();
    });

    it('should apply discounts for bulk orders', async () => {
      const bulkDto = {
        ...createDto,
        items: [
          {
            fileId: 'file-456',
            technology: Technology.FFF,
            material: Material.PLA,
            quantity: 100, // Bulk quantity
          },
        ],
      };

      mockFilesService.getFileMetadata.mockResolvedValue({ id: 'file-456' });
      mockPricingService.calculateItemPrice.mockResolvedValue({
        unitPrice: 20.0, // Discounted price
        totalPrice: 2000.0,
        discount: 10, // 10% discount
      });

      mockPrismaService.quote.create.mockResolvedValue({
        ...mockQuote,
        discount: 200, // Total discount
        subtotal: 2000,
        totalPrice: 2160, // After tax
      });

      const result = await service.create(bulkDto, 'user-123', 'tenant-123');

      expect(result.discount).toBe(200);
    });
  });

  describe('findAll', () => {
    it('should return paginated quotes for customer', async () => {
      const quotes = [mockQuote, { ...mockQuote, id: 'quote-456' }];

      mockPrismaService.quote.findMany.mockResolvedValue(quotes);
      mockPrismaService.quote.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 20 }, 'user-123', 'customer');

      expect(result).toEqual({
        data: quotes,
        meta: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      });

      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'user-123' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should return all quotes for admin', async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([mockQuote]);
      mockPrismaService.quote.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20 }, 'admin-123', 'admin');

      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {}, // No customer filter for admin
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([]);
      mockPrismaService.quote.count.mockResolvedValue(0);

      await service.findAll({ status: QuoteStatus.APPROVED }, 'user-123', 'customer');

      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            customerId: 'user-123',
            status: QuoteStatus.APPROVED,
          },
        }),
      );
    });

    it('should use cache for frequently accessed pages', async () => {
      const cacheKey = 'quotes:user-123:page-1:limit-20';
      const cachedData = { data: [mockQuote], meta: {} };

      mockCacheService.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.findAll({ page: 1, limit: 20 }, 'user-123', 'customer');

      expect(result).toEqual(cachedData);
      expect(mockPrismaService.quote.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return quote with all relations', async () => {
      const detailedQuote = {
        ...mockQuote,
        items: [
          {
            id: 'item-123',
            technology: Technology.FFF,
            material: Material.PLA,
            quantity: 10,
            unitPrice: 25.5,
            totalPrice: 255.0,
          },
        ],
        customer: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        },
        files: [
          {
            id: 'file-456',
            fileName: 'part.stl',
            fileSize: 1024000,
          },
        ],
      };

      mockPrismaService.quote.findUnique.mockResolvedValue(detailedQuote);

      const result = await service.findOne('quote-123');

      expect(result).toEqual(detailedQuote);
      expect(mockPrismaService.quote.findUnique).toHaveBeenCalledWith({
        where: { id: 'quote-123' },
        include: {
          items: true,
          customer: true,
          files: true,
        },
      });
    });

    it('should throw NotFoundException if quote not found', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });

    it('should use cache for frequently accessed quotes', async () => {
      const cacheKey = 'quote:quote-123';
      mockCacheService.get.mockResolvedValue(JSON.stringify(mockQuote));

      const result = await service.findOne('quote-123');

      expect(result).toEqual(mockQuote);
      expect(mockPrismaService.quote.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('calculate', () => {
    it('should calculate quote totals', async () => {
      const quoteWithItems = {
        ...mockQuote,
        items: [
          {
            id: 'item-1',
            unitPrice: 25.5,
            totalPrice: 255.0,
            quantity: 10,
          },
          {
            id: 'item-2',
            unitPrice: 35.0,
            totalPrice: 175.0,
            quantity: 5,
          },
        ],
      };

      mockPrismaService.quote.findUnique.mockResolvedValue(quoteWithItems);
      mockPricingService.calculateQuoteTotal.mockResolvedValue({
        subtotal: 430.0,
        tax: 77.4,
        shipping: 25.0,
        totalPrice: 532.4,
      });

      const updatedQuote = {
        ...quoteWithItems,
        subtotal: 430.0,
        tax: 77.4,
        shipping: 25.0,
        totalPrice: 532.4,
        status: QuoteStatus.READY,
      };

      mockPrismaService.quote.update.mockResolvedValue(updatedQuote);

      const result = await service.calculate('quote-123');

      expect(result.totalPrice).toBe(532.4);
      expect(result.status).toBe(QuoteStatus.READY);
      expect(mockCacheService.del).toHaveBeenCalledWith('quote:quote-123');
    });

    it('should handle empty quotes', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(mockQuote);

      await expect(service.calculate('quote-123')).rejects.toThrow(
        'Cannot calculate quote without items',
      );
    });

    it('should apply currency conversion', async () => {
      const quoteInEUR = {
        ...mockQuote,
        currency: 'EUR',
        exchangeRate: 0.92,
        items: [{ unitPrice: 25.5, totalPrice: 255.0, quantity: 10 }],
      };

      mockPrismaService.quote.findUnique.mockResolvedValue(quoteInEUR);
      mockPricingService.calculateQuoteTotal.mockResolvedValue({
        subtotal: 234.6, // Converted to EUR
        tax: 42.23,
        totalPrice: 276.83,
      });

      mockPrismaService.quote.update.mockResolvedValue({
        ...quoteInEUR,
        totalPrice: 276.83,
      });

      const result = await service.calculate('quote-123');

      expect(result.currency).toBe('EUR');
      expect(result.exchangeRate).toBe(0.92);
    });
  });

  describe('approve', () => {
    it('should approve a valid quote', async () => {
      const readyQuote = {
        ...mockQuote,
        status: QuoteStatus.READY,
        totalPrice: 500.0,
      };

      mockPrismaService.quote.findUnique.mockResolvedValue(readyQuote);
      mockPrismaService.quote.update.mockResolvedValue({
        ...readyQuote,
        status: QuoteStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: 'user-123',
      });

      const result = await service.approve('quote-123', 'user-123');

      expect(result.status).toBe(QuoteStatus.APPROVED);
      expect(result.approvedBy).toBe('user-123');
      expect(mockJobsService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ORDER_CREATION',
        }),
      );
    });

    it('should prevent approving draft quotes', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(mockQuote);

      await expect(service.approve('quote-123', 'user-123')).rejects.toThrow(
        'Quote must be calculated before approval',
      );
    });

    it('should prevent approving expired quotes', async () => {
      const expiredQuote = {
        ...mockQuote,
        status: QuoteStatus.READY,
        validUntil: new Date(Date.now() - 1000),
      };

      mockPrismaService.quote.findUnique.mockResolvedValue(expiredQuote);

      await expect(service.approve('quote-123', 'user-123')).rejects.toThrow('Quote has expired');
    });
  });

  describe('cancel', () => {
    it('should cancel a quote with reason', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(mockQuote);
      mockPrismaService.quote.update.mockResolvedValue({
        ...mockQuote,
        status: QuoteStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: 'Requirements changed',
      });

      const result = await service.cancel('quote-123', 'Requirements changed');

      expect(result.status).toBe(QuoteStatus.CANCELLED);
      expect(result.cancellationReason).toBe('Requirements changed');
    });

    it('should prevent cancelling completed quotes', async () => {
      const completedQuote = {
        ...mockQuote,
        status: QuoteStatus.COMPLETED,
      };

      mockPrismaService.quote.findUnique.mockResolvedValue(completedQuote);

      await expect(service.cancel('quote-123', 'Try to cancel')).rejects.toThrow(
        'Cannot cancel a completed quote',
      );
    });
  });

  describe('generatePdf', () => {
    it('should generate and upload PDF', async () => {
      const detailedQuote = {
        ...mockQuote,
        items: [
          {
            fileName: 'part.stl',
            technology: Technology.FFF,
            material: Material.PLA,
            quantity: 10,
            unitPrice: 25.5,
            totalPrice: 255.0,
          },
        ],
        totalPrice: 300.0,
      };

      mockPrismaService.quote.findUnique.mockResolvedValue(detailedQuote);

      const pdfUrl = 'https://s3.amazonaws.com/quotes/quote-123.pdf';
      jest.spyOn(service as any, 'uploadPdfToS3').mockResolvedValue(pdfUrl);

      const result = await service.generatePdf('quote-123');

      expect(result.url).toBe(pdfUrl);
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'quote-pdf:quote-123',
        pdfUrl,
        86400, // 24 hours
      );
    });

    it('should return cached PDF URL if available', async () => {
      const cachedUrl = 'https://s3.amazonaws.com/quotes/quote-123.pdf';
      mockCacheService.get.mockResolvedValue(cachedUrl);

      const result = await service.generatePdf('quote-123');

      expect(result.url).toBe(cachedUrl);
      expect(mockPrismaService.quote.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('checkOwnership', () => {
    it('should return true for quote owner', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(mockQuote);

      const result = await service.checkOwnership('quote-123', 'user-123');

      expect(result).toBe(true);
    });

    it('should return false for non-owner', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(mockQuote);

      const result = await service.checkOwnership('quote-123', 'other-user');

      expect(result).toBe(false);
    });

    it('should return true for admin/manager roles', async () => {
      mockPrismaService.quote.findUnique.mockResolvedValue(mockQuote);

      const result = await service.checkOwnership('quote-123', 'admin-user', 'admin');

      expect(result).toBe(true);
    });
  });
});
