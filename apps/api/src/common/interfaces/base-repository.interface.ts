import { Prisma, PrismaClient } from '@prisma/client';

// Generic type to extract the delegate type from PrismaClient
// type ExtractDelegate<T> = T extends { [K in keyof T]: infer D } ? D : never;

// Generic constraints for Prisma operations
type WhereInput<T> = T extends { findMany: (args: infer Args) => Promise<unknown> }
  ? Args extends { where?: infer W }
    ? W
    : never
  : never;

type OrderByInput<T> = T extends { findMany: (args: infer Args) => Promise<unknown> }
  ? Args extends { orderBy?: infer O }
    ? O
    : never
  : never;

type IncludeInput<T> = T extends { findMany: (args: infer Args) => Promise<unknown> }
  ? Args extends { include?: infer I }
    ? I
    : never
  : never;

export interface BaseRepository<T, CreateInput, UpdateInput, ModelDelegate = unknown> {
  findById(id: string, tenantId: string): Promise<T | null>;
  findMany(
    tenantId: string,
    options?: {
      where?: WhereInput<ModelDelegate>;
      orderBy?: OrderByInput<ModelDelegate>;
      skip?: number;
      take?: number;
      include?: IncludeInput<ModelDelegate>;
    },
  ): Promise<T[]>;
  count(tenantId: string, where?: WhereInput<ModelDelegate>): Promise<number>;
  create(data: CreateInput & { tenantId: string }): Promise<T>;
  update(id: string, tenantId: string, data: UpdateInput): Promise<T>;
  delete(id: string, tenantId: string): Promise<T>;
  transaction<R>(fn: (tx: Prisma.TransactionClient) => Promise<R>): Promise<R>;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QueryOptions<TFilter = Record<string, unknown>> {
  page?: number;
  limit?: number;
  sort?: string;
  filters?: TFilter;
  include?: Record<string, boolean>;
}

export abstract class BaseRepositoryImpl<T, CreateInput, UpdateInput, ModelDelegate = unknown>
  implements BaseRepository<T, CreateInput, UpdateInput, ModelDelegate>
{
  constructor(protected readonly prisma: PrismaClient) {}

  abstract findById(id: string, tenantId: string): Promise<T | null>;
  abstract findMany(
    tenantId: string,
    options?: {
      where?: WhereInput<ModelDelegate>;
      orderBy?: OrderByInput<ModelDelegate>;
      skip?: number;
      take?: number;
      include?: IncludeInput<ModelDelegate>;
    },
  ): Promise<T[]>;
  abstract count(tenantId: string, where?: WhereInput<ModelDelegate>): Promise<number>;
  abstract create(data: CreateInput & { tenantId: string }): Promise<T>;
  abstract update(id: string, tenantId: string, data: UpdateInput): Promise<T>;
  abstract delete(id: string, tenantId: string): Promise<T>;

  async transaction<R>(fn: (tx: Prisma.TransactionClient) => Promise<R>): Promise<R> {
    return this.prisma.$transaction(fn);
  }

  protected buildWhereClause<TFilter extends Record<string, unknown>>(
    tenantId: string,
    filters?: TFilter,
  ): WhereInput<ModelDelegate> {
    const where: Record<string, unknown> = { tenantId };

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          where[key] = value;
        }
      });
    }

    return where as WhereInput<ModelDelegate>;
  }

  protected buildOrderBy(sort?: string): OrderByInput<ModelDelegate> {
    if (!sort) return { createdAt: 'desc' } as OrderByInput<ModelDelegate>;

    const isDescending = sort.startsWith('-');
    const field = isDescending ? sort.substring(1) : sort;

    return { [field]: isDescending ? 'desc' : 'asc' } as OrderByInput<ModelDelegate>;
  }

  protected calculatePagination(page: number = 1, limit: number = 20) {
    const pageSize = Math.min(Math.max(1, limit), 100);
    const currentPage = Math.max(1, page);
    const skip = (currentPage - 1) * pageSize;

    return { skip, take: pageSize, page: currentPage, pageSize };
  }
}
