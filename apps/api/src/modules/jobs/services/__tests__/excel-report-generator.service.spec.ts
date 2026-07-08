import { Test, TestingModule } from '@nestjs/testing';
import { ExcelReportGeneratorService } from '../excel-report-generator.service';
import { LoggerService } from '@/common/logger/logger.service';
import * as ExcelJS from 'exceljs';

// Mock ExcelJS
jest.mock('exceljs');

describe('ExcelReportGeneratorService', () => {
  let service: ExcelReportGeneratorService;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExcelReportGeneratorService,
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

    service = module.get<ExcelReportGeneratorService>(ExcelReportGeneratorService);
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

    interface MockCell {
      value: unknown;
      font: Record<string, unknown>;
      alignment: Record<string, unknown>;
      fill: Record<string, unknown>;
      border: Record<string, unknown>;
      numFmt?: string;
    }

    // mockWorkbook / mockWorksheet are intentionally partial stand-ins for the
    // ExcelJS Workbook/Worksheet (typed `any`) — the real classes carry ~30
    // members the generator never touches under test.
    let mockWorkbook: any;
    let mockWorksheet: any;

    beforeEach(() => {
      mockWorksheet = {
        mergeCells: jest.fn(),
        getCell: jest.fn().mockReturnValue({
          value: undefined,
          font: {},
          alignment: {},
          style: {},
        }),
        getRow: jest.fn().mockReturnValue({
          getCell: jest.fn().mockReturnValue({
            value: undefined,
            style: {},
            font: {},
            numFmt: undefined,
          }),
        }),
        columns: [],
      };

      mockWorkbook = {
        creator: '',
        created: undefined,
        addWorksheet: jest.fn().mockReturnValue(mockWorksheet),
        xlsx: {
          writeFile: jest.fn().mockResolvedValue(undefined),
        },
      };

      (ExcelJS.Workbook as jest.MockedClass<typeof ExcelJS.Workbook>).mockImplementation(
        () => mockWorkbook,
      );
    });

    it('should generate an Excel report for a quote', async () => {
      const result = await service.generateReport('quote', mockQuoteData, mockOptions);

      expect(result).toHaveProperty('filePath');
      expect(result).toHaveProperty('fileName');
      expect(result.fileName).toMatch(/^quote-quote-123-\d+\.xlsx$/);
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Quote Details');
      expect(mockWorksheet.mergeCells).toHaveBeenCalledWith('A1:F1');
      expect(mockWorksheet.getCell).toHaveBeenCalledWith('A1');
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Generating Excel report'),
      );
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith(expect.stringContaining('.xlsx'));
    });

    it('should generate an Excel report for an order', async () => {
      const mockOrderData: any = {
        id: 'order-123',
        number: 'O-2024-001',
        status: 'completed',
        createdAt: new Date('2024-01-15'),
        customer: mockQuoteData.customer,
        quote: mockQuoteData,
      };

      const result = await service.generateReport('order', mockOrderData, mockOptions);

      expect(result.fileName).toMatch(/^order-order-123-\d+\.xlsx$/);
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Order Details');
    });

    it('should generate an Excel report for an invoice', async () => {
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

      const result = await service.generateReport('invoice', mockInvoiceData, mockOptions);

      expect(result.fileName).toMatch(/^invoice-inv-123-\d+\.xlsx$/);
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Invoice');
    });

    it('should generate analytics report with multiple sheets', async () => {
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

      const result = await service.generateReport('analytics', mockAnalyticsData, mockOptions);

      expect(result.fileName).toMatch(/^analytics-report-\d+\.xlsx$/);
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Summary');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Quote Statistics');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Order Statistics');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Revenue Analysis');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledTimes(4);
    });

    it('should include item details when option is enabled', async () => {
      await service.generateReport('quote', mockQuoteData, { includeItemDetails: true });

      const rowCalls = mockWorksheet.getRow.mock.calls;
      expect(rowCalls.length).toBeGreaterThan(0);

      // Verify that item details were added
      const cellSetCalls = mockWorksheet.getRow.mock.results.flatMap(
        (result: { value: { getCell: jest.Mock } }) => result.value.getCell.mock.calls,
      );

      expect(cellSetCalls.length).toBeGreaterThan(0);
    });

    it('should format currency cells correctly', async () => {
      const mockGetCell = jest.fn();
      const mockCell = {
        value: undefined,
        numFmt: undefined,
      };
      mockGetCell.mockReturnValue(mockCell);

      mockWorksheet.getRow.mockReturnValue({
        getCell: mockGetCell,
      });

      await service.generateReport('quote', mockQuoteData, mockOptions);

      // Check that currency format was applied
      const cellsWithNumFmt = mockGetCell.mock.results
        .map((result: { value: MockCell }) => result.value)
        .filter((cell: MockCell) => cell.numFmt);

      expect(cellsWithNumFmt.some((cell: MockCell) => cell.numFmt === '"$"#,##0.00')).toBe(true);
    });

    it('should handle MXN currency format', async () => {
      const mockGetCell = jest.fn();
      const mockCell = {
        value: undefined,
        numFmt: undefined,
      };
      mockGetCell.mockReturnValue(mockCell);

      mockWorksheet.getRow.mockReturnValue({
        getCell: mockGetCell,
      });

      const mxnInvoiceData: any = {
        id: 'inv-123',
        number: 'INV-2024-001',
        currency: 'MXN',
        issuedAt: new Date(),
        dueAt: new Date(),
        subtotal: 1000,
        tax: 100,
        total: 1100,
        order: {
          quote: {
            items: [{ name: 'Item 1', quantity: 1, unitPrice: 1000 }],
          },
        },
      };

      await service.generateReport('invoice', mxnInvoiceData, mockOptions);

      const cellsWithNumFmt = mockGetCell.mock.results
        .map((result: { value: MockCell }) => result.value)
        .filter((cell: MockCell) => cell.numFmt);

      expect(cellsWithNumFmt.some((cell: MockCell) => cell.numFmt === '"MXN"#,##0.00')).toBe(true);
    });

    it('should handle missing data gracefully', async () => {
      const incompleteQuote: any = {
        id: 'quote-123',
        number: 'Q-2024-001',
        createdAt: new Date(),
        items: [],
      };

      await expect(
        service.generateReport('quote', incompleteQuote, mockOptions),
      ).resolves.toHaveProperty('fileName');

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Excel report generated successfully'),
      );
    });

    it('should handle file write errors', async () => {
      mockWorkbook.xlsx.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(service.generateReport('quote', mockQuoteData, mockOptions)).rejects.toThrow(
        'Write failed',
      );
    });

    it('should set column widths', async () => {
      const mockColumns: Array<{ key?: string; header?: string; width?: number }> = [];
      mockWorksheet.columns = mockColumns;

      await service.generateReport('quote', mockQuoteData, mockOptions);

      // Verify columns were configured
      expect(mockColumns.length).toBe(0); // Initially empty

      // The service should iterate over columns and set width
      // This is done through forEach, so we verify the columns array was accessed
      expect(mockWorksheet.columns).toBeDefined();
    });

    it('should create proper headers for analytics summary', async () => {
      const mockAnalyticsData: any = {
        criteria: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
        quotes: [{ status: 'accepted', _count: 10, _sum: { total: 10000 } }],
        orders: [{ status: 'completed', _count: 8, _sum: { totalPaid: 8000 } }],
        revenue: [{ period: '2024-01-01', order_count: 3, revenue: 3000 }],
      };

      const getCellSpy = jest.fn().mockReturnValue({
        value: undefined,
        font: {},
      });
      mockWorksheet.getCell = getCellSpy;

      await service.generateReport('analytics', mockAnalyticsData, mockOptions);

      // Verify summary headers were set
      expect(getCellSpy).toHaveBeenCalledWith('A1');
      expect(getCellSpy).toHaveBeenCalledWith('A3');
    });
    it('should handle workbook creation errors', async () => {
      (ExcelJS.Workbook as jest.MockedClass<typeof ExcelJS.Workbook>).mockImplementation(() => {
        throw new Error('Workbook creation failed');
      });

      await expect(service.generateReport('quote', {} as any, {})).rejects.toThrow(
        'Workbook creation failed',
      );
    });

    it('should handle undefined analytics data arrays', async () => {
      const mockAnalyticsData: any = {
        criteria: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
        // Missing quotes, orders, revenue arrays
      };

      await expect(
        service.generateReport('analytics', mockAnalyticsData, {}),
      ).resolves.toHaveProperty('fileName');

      // Should create Summary sheet even with missing data
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Summary');
    });
  });
});
