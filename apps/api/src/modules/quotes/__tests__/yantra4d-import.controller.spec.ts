import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

// Mock modules with transitive Prisma dependencies to avoid schema errors
jest.mock('../../audit/audit.interceptor', () => ({
  Audit: () => () => undefined,
}));
jest.mock('../../audit/audit.service', () => ({
  AuditAction: { CREATE: 'CREATE' },
  AuditEntity: { QUOTE: 'QUOTE' },
}));
jest.mock('../services/yantra4d-import.service', () => ({
  Yantra4dImportService: jest.fn().mockImplementation(() => ({
    createQuoteFromYantra4d: jest.fn(),
  })),
}));
jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: jest.fn().mockImplementation(() => ({
    canActivate: jest.fn().mockReturnValue(true),
  })),
}));
jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: jest.fn().mockImplementation(() => ({
    canActivate: jest.fn().mockReturnValue(true),
  })),
}));

import { Yantra4dImportController } from '../yantra4d-import.controller';
import { Yantra4dImportService } from '../services/yantra4d-import.service';

// ---------------------------------------------------------------------------
// Types matching the DTO structures
// ---------------------------------------------------------------------------

interface Yantra4dImportDto {
  source: string;
  project: { slug: string; name: string; description?: string };
  geometry: {
    volume_cm3: number;
    surface_area_cm2: number;
    bounding_box_mm: { x: number; y: number; z: number };
  };
  item: {
    name: string;
    process: string;
    material: string;
    quantity: number;
    finish?: string;
    options?: Record<string, unknown>;
  };
  currency?: string;
  notes?: string;
}

interface Yantra4dImportResponseDto {
  quoteId: string;
  quoteNumber: string;
  status: string;
  totalPrice: number;
  currency: string;
  itemCount: number;
  items?: Array<{
    name: string;
    process: string;
    material: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    leadDays: number;
  }>;
  warnings?: string[];
  market_context?: {
    source: string;
    sample_count: number;
    updated_at: string | null;
    confidence: number;
    fallback_reason: string | null;
    market_verified: boolean;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDto(overrides: Partial<Yantra4dImportDto> = {}): Yantra4dImportDto {
  return {
    source: 'yantra4d',
    project: {
      slug: 'rugged-box',
      name: 'Rugged Box',
      description: 'Parametric rugged storage box',
    },
    geometry: {
      volume_cm3: 42.75,
      surface_area_cm2: 185.2,
      bounding_box_mm: { x: 120.5, y: 80.3, z: 45.0 },
    },
    item: {
      name: 'Rugged Box',
      process: '3d_fff',
      material: 'PLA',
      quantity: 5,
      finish: 'standard',
    },
    currency: 'MXN',
    notes: 'Test import',
    ...overrides,
  };
}

function buildResponse(): Yantra4dImportResponseDto {
  return {
    quoteId: 'quote-001',
    quoteNumber: 'Q-2026-04-0001',
    status: 'auto_quoted',
    totalPrice: 987.5,
    currency: 'MXN',
    itemCount: 1,
    items: [
      {
        name: 'Rugged Box',
        process: '3d_fff',
        material: 'PLA',
        quantity: 5,
        unitPrice: 199.5,
        totalPrice: 997.5,
        leadDays: 5,
      },
    ],
    market_context: {
      source: 'internal_pricing',
      sample_count: 0,
      updated_at: null,
      confidence: 0,
      fallback_reason: 'forgesight_not_configured',
      market_verified: false,
    },
  };
}

function buildRequest(tenantId = 'tenant-001', userId = 'user-001') {
  return {
    user: { tenantId, id: userId },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Yantra4dImportController', () => {
  let controller: Yantra4dImportController;
  let importService: { createQuoteFromYantra4d: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [Yantra4dImportController],
      providers: [
        {
          provide: Yantra4dImportService,
          useValue: {
            createQuoteFromYantra4d: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<Yantra4dImportController>(Yantra4dImportController);
    importService = module.get(Yantra4dImportService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------- Happy path ----------

  describe('importFromYantra4d - success', () => {
    it('should call service with tenantId, userId, and DTO', async () => {
      const dto = buildDto();
      const req = buildRequest('t-1', 'u-1');
      importService.createQuoteFromYantra4d.mockResolvedValue(buildResponse());

      await controller.importFromYantra4d(req, dto as any);

      expect(importService.createQuoteFromYantra4d).toHaveBeenCalledWith('t-1', 'u-1', dto);
    });

    it('should return the service response', async () => {
      const expected = buildResponse();
      importService.createQuoteFromYantra4d.mockResolvedValue(expected);

      const result = await controller.importFromYantra4d(buildRequest(), buildDto() as any);

      expect(result).toEqual(expected);
    });

    it('should return response with warnings when present', async () => {
      const response = {
        ...buildResponse(),
        status: 'needs_review',
        warnings: ['Material not found in tenant catalog.'],
      };
      importService.createQuoteFromYantra4d.mockResolvedValue(response);

      const result = await controller.importFromYantra4d(buildRequest(), buildDto() as any);

      expect(result.warnings).toContain('Material not found in tenant catalog.');
      expect(result.status).toBe('needs_review');
    });

    it('should return market context provenance when present', async () => {
      const response = buildResponse();
      importService.createQuoteFromYantra4d.mockResolvedValue(response);

      const result = await controller.importFromYantra4d(buildRequest(), buildDto() as any);

      expect(result.market_context).toEqual({
        source: 'internal_pricing',
        sample_count: 0,
        updated_at: null,
        confidence: 0,
        fallback_reason: 'forgesight_not_configured',
        market_verified: false,
      });
    });
  });

  // ---------- Validation ----------

  describe('importFromYantra4d - source validation', () => {
    it('should throw BadRequestException when source is not "yantra4d"', async () => {
      const dto = buildDto({ source: 'other-system' });

      await expect(controller.importFromYantra4d(buildRequest(), dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should include the invalid source value in the error message', async () => {
      const dto = buildDto({ source: 'fakesource' });

      await expect(controller.importFromYantra4d(buildRequest(), dto as any)).rejects.toThrow(
        'expected "yantra4d", got "fakesource"',
      );
    });

    it('should throw BadRequestException when source is empty', async () => {
      const dto = buildDto({ source: '' });

      await expect(controller.importFromYantra4d(buildRequest(), dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------- Service error propagation ----------

  describe('importFromYantra4d - service errors', () => {
    it('should propagate service exceptions', async () => {
      importService.createQuoteFromYantra4d.mockRejectedValue(
        new BadRequestException('Unsupported process type'),
      );

      await expect(
        controller.importFromYantra4d(buildRequest(), buildDto() as any),
      ).rejects.toThrow('Unsupported process type');
    });
  });

  // ---------- DTO structure ----------

  describe('Yantra4dImportDto structure', () => {
    it('should accept all valid process types', () => {
      const processes = ['3d_fff', '3d_sla', 'cnc_3axis', 'laser_2d'];
      for (const proc of processes) {
        const dto = buildDto();
        dto.item.process = proc;
        expect(dto.item.process).toBe(proc);
      }
    });

    it('should accept MXN and USD currencies', () => {
      for (const currency of ['MXN', 'USD']) {
        const dto = buildDto({ currency });
        expect(dto.currency).toBe(currency);
      }
    });

    it('should preserve optional fields', () => {
      const dto = buildDto();
      expect(dto.notes).toBe('Test import');
      expect(dto.item.finish).toBe('standard');
    });
  });
});
