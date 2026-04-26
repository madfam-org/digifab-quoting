import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ReportGenerationJobData } from '../interfaces/job.interface';
import { LoggerService } from '@/common/logger/logger.service';

export interface AnalyticsCriteria {
  startDate: string;
  endDate: string;
  groupBy?: 'day' | 'week' | 'month';
  filters?: Record<string, unknown>;
}

@Injectable()
export class ReportDataLoaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async loadReportData(
    reportType: ReportGenerationJobData['reportType'],
    entityId: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    this.logger.log(`Loading data for ${reportType} report`, { entityId, tenantId });

    switch (reportType) {
      case 'quote':
        return this.loadQuoteData(entityId, tenantId);
      case 'order':
        return this.loadOrderData(entityId, tenantId);
      case 'invoice':
        return this.loadInvoiceData(entityId, tenantId);
      case 'analytics':
        return this.loadAnalyticsData(entityId, tenantId);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  private async loadQuoteData(quoteId: string, tenantId: string): Promise<Record<string, unknown>> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId, tenantId },
      include: {
        items: {
          include: {
            files: true,
            materialObj: true,
            manufacturingProcess: true,
          },
        },
        customer: true,
        tenant: {
          select: {
            name: true,
            // taxId: true, // Remove if not in schema
            settings: true,
            branding: true,
          },
        },
        // quoteItems: { // Remove if not in schema
        //   include: {
        //     part: {
        //       include: {
        //         fileAnalysis: true,
        //       },
        //     },
        //   },
        // },
      },
    });

    if (!quote) {
      throw new Error(`Quote ${quoteId} not found`);
    }

    return quote;
  }

  private async loadOrderData(orderId: string, tenantId: string): Promise<Record<string, unknown>> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, tenantId },
      include: {
        quote: {
          include: {
            items: {
              include: {
                files: true,
                materialObj: true,
                manufacturingProcess: true,
              },
            },
            // quoteItems: true, // Remove if not in schema
          },
        },
        customer: {
          include: {
            // user: true, // Remove if not in schema
          },
        },
        paymentIntents: {
          where: { status: 'succeeded' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        orderItems: {
          include: {
            quoteItem: {
              include: {
                part: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    return order;
  }

  private async loadInvoiceData(
    invoiceId: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId, tenantId },
      include: {
        order: {
          include: {
            quote: {
              include: {
                items: true,
                // quoteItems: true, // Remove if not in schema
              },
            },
            orderItems: true,
          },
        },
        customer: {
          select: {
            id: true,
            // name: true, // Remove if not in schema
            email: true,
            // company: true, // Remove if not in schema
            // billingAddress: true, // Remove if not in schema
            // taxId: true, // Remove if not in schema
          },
        },
        // tenant: { // Remove if not in schema - Invoice context
        //   select: {
        //     name: true,
        //     // taxId: true, // Remove if not in schema
        //     settings: true,
        //     branding: true,
        //   },
        // },
      },
    });

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    return invoice;
  }

  private async loadAnalyticsData(
    criteriaJson: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const criteria: AnalyticsCriteria = JSON.parse(criteriaJson);
    const { startDate, endDate, groupBy = 'day' } = criteria;

    this.logger.log('Loading analytics data', { criteria, tenantId });

    const [quotes, orders, revenue, materials, processes] = await Promise.all([
      // Quote statistics by status
      this.getQuoteStatistics(tenantId, startDate, endDate),

      // Order statistics by status
      this.getOrderStatistics(tenantId, startDate, endDate),

      // Revenue by period
      this.getRevenueByPeriod(tenantId, startDate, endDate, groupBy),

      // Top materials
      this.getTopMaterials(tenantId, startDate, endDate),

      // Top processes
      this.getTopProcesses(tenantId, startDate, endDate),
    ]);

    // Calculate additional metrics
    const metrics = await this.calculateAnalyticsMetrics(tenantId, startDate, endDate);

    return {
      criteria,
      quotes,
      orders,
      revenue,
      materials,
      processes,
      metrics,
      generatedAt: new Date(),
    };
  }

  private async getQuoteStatistics(tenantId: string, startDate: string, endDate: string) {
    return this.prisma.quote.groupBy({
      by: ['status'],
      where: {
        tenantId,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      _count: true,
      _sum: {
        total: true,
      },
      _avg: {
        total: true,
      },
    });
  }

  private async getOrderStatistics(tenantId: string, startDate: string, endDate: string) {
    return this.prisma.order.groupBy({
      by: ['status'],
      where: {
        tenantId,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      _count: true,
      _sum: {
        totalPaid: true,
      },
      _avg: {
        totalPaid: true,
      },
    });
  }

  private async getRevenueByPeriod(
    tenantId: string,
    startDate: string,
    endDate: string,
    groupBy: 'day' | 'week' | 'month',
  ) {
    return this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${groupBy}, created_at) as period,
        COUNT(*)::int as order_count,
        SUM(total_paid)::decimal as revenue,
        AVG(total_paid)::decimal as avg_order_value
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND created_at >= ${startDate}::timestamp
        AND created_at <= ${endDate}::timestamp
        AND status IN ('completed', 'shipped', 'delivered')
      GROUP BY period
      ORDER BY period
    `;
  }

  private async getTopMaterials(tenantId: string, startDate: string, endDate: string, limit = 10) {
    return this.prisma.$queryRaw`
      SELECT 
        m.name as material_name,
        m.code as material_code,
        COUNT(DISTINCT qi.id)::int as usage_count,
        SUM(qi.quantity)::int as total_quantity,
        SUM(qi.unit_price * qi.quantity)::decimal as total_revenue
      FROM quote_items qi
      JOIN quotes q ON qi.quote_id = q.id
      JOIN materials m ON qi.material_id = m.id
      WHERE q.tenant_id = ${tenantId}
        AND q.created_at >= ${startDate}::timestamp
        AND q.created_at <= ${endDate}::timestamp
        AND q.status IN ('accepted', 'expired')
      GROUP BY m.id, m.name, m.code
      ORDER BY total_revenue DESC
      LIMIT ${limit}
    `;
  }

  private async getTopProcesses(tenantId: string, startDate: string, endDate: string, limit = 10) {
    return this.prisma.$queryRaw`
      SELECT 
        mp.name as process_name,
        mp.code as process_code,
        mp.category,
        COUNT(DISTINCT qi.id)::int as usage_count,
        SUM(qi.quantity)::int as total_quantity,
        SUM(qi.unit_price * qi.quantity)::decimal as total_revenue
      FROM quote_items qi
      JOIN quotes q ON qi.quote_id = q.id
      JOIN manufacturing_processes mp ON qi.process_id = mp.id
      WHERE q.tenant_id = ${tenantId}
        AND q.created_at >= ${startDate}::timestamp
        AND q.created_at <= ${endDate}::timestamp
        AND q.status IN ('accepted', 'expired')
      GROUP BY mp.id, mp.name, mp.code, mp.category
      ORDER BY total_revenue DESC
      LIMIT ${limit}
    `;
  }

  private async calculateAnalyticsMetrics(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<Record<string, unknown>> {
    const [quoteMetrics, conversionMetrics, customerMetrics] = await Promise.all([
      // Quote metrics
      this.prisma.quote.aggregate({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        _count: true,
        _avg: {
          total: true,
        },
        _sum: {
          total: true,
        },
      }),

      // Conversion metrics
      this.calculateConversionRate(tenantId, startDate, endDate),

      // Customer metrics
      this.getUniqueCustomerCount(tenantId, startDate, endDate),
    ]);

    return {
      totalQuotes: quoteMetrics._count,
      averageQuoteValue: quoteMetrics._avg.total,
      totalQuoteValue: quoteMetrics._sum.total,
      conversionRate: conversionMetrics.rate,
      averageTimeToConvert: conversionMetrics.avgTime,
      uniqueCustomers: customerMetrics,
    };
  }

  private async calculateConversionRate(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ rate: number; avgTime: number }> {
    const result = await this.prisma.$queryRaw<
      Array<{ total_quotes: number; converted_quotes: number; avg_hours_to_convert: number | null }>
    >`
      SELECT 
        COUNT(DISTINCT q.id)::int as total_quotes,
        COUNT(DISTINCT o.quote_id)::int as converted_quotes,
        AVG(EXTRACT(EPOCH FROM (o.created_at - q.created_at)) / 3600)::decimal as avg_hours_to_convert
      FROM quotes q
      LEFT JOIN orders o ON q.id = o.quote_id
      WHERE q.tenant_id = ${tenantId}
        AND q.created_at >= ${startDate}::timestamp
        AND q.created_at <= ${endDate}::timestamp
    `;

    const data = result[0];
    const rate = data.total_quotes > 0 ? (data.converted_quotes / data.total_quotes) * 100 : 0;

    return {
      rate: parseFloat(rate.toFixed(2)),
      avgTime: parseFloat(String(data.avg_hours_to_convert || 0)),
    };
  }

  private async getUniqueCustomerCount(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const result = await this.prisma.quote.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        customerId: { not: null },
      },
      select: {
        customerId: true,
      },
      distinct: ['customerId'],
    });

    return result.length;
  }
}
