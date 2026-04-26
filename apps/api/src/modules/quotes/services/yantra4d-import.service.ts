import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PricingService } from '../../pricing/pricing.service';
import { TenantCacheService } from '../../tenants/services/tenant-cache.service';
import { QuoteCacheService } from '../../redis/quote-cache.service';
import { ProcessType, QuoteStatus, Currency } from '@cotiza/shared';
import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { Yantra4dImportDto, Yantra4dImportResponseDto } from '../dto/yantra4d-import.dto';

/**
 * Service responsible for importing Yantra4D geometry exports into Cotiza quotes.
 *
 * Flow:
 *  1. Create a new quote in DRAFT status.
 *  2. Resolve material by name to a tenant-specific material record.
 *  3. Create a quote item with the geometry metadata.
 *  4. Run the pricing engine using the supplied geometry metrics.
 *  5. Update the quote with totals and transition to AUTO_QUOTED.
 *  6. Return the structured response.
 */
@Injectable()
export class Yantra4dImportService {
  private readonly logger = new Logger(Yantra4dImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly tenantCacheService: TenantCacheService,
    private readonly quoteCacheService: QuoteCacheService,
  ) {}

  async createQuoteFromYantra4d(
    tenantId: string,
    customerId: string,
    dto: Yantra4dImportDto,
  ): Promise<Yantra4dImportResponseDto> {
    const warnings: string[] = [];
    const currency = (dto.currency || 'MXN') as Currency;
    const process = dto.item.process as ProcessType;

    // -----------------------------------------------------------------------
    // 1. Resolve material by name (case-insensitive partial match)
    // -----------------------------------------------------------------------
    const material = await this.prisma.material.findFirst({
      where: {
        tenantId,
        active: true,
        name: { contains: dto.item.material, mode: 'insensitive' },
      },
    });

    if (!material) {
      warnings.push(
        `Material "${dto.item.material}" not found in tenant catalog. ` +
          'Using default pricing estimates.',
      );
    }

    // -----------------------------------------------------------------------
    // 2. Resolve a machine for this process
    // -----------------------------------------------------------------------
    const machine = await this.prisma.machine.findFirst({
      where: {
        tenantId,
        active: true,
        process: process,
      },
      orderBy: { name: 'asc' },
    });

    if (!machine) {
      warnings.push(
        `No active machine found for process "${process}" in tenant. ` +
          'Using default pricing estimates.',
      );
    }

    // -----------------------------------------------------------------------
    // 3. Generate quote number and determine validity period
    // -----------------------------------------------------------------------
    const tenantConfig = await this.tenantCacheService.getTenantConfig(tenantId);
    const validityDays = (tenantConfig.settings.quoteValidityDays as number) || 14;
    const validityUntil = new Date();
    validityUntil.setDate(validityUntil.getDate() + validityDays);

    const quoteNumber = await this.generateQuoteNumber(tenantId);

    // -----------------------------------------------------------------------
    // 4. Create the quote record
    // -----------------------------------------------------------------------
    const quote = await this.prisma.quote.create({
      data: {
        tenantId,
        customerId,
        number: quoteNumber,
        currency,
        objective: { cost: 0.5, lead: 0.3, green: 0.2 } as Prisma.InputJsonValue,
        validityUntil,
        status: QuoteStatus.DRAFT,
        metadata: {
          source: 'yantra4d',
          yantra4dProject: dto.project.slug,
          yantra4dProjectName: dto.project.name,
          notes: dto.notes || '',
        } as Prisma.InputJsonValue,
      },
    });

    // -----------------------------------------------------------------------
    // 5. Create the quote item
    // -----------------------------------------------------------------------
    const quoteItem = await this.prisma.quoteItem.create({
      data: {
        quoteId: quote.id,
        name: dto.item.name,
        process: process,
        processCode: process,
        material: dto.item.material,
        materialId: material?.id || null,
        quantity: dto.item.quantity,
        selections: {
          material: dto.item.material,
          finish: dto.item.finish || 'standard',
          ...(dto.item.options || {}),
          // Preserve geometry metadata in selections for downstream processing
          _yantra4d_geometry: {
            volume_cm3: dto.geometry.volume_cm3,
            surface_area_cm2: dto.geometry.surface_area_cm2,
            bounding_box_mm: dto.geometry.bounding_box_mm,
          },
          // BoundingBoxDto is a class; InputJsonValue doesn't see it as
          // structurally overlapping — round-trip via unknown.
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // -----------------------------------------------------------------------
    // 6. Run pricing engine
    // -----------------------------------------------------------------------
    let unitPrice = 0;
    let totalPrice = 0;
    let leadDays = 5;
    let costBreakdown: Record<string, number> = {};

    try {
      const geometryMetrics = {
        volumeCm3: dto.geometry.volume_cm3,
        surfaceAreaCm2: dto.geometry.surface_area_cm2,
        boundingBox: dto.geometry.bounding_box_mm,
      };

      // Only run pricing engine if we have both material and machine
      if (material && machine) {
        const pricingResult = await this.pricingService.calculateQuoteItem(
          tenantId,
          process,
          geometryMetrics,
          material.id,
          machine.id,
          { material: dto.item.material, finish: dto.item.finish || 'standard' },
          dto.item.quantity,
          { cost: 0.5, lead: 0.3, green: 0.2 },
        );

        unitPrice = pricingResult.unitPrice;
        totalPrice = pricingResult.totalPrice;
        leadDays = pricingResult.leadDays;
        costBreakdown = pricingResult.costBreakdown;
      } else {
        // Fallback: estimate pricing from geometry volume
        const estimatedUnitCost = this.estimateFallbackPrice(
          dto.geometry.volume_cm3,
          process,
          dto.item.material,
        );
        unitPrice = estimatedUnitCost;
        totalPrice = estimatedUnitCost * dto.item.quantity;
        costBreakdown = { estimated: totalPrice };
        warnings.push(
          'Pricing is estimated due to missing material/machine configuration. ' +
            'Review and adjust before sending to customer.',
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Pricing calculation failed for Yantra4D import: ${msg}`);
      warnings.push(`Pricing engine error: ${msg}. Quote created without pricing.`);
    }

    // -----------------------------------------------------------------------
    // 7. Update quote item with pricing results
    // -----------------------------------------------------------------------
    await this.prisma.quoteItem.update({
      where: { id: quoteItem.id },
      data: {
        unitPrice,
        totalPrice,
        leadDays,
        costBreakdown: costBreakdown as Prisma.InputJsonValue,
        flags: warnings.length > 0 ? ['needs_review'] : [],
      },
    });

    // -----------------------------------------------------------------------
    // 8. Calculate totals and update quote status
    // -----------------------------------------------------------------------
    const pricingSettings = await this.tenantCacheService.getPricingSettings(tenantId);
    const taxRate = new Decimal((pricingSettings.taxRate as number) || 0.16);
    const subtotal = new Decimal(totalPrice);
    const tax = subtotal.mul(taxRate);

    const freeShippingThreshold = new Decimal(
      (pricingSettings.freeShippingThreshold as number) || 1000,
    );
    const standardShippingRate = new Decimal(
      (pricingSettings.standardShippingRate as number) || 150,
    );
    const shipping = subtotal.gte(freeShippingThreshold) ? new Decimal(0) : standardShippingRate;
    const grandTotal = subtotal.plus(tax).plus(shipping);

    const finalStatus = warnings.length > 0 ? QuoteStatus.NEEDS_REVIEW : QuoteStatus.AUTO_QUOTED;

    await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: finalStatus,
        totals: {
          subtotal: subtotal.toNumber(),
          tax: tax.toNumber(),
          shipping: shipping.toNumber(),
          grandTotal: grandTotal.toNumber(),
          currency,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // -----------------------------------------------------------------------
    // 9. Build response
    // -----------------------------------------------------------------------
    return {
      quoteId: quote.id,
      quoteNumber: quoteNumber,
      status: finalStatus,
      totalPrice: grandTotal.toNumber(),
      currency,
      itemCount: 1,
      items: [
        {
          name: dto.item.name,
          process: process,
          material: dto.item.material,
          quantity: dto.item.quantity,
          unitPrice,
          totalPrice,
          leadDays,
        },
      ],
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Fallback price estimation when material/machine records are missing.
   * Uses a simple cost-per-cm3 heuristic based on process type.
   */
  private estimateFallbackPrice(volumeCm3: number, process: string, material: string): number {
    // Base rates per cm3 by process (MXN)
    const rateMap: Record<string, number> = {
      '3d_fff': 3.5,
      '3d_sla': 8.0,
      cnc_3axis: 15.0,
      laser_2d: 5.0,
    };

    // Material multipliers for common materials
    const materialMultiplier: Record<string, number> = {
      pla: 1.0,
      abs: 1.2,
      petg: 1.3,
      tpu: 1.8,
      nylon: 2.0,
      resin: 1.5,
      aluminum: 3.0,
      steel: 3.5,
      acrylic: 1.0,
      wood: 0.8,
    };

    const baseRate = rateMap[process] || 5.0;
    const matMult = materialMultiplier[material.toLowerCase()] || 1.0;
    const effectiveVolume = Math.max(volumeCm3, 1.0); // minimum 1 cm3

    // Setup fee + volume-based cost
    const setupFee = 50.0; // MXN
    const volumeCost = effectiveVolume * baseRate * matMult;

    return Math.round((setupFee + volumeCost) * 100) / 100;
  }

  /**
   * Generate a unique quote number: Q-YYYY-MM-XXXX
   */
  private async generateQuoteNumber(tenantId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const startOfMonth = new Date(year, now.getMonth(), 1);
    const endOfMonth = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = await this.prisma.quote.count({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `Q-${year}-${month}-${sequence}`;
  }
}
