import { describe, it, expect } from '@jest/globals';
import { PricingEngine } from '../src/engine';
import { PricingInput } from '../src/types';
import { ProcessType } from '@cotiza/shared';
import { Decimal } from 'decimal.js';

describe('Margin Enforcement Edge Cases', () => {
  const engine = new PricingEngine();

  const createInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
    process: ProcessType.FFF,
    geometry: {
      volumeCm3: 100,
      surfaceAreaCm2: 200,
      bboxMm: { x: 100, y: 100, z: 100 },
    },
    material: {
      id: 'pla',
      name: 'PLA',
      pricePerUom: new Decimal(25),
      density: 1.24,
      category: 'thermoplastic',
      co2eFactor: new Decimal(2.5),
      recycledPercent: 20,
    },
    machine: {
      id: 'prusa',
      name: 'Prusa',
      hourlyRate: new Decimal(10),
      setupMinutes: 15,
      powerW: 150,
    },
    quantity: 1,
    tenantConfig: {
      marginFloorPercent: new Decimal(50),
      overheadPercent: new Decimal(20),
      energyTariffPerKwh: new Decimal(0.15),
      laborRatePerHour: new Decimal(25),
      rushUpchargePercent: new Decimal(30),
      volumeDiscounts: [],
      gridCo2eFactor: new Decimal(0.5),
      logisticsCo2eFactor: new Decimal(0.1),
    },
    selections: {
      infill: 35,
    },
    ...overrides,
  });

  describe('Volume Discount Edge Cases', () => {
    it('should never allow selling below cost + minimum margin', () => {
      // Create aggressive volume discounts
      const input = createInput({
        quantity: 1000,
        tenantConfig: {
          ...createInput().tenantConfig,
          marginFloorPercent: new Decimal(50),
          volumeDiscounts: [
            { minQuantity: 10, discountPercent: new Decimal(10) },
            { minQuantity: 100, discountPercent: new Decimal(20) },
            { minQuantity: 500, discountPercent: new Decimal(30) },
            { minQuantity: 1000, discountPercent: new Decimal(40) }, // Aggressive discount
          ],
        },
      });

      const result = engine.calculate(input);

      // Calculate the actual margin after discount
      const totalCost = result.costBreakdown.material
        .plus(result.costBreakdown.machine)
        .plus(result.costBreakdown.energy)
        .plus(result.costBreakdown.labor)
        .plus(result.costBreakdown.overhead);

      const discount = result.costBreakdown.discount || new Decimal(0);
      const effectiveMargin = result.costBreakdown.margin.minus(discount);
      const effectiveMarginPercent = effectiveMargin.div(totalCost).mul(100);

      // Should maintain at least 10% margin (absolute minimum)
      expect(effectiveMarginPercent.toNumber()).toBeGreaterThanOrEqual(10);

      // Unit price should never be below cost + minimum margin
      const minimumPrice = totalCost.mul(1.1); // 10% minimum margin
      expect(result.unitPrice.toNumber()).toBeGreaterThanOrEqual(minimumPrice.toNumber());
    });

    it('should adjust discount when it would violate margin floor', () => {
      const input = createInput({
        quantity: 1000,
        tenantConfig: {
          ...createInput().tenantConfig,
          marginFloorPercent: new Decimal(30),
          volumeDiscounts: [
            { minQuantity: 1000, discountPercent: new Decimal(25) }, // Would leave only 5% margin
          ],
        },
      });

      const result = engine.calculate(input);

      // Check warnings for discount adjustment
      const hasDiscountWarning = result.warnings.some(
        (w) => w.includes('Discount reduced') || w.includes('margin'),
      );
      expect(hasDiscountWarning).toBe(true);

      // Verify minimum margin is maintained
      const totalCost = result.costBreakdown.material
        .plus(result.costBreakdown.machine)
        .plus(result.costBreakdown.energy)
        .plus(result.costBreakdown.labor)
        .plus(result.costBreakdown.overhead);

      const finalPrice = result.unitPrice;
      const actualMarginPercent = finalPrice.minus(totalCost).div(totalCost).mul(100);

      expect(actualMarginPercent.toNumber()).toBeGreaterThanOrEqual(10); // Absolute minimum
    });
  });

  describe('Low Cost Parts', () => {
    it('should maintain margin percentage even for very low cost parts', () => {
      const input = createInput({
        geometry: {
          volumeCm3: 0.01, // Very tiny part
          surfaceAreaCm2: 0.1,
          bboxMm: { x: 5, y: 5, z: 2 },
        },
        tenantConfig: {
          ...createInput().tenantConfig,
          marginFloorPercent: new Decimal(100), // 100% margin requirement
        },
      });

      const result = engine.calculate(input);

      const totalCost = result.costBreakdown.material
        .plus(result.costBreakdown.machine)
        .plus(result.costBreakdown.energy)
        .plus(result.costBreakdown.labor)
        .plus(result.costBreakdown.overhead);

      const marginPercent = result.costBreakdown.margin.div(totalCost).mul(100);

      expect(marginPercent.toNumber()).toBeGreaterThanOrEqual(100);
      expect(result.unitPrice.toNumber()).toBeGreaterThanOrEqual(totalCost.mul(2).toNumber());
    });
  });

  describe('High Volume with Discounts', () => {
    it('should properly calculate cumulative pricing with volume discounts', () => {
      const quantities = [1, 10, 100, 1000];
      const results: { qty: number; unitPrice: number; effectiveMargin: number }[] = [];

      quantities.forEach((qty) => {
        const input = createInput({
          quantity: qty,
          tenantConfig: {
            ...createInput().tenantConfig,
            marginFloorPercent: new Decimal(50),
            volumeDiscounts: [
              { minQuantity: 10, discountPercent: new Decimal(5) },
              { minQuantity: 100, discountPercent: new Decimal(10) },
              { minQuantity: 1000, discountPercent: new Decimal(15) },
            ],
          },
        });

        const result = engine.calculate(input);

        const totalCost = result.costBreakdown.material
          .plus(result.costBreakdown.machine)
          .plus(result.costBreakdown.energy)
          .plus(result.costBreakdown.labor)
          .plus(result.costBreakdown.overhead);

        const discount = result.costBreakdown.discount || new Decimal(0);
        const effectiveMargin = result.costBreakdown.margin.minus(discount);
        const effectiveMarginPercent = effectiveMargin.div(totalCost).mul(100);

        results.push({
          qty,
          unitPrice: result.unitPrice.toNumber(),
          effectiveMargin: effectiveMarginPercent.toNumber(),
        });
      });

      // Unit prices should decrease with quantity (due to discounts)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].unitPrice).toBeLessThanOrEqual(results[i - 1].unitPrice);
      }

      // All should maintain minimum margin
      results.forEach((r) => {
        expect(r.effectiveMargin).toBeGreaterThanOrEqual(10); // Absolute minimum
      });
    });
  });

  describe('Negative Input Validation', () => {
    it('should handle negative margin configuration gracefully', () => {
      // This should throw during validation
      const input = createInput({
        tenantConfig: {
          ...createInput().tenantConfig,
          marginFloorPercent: new Decimal(-10), // Invalid negative margin
        },
      });

      const result = engine.calculate(input);

      // Should return error result
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('Validation failed'))).toBe(true);
    });

    it('should handle zero costs gracefully', () => {
      const input = createInput({
        material: {
          ...createInput().material,
          pricePerUom: new Decimal(0), // Free material
        },
        machine: {
          ...createInput().machine,
          hourlyRate: new Decimal(0), // Free machine time
        },
        tenantConfig: {
          ...createInput().tenantConfig,
          laborRatePerHour: new Decimal(0), // Free labor
          energyTariffPerKwh: new Decimal(0), // Free energy
          overheadPercent: new Decimal(0), // No overhead
        },
      });

      const result = engine.calculate(input);

      // Should still have a positive price due to margin requirements
      expect(result.unitPrice.toNumber()).toBeGreaterThan(0);

      // Should have warnings about zero cost
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Margin Warnings', () => {
    it('should warn when margin is below recommended levels', () => {
      const input = createInput({
        tenantConfig: {
          ...createInput().tenantConfig,
          marginFloorPercent: new Decimal(15), // Low but valid margin
        },
      });

      const result = engine.calculate(input);

      // Should have low margin warning
      const hasLowMarginWarning = result.warnings.some((w) => w.includes('Low margin warning'));
      expect(hasLowMarginWarning).toBe(true);
    });

    it('should warn when discount reduces effective margin significantly', () => {
      const input = createInput({
        quantity: 100,
        tenantConfig: {
          ...createInput().tenantConfig,
          marginFloorPercent: new Decimal(50),
          volumeDiscounts: [
            { minQuantity: 100, discountPercent: new Decimal(30) }, // Large discount
          ],
        },
      });

      const result = engine.calculate(input);

      // Should have warning about effective margin
      const hasMarginWarning = result.warnings.some(
        (w) => w.includes('margin') || w.includes('Discount'),
      );
      expect(hasMarginWarning).toBe(true);
    });
  });
});
