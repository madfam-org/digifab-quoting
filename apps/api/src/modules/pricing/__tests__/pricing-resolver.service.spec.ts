import { PricingResolverService } from '../pricing-resolver.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('PricingResolverService', () => {
  let resolver: PricingResolverService;

  const mockPrisma = {
    machine: {
      findFirst: jest.fn(),
    },
    material: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolver = new PricingResolverService(mockPrisma as unknown as PrismaService);
  });

  // -------------------------------------------------------------------------
  // Machine selection
  // -------------------------------------------------------------------------
  describe('resolveMachine', () => {
    it('selects the cheapest active machine for the process', async () => {
      const machine = { id: 'mach-1', process: 'FFF', hourlyRate: 10, active: true };
      mockPrisma.machine.findFirst.mockResolvedValue(machine);

      const result = await resolver.resolveMachine('tenant-1', 'FFF');

      expect(result).toEqual(machine);
      expect(mockPrisma.machine.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', process: 'FFF', active: true },
        orderBy: [{ hourlyRate: 'asc' }, { name: 'asc' }],
      });
    });

    it('returns null when the tenant has no active machine for the process', async () => {
      mockPrisma.machine.findFirst.mockResolvedValue(null);

      const result = await resolver.resolveMachine('tenant-1', 'CNC_3AXIS');

      expect(result).toBeNull();
    });

    it('returns null without querying when process is empty', async () => {
      const result = await resolver.resolveMachine('tenant-1', '');

      expect(result).toBeNull();
      expect(mockPrisma.machine.findFirst).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Material resolution
  // -------------------------------------------------------------------------
  describe('resolveMaterial', () => {
    it('resolves by explicit materialId first', async () => {
      const material = { id: 'mat-1', code: 'PLA', active: true };
      mockPrisma.material.findFirst.mockResolvedValueOnce(material);

      const result = await resolver.resolveMaterial('tenant-1', {
        materialId: 'mat-1',
        materialCode: 'PLA',
        process: 'FFF',
      });

      expect(result).toEqual(material);
      expect(mockPrisma.material.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.material.findFirst).toHaveBeenCalledWith({
        where: { id: 'mat-1', tenantId: 'tenant-1', active: true },
      });
    });

    it('falls back to a case-insensitive code match scoped to the process', async () => {
      const material = { id: 'mat-2', code: 'PLA', process: 'FFF', active: true };
      mockPrisma.material.findFirst
        .mockResolvedValueOnce(null) // by id — stale/missing
        .mockResolvedValueOnce(material); // by code

      const result = await resolver.resolveMaterial('tenant-1', {
        materialId: 'stale-id',
        materialCode: 'pla',
        process: 'FFF',
      });

      expect(result).toEqual(material);
      expect(mockPrisma.material.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          tenantId: 'tenant-1',
          active: true,
          code: { equals: 'pla', mode: 'insensitive' },
          process: 'FFF',
        },
        orderBy: { versionEffectiveFrom: 'desc' },
      });
    });

    it('falls back to a name substring match when no code matches', async () => {
      const material = { id: 'mat-3', name: 'PLA Basic Black' };
      mockPrisma.material.findFirst
        .mockResolvedValueOnce(null) // by code
        .mockResolvedValueOnce(material); // by name

      const result = await resolver.resolveMaterial('tenant-1', {
        materialCode: 'PLA Basic',
        process: 'FFF',
      });

      expect(result).toEqual(material);
    });

    it('returns null when neither id nor code is resolvable', async () => {
      mockPrisma.material.findFirst.mockResolvedValue(null);

      const result = await resolver.resolveMaterial('tenant-1', {
        materialCode: 'UNOBTAINIUM',
        process: 'FFF',
      });

      expect(result).toBeNull();
    });

    it('returns null when there is no code to search by', async () => {
      const result = await resolver.resolveMaterial('tenant-1', {});

      expect(result).toBeNull();
      expect(mockPrisma.material.findFirst).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Geometry wiring (worker analysis present / absent)
  // -------------------------------------------------------------------------
  describe('resolveGeometry', () => {
    it('uses the persisted FileAnalysis row when present', () => {
      const item = {
        files: [
          {
            id: 'file-1',
            fileAnalysis: {
              volume: 12.5, // cm3 (worker output)
              surfaceArea: 88.4, // cm2
              boundingBoxX: 40,
              boundingBoxY: 30,
              boundingBoxZ: 20, // mm
            },
          },
        ],
        dfmReport: null,
      };

      const geometry = resolver.resolveGeometry(item as never);

      expect(geometry).toEqual({
        volumeCm3: 12.5,
        surfaceAreaCm2: 88.4,
        boundingBox: { x: 40, y: 30, z: 20 },
        source: 'file_analysis',
      });
    });

    it('handles Prisma Decimal-like values via toString()', () => {
      const dec = (v: number) => ({ toString: () => String(v) });
      const item = {
        files: [
          {
            id: 'file-1',
            fileAnalysis: {
              volume: dec(3.75),
              surfaceArea: dec(21.2),
              boundingBoxX: dec(10),
              boundingBoxY: dec(10),
              boundingBoxZ: dec(10),
            },
          },
        ],
      };

      const geometry = resolver.resolveGeometry(item as never);

      expect(geometry?.volumeCm3).toBe(3.75);
      expect(geometry?.boundingBox).toEqual({ x: 10, y: 10, z: 10 });
    });

    it('skips analyses without a usable volume and falls back to the DFM report', () => {
      const item = {
        files: [{ id: 'file-1', fileAnalysis: { volume: null } }],
        dfmReport: {
          metrics: {
            volumeCm3: 7.2,
            surfaceAreaCm2: 55,
            bboxMm: { x: 25, y: 25, z: 12 },
          },
        },
      };

      const geometry = resolver.resolveGeometry(item as never);

      expect(geometry).toEqual({
        volumeCm3: 7.2,
        surfaceAreaCm2: 55,
        boundingBox: { x: 25, y: 25, z: 12 },
        source: 'dfm_report',
      });
    });

    it('returns null when no analysis exists at all', () => {
      expect(resolver.resolveGeometry({ files: [{ id: 'f', fileAnalysis: null }] } as never)).toBeNull();
      expect(resolver.resolveGeometry({ files: [] } as never)).toBeNull();
      expect(resolver.resolveGeometry({} as never)).toBeNull();
    });

    it('returns null for zero-volume analyses instead of pricing garbage', () => {
      const item = {
        files: [{ id: 'file-1', fileAnalysis: { volume: 0 } }],
        dfmReport: null,
      };

      expect(resolver.resolveGeometry(item as never)).toBeNull();
    });
  });
});
