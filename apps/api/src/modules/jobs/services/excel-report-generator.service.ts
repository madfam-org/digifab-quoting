import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ReportGenerationJobData } from '../interfaces/job.interface';
import { LoggerService } from '@/common/logger/logger.service';
import {
  ReportItem,
  QuoteOrderData,
  QuoteStatistic,
  OrderStatistic,
  RevenueByPeriod,
  AnalyticsData,
  InvoiceData,
} from '../interfaces/report.interface';

@Injectable()
export class ExcelReportGeneratorService {
  constructor(private readonly logger: LoggerService) {}

  async generateReport(
    reportType: ReportGenerationJobData['reportType'],
    data: QuoteOrderData | InvoiceData | AnalyticsData,
    options: ReportGenerationJobData['options'],
  ): Promise<{ filePath: string; fileName: string }> {
    const dataId = 'id' in data ? (data as QuoteOrderData | InvoiceData).id : 'report';
    const fileName = `${reportType}-${dataId}-${Date.now()}.xlsx`;
    const filePath = join(tmpdir(), fileName);

    this.logger.log(`Generating Excel report: ${fileName}`);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Cotiza Studio Quoting System';
    workbook.created = new Date();

    switch (reportType) {
      case 'quote':
      case 'order':
        this.addQuoteOrderSheet(workbook, data as QuoteOrderData, reportType, options);
        break;
      case 'invoice':
        this.addInvoiceSheet(workbook, data as InvoiceData, options);
        break;
      case 'analytics':
        this.addAnalyticsSheets(workbook, data as AnalyticsData, options);
        break;
    }

    await workbook.xlsx.writeFile(filePath);
    this.logger.log(`Excel report generated successfully: ${fileName}`);

    return { filePath, fileName };
  }

