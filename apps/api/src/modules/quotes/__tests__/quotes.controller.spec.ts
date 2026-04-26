import { Test, TestingModule } from '@nestjs/testing';
import { QuotesController } from '../quotes.controller';
import { QuotesService } from '../quotes.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CacheService } from '@/cache/cache.service';
import { FilesService } from '@/modules/files/files.service';
import { PricingService } from '@/modules/pricing/pricing.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { QuoteStatus, Technology, Material } from '@prisma/client';

describe('QuotesController', () => {
  let controller: QuotesController;
  let quotesService: QuotesService;

  const mockQuotesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addItem: jest.fn(),
    calculate: jest.fn(),
    approve: jest.fn(),
    cancel: jest.fn(),
    generatePdf: jest.fn(),
    checkOwnership: jest.fn(),
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'customer',
    tenantId: 'tenant-123',
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
    totalPrice: 0,
    currency: 'USD',
    validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    tenantId: 'tenant-123',
  };

  const mockQuoteItem = {
    id: 'item-123',
    quoteId: 'quote-123',
    fileId: 'file-123',
    fileName: 'part.stl',
    technology: Technology.FFF,
    material: Material.PLA,
    quantity: 10,
    unitPrice: 25.5,
    totalPrice: 255.0,
    leadTime: 3,
    status: 'priced',
    manufacturingDetails: {
      volume: 125.5,
      boundingBox: { x: 100, y: 50, z: 25 },
      machineTime: 180,
      complexity: 'medium',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotesController],
      providers: [
        {
          provide: QuotesService,
          useValue: mockQuotesService,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: FilesService,
          useValue: {},
        },
        {
          provide: PricingService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<QuotesController>(QuotesController);
    quotesService = module.get<QuotesService>(QuotesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createQuoteDto = {
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
      requestedDelivery: new Date('2025-02-15'),
    };

    it('should create a new quote', async () => {
      const expectedQuote = {
        ...mockQuote,
        ...createQuoteDto,
        id: 'quote-456',
      };

      mockQuotesService.create.mockResolvedValue(expectedQuote);

      const result = await controller.create(createQuoteDto, { user: mockUser });

      expect(result).toEqual(expectedQuote);
      expect(mockQuotesService.create).toHaveBeenCalledWith(
        createQuoteDto,
        mockUser.id,
        mockUser.tenantId,
      );
    });

    it('should validate required fields', async () => {
      const invalidDto = {
        projectName: '', // Invalid: empty
        items: [], // Invalid: no items
      };

      mockQuotesService.create.mockRejectedValue(new BadRequestException('Validation failed'));

      await expect(controller.create(invalidDto, { user: mockUser })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle file not found error', async () => {
      mockQuotesService.create.mockRejectedValue(new NotFoundException('File not found'));

      await expect(controller.create(createQuoteDto, { user: mockUser })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should enforce item limits', async () => {
      const tooManyItems = {
        projectName: 'Project',
        items: Array(101).fill({
          fileId: 'file-123',
          technology: Technology.FFF,
          material: Material.PLA,
          quantity: 1,
        }),
      };

      mockQuotesService.create.mockRejectedValue(
        new BadRequestException('Too many items (max 100)'),
      );

      await expect(controller.create(tooManyItems, { user: mockUser })).rejects.toThrow(
        'Too many items',
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated quotes list', async () => {
      const quotes = [mockQuote, { ...mockQuote, id: 'quote-456' }];
      const paginatedResult = {
        data: quotes,
        meta: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      };

      mockQuotesService.findAll.mockResolvedValue(paginatedResult);

      const result = await controller.findAll({ page: 1, limit: 20 }, { user: mockUser });

      expect(result).toEqual(paginatedResult);
      expect(mockQuotesService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        mockUser.id,
        mockUser.role,
      );
    });

    it('should filter quotes by status', async () => {
      mockQuotesService.findAll.mockResolvedValue({
        data: [mockQuote],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await controller.findAll({ status: QuoteStatus.DRAFT }, { user: mockUser });

      expect(mockQuotesService.findAll).toHaveBeenCalledWith(
        { status: QuoteStatus.DRAFT },
        mockUser.id,
        mockUser.role,
      );
    });

    it('should filter quotes by date range', async () => {
      const dateFilter = {
        createdAfter: new Date('2025-01-01'),
        createdBefore: new Date('2025-01-31'),
      };

      mockQuotesService.findAll.mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      await controller.findAll(dateFilter, { user: mockUser });

      expect(mockQuotesService.findAll).toHaveBeenCalledWith(
        dateFilter,
        mockUser.id,
        mockUser.role,
      );
    });

    it('should return all quotes for admin users', async () => {
      const adminUser = { ...mockUser, role: 'admin' };

      mockQuotesService.findAll.mockResolvedValue({
        data: [mockQuote],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      await controller.findAll({}, { user: adminUser });

      expect(mockQuotesService.findAll).toHaveBeenCalledWith({}, adminUser.id, 'admin');
    });
  });

  describe('findOne', () => {
    it('should return quote details', async () => {
      const detailedQuote = {
        ...mockQuote,
        items: [mockQuoteItem],
        customer: {
          id: mockUser.id,
          name: 'Test User',
          email: mockUser.email,
        },
      };

      mockQuotesService.findOne.mockResolvedValue(detailedQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      const result = await controller.findOne('quote-123', { user: mockUser });

      expect(result).toEqual(detailedQuote);
      expect(mockQuotesService.findOne).toHaveBeenCalledWith('quote-123');
    });

    it('should throw 404 if quote not found', async () => {
      mockQuotesService.findOne.mockRejectedValue(new NotFoundException('Quote not found'));

      await expect(controller.findOne('invalid-id', { user: mockUser })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should check ownership for non-admin users', async () => {
      mockQuotesService.findOne.mockResolvedValue(mockQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(false);

      await expect(controller.findOne('quote-123', { user: mockUser })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow admin to view any quote', async () => {
      const adminUser = { ...mockUser, role: 'admin' };

      mockQuotesService.findOne.mockResolvedValue(mockQuote);

      const result = await controller.findOne('quote-123', { user: adminUser });

      expect(result).toEqual(mockQuote);
      expect(mockQuotesService.checkOwnership).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateDto = {
      projectName: 'Updated Project',
      description: 'Updated description',
    };

    it('should update quote details', async () => {
      const updatedQuote = { ...mockQuote, ...updateDto };

      mockQuotesService.update.mockResolvedValue(updatedQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      const result = await controller.update('quote-123', updateDto, { user: mockUser });

      expect(result).toEqual(updatedQuote);
      expect(mockQuotesService.update).toHaveBeenCalledWith('quote-123', updateDto);
    });

    it('should prevent updates to approved quotes', async () => {
      const approvedQuote = { ...mockQuote, status: QuoteStatus.APPROVED };

      mockQuotesService.findOne.mockResolvedValue(approvedQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      await expect(controller.update('quote-123', updateDto, { user: mockUser })).rejects.toThrow(
        'Cannot update approved quote',
      );
    });

    it('should prevent non-owners from updating', async () => {
      mockQuotesService.checkOwnership.mockResolvedValue(false);

      await expect(controller.update('quote-123', updateDto, { user: mockUser })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('addItem', () => {
    const addItemDto = {
      fileId: 'file-789',
      technology: Technology.CNC,
      material: Material.ALUMINUM_6061,
      quantity: 15,
      finishType: 'ANODIZED',
      notes: 'Black anodizing required',
    };

    it('should add item to quote', async () => {
      const updatedQuote = {
        ...mockQuote,
        items: [mockQuoteItem, { ...mockQuoteItem, id: 'item-456' }],
      };

      mockQuotesService.addItem.mockResolvedValue(updatedQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      const result = await controller.addItem('quote-123', addItemDto, { user: mockUser });

      expect(result).toEqual(updatedQuote);
      expect(mockQuotesService.addItem).toHaveBeenCalledWith('quote-123', addItemDto);
    });

    it('should validate technology and material compatibility', async () => {
      const invalidCombination = {
        fileId: 'file-789',
        technology: Technology.FFF,
        material: Material.ALUMINUM_6061, // Invalid for FFF
        quantity: 1,
      };

      mockQuotesService.addItem.mockRejectedValue(
        new BadRequestException('Invalid technology-material combination'),
      );

      await expect(
        controller.addItem('quote-123', invalidCombination, { user: mockUser }),
      ).rejects.toThrow('Invalid technology-material combination');
    });
  });

  describe('calculate', () => {
    it('should calculate quote pricing', async () => {
      const calculatedQuote = {
        ...mockQuote,
        subtotal: 255.0,
        tax: 45.9,
        totalPrice: 300.9,
        items: [
          {
            ...mockQuoteItem,
            unitPrice: 25.5,
            totalPrice: 255.0,
          },
        ],
      };

      mockQuotesService.calculate.mockResolvedValue(calculatedQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      const result = await controller.calculate('quote-123', { user: mockUser });

      expect(result).toEqual(calculatedQuote);
      expect(mockQuotesService.calculate).toHaveBeenCalledWith('quote-123');
    });

    it('should handle calculation errors', async () => {
      mockQuotesService.calculate.mockRejectedValue(
        new BadRequestException('Missing required data for calculation'),
      );

      await expect(controller.calculate('quote-123', { user: mockUser })).rejects.toThrow(
        'Missing required data for calculation',
      );
    });
  });

  describe('approve', () => {
    it('should approve quote', async () => {
      const approvedQuote = {
        ...mockQuote,
        status: QuoteStatus.APPROVED,
        approvedAt: new Date(),
      };

      mockQuotesService.approve.mockResolvedValue(approvedQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      const result = await controller.approve('quote-123', { user: mockUser });

      expect(result).toEqual(approvedQuote);
      expect(mockQuotesService.approve).toHaveBeenCalledWith('quote-123', mockUser.id);
    });

    it('should prevent approving expired quotes', async () => {
      const expiredQuote = {
        ...mockQuote,
        validUntil: new Date(Date.now() - 1000),
      };

      mockQuotesService.findOne.mockResolvedValue(expiredQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      await expect(controller.approve('quote-123', { user: mockUser })).rejects.toThrow(
        'Quote has expired',
      );
    });
  });

  describe('cancel', () => {
    it('should cancel quote', async () => {
      const cancelledQuote = {
        ...mockQuote,
        status: QuoteStatus.CANCELLED,
        cancelledAt: new Date(),
      };

      mockQuotesService.cancel.mockResolvedValue(cancelledQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      const result = await controller.cancel(
        'quote-123',
        { reason: 'Changed requirements' },
        { user: mockUser },
      );

      expect(result).toEqual(cancelledQuote);
      expect(mockQuotesService.cancel).toHaveBeenCalledWith('quote-123', 'Changed requirements');
    });

    it('should prevent cancelling completed quotes', async () => {
      const completedQuote = {
        ...mockQuote,
        status: QuoteStatus.COMPLETED,
      };

      mockQuotesService.findOne.mockResolvedValue(completedQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      await expect(controller.cancel('quote-123', {}, { user: mockUser })).rejects.toThrow(
        'Cannot cancel completed quote',
      );
    });
  });

  describe('generatePdf', () => {
    it('should generate quote PDF', async () => {
      const pdfUrl = 'https://s3.amazonaws.com/quotes/quote-123.pdf';

      mockQuotesService.generatePdf.mockResolvedValue({ url: pdfUrl });
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      const result = await controller.generatePdf('quote-123', { user: mockUser });

      expect(result).toEqual({ url: pdfUrl });
      expect(mockQuotesService.generatePdf).toHaveBeenCalledWith('quote-123');
    });

    it('should cache generated PDFs', async () => {
      const pdfUrl = 'https://s3.amazonaws.com/quotes/quote-123.pdf';

      mockQuotesService.generatePdf.mockResolvedValue({ url: pdfUrl });
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      // First call
      await controller.generatePdf('quote-123', { user: mockUser });

      // Second call should use cache
      await controller.generatePdf('quote-123', { user: mockUser });

      expect(mockQuotesService.generatePdf).toHaveBeenCalledTimes(1);
    });
  });

  describe('permissions', () => {
    it('should allow customers to view own quotes', async () => {
      mockQuotesService.findOne.mockResolvedValue(mockQuote);
      mockQuotesService.checkOwnership.mockResolvedValue(true);

      const result = await controller.findOne('quote-123', { user: mockUser });

      expect(result).toEqual(mockQuote);
    });

    it('should allow operators to view all quotes', async () => {
      const operatorUser = { ...mockUser, role: 'operator' };

      mockQuotesService.findOne.mockResolvedValue(mockQuote);

      const result = await controller.findOne('quote-123', { user: operatorUser });

      expect(result).toEqual(mockQuote);
    });

    it('should allow managers to update any quote', async () => {
      const managerUser = { ...mockUser, role: 'manager' };
      const updateDto = { projectName: 'Manager Update' };

      mockQuotesService.update.mockResolvedValue({ ...mockQuote, ...updateDto });

      const result = await controller.update('quote-123', updateDto, { user: managerUser });

      expect(result.projectName).toBe('Manager Update');
    });
  });
});
