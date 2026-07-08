import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';
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
  CustomerData,
} from '../interfaces/report.interface';

@Injectable()
export class PdfReportGeneratorService {
  constructor(private readonly logger: LoggerService) {}

  async generateReport(
    reportType: ReportGenerationJobData['reportType'],
    data: QuoteOrderData | InvoiceData | AnalyticsData,
    options: ReportGenerationJobData['options'],
  ): Promise<{ filePath: string; fileName: string }> {
    const fileName = `${reportType}-${(data as QuoteOrderData | InvoiceData).id || 'report'}-${Date.now()}.pdf`;
    const filePath = join(tmpdir(), fileName);

    this.logger.log(`Generating PDF report: ${fileName}`);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      // Add report header
      doc.fontSize(20).text(this.getReportTitle(reportType, options?.language), {
        align: 'center',
      });
      doc.moveDown();

      // Add report content based on type
      switch (reportType) {
        case 'quote':
          this.addQuoteContent(doc, data as QuoteOrderData, options);
          break;
        case 'order':
          this.addOrderContent(doc, data as QuoteOrderData, options);
          break;
        case 'invoice':
          this.addInvoiceContent(doc, data as InvoiceData, options);
          break;
        case 'analytics':
          this.addAnalyticsContent(doc, data as AnalyticsData, options);
          break;
      }

      // Add footer
      doc
        .fontSize(10)
        .text(`Generated on ${new Date().toLocaleString()}`, 50, doc.page.height - 50, {
          align: 'center',
        });

      doc.end();

      stream.on('finish', () => {
        this.logger.log(`PDF report generated successfully: ${fileName}`);
        resolve({ filePath, fileName });
      });

      stream.on('error', (error) => {
        this.logger.error(`Error generating PDF report: ${error.message}`);
        reject(error);
      });
    });
  }

  private getReportTitle(
    reportType: ReportGenerationJobData['reportType'],
    language?: 'en' | 'es',
  ): string {
    const titles = {
      en: {
        quote: 'Quote Report',
        order: 'Order Report',
        invoice: 'Invoice',
        analytics: 'Analytics Report',
      },
      es: {
        quote: 'Reporte de Cotización',
        order: 'Reporte de Pedido',
        invoice: 'Factura',
        analytics: 'Reporte de Análisis',
      },
    };

    return titles[language || 'en'][reportType];
  }

  private addQuoteContent(
    doc: InstanceType<typeof PDFDocument>,
    quote: QuoteOrderData,
    options: ReportGenerationJobData['options'],
  ): void {
    // Customer information
    doc.fontSize(14).text('Customer Information', { underline: true });
    doc
      .fontSize(12)
      .text(`Name: ${quote.customer?.name || 'N/A'}`)
      .text(`Email: ${quote.customer?.email || 'N/A'}`)
      .text(`Phone: ${quote.customer?.phone || 'N/A'}`)
      .moveDown();

    // Quote details
    doc.fontSize(14).text('Quote Details', { underline: true });
    doc
      .fontSize(12)
      .text(`Quote Number: ${quote.number}`)
      .text(`Date: ${new Date(quote.createdAt).toLocaleDateString()}`)
      .text(
        `Valid Until: ${new Date((quote as QuoteOrderData & { validUntil?: Date }).validUntil || quote.createdAt).toLocaleDateString()}`,
      )
      .text(`Status: ${quote.status}`)
      .text(`Currency: ${quote.currency}`)
      .moveDown();

    // Items
    if (options?.includeItemDetails && quote.items?.length > 0) {
      doc.fontSize(14).text('Items', { underline: true });
      quote.items.forEach((item: ReportItem, index: number) => {
        this.addQuoteItemDetails(doc, item, index + 1);
      });
    }

    // Pricing summary
    this.addPricingSummary(doc, quote);
  }

  private addQuoteItemDetails(
    doc: InstanceType<typeof PDFDocument>,
    item: ReportItem,
    index: number,
  ): void {
    const fileName =
      (item as ReportItem & { files?: Array<{ originalName?: string }> }).files?.[0]
        ?.originalName ||
      item.name ||
      'Unknown file';
    const materialName =
      (item as ReportItem & { material?: { name?: string } }).material?.name || 'Unknown material';
    const processName =
      (item as ReportItem & { manufacturingProcess?: { name?: string }; processCode?: string })
        .manufacturingProcess?.name ||
      (item as ReportItem & { processCode?: string }).processCode ||
      'Unknown process';

    doc
      .fontSize(12)
      .text(`${index}. ${fileName}`)
      .text(`   Material: ${materialName}`)
      .text(`   Process: ${processName}`)
      .text(`   Quantity: ${item.quantity || 0}`)
      .text(
        `   Unit Price: ${this.formatCurrency(item.unitPrice || 0, (item as ReportItem & { currency?: string }).currency || 'MXN')}`,
      )
      .text(
        `   Total: ${this.formatCurrency((item.unitPrice || 0) * (item.quantity || 0), (item as ReportItem & { currency?: string }).currency || 'MXN')}`,
      )
      .moveDown(0.5);
  }

  private addOrderContent(
    doc: InstanceType<typeof PDFDocument>,
    order: QuoteOrderData,
    options: ReportGenerationJobData['options'],
  ): void {
    // Order header
    doc.fontSize(14).text('Order Information', { underline: true });
    doc
      .fontSize(12)
      .text(`Order Number: ${order.number}`)
      .text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`)
      .text(`Status: ${order.status}`)
      .moveDown();

    // Customer information
    if (order.customer) {
      doc.fontSize(14).text('Customer Information', { underline: true });
      doc
        .fontSize(12)
        .text(`Name: ${order.customer.name}`)
        .text(`Email: ${order.customer.email}`)
        .text(`Phone: ${order.customer.phone || 'N/A'}`)
        .moveDown();
    }

    // Quote information
    if (order.quote) {
      doc.fontSize(14).text('Quote Details', { underline: true });
      doc.fontSize(12).text(`Quote Number: ${order.quote.number}`).moveDown();

      // Add quote items if requested
      if (options?.includeItemDetails && order.quote.items) {
        // Create a minimal QuoteOrderData for the quote content
        const quoteData: QuoteOrderData = {
          id: order.quote.id,
          number: order.quote.number,
          status: 'QUOTED', // Default status for quote within order
          createdAt: order.createdAt,
          items: order.quote.items,
          customer: order.customer,
          totalAmount: order.totalAmount || 0,
          currency: order.currency || 'MXN',
        };
        this.addQuoteContent(doc, quoteData, options);
      }
    }

    // Payment information
    this.addPaymentInformation(doc, order);
  }

  private addInvoiceContent(
    doc: InstanceType<typeof PDFDocument>,
    invoice: InvoiceData,
    _options: ReportGenerationJobData['options'],
  ): void {
    // Invoice header
    doc.fontSize(16).text(`INVOICE #${invoice.number}`, { align: 'right' });
    doc.moveDown();

    // Company information (from tenant)
    if (invoice.tenant) {
      doc
        .fontSize(12)
        .text(invoice.tenant.name, { align: 'left' })
        .text(invoice.tenant.taxId || '', { align: 'left' })
        .moveDown();
    }

    // Billing information
    doc.fontSize(14).text('Bill To:', { underline: true });
    if (invoice.customer) {
      doc
        .fontSize(12)
        .text(invoice.customer.name)
        .text(invoice.customer.company || '')
        .text(
          (
            invoice.customer as CustomerData & {
              billingAddress?: {
                street?: string;
                city?: string;
                state?: string;
                postalCode?: string;
                country?: string;
              };
            }
          ).billingAddress?.street || '',
        )
        .text(
          `${(invoice.customer as CustomerData & { billingAddress?: { city?: string; state?: string; postalCode?: string } }).billingAddress?.city || ''}, ${(invoice.customer as CustomerData & { billingAddress?: { state?: string } }).billingAddress?.state || ''} ${(invoice.customer as CustomerData & { billingAddress?: { postalCode?: string } }).billingAddress?.postalCode || ''}`,
        )
        .text(
          (invoice.customer as CustomerData & { billingAddress?: { country?: string } })
            .billingAddress?.country || '',
        )
        .moveDown();
    }

    // Invoice details
    doc.fontSize(14).text('Invoice Details', { underline: true });
    doc
      .fontSize(12)
      .text(
        `Invoice Date: ${new Date((invoice as InvoiceData & { issuedAt?: Date }).issuedAt || invoice.dueDate).toLocaleDateString()}`,
      )
      .text(
        `Due Date: ${new Date((invoice as InvoiceData & { dueAt?: Date }).dueAt || invoice.dueDate).toLocaleDateString()}`,
      )
      .text(`Status: ${invoice.status}`)
      .moveDown();

    // Line items
    if (invoice.order?.quote?.items) {
      this.addInvoiceLineItems(
        doc,
        invoice.order.quote.items,
        (invoice as InvoiceData & { currency?: string }).currency || 'MXN',
      );
    }

    // Totals
    this.addInvoiceTotals(doc, invoice);
  }

  private addAnalyticsContent(
    doc: InstanceType<typeof PDFDocument>,
    data: AnalyticsData,
    _options: ReportGenerationJobData['options'],
  ): void {
    doc.fontSize(14).text('Analytics Period', { underline: true });
    doc
      .fontSize(12)
      .text(`From: ${new Date(data.criteria.startDate).toLocaleDateString()}`)
      .text(`To: ${new Date(data.criteria.endDate).toLocaleDateString()}`)
      .moveDown();

    // Quote statistics
    if (data.quotes) {
      doc.fontSize(14).text('Quote Statistics', { underline: true });
      data.quotes.forEach((stat: QuoteStatistic) => {
        doc
          .fontSize(12)
          .text(
            `${stat.status}: ${stat._count} quotes, Total: ${this.formatCurrency(stat._sum.total || 0)}`,
          );
      });
      doc.moveDown();
    }

    // Order statistics
    if (data.orders) {
      doc.fontSize(14).text('Order Statistics', { underline: true });
      data.orders.forEach((stat: OrderStatistic) => {
        doc
          .fontSize(12)
          .text(
            `${stat.status}: ${stat._count} orders, Total: ${this.formatCurrency(stat._sum.totalPaid || 0)}`,
          );
      });
      doc.moveDown();
    }

    // Revenue chart (simplified text representation)
    if (data.revenue && data.revenue.length > 0) {
      doc.fontSize(14).text('Revenue by Period', { underline: true });
      data.revenue.forEach((period: RevenueByPeriod) => {
        doc
          .fontSize(12)
          .text(
            `${new Date(period.period).toLocaleDateString()}: ${this.formatCurrency(period.revenue)}`,
          );
      });
    }
  }

  private addPricingSummary(
    doc: InstanceType<typeof PDFDocument>,
    quote: QuoteOrderData & { subtotal?: number; tax?: number; shipping?: number; total?: number },
  ): void {
    doc.fontSize(14).text('Pricing Summary', { underline: true });
    doc
      .fontSize(12)
      .text(`Subtotal: ${this.formatCurrency(quote.subtotal || 0, quote.currency)}`)
      .text(`Tax: ${this.formatCurrency(quote.tax || 0, quote.currency)}`)
      .text(`Shipping: ${this.formatCurrency(quote.shipping || 0, quote.currency)}`)
      .text(
        `Total: ${this.formatCurrency(quote.total || quote.totalAmount || 0, quote.currency)}`,
        {
          underline: true,
        },
      );
  }

  private addPaymentInformation(
    doc: InstanceType<typeof PDFDocument>,
    order: QuoteOrderData & { paymentStatus?: string; totalPaid?: number },
  ): void {
    doc.fontSize(14).text('Payment Information', { underline: true });
    doc
      .fontSize(12)
      .text(`Payment Status: ${order.paymentStatus || 'pending'}`)
      .text(`Total Amount: ${this.formatCurrency(order.totalAmount, order.currency)}`)
      .text(`Amount Paid: ${this.formatCurrency(order.totalPaid || 0, order.currency)}`);
  }

  private addInvoiceLineItems(
    doc: InstanceType<typeof PDFDocument>,
    items: ReportItem[],
    currency: string,
  ): void {
    doc.fontSize(14).text('Line Items', { underline: true });
    doc.moveDown(0.5);

    let subtotal = 0;
    items.forEach((item: ReportItem, index: number) => {
      const total = item.unitPrice * item.quantity;
      subtotal += total;

      doc
        .fontSize(11)
        .text(`${index + 1}. ${item.name || 'Item'}`, { continued: true })
        .text(
          `${item.quantity} x ${this.formatCurrency(item.unitPrice, currency)} = ${this.formatCurrency(total, currency)}`,
          { align: 'right' },
        );
    });

    doc.moveDown();
    doc
      .fontSize(12)
      .text(`Subtotal: ${this.formatCurrency(subtotal, currency)}`, { align: 'right' });
  }

  private addInvoiceTotals(doc: InstanceType<typeof PDFDocument>, invoice: InvoiceData): void {
    doc.moveDown();
    doc
      .fontSize(12)
      .text(
        `Subtotal: ${this.formatCurrency(invoice.subtotal, (invoice as InvoiceData & { currency?: string }).currency || 'MXN')}`,
        {
          align: 'right',
        },
      )
      .text(
        `Tax: ${this.formatCurrency(invoice.tax, (invoice as InvoiceData & { currency?: string }).currency || 'MXN')}`,
        { align: 'right' },
      )
      .text(
        `Total: ${this.formatCurrency(invoice.total, (invoice as InvoiceData & { currency?: string }).currency || 'MXN')}`,
        {
          align: 'right',
          underline: true,
        },
      );

    if (invoice.totalPaid && invoice.totalPaid > 0) {
      doc
        .text(
          `Paid: ${this.formatCurrency(invoice.totalPaid, (invoice as InvoiceData & { currency?: string }).currency || 'MXN')}`,
          {
            align: 'right',
          },
        )
        .text(
          `Balance Due: ${this.formatCurrency(invoice.total - (invoice.totalPaid || 0), (invoice as InvoiceData & { currency?: string }).currency || 'MXN')}`,
          {
            align: 'right',
            underline: true,
          },
        );
    }
  }

  private formatCurrency(amount: number, currency?: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount || 0);
  }
}
