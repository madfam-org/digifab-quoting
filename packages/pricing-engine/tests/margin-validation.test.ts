import { describe, it, expect } from '@jest/globals';
import { PricingEngine } from '../src/engine';
import { PricingInput } from '../src/types';
import { ProcessType } from '@cotiza/shared';
import { Decimal } from 'decimal.js';

describe('Margin Validation', () => {
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

  it('should maintain minimum 50% markup', () => {
    const input = createInput();
    const result = engine.calculate(input);

    const totalCost = result.costBreakdown.material
      .plus(result.costBreakdown.machine)
      .plus(result.costBreakdown.energy)
      .plus(result.costBreakdown.labor)
      .plus(result.costBreakdown.overhead);

    const actualMarkup = result.costBreakdown.margin.div(totalCost).mul(100);

    expect(actualMarkup.toNumber()).toBeGreaterThanOrEqual(50);
  });

  it('should apply correct margin for different processes', () => {
    const processes = [
      { type: ProcessType.FFF, expectedMin: 50 },
      { type: ProcessType.SLA, expectedMin: 50 },
      { type: ProcessType.CNC_3AXIS, expectedMin: 50 },
      { type: ProcessType.LASER_2D, expectedMin: 50 },
    ];

    processes.forEach(({ type, expectedMin }) => {
      const input = createInput({ process: type });
      const result = engine.calculate(input);

      const totalCost = result.costBreakdown.material
        .plus(result.costBreakdown.machine)
        .plus(result.costBreakdown.energy)
        .plus(result.costBreakdown.labor)
        .plus(result.costBreakdown.overhead);

      const actualMarkup = result.costBreakdown.margin.div(totalCost).mul(100);

      expect(actualMarkup.toNumber()).toBeGreaterThanOrEqual(expectedMin);
    });
  });

  it('should ensure profitability after volume discounts', () => {
    // Set up volume discounts
    const inputWithDiscounts = createInput({
      tenantConfig: {
        ...createInput().tenantConfig,
        volumeDiscounts: [
          { minQuantity: 10, discountPercent: new Decimal(5) },
          { minQuantity: 50, discountPercent: new Decimal(10) },
          { minQuantity: 100, discountPercent: new Decimal(15) },
          { minQuantity: 500, discountPercent: new Decimal(20) },
        ],
      },
    });

    const quantities = [1, 10, 50, 100, 500];

    quantities.forEach((qty) => {
      const input = { ...inputWithDiscounts, quantity: qty };
      const result = engine.calculate(input);

      // Calculate effective margin after discount
      const totalCost = result.costBreakdown.material
        .plus(result.costBreakdown.machine)
        .plus(result.costBreakdown.energy)
        .plus(result.costBreakdown.labor)
        .plus(result.costBreakdown.overhead);

      const discount = result.costBreakdown.discount || new Decimal(0);
      const netMargin = result.costBreakdown.margin.minus(discount);
      const effectiveMarkup = netMargin.div(totalCost).mul(100);

      // Even with max 20% discount, should maintain at least 30% effective markup
      expect(effectiveMarkup.toNumber()).toBeGreaterThanOrEqual(30);
    });
  });

  it('should calculate correct total price', () => {
    const input = createInput();
    const result = engine.calculate(input);

    // Verify total calculation
    const expectedTotal = result.costBreakdown.material
      .plus(result.costBreakdown.machine)
      .plus(result.costBreakdown.energy)
      .plus(result.costBreakdown.labor)
      .plus(result.costBreakdown.overhead)
      .plus(result.costBreakdown.margin)
      .minus(result.costBreakdown.discount || new Decimal(0));

    expect(result.unitPrice.toNumber()).toBeCloseTo(expectedTotal.toNumber(), 2);
    expect(result.totalPrice.toNumber()).toBeCloseTo(
      expectedTotal.mul(input.quantity).toNumber(),
      2,
    );
  });

  it('should handle small parts correctly', () => {
    const input = createInput({
      geometry: {
        volumeCm3: 0.1, // Very small part
        surfaceAreaCm2: 1,
        bboxMm: { x: 10, y: 10, z: 1 },
      },
    });

    const result = engine.calculate(input);

    // Even small parts should have positive pricing
    expect(result.unitPrice.toNumber()).toBeGreaterThan(0);
    expect(result.totalPrice.toNumber()).toBeGreaterThan(0);
  });

  it('should handle different margin floor configurations', () => {
    const marginFloors = [30, 50, 70];

    marginFloors.forEach((floor) => {
      const input = createInput({
        tenantConfig: {
          ...createInput().tenantConfig,
          marginFloorPercent: new Decimal(floor),
        },
      });

      const result = engine.calculate(input);

      // Should calculate successfully with different margin floors
      expect(result.unitPrice.toNumber()).toBeGreaterThan(0);
      expect(result.costBreakdown.margin.toNumber()).toBeGreaterThan(0);

      // Verify margin floor is respected
      const totalCost = result.costBreakdown.material
        .plus(result.costBreakdown.machine)
        .plus(result.costBreakdown.energy)
        .plus(result.costBreakdown.labor)
        .plus(result.costBreakdown.overhead);

      const actualMarginPercent = result.costBreakdown.margin.div(totalCost).mul(100);
      expect(actualMarginPercent.toNumber()).toBeGreaterThanOrEqual(floor);
    });
  });

  it('should validate cost breakdown totals', () => {
    const input = createInput();
    const result = engine.calculate(input);
    const breakdown = result.costBreakdown;

    // All cost components should be positive
    expect(breakdown.material.toNumber()).toBeGreaterThan(0);
    expect(breakdown.machine.toNumber()).toBeGreaterThan(0);
    expect(breakdown.energy.toNumber()).toBeGreaterThan(0);
    expect(breakdown.labor.toNumber()).toBeGreaterThan(0);
    expect(breakdown.overhead.toNumber()).toBeGreaterThan(0);
    expect(breakdown.margin.toNumber()).toBeGreaterThan(0);

    // Total should equal sum of all components minus discount
    const expectedTotal = breakdown.material
      .plus(breakdown.machine)
      .plus(breakdown.energy)
      .plus(breakdown.labor)
      .plus(breakdown.overhead)
      .plus(breakdown.margin)
      .minus(breakdown.discount || new Decimal(0));

    expect(result.unitPrice.toNumber()).toBeCloseTo(expectedTotal.toNumber(), 2);
  });
});
