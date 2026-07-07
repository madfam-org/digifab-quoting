import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { File, FileAnalysis, Machine, Material, Prisma } from '@prisma/client';

/**
 * Machine-readable degradation reasons for fab quote items whose pricing
 * inputs could not be resolved. These are recorded on the quote item
 * (`flags` + `metadata.needsReviewReason`) and surfaced in the calculate()
 * errors array so the quote lands in NEEDS_REVIEW instead of erroring.
 */
export const PRICING_DEGRADE_REASONS = {
  MISSING_GEOMETRY_ANALYSIS: 'missing_geometry_analysis',
  NO_MACHINE_FOR_PROCESS: 'no_machine_for_process',
  MATERIAL_NOT_FOUND: 'material_not_found',
} as const;

export type PricingDegradeReason =
  (typeof PRICING_DEGRADE_REASONS)[keyof typeof PRICING_DEGRADE_REASONS];

export interface ResolvedGeometry {
  volumeCm3: number;
  surfaceAreaCm2?: number;
  boundingBox?: { x: number; y: number; z: number };
  /** Where the metrics came from, recorded for provenance/debugging. */
  source: 'file_analysis' | 'dfm_report';
}

type FileWithAnalysis = File & { fileAnalysis?: FileAnalysis | null };

interface QuoteItemGeometrySource {
  files?: FileWithAnalysis[] | null;
  dfmReport?: { metrics: Prisma.JsonValue } | null;
}

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Resolves the real-world inputs the pricing engine needs for a fab quote
 * item: geometry metrics (from the worker's persisted analysis), a concrete
 * material row, and a concrete machine row for the item's process.
 *
 * Selection rules:
 * - Geometry: first analyzed file's `FileAnalysis` row (worker output,
 *   volume in cm3 / surface in cm2 / bbox in mm), falling back to the
 *   item's `DFMReport.metrics` when present.
 * - Machine: cheapest active machine for the process (hourlyRate asc,
 *   name asc tiebreak) — same rule as QuoteCalculationService.
 * - Material: by explicit materialId first, then by code (case-insensitive)
 *   for the process, then by name substring (Yantra4D import precedent).
 */
@Injectable()
export class PricingResolverService {
  private readonly logger = new Logger(PricingResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  resolveGeometry(item: QuoteItemGeometrySource): ResolvedGeometry | null {
    // Preferred source: the worker's persisted FileAnalysis row.
    for (const file of item.files ?? []) {
      const analysis = file.fileAnalysis;
      if (!analysis) continue;

      const volumeCm3 = toNumber(analysis.volume);
      if (!volumeCm3 || volumeCm3 <= 0) continue;

      const x = toNumber(analysis.boundingBoxX);
      const y = toNumber(analysis.boundingBoxY);
      const z = toNumber(analysis.boundingBoxZ);

      return {
        volumeCm3,
        surfaceAreaCm2: toNumber(analysis.surfaceArea),
        boundingBox:
          x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined,
        source: 'file_analysis',
      };
    }

    // Fallback: DFM report metrics attached directly to the quote item.
    const metrics = (item.dfmReport?.metrics ?? null) as Record<string, unknown> | null;
    if (metrics) {
      const volumeCm3 = toNumber(metrics.volumeCm3 ?? metrics.volume_cm3);
      if (volumeCm3 && volumeCm3 > 0) {
        const bbox = (metrics.bboxMm ?? metrics.bbox_mm ?? metrics.boundingBox) as
          | { x: number; y: number; z: number }
          | undefined;
        return {
          volumeCm3,
          surfaceAreaCm2: toNumber(metrics.surfaceAreaCm2 ?? metrics.surface_area_cm2),
          boundingBox: bbox,
          source: 'dfm_report',
        };
      }
    }

    return null;
  }

  async resolveMachine(tenantId: string, process: string): Promise<Machine | null> {
    if (!process) return null;

    return this.prisma.machine.findFirst({
      where: { tenantId, process, active: true },
      orderBy: [{ hourlyRate: 'asc' }, { name: 'asc' }],
    });
  }

  async resolveMaterial(
    tenantId: string,
    params: { materialId?: string | null; materialCode?: string | null; process?: string | null },
  ): Promise<Material | null> {
    const { materialId, materialCode, process } = params;

    if (materialId) {
      const byId = await this.prisma.material.findFirst({
        where: { id: materialId, tenantId, active: true },
      });
      if (byId) return byId;
      this.logger.warn(
        `Material ${materialId} not found or inactive for tenant ${tenantId}; retrying by code`,
      );
    }

    if (!materialCode) return null;

    const byCode = await this.prisma.material.findFirst({
      where: {
        tenantId,
        active: true,
        code: { equals: materialCode, mode: 'insensitive' },
        ...(process ? { process } : {}),
      },
      orderBy: { versionEffectiveFrom: 'desc' },
    });
    if (byCode) return byCode;

    return this.prisma.material.findFirst({
      where: {
        tenantId,
        active: true,
        name: { contains: materialCode, mode: 'insensitive' },
        ...(process ? { process } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }
}
