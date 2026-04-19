import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { LoggerService } from '@/common/logger/logger.service';
import { Currency } from '@prisma/client';
import PDFKit from 'pdfkit';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class QuotePdfService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.bucketName = this.configService.get<string>('S3_BUCKET', '');
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
    });
  }

  async generatePdf(
    tenantId: string,
    quoteId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    // Fetch quote with all related data
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId, tenantId },
      include: {
        items: {
          include: {
            files: true,
            dfmReport: true,
          },
        },
        customer: {
          select: {
            name: true,
            email: true,
            customer: {
              select: {
                company: true,
              },
            },
          },
        },
        tenant: {
          select: {
            name: true,
            branding: true,
          },
        },
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    // Generate PDF buffer
    const pdfBuffer = await this.createPdfBuffer(quote);

    // Upload to S3
    const key = `quotes/${tenantId}/${quoteId}/quote-${quote.number}.pdf`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        Metadata: {
          quoteId: quoteId,
          tenantId: tenantId,
          generatedAt: new Date().toISOString(),
        },
      }),
    );

    // Generate presigned URL (valid for 7 days)
    const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds
    const url = await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
      { expiresIn },
    );

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    this.logger.log(`Generated PDF for quote ${quote.number}`, {
      quoteId,
      tenantId,
      key,
      expiresAt,
    });

    return { url, expiresAt };
  }

  private async createPdfBuffer(quote: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFKit({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        // Node 22 narrowed Buffer.concat's overload to Uint8Array[]; Buffer
        // extends Uint8Array so the map is a zero-copy cast.
        doc.on('end', () => resolve(Buffer.concat(chunks.map((c) => new Uint8Array(c)))));
        doc.on('error', reject);

        // Header
        this.addHeader(doc, quote);

        // Customer Information
        this.addCustomerInfo(doc, quote);

        // Quote Details
        this.addQuoteDetails(doc, quote);

        // Items Table
        this.addItemsTable(doc, quote);

        // Totals
        this.addTotals(doc, quote);

        // Terms and Footer
        this.addTermsAndFooter(doc, quote);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private addHeader(doc: PDFKit.PDFDocument, quote: any): void {
    const branding = quote.tenant?.branding || {};

    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(quote.tenant?.name || 'Cotiza Studio Quote', 50, 50);

    doc
      .fontSize(12)
      .font('Helvetica')
      .text(`Quote #${quote.number}`, 400, 50)
      .text(`Date: ${new Date(quote.createdAt).toLocaleDateString()}`, 400, 65)
      .text(`Valid Until: ${new Date(quote.validityUntil).toLocaleDateString()}`, 400, 80);

    doc.moveTo(50, 110).lineTo(550, 110).stroke();
  }

  private addCustomerInfo(doc: PDFKit.PDFDocument, quote: any): void {
    doc.fontSize(14).font('Helvetica-Bold').text('Bill To:', 50, 130);

    let y = 150;
    if (quote.customer?.company) {
      doc.fontSize(12).font('Helvetica').text(quote.customer.company, 50, y);
      y += 15;
    }

    if (quote.customer?.name) {
      doc.text(quote.customer.name, 50, y);
      y += 15;
    }

    if (quote.customer?.email) {
      doc.text(quote.customer.email, 50, y);
    }
  }

  private addQuoteDetails(doc: PDFKit.PDFDocument, quote: any): void {
    const currency = (quote.currency as Currency) || Currency.MXN;
    const symbol = this.getCurrencySymbol(currency);

    doc.fontSize(14).font('Helvetica-Bold').text('Quote Details:', 300, 130);

    doc.fontSize(12).font('Helvetica').text(`Currency: ${currency} (${symbol})`, 300, 150);

    doc
      .fontSize(12)
      .font('Helvetica')
      .text(`Currency: ${quote.currency}`, 300, 150)
      .text(`Status: ${quote.status.toUpperCase()}`, 300, 165);

    if (quote.sustainability) {
      const sustainability =
        typeof quote.sustainability === 'string'
          ? JSON.parse(quote.sustainability)
          : quote.sustainability;
      doc.text(`Sustainability Score: ${sustainability.score || 'N/A'}`, 300, 180);
    }
  }

  private addItemsTable(doc: PDFKit.PDFDocument, quote: any): void {
    const tableTop = 220;
    const tableHeaders = ['Item', 'Process', 'Material', 'Qty', 'Unit Price', 'Total'];
    const columnWidths = [120, 80, 80, 40, 80, 80];
    let currentX = 50;

    // Table headers
    doc.fontSize(10).font('Helvetica-Bold');
    tableHeaders.forEach((header, i) => {
      doc.text(header, currentX, tableTop, { width: columnWidths[i], align: 'left' });
      currentX += columnWidths[i];
    });

    // Header line
    doc
      .moveTo(50, tableTop + 15)
      .lineTo(530, tableTop + 15)
      .stroke();

    // Table rows
    let currentY = tableTop + 25;
    doc.font('Helvetica');

    quote.items.forEach((item: any) => {
      currentX = 50;
      const rowData = [
        item.name,
        item.process,
        item.material,
        item.quantity.toString(),
        `${this.formatMoney(item.unitPrice || 0, quote.currency)}`,
        `${this.formatMoney(item.totalPrice || 0, quote.currency)}`,
      ];

      rowData.forEach((data, i) => {
        doc.text(data, currentX, currentY, {
          width: columnWidths[i],
          align: i >= 3 ? 'right' : 'left',
        });
        currentX += columnWidths[i];
      });

      currentY += 20;
    });

    // Bottom line
    doc.moveTo(50, currentY).lineTo(530, currentY).stroke();
  }

  private addTotals(doc: PDFKit.PDFDocument, quote: any): void {
    const totalsX = 400;
    let y = doc.y + 20;

    doc.fontSize(12).font('Helvetica');

    if (quote.subtotal) {
      doc.text(`Subtotal:`, totalsX, y);
      doc.text(`${this.formatMoney(quote.subtotal, quote.currency)}`, totalsX + 80, y, {
        align: 'right',
      });
      y += 20;
    }

    if (quote.tax) {
      doc.text(`Tax:`, totalsX, y);
      doc.text(`${this.formatMoney(quote.tax, quote.currency)}`, totalsX + 80, y, {
        align: 'right',
      });
      y += 20;
    }

    if (quote.shipping) {
      doc.text(`Shipping:`, totalsX, y);
      doc.text(`${this.formatMoney(quote.shipping, quote.currency)}`, totalsX + 80, y, {
        align: 'right',
      });
      y += 20;
    }

    // Total line
    doc.moveTo(totalsX, y).lineTo(530, y).stroke();
    y += 10;

    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(`Total:`, totalsX, y);
    doc.text(`${this.formatMoney(quote.total || 0, quote.currency)}`, totalsX + 80, y, {
      align: 'right',
    });
  }

  private addTermsAndFooter(doc: PDFKit.PDFDocument, quote: any): void {
    const footerY = 700;

    doc.fontSize(10).font('Helvetica');
    doc.text('Terms & Conditions:', 50, footerY);
    doc.text(
      `This quote is valid until ${new Date(quote.validityUntil).toLocaleDateString()}.`,
      50,
      footerY + 15,
    );
    doc.text('Prices are subject to change without notice.', 50, footerY + 30);
    doc.text('Payment terms: Net 30 days from invoice date.', 50, footerY + 45);

    // Footer line
    doc
      .moveTo(50, footerY + 65)
      .lineTo(530, footerY + 65)
      .stroke();

    doc.text(`Generated on ${new Date().toLocaleString()}`, 50, footerY + 75);
    doc.text('Powered by Cotiza Studio Digital Fabrication Platform', 300, footerY + 75);
  }

  private formatMoney(amount: number, currency?: Currency | string): string {
    const curr = (currency as Currency) || Currency.MXN;
    const symbol = this.getCurrencySymbol(curr);
    const decimals = this.getCurrencyDecimals(curr);

    // Format based on currency conventions
    const formatted = amount.toFixed(decimals);

    // Apply symbol position based on currency
    if (curr === Currency.EUR) {
      return `${formatted} ${symbol}`; // EUR format: 100.00 €
    } else if (curr === Currency.BRL) {
      return `${symbol} ${formatted}`; // BRL format: R$ 100.00
    } else {
      return `${symbol}${formatted}`; // Default format: $100.00
    }
  }

  private getCurrencySymbol(currency: Currency): string {
    const symbols: Record<Currency, string> = {
      [Currency.MXN]: '$',
      [Currency.USD]: '$',
      [Currency.EUR]: '€',
      [Currency.BRL]: 'R$',
      [Currency.GBP]: '£',
      [Currency.CAD]: 'C$',
      [Currency.CNY]: '¥',
      [Currency.JPY]: '¥',
      [Currency.ARS]: '$',
      [Currency.CLP]: '$',
      [Currency.COP]: '$',
      [Currency.PEN]: 'S/',
      [Currency.CHF]: 'Fr',
      [Currency.SEK]: 'kr',
      [Currency.NOK]: 'kr',
      [Currency.DKK]: 'kr',
      [Currency.PLN]: 'zł',
      [Currency.KRW]: '₩',
      [Currency.INR]: '₹',
      [Currency.SGD]: 'S$',
      [Currency.HKD]: 'HK$',
      [Currency.AUD]: 'A$',
      [Currency.NZD]: 'NZ$',
      [Currency.TWD]: 'NT$',
      [Currency.THB]: '฿',
      [Currency.AED]: 'د.إ',
      [Currency.SAR]: '﷼',
      [Currency.ZAR]: 'R',
      [Currency.EGP]: '£',
    };
    return symbols[currency] || '$';
  }

  private getCurrencyDecimals(currency: Currency): number {
    // Currencies with no decimal places
    if ([Currency.JPY, Currency.KRW].includes(currency as any)) {
      return 0;
    }
    // Most currencies use 2 decimal places
    return 2;
  }
}