  private addQuoteOrderSheet(
    workbook: ExcelJS.Workbook,
    data: QuoteOrderData,
    reportType: 'quote' | 'order',
    options: ReportGenerationJobData['options'],
  ): void {
    const sheet = workbook.addWorksheet(reportType === 'quote' ? 'Quote Details' : 'Order Details');

    // Header styling
    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, size: 12 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    // Add header information
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = `${reportType.toUpperCase()} #${data.number}`;
    sheet.getCell('A1').font = { bold: true, size: 16 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    // Customer information
    let row = 3;
    sheet.getCell(`A${row}`).value = 'Customer Information';
    sheet.getCell(`A${row}`).style = headerStyle;
    sheet.mergeCells(`A${row}:B${row}`);
    row++;

    const customer = reportType === 'order' ? data.customer : data.customer;
    if (customer) {
      sheet.getCell(`A${row}`).value = 'Name:';
      sheet.getCell(`B${row}`).value = customer.name || 'N/A';
      row++;
      sheet.getCell(`A${row}`).value = 'Email:';
      sheet.getCell(`B${row}`).value = customer.email || 'N/A';
      row++;
      sheet.getCell(`A${row}`).value = 'Phone:';
      sheet.getCell(`B${row}`).value = customer.phone || 'N/A';
      row += 2;
    }

    // Quote/Order details
    sheet.getCell(`A${row}`).value = `${reportType} Details`;
    sheet.getCell(`A${row}`).style = headerStyle;
    sheet.mergeCells(`A${row}:B${row}`);
    row++;

    sheet.getCell(`A${row}`).value = 'Date:';
    sheet.getCell(`B${row}`).value = new Date(data.createdAt).toLocaleDateString();
    row++;
    sheet.getCell(`A${row}`).value = 'Status:';
    sheet.getCell(`B${row}`).value = data.status;
    row++;

    if (reportType === 'quote') {
      sheet.getCell(`A${row}`).value = 'Valid Until:';
      sheet.getCell(`B${row}`).value = new Date(
        (data as QuoteOrderData & { validUntil?: Date }).validUntil || data.createdAt,
      ).toLocaleDateString();
      row++;
    }

    row += 2;

    // Items table
    if (options?.includeItemDetails) {
      const items =
        reportType === 'order'
          ? (data as QuoteOrderData & { quote?: { items?: ReportItem[] } }).quote?.items
          : data.items;
      if (items && items.length > 0) {
        this.addItemsTable(sheet, items, row);
      }
    }

    // Auto-fit columns
    sheet.columns.forEach((column) => {
      column.width = 15;
    });
  }

  private addInvoiceSheet(
    workbook: ExcelJS.Workbook,
    invoice: InvoiceData,
    _options: ReportGenerationJobData['options'],
  ): void {
    const sheet = workbook.addWorksheet('Invoice');

    // Invoice header
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = `INVOICE #${invoice.number}`;
    sheet.getCell('A1').font = { bold: true, size: 16 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    let row = 3;

    // Company info
    if (invoice.tenant) {
      sheet.getCell(`A${row}`).value = invoice.tenant.name;
      sheet.getCell(`A${row}`).font = { bold: true, size: 14 };
      row++;
      if (invoice.tenant.taxId) {
        sheet.getCell(`A${row}`).value = `Tax ID: ${invoice.tenant.taxId}`;
        row++;
      }
      row++;
    }

    // Billing info
    sheet.getCell(`A${row}`).value = 'Bill To:';
    sheet.getCell(`A${row}`).font = { bold: true };
    row++;

    if (invoice.customer) {
      sheet.getCell(`A${row}`).value = invoice.customer.name;
      row++;
      if (invoice.customer.company) {
        sheet.getCell(`A${row}`).value = invoice.customer.company;
        row++;
      }
      row += 2;
    }

    // Invoice details
    sheet.getCell(`A${row}`).value = 'Invoice Date:';
    sheet.getCell(`B${row}`).value = new Date(
      (invoice as InvoiceData & { issuedAt?: Date }).issuedAt || invoice.dueDate,
    ).toLocaleDateString();
    row++;
    sheet.getCell(`A${row}`).value = 'Due Date:';
    sheet.getCell(`B${row}`).value = new Date(
      (invoice as InvoiceData & { dueAt?: Date }).dueAt || invoice.dueDate,
    ).toLocaleDateString();
    row++;
    sheet.getCell(`A${row}`).value = 'Status:';
    sheet.getCell(`B${row}`).value = String(invoice.status);
    row += 2;

    // Line items
    if (invoice.order?.quote?.items) {
      this.addInvoiceItemsTable(
        sheet,
        invoice.order.quote.items,
        row,
        (invoice as InvoiceData & { currency?: string }).currency || 'MXN',
      );
      row += invoice.order.quote.items.length + 4;
    }

    // Totals
    sheet.getCell(`E${row}`).value = 'Subtotal:';
    sheet.getCell(`F${row}`).value = this.formatCurrency(
      invoice.subtotal,
      (invoice as InvoiceData & { currency?: string }).currency || 'MXN',
    );
    row++;
    sheet.getCell(`E${row}`).value = 'Tax:';
    sheet.getCell(`F${row}`).value = this.formatCurrency(
      invoice.tax,
      (invoice as InvoiceData & { currency?: string }).currency || 'MXN',
    );
    row++;
    sheet.getCell(`E${row}`).value = 'Total:';
    sheet.getCell(`E${row}`).font = { bold: true };
    sheet.getCell(`F${row}`).value = this.formatCurrency(
      invoice.total,
      (invoice as InvoiceData & { currency?: string }).currency || 'MXN',
    );
    sheet.getCell(`F${row}`).font = { bold: true };

    // Auto-fit columns
    sheet.columns.forEach((column) => {
      column.width = 15;
    });
  }

  private addAnalyticsSheets(
    workbook: ExcelJS.Workbook,
    data: AnalyticsData,
    _options: ReportGenerationJobData['options'],
  ): void {
    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    this.addAnalyticsSummary(summarySheet, data);

    // Quote statistics sheet
    if (data.quotes && data.quotes.length > 0) {
      const quoteSheet = workbook.addWorksheet('Quote Statistics');
      this.addQuoteStatistics(quoteSheet, data.quotes);
    }

    // Order statistics sheet
    if (data.orders && data.orders.length > 0) {
      const orderSheet = workbook.addWorksheet('Order Statistics');
      this.addOrderStatistics(orderSheet, data.orders);
    }

    // Revenue sheet
    if (data.revenue && data.revenue.length > 0) {
      const revenueSheet = workbook.addWorksheet('Revenue Analysis');
      this.addRevenueAnalysis(revenueSheet, data.revenue);
    }
  }

  private addItemsTable(sheet: ExcelJS.Worksheet, items: ReportItem[], startRow: number): void {
    const headers = ['#', 'Item', 'Material', 'Process', 'Quantity', 'Unit Price', 'Total'];
    const headerRow = sheet.getRow(startRow);

    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.style = {
        font: { bold: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
        border: {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        },
      };
    });

    items.forEach((item, index) => {
      const row = sheet.getRow(startRow + index + 1);
      row.getCell(1).value = index + 1;
      row.getCell(2).value =
        (item as ReportItem & { files?: Array<{ originalName?: string }> }).files?.[0]
          ?.originalName ||
        item.name ||
        'Unknown';
      row.getCell(3).value =
        (item as ReportItem & { material?: { name?: string } }).material?.name || 'N/A';
      row.getCell(4).value =
        (item as ReportItem & { manufacturingProcess?: { name?: string }; processCode?: string })
          .manufacturingProcess?.name ||
        (item as ReportItem & { processCode?: string }).processCode ||
        'N/A';
      row.getCell(5).value = item.quantity;
      row.getCell(6).value = item.unitPrice;
      row.getCell(7).value = item.unitPrice * item.quantity;

      // Format currency cells
      row.getCell(6).numFmt = '"$"#,##0.00';
      row.getCell(7).numFmt = '"$"#,##0.00';
    });
  }

  private addInvoiceItemsTable(
    sheet: ExcelJS.Worksheet,
    items: ReportItem[],
    startRow: number,
    currency: string,
  ): void {
    const headers = ['#', 'Description', 'Quantity', 'Unit Price', 'Total'];
    const headerRow = sheet.getRow(startRow);

    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.style = {
        font: { bold: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
      };
    });

    items.forEach((item, index) => {
      const row = sheet.getRow(startRow + index + 1);
      row.getCell(1).value = index + 1;
      row.getCell(2).value = item.name || 'Item';
      row.getCell(3).value = item.quantity;
      row.getCell(4).value = item.unitPrice;
      row.getCell(5).value = item.unitPrice * item.quantity;

      // Format currency cells
      const currencyFormat = currency === 'MXN' ? '"MXN"#,##0.00' : '"$"#,##0.00';
      row.getCell(4).numFmt = currencyFormat;
      row.getCell(5).numFmt = currencyFormat;
    });
  }

