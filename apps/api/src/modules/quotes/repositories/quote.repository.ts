import { Injectable } from '@nestjs/common';
import { Prisma, Quote, PrismaClient } from '@prisma/client';
import { QuoteStatus } from '@cotiza/shared';
import { PrismaService } from '@/prisma/prisma.service';
import {
  BaseRepositoryImpl,
  PaginatedResult,
  QueryOptions,
} from '@/common/interfaces/base-repository.interface';

interface Customer {
  id: string;
  email: string;
  name: string;
  tenantId?: string;
}

interface QuoteItemWithRelations {
  id: string;
  quoteId: string;
  process: string;
  material: string;
  quantity: number;
  unitPrice?: Prisma.Decimal | null;
  totalPrice?: Prisma.Decimal | null;
  leadDays?: number;
  files: Array<{
    id: string;
    filename: string;
    originalName: string;
    path: string;
    size: number;
    analyzedAt?: Date | null;
  }>;
  dfmReport?: {
    id: string;
    metrics: Record<string, unknown>;
  } | null;
}

export type QuoteWithRelations = Quote & {
  customer?: Customer;
  items?: QuoteItemWithRelations[];
  _count?: {
    items?: number;
  };
};

@Injectable()
export class QuoteRepository extends BaseRepositoryImpl<
  QuoteWithRelations,
  Prisma.QuoteCreateInput,
  Prisma.QuoteUpdateInput,
  PrismaClient['quote']
> {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findById(
    id: string,
    tenantId: string,
    include?: Prisma.QuoteInclude,
  ): Promise<QuoteWithRelations | null> {
    return this.prisma.quote.findFirst({
      where: { id, tenantId },
      include,
    }) as any;
  }

  async findMany(
    tenantId: string,
    options?: {
      where?: Prisma.QuoteWhereInput;
      orderBy?: Prisma.QuoteOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.QuoteInclude;
    },
  ): Promise<QuoteWithRelations[]> {
    return this.prisma.quote.findMany({
      where: { tenantId, ...options?.where },
      orderBy: options?.orderBy || { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
      include: options?.include,
    }) as any;
  }

  async findPaginated(
    tenantId: string,
    options: QueryOptions,
  ): Promise<PaginatedResult<QuoteWithRelations>> {
    const { page = 1, limit = 20, sort, filters, include } = options;
    const { skip, take, page: currentPage, pageSize } = this.calculatePagination(page, limit);

    const where = this.buildWhereClause(tenantId, filters);
    const orderBy = this.buildOrderBy(sort);

    const [items, total] = await Promise.all([
      this.findMany(tenantId, {
        where,
        orderBy: Array.isArray(orderBy) ? orderBy[0] : orderBy,
        skip,
        take,
        include,
      }),
      this.count(tenantId, where),
    ]);

    return {
      items,
      total,
      page: currentPage,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async count(tenantId: string, where?: Prisma.QuoteWhereInput): Promise<number> {
    return this.prisma.quote.count({
      where: { tenantId, ...where },
    });
  }

  async create(data: Prisma.QuoteCreateInput & { tenantId: string }): Promise<QuoteWithRelations> {
    return this.prisma.quote.create({ data: data as Prisma.QuoteCreateInput });
  }

  async update(
    id: string,
    tenantId: string,
    data: Prisma.QuoteUpdateInput,
  ): Promise<QuoteWithRelations> {
    return this.prisma.quote.update({
      where: { id, tenantId },
      data,
    });
  }

  async delete(id: string, tenantId: string): Promise<QuoteWithRelations> {
    return this.prisma.quote.delete({
      where: { id, tenantId },
    });
  }

  async findDraftQuote(customerId: string, tenantId: string): Promise<QuoteWithRelations | null> {
    return this.prisma.quote.findFirst({
      where: {
        tenantId,
        customerId,
        status: QuoteStatus.DRAFT,
      },
      include: {
        items: {
          include: {
            files: true,
          },
        },
      },
    });
  }

  async findExpiredQuotes(tenantId: string): Promise<QuoteWithRelations[]> {
    return this.prisma.quote.findMany({
      where: {
        tenantId,
        status: {
          in: [QuoteStatus.QUOTED, QuoteStatus.NEEDS_REVIEW],
        },
        validityUntil: {
          lt: new Date(),
        },
      },
    });
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: QuoteStatus,
  ): Promise<QuoteWithRelations> {
    return this.update(id, tenantId, { status });
  }

  async generateQuoteNumber(tenantId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Use a transaction to ensure atomicity
    return this.transaction(async (tx) => {
      // Get the last quote number for this month
      const lastQuote = await tx.quote.findFirst({
        where: {
          tenantId,
          number: {
            startsWith: `Q${year}${month}`,
          },
        },
        orderBy: {
          number: 'desc',
        },
        select: {
          number: true,
        },
      });

      let sequence = 1;
      if (lastQuote?.number) {
        const match = lastQuote.number.match(/Q\d{6}(\d{4})/);
        if (match) {
          sequence = parseInt(match[1], 10) + 1;
        }
      }

      return `Q${year}${month}${String(sequence).padStart(4, '0')}`;
    });
  }

  async batchUpdateItems(
    quoteId: string,
    tenantId: string,
    items: Array<{ id: string; data: Prisma.QuoteItemUpdateInput }>,
  ): Promise<void> {
    await this.transaction(async (tx) => {
      // Verify quote belongs to tenant
      const quote = await tx.quote.findFirst({
        where: { id: quoteId, tenantId },
      });

      if (!quote) {
        throw new Error('Quote not found');
      }

      // Batch update items
      await Promise.all(
        items.map((item) =>
          tx.quoteItem.update({
            where: { id: item.id, quoteId },
            data: item.data,
          }),
        ),
      );
    });
  }

  protected buildWhereClause<TFilter extends Record<string, unknown>>(
    tenantId: string,
    filters?: TFilter,
  ): Prisma.QuoteWhereInput {
    const baseWhere = super.buildWhereClause(tenantId, filters) as Prisma.QuoteWhereInput;
    const where: Prisma.QuoteWhereInput = { ...baseWhere };

    // Handle special filters
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = new Date(filters.dateFrom as string);
      }
      if (filters.dateTo) {
        where.createdAt.lte = new Date(filters.dateTo as string);
      }
    }

    if (filters?.search) {
      where.OR = [
        { number: { contains: filters.search as string, mode: 'insensitive' } },
        { customer: { name: { contains: filters.search as string, mode: 'insensitive' } } },
        { customer: { email: { contains: filters.search as string, mode: 'insensitive' } } },
      ];
    }

    // Remove processed filters from base where
    const cleanedWhere = { ...where };
    type FilteredWhere = Prisma.QuoteWhereInput & {
      dateFrom?: unknown;
      dateTo?: unknown;
      search?: unknown;
    };
    delete (cleanedWhere as FilteredWhere).dateFrom;
    delete (cleanedWhere as FilteredWhere).dateTo;
    delete (cleanedWhere as FilteredWhere).search;

    return cleanedWhere;
  }
}
