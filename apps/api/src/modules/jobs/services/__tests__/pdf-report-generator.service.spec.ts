import { Test, TestingModule } from '@nestjs/testing';
import { PdfReportGeneratorService } from '../pdf-report-generator.service';
import { LoggerService } from '@/common/logger/logger.service';
import * as fs from 'fs';
import PDFDocument from 'pdfkit';

// Mock PDFDocument
jest.mock('pdfkit');
// fs.createWriteStream is non-configurable under Node 22, so spyOn() fails with
// "Cannot redefine property". Replace the module with a jest.fn factory instead.
jest.mock('fs', () => ({ createWriteStream: jest.fn() }));

describe('PdfReportGeneratorService', () => {
  let service: PdfReportGeneratorService;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfReportGeneratorService,
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

    service = module.get<PdfReportGeneratorService>(PdfReportGeneratorService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateReport', () => {
    const mockQuoteData: any = {
      id: 'quote-123',
      number: 'Q-2024-001',
      status: 'active',
      currency: 'USD',
      createdAt: new Date('2024-01-15'),
      validUntil: new Date('2024-02-15'),
      subtotal: 1000,
      tax: 100,
      shipping: 50,
      total: 1150,
      customer: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
      },
      items: [
        {
          files: [{ originalName: 'part1.stl' }],
          material: { name: 'PLA' },
          manufacturingProcess: { name: '3D Printing' },
          quantity: 10,
          unitPrice: 100,
          currency: 'USD',
        },
      ],
    };

    const mockOptions = {
      language: 'en' as const,
      includeItemDetails: true,
    };

    it('should generate a PDF report for a quote', async () => {
      // Mock PDFDocument instance
      const mockDoc = {
        pipe: jest.fn(),
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        end: jest.fn(),
        page: { height: 800 },
      };

      (PDFDocument as jest.MockedClass<typeof PDFDocument>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => mockDoc as any,
      );

      // Mock file stream
      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            // Simulate stream finish
            setTimeout(callback, 10);
          }
          return mockStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream as any);

      const result = await service.generateReport('quote', mockQuoteData, mockOptions);

      expect(result).toHaveProperty('filePath');
      expect(result).toHaveProperty('fileName');
      expect(result.fileName).toMatch(/^quote-quote-123-\d+\.pdf$/);
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Generating PDF report'),
      );
      expect(mockDoc.text).toHaveBeenCalledWith('Quote Report', expect.any(Object));
    });

    it('should handle order reports', async () => {
      const mockOrderData: any = {
        id: 'order-123',
        number: 'O-2024-001',
        status: 'completed',
        createdAt: new Date('2024-01-15'),
        customer: mockQuoteData.customer,
        quote: mockQuoteData,
        paymentStatus: 'paid',
        totalAmount: 1150,
        totalPaid: 1150,
        currency: 'USD',
      };

      const mockDoc = {
        pipe: jest.fn(),
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        end: jest.fn(),
        page: { height: 800 },
      };

      (PDFDocument as jest.MockedClass<typeof PDFDocument>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => mockDoc as any,
      );

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream as any);

      const result = await service.generateReport('order', mockOrderData, mockOptions);

      expect(result.fileName).toMatch(/^order-order-123-\d+\.pdf$/);
      expect(mockDoc.text).toHaveBeenCalledWith('Order Report', expect.any(Object));
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Order Number: O-2024-001'),
      );
    });

    it('should handle invoice reports', async () => {
      const mockInvoiceData: any = {
        id: 'inv-123',
        number: 'INV-2024-001',
        status: 'paid',
        currency: 'USD',
        issuedAt: new Date('2024-01-15'),
        dueAt: new Date('2024-02-15'),
        subtotal: 1000,
        tax: 100,
        total: 1100,
        totalPaid: 1100,
        tenant: {
          name: 'Cotiza Studio Inc.',
          taxId: 'TAX123456',
        },
        customer: {
          name: 'John Doe',
          company: 'Acme Corp',
          billingAddress: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
          },
        },
        order: {
          quote: {
            items: mockQuoteData.items,
          },
        },
      };

      const mockDoc = {
        pipe: jest.fn(),
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        end: jest.fn(),
        page: { height: 800 },
      };

      (PDFDocument as jest.MockedClass<typeof PDFDocument>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => mockDoc as any,
      );

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream as any);

      const result = await service.generateReport('invoice', mockInvoiceData, mockOptions);

      expect(result.fileName).toMatch(/^invoice-inv-123-\d+\.pdf$/);
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('INVOICE #INV-2024-001'),
        expect.anything(),
      );
    });

    it('should handle analytics reports', async () => {
      const mockAnalyticsData: any = {
        criteria: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
        quotes: [
          { status: 'accepted', _count: 10, _sum: { total: 10000 } },
          { status: 'pending', _count: 5, _sum: { total: 5000 } },
        ],
        orders: [{ status: 'completed', _count: 8, _sum: { totalPaid: 8000 } }],
        revenue: [
          { period: '2024-01-01', order_count: 3, revenue: 3000 },
          { period: '2024-01-02', order_count: 5, revenue: 5000 },
        ],
      };

      const mockDoc = {
        pipe: jest.fn(),
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        end: jest.fn(),
        page: { height: 800 },
      };

      (PDFDocument as jest.MockedClass<typeof PDFDocument>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => mockDoc as any,
      );

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream as any);

      const result = await service.generateReport('analytics', mockAnalyticsData, mockOptions);

      expect(result.fileName).toMatch(/^analytics-report-\d+\.pdf$/);
      expect(mockDoc.text).toHaveBeenCalledWith('Analytics Report', expect.any(Object));
    });

    it('should handle Spanish language option', async () => {
      const mockDoc = {
        pipe: jest.fn(),
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        end: jest.fn(),
        page: { height: 800 },
      };

      (PDFDocument as jest.MockedClass<typeof PDFDocument>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => mockDoc as any,
      );

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream as any);

      await service.generateReport('quote', mockQuoteData, { ...mockOptions, language: 'es' });

      expect(mockDoc.text).toHaveBeenCalledWith('Reporte de Cotización', expect.any(Object));
    });

    it('should handle stream errors', async () => {
      const mockDoc = {
        pipe: jest.fn(),
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        end: jest.fn(),
        page: { height: 800 },
      };

      (PDFDocument as jest.MockedClass<typeof PDFDocument>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => mockDoc as any,
      );

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Stream error')), 10);
          }
          return mockStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream as any);

      await expect(service.generateReport('quote', mockQuoteData, mockOptions)).rejects.toThrow(
        'Stream error',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Error generating PDF report'),
      );
    });

    it('should format currency correctly', async () => {
      const mockDoc = {
        pipe: jest.fn(),
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        end: jest.fn(),
        page: { height: 800 },
      };

      (PDFDocument as jest.MockedClass<typeof PDFDocument>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => mockDoc as any,
      );

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream as any);

      const mxnQuoteData = { ...mockQuoteData, currency: 'MXN' };
      await service.generateReport('quote', mxnQuoteData, mockOptions);

      // Currency formatting is applied per-currency: MXN renders as "MX$" in the
      // en-US locale, and the total line carries an { underline: true } option.
      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining('Total: MX$1,150.00'),
        expect.anything(),
      );
    });
  });

  describe('edge cases', () => {
    it('should handle missing customer data gracefully', async () => {
      const mockDoc = {
        pipe: jest.fn(),
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        end: jest.fn(),
        page: { height: 800 },
      };

      (PDFDocument as jest.MockedClass<typeof PDFDocument>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => mockDoc as any,
      );

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream as any);

      const quoteWithoutCustomer: any = {
        id: 'quote-123',
        number: 'Q-2024-001',
        status: 'active',
        currency: 'USD',
        createdAt: new Date(),
        validUntil: new Date(),
        items: [],
      };

      await service.generateReport('quote', quoteWithoutCustomer, {});

      expect(mockDoc.text).toHaveBeenCalledWith(expect.stringContaining('Name: N/A'));
      expect(mockDoc.text).toHaveBeenCalledWith(expect.stringContaining('Email: N/A'));
    });

    it('should handle empty items array', async () => {
      const mockDoc = {
        pipe: jest.fn(),
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        end: jest.fn(),
        page: { height: 800 },
      };

      (PDFDocument as jest.MockedClass<typeof PDFDocument>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => mockDoc as any,
      );

      const mockStream = {
        on: jest.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
          return mockStream;
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream as any);

      const quoteWithNoItems: any = {
        id: 'quote-123',
        number: 'Q-2024-001',
        status: 'active',
        currency: 'USD',
        createdAt: new Date(),
        validUntil: new Date(),
        subtotal: 1000,
        tax: 100,
        shipping: 50,
        total: 1150,
        customer: { name: 'John Doe', email: 'john@example.com' },
        items: [],
      };

      await service.generateReport('quote', quoteWithNoItems, { includeItemDetails: true });

      // Should complete without errors
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('PDF report generated successfully'),
      );
    });
  });
});
