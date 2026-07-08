import { Test, TestingModule } from '@nestjs/testing';
import { CsvReportGeneratorService } from '../csv-report-generator.service';
import { LoggerService } from '@/common/logger/logger.service';
import { createWriteStream } from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  createWriteStream: jest.fn(),
}));

describe('CsvReportGeneratorService', () => {
  let service: CsvReportGeneratorService;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvReportGeneratorService,
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

    service = module.get<CsvReportGeneratorService>(CsvReportGeneratorService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateReport', () => {
    let mockStream: any;

    beforeEach(() => {
      mockStream = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            setTimeout(callback, 10);
          }
          return mockStream as any;
        }),
      };
      (createWriteStream as jest.Mock).mockReturnValue(mockStream);
    });

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
        company: 'Acme, Inc.',
      },
      items: [
        {
          files: [{ originalName: 'part1.stl' }],
          material: { name: 'PLA' },
          manufacturingProcess: { name: '3D Printing' },
          quantity: 10,
          unitPrice: 100,
        },
      ],
    };

    it('should generate a CSV report for a quote', async () => {
      const result = await service.generateReport('quote', mockQuoteData, {});

      expect(result).toHaveProperty('filePath');
      expect(result).toHaveProperty('fileName');
      expect(result.fileName).toMatch(/^quote-quote-123-\d+\.csv$/);
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Generating CSV report'),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('CSV report generated successfully'),
      );

      // Verify CSV content was written
      expect(mockStream.write).toHaveBeenCalled();
      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('QUOTE REPORT');
      expect(csvContent).toContain('Q-2024-001');
      expect(csvContent).toContain('John Doe');
    });

    it('should escape CSV values with commas', async () => {
      await service.generateReport('quote', mockQuoteData, {});

      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('"Acme, Inc."'); // Company name with comma should be quoted
    });

    it('should handle order reports', async () => {
      const mockOrderData: any = {
        id: 'order-123',
        number: 'O-2024-001',
        status: 'completed',
        createdAt: new Date('2024-01-15'),
        customer: mockQuoteData.customer,
        quote: mockQuoteData,
      };

      const result = await service.generateReport('order', mockOrderData, {});

      expect(result.fileName).toMatch(/^order-order-123-\d+\.csv$/);
      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('ORDER REPORT');
      expect(csvContent).toContain('O-2024-001');
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
          email: 'john@example.com',
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
            items: [{ name: 'Item 1', quantity: 1, unitPrice: 1000 }],
          },
        },
      };

      const result = await service.generateReport('invoice', mockInvoiceData, {});

      expect(result.fileName).toMatch(/^invoice-inv-123-\d+\.csv$/);
      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('INVOICE');
      expect(csvContent).toContain('INV-2024-001');
      expect(csvContent).toContain('BILL TO');
      expect(csvContent).toContain('LINE ITEMS');
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

      const result = await service.generateReport('analytics', mockAnalyticsData, {});

      expect(result.fileName).toMatch(/^analytics-report-\d+\.csv$/);
      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('ANALYTICS REPORT');
      expect(csvContent).toContain('QUOTE STATISTICS');
      expect(csvContent).toContain('ORDER STATISTICS');
      expect(csvContent).toContain('REVENUE BY PERIOD');
      expect(csvContent).toContain('Conversion Rate');
    });

    it('should throw error for unsupported report types', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(service.generateReport('unsupported' as any, {} as any, {})).rejects.toThrow(
        'CSV generation not supported for report type: unsupported',
      );
    });

    it('should handle missing customer data', async () => {
      const quoteWithoutCustomer = {
        ...mockQuoteData,
        customer: null,
      };

      const result = await service.generateReport('quote', quoteWithoutCustomer, {});

      const csvContent = mockStream.write.mock.calls[0][0];
      // A null customer is handled gracefully: the report still generates and
      // the customer section is omitted rather than throwing.
      expect(result).toHaveProperty('fileName');
      expect(csvContent).toContain('QUOTE REPORT');
      expect(csvContent).not.toContain('CUSTOMER INFORMATION');
    });

    it('should handle empty items array', async () => {
      const quoteWithNoItems = {
        ...mockQuoteData,
        items: [],
      };

      const result = await service.generateReport('quote', quoteWithNoItems, {});

      const csvContent = mockStream.write.mock.calls[0][0];
      // An empty items list is handled gracefully: no line-item rows are
      // emitted and the report still renders its totals section.
      expect(result).toHaveProperty('fileName');
      expect(csvContent).not.toContain('part1.stl');
      expect(csvContent).toContain('TOTALS');
    });

    it('should escape values with double quotes', async () => {
      const quoteWithQuotes = {
        ...mockQuoteData,
        customer: {
          ...mockQuoteData.customer,
          company: 'Acme "The Best" Corp',
        },
      };

      await service.generateReport('quote', quoteWithQuotes, {});

      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('"Acme ""The Best"" Corp"'); // Double quotes should be escaped
    });

    it('should escape values with newlines', async () => {
      const quoteWithNewlines = {
        ...mockQuoteData,
        customer: {
          ...mockQuoteData.customer,
          name: 'John\nDoe',
        },
      };

      await service.generateReport('quote', quoteWithNewlines, {});

      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('"John\nDoe"'); // Values with newlines should be quoted
    });

    it('should handle write stream errors', async () => {
      const errorStream = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Write failed')), 10);
          }
          return errorStream;
        }),
      };
      (createWriteStream as jest.Mock).mockReturnValue(errorStream);

      await expect(service.generateReport('quote', mockQuoteData, {})).rejects.toThrow(
        'Write failed',
      );
    });

    it('should handle missing invoice customer billing address', async () => {
      const invoiceWithoutAddress: any = {
        id: 'inv-123',
        number: 'INV-2024-001',
        status: 'paid',
        currency: 'USD',
        issuedAt: new Date(),
        dueAt: new Date(),
        customer: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      await service.generateReport('invoice', invoiceWithoutAddress, {});

      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('BILL TO');
      expect(csvContent).not.toContain('Address,');
    });

    it('should calculate conversion rate for analytics', async () => {
      const analyticsData: any = {
        criteria: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
        quotes: [{ status: 'accepted', _count: 10, _sum: { total: 10000 } }],
        orders: [{ status: 'completed', _count: 5, _sum: { totalPaid: 5000 } }],
      };

      await service.generateReport('analytics', analyticsData, {});

      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('Total Quotes,10');
      expect(csvContent).toContain('Total Orders,5');
      expect(csvContent).toContain('Conversion Rate,50.00%');
    });

    it('should handle zero quotes in conversion rate calculation', async () => {
      const analyticsData: any = {
        criteria: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
        quotes: [],
        orders: [],
      };

      await service.generateReport('analytics', analyticsData, {});

      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('Total Quotes,0');
      expect(csvContent).toContain('Total Orders,0');
      expect(csvContent).not.toContain('Conversion Rate'); // Should not include conversion rate when no quotes
    });

    it('should handle special characters in CSV values', async () => {
      const quoteWithSpecialChars = {
        ...mockQuoteData,
        items: [
          {
            files: [{ originalName: 'part="test",file.stl' }],
            material: { name: 'PLA\nFilament' },
            manufacturingProcess: { name: '3D,Printing' },
            quantity: 10,
            unitPrice: 100,
          },
        ],
      };

      await service.generateReport('quote', quoteWithSpecialChars, {});

      const csvContent = mockStream.write.mock.calls[0][0];
      expect(csvContent).toContain('"part=""test"",file.stl"'); // Properly escaped
      expect(csvContent).toContain('"PLA\nFilament"'); // Newline quoted
      expect(csvContent).toContain('"3D,Printing"'); // Comma quoted
    });
  });

  describe('escapeCsvValue', () => {
    it('should return empty string for falsy values', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const escapeMethod = (service as any).escapeCsvValue.bind(service);
      expect(escapeMethod(null)).toBe('');
      expect(escapeMethod(undefined)).toBe('');
      expect(escapeMethod('')).toBe('');
    });

    it('should not quote simple values', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const escapeMethod = (service as any).escapeCsvValue.bind(service);
      expect(escapeMethod('simple')).toBe('simple');
      expect(escapeMethod('123')).toBe('123');
    });

    it('should quote and escape complex values', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const escapeMethod = (service as any).escapeCsvValue.bind(service);
      expect(escapeMethod('value,with,commas')).toBe('"value,with,commas"');
      expect(escapeMethod('value"with"quotes')).toBe('"value""with""quotes"');
      expect(escapeMethod('value\nwith\nnewlines')).toBe('"value\nwith\nnewlines"');
    });
  });
});