  private addAnalyticsSummary(sheet: ExcelJS.Worksheet, data: AnalyticsData): void {
    sheet.getCell('A1').value = 'Analytics Summary';
    sheet.getCell('A1').font = { bold: true, size: 16 };

    sheet.getCell('A3').value = 'Period:';
    sheet.getCell('B3').value =
      `${new Date(data.criteria.startDate).toLocaleDateString()} - ${new Date(data.criteria.endDate).toLocaleDateString()}`;

    let row = 5;
    sheet.getCell(`A${row}`).value = 'Key Metrics';
    sheet.getCell(`A${row}`).font = { bold: true };
    row += 2;

    // Add summary metrics
    const totalQuotes =
      data.quotes?.reduce((sum: number, q: QuoteStatistic) => sum + q._count, 0) || 0;
    const totalOrders =
      data.orders?.reduce((sum: number, o: OrderStatistic) => sum + o._count, 0) || 0;
    const totalRevenue =
      data.revenue?.reduce((sum: number, r: RevenueByPeriod) => sum + (r.revenue || 0), 0) || 0;

    sheet.getCell(`A${row}`).value = 'Total Quotes:';
    sheet.getCell(`B${row}`).value = totalQuotes;
    row++;
    sheet.getCell(`A${row}`).value = 'Total Orders:';
    sheet.getCell(`B${row}`).value = totalOrders;
    row++;
    sheet.getCell(`A${row}`).value = 'Total Revenue:';
    sheet.getCell(`B${row}`).value = totalRevenue;
    sheet.getCell(`B${row}`).numFmt = '"$"#,##0.00';
  }

  private addQuoteStatistics(sheet: ExcelJS.Worksheet, quotes: QuoteStatistic[]): void {
    sheet.getCell('A1').value = 'Quote Statistics by Status';
    sheet.getCell('A1').font = { bold: true, size: 14 };

    const headers = ['Status', 'Count', 'Total Value'];
    const headerRow = sheet.getRow(3);
    headers.forEach((header, index) => {
      headerRow.getCell(index + 1).value = header;
      headerRow.getCell(index + 1).font = { bold: true };
    });

    quotes.forEach((stat, index) => {
      const row = sheet.getRow(4 + index);
      row.getCell(1).value = stat.status;
      row.getCell(2).value = stat._count;
      row.getCell(3).value = stat._sum.total || 0;
      row.getCell(3).numFmt = '"$"#,##0.00';
    });
  }

  private addOrderStatistics(sheet: ExcelJS.Worksheet, orders: OrderStatistic[]): void {
    sheet.getCell('A1').value = 'Order Statistics by Status';
    sheet.getCell('A1').font = { bold: true, size: 14 };

    const headers = ['Status', 'Count', 'Total Paid'];
    const headerRow = sheet.getRow(3);
    headers.forEach((header, index) => {
      headerRow.getCell(index + 1).value = header;
      headerRow.getCell(index + 1).font = { bold: true };
    });

    orders.forEach((stat, index) => {
      const row = sheet.getRow(4 + index);
      row.getCell(1).value = stat.status;
      row.getCell(2).value = stat._count;
      row.getCell(3).value = stat._sum.totalPaid || 0;
      row.getCell(3).numFmt = '"$"#,##0.00';
    });
  }

  private addRevenueAnalysis(sheet: ExcelJS.Worksheet, revenue: RevenueByPeriod[]): void {
    sheet.getCell('A1').value = 'Revenue by Period';
    sheet.getCell('A1').font = { bold: true, size: 14 };

    const headers = ['Period', 'Order Count', 'Revenue'];
    const headerRow = sheet.getRow(3);
    headers.forEach((header, index) => {
      headerRow.getCell(index + 1).value = header;
      headerRow.getCell(index + 1).font = { bold: true };
    });

    revenue.forEach((period, index) => {
      const row = sheet.getRow(4 + index);
      row.getCell(1).value = new Date(period.period).toLocaleDateString();
      row.getCell(2).value = period.order_count;
      row.getCell(3).value = period.revenue;
      row.getCell(3).numFmt = '"$"#,##0.00';
    });

    // Add chart (placeholder - would need chart generation logic)
    sheet.getCell('E3').value = 'Revenue Trend';
    sheet.getCell('E3').font = { bold: true };
  }

  private formatCurrency(amount: number | undefined, currency?: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount || 0);
  }
}
