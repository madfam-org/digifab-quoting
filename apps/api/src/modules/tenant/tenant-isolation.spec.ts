import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Unit tests for the Prisma tenant-isolation middleware.
 *
 * The previous version of this file booted a full Nest application and spied on
 * the Prisma delegate methods (e.g. `prisma.quote.findMany`). That approach was
 * doubly broken: it required a live database (app.init() -> $connect) and, more
 * fundamentally, spying on a delegate method bypasses the `$use` middleware
 * chain entirely, so it could never actually observe the tenant injection.
 *
 * The isolation logic lives in `tenantIsolationMiddleware`, a pure function that
 * reads `params.__tenantId` (set upstream by TenantContextMiddleware /
 * withTenant) and rewrites `params.args`. We exercise it directly — no database
 * required. Context propagation (AsyncLocalStorage -> __tenantId) is covered
 * separately by tenant-context.service.spec.ts.
 */
describe('Multi-Tenant Isolation (tenantIsolationMiddleware)', () => {
  let prisma: PrismaService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let middleware: (params: any, next: (p: any) => Promise<unknown>) => Promise<unknown>;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string, def?: unknown) =>
        key === 'DATABASE_URL' ? 'postgresql://user:pass@localhost:5432/test' : def,
      ),
    } as unknown as ConfigService;
    prisma = new PrismaService(configService);
    // Access the private middleware for direct invocation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware = (prisma as any).tenantIsolationMiddleware.bind(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoke = async (params: any) => {
    const next = jest.fn().mockResolvedValue(undefined);
    await middleware(params, next);
    expect(next).toHaveBeenCalledTimes(1);
    return next.mock.calls[0][0];
  };

  it('injects tenantId into findMany where clauses', async () => {
    const forwarded = await invoke({
      model: 'Quote',
      action: 'findMany',
      args: {},
      __tenantId: 'tenant-1',
    });
    expect(forwarded.args.where).toEqual({ tenantId: 'tenant-1' });
  });

  it('preserves an existing where clause when injecting tenantId', async () => {
    const forwarded = await invoke({
      model: 'Quote',
      action: 'findMany',
      args: { where: { status: 'draft' } },
      __tenantId: 'tenant-2',
    });
    expect(forwarded.args.where).toEqual({ status: 'draft', tenantId: 'tenant-2' });
  });

  it('adds tenantId to create data', async () => {
    const forwarded = await invoke({
      model: 'Quote',
      action: 'create',
      args: { data: { number: 'Q-2024-001', status: 'draft' } },
      __tenantId: 'tenant-123',
    });
    expect(forwarded.args.data).toEqual({
      number: 'Q-2024-001',
      status: 'draft',
      tenantId: 'tenant-123',
    });
  });

  it('scopes update operations to the tenant (prevents cross-tenant updates)', async () => {
    const forwarded = await invoke({
      model: 'Quote',
      action: 'update',
      args: { where: { id: 'quote-456' }, data: { status: 'accepted' } },
      __tenantId: 'tenant-123',
    });
    expect(forwarded.args.where).toEqual({ id: 'quote-456', tenantId: 'tenant-123' });
    expect(forwarded.args.data).toEqual({ status: 'accepted' });
  });

  it('scopes delete operations to the tenant (prevents cross-tenant deletes)', async () => {
    const forwarded = await invoke({
      model: 'Quote',
      action: 'delete',
      args: { where: { id: 'quote-789' } },
      __tenantId: 'tenant-123',
    });
    expect(forwarded.args.where).toEqual({ id: 'quote-789', tenantId: 'tenant-123' });
  });

  it('stamps tenantId onto every row of a createMany', async () => {
    const forwarded = await invoke({
      model: 'Material',
      action: 'createMany',
      args: {
        data: [
          { name: 'Material 1', code: 'M1' },
          { name: 'Material 2', code: 'M2' },
        ],
      },
      __tenantId: 'tenant-123',
    });
    expect(forwarded.args.data).toEqual([
      { name: 'Material 1', code: 'M1', tenantId: 'tenant-123' },
      { name: 'Material 2', code: 'M2', tenantId: 'tenant-123' },
    ]);
  });

  it('does not filter the global Tenant model', async () => {
    const forwarded = await invoke({
      model: 'Tenant',
      action: 'findMany',
      args: {},
      __tenantId: 'tenant-123',
    });
    expect(forwarded.args).toEqual({});
  });

  it('preserves complex where clauses while adding the tenant filter', async () => {
    const forwarded = await invoke({
      model: 'Quote',
      action: 'findMany',
      args: {
        where: {
          OR: [{ status: 'draft' }, { status: 'pending' }],
          createdAt: { gte: new Date('2024-01-01') },
        },
      },
      __tenantId: 'tenant-123',
    });
    expect(forwarded.args.where).toEqual({
      OR: [{ status: 'draft' }, { status: 'pending' }],
      createdAt: { gte: new Date('2024-01-01') },
      tenantId: 'tenant-123',
    });
  });

  it('does not inject a tenant filter when no tenant context is present', async () => {
    const forwarded = await invoke({
      model: 'Quote',
      action: 'findMany',
      args: {},
      // no __tenantId
    });
    expect(forwarded.args).toEqual({});
  });

  it('skips tenant filtering for auth models without a tenant context', async () => {
    const forwarded = await invoke({
      model: 'User',
      action: 'findMany',
      args: { where: { email: 'a@b.com' } },
    });
    expect(forwarded.args.where).toEqual({ email: 'a@b.com' });
  });
});
