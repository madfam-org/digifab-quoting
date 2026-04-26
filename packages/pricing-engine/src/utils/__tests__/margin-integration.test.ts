import { describe, it, expect } from '@jest/globals';
import { Decimal } from 'decimal.js';
import { FFFPricingCalculator } from '../../calculators/fff.calculator';
import { PricingInput } from '../../types';
import { ProcessType } from '@cotiza/shared';

describe('Margin Validation Integration', () => {
  const createTestInput = (): PricingInput => ({
    process: ProcessType.FFF,
    geometry: {
      volumeCm3: 10,
      surfaceAreaCm2: 50,
      bboxMm: { x: 50, y: 50, z: 20 },
    },
    material: {
      id: 'pla',
      name: 'PLA',
      pricePerUom: new Decimal(25), // $25/kg
      density: 1.24, // g/cm³
      category: 'thermoplastic',
      co2eFactor: new Decimal(2.5),
      recycledPercent: 20,
    },
    machine: {
      id: 'prusa',
      name: 'Prusa i3',
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
  });

  it('should enforce minimum margin of 50%', () => {
    const input = createTestInput();
    const calculator = new FFFPricingCalculator(input);
    const result = calculator.calculate();

    // Calculate total cost
    const totalCost = result.costBreakdown.material
      .plus(result.costBreakdown.machine)
      .plus(result.costBreakdown.energy)
      .plus(result.costBreakdown.labor)
      .plus(result.costBreakdown.overhead);

    // Calculate margin percentage
    const marginPercent = result.costBreakdown.margin.div(totalCost).mul(100);

    expect(marginPercent.toNumber()).toBeGreaterThanOrEqual(50);
    expect(result.unitPrice.toNumber()).toBeGreaterThan(totalCost.toNumber());
  });

  it('should adjust discount to maintain minimum margin', () => {
    const input = createTestInput();
    input.quantity = 100;
    input.tenantConfig.volumeDiscounts = [
      { minQuantity: 100, discountPercent: new Decimal(40) }, // Aggressive discount
    ];

    const calculator = new FFFPricingCalculator(input);
    const result = calculator.calculate();

    // Calculate effective margin after discount
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

    // Should have warning about discount adjustment
    const hasWarning = result.warnings.some(
      (w) => w.includes('Discount reduced') || w.includes('margin'),
    );
    expect(hasWarning).toBe(true);
  });

  it('should reject negative margin configuration', () => {
    const input = createTestInput();
    input.tenantConfig.marginFloorPercent = new Decimal(-10);

    // Should throw during calculator construction
    expect(() => new FFFPricingCalculator(input)).toThrow(
      'Margin floor percentage must be positive',
    );
  });

  it('should warn about low margins', () => {
    const input = createTestInput();
    input.tenantConfig.marginFloorPercent = new Decimal(15); // Low margin

    const calculator = new FFFPricingCalculator(input);
    const result = calculator.calculate();

    // Should have low margin warning
    const hasLowMarginWarning = result.warnings.some((w) => w.includes('Low margin warning'));
    expect(hasLowMarginWarning).toBe(true);
  });

  it('should handle zero cost components gracefully', () => {
    const input = createTestInput();
    input.material.pricePerUom = new Decimal(0); // Free material
    input.machine.hourlyRate = new Decimal(0); // Free machine time
    input.tenantConfig.laborRatePerHour = new Decimal(0); // Free labor
    input.tenantConfig.energyTariffPerKwh = new Decimal(0); // Free energy

    const calculator = new FFFPricingCalculator(input);

    // Should throw due to zero total cost
    expect(() => calculator.calculate()).toThrow('Total cost cannot be zero');
  });

  it('should calculate costs correctly for normal scenario', () => {
    const input = createTestInput();
    const calculator = new FFFPricingCalculator(input);
    const result = calculator.calculate();

    // All cost components should be positive
    expect(result.costBreakdown.material.toNumber()).toBeGreaterThan(0);
    expect(result.costBreakdown.machine.toNumber()).toBeGreaterThan(0);
    expect(result.costBreakdown.energy.toNumber()).toBeGreaterThan(0);
    expect(result.costBreakdown.labor.toNumber()).toBeGreaterThan(0);
    expect(result.costBreakdown.overhead.toNumber()).toBeGreaterThan(0);
    expect(result.costBreakdown.margin.toNumber()).toBeGreaterThan(0);

    // Final price should be sum of all components
    const expectedPrice = result.costBreakdown.material
      .plus(result.costBreakdown.machine)
      .plus(result.costBreakdown.energy)
      .plus(result.costBreakdown.labor)
      .plus(result.costBreakdown.overhead)
      .plus(result.costBreakdown.margin)
      .minus(result.costBreakdown.discount || new Decimal(0));

    expect(result.unitPrice.toNumber()).toBeCloseTo(expectedPrice.toNumber(), 2);
  });
});
