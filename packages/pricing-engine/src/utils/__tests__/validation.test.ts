import { describe, it, expect } from '@jest/globals';
import { Decimal } from 'decimal.js';
import {
  MarginValidator,
  ConfigValidator,
  CostValidator,
  PricingValidationError,
} from '../validation';
import { TenantPricingConfig, VolumeDiscount } from '../../types';

describe('MarginValidator', () => {
  describe('validateMarginPercent', () => {
    it('should accept positive margin percentages', () => {
      expect(() => MarginValidator.validateMarginPercent(new Decimal(50))).not.toThrow();
      expect(() => MarginValidator.validateMarginPercent(new Decimal(0))).not.toThrow();
      expect(() => MarginValidator.validateMarginPercent(new Decimal(100))).not.toThrow();
    });

    it('should reject negative margin percentages', () => {
      expect(() => MarginValidator.validateMarginPercent(new Decimal(-10))).toThrow(
        PricingValidationError,
      );
      expect(() => MarginValidator.validateMarginPercent(new Decimal(-0.1))).toThrow(
        'Margin percentage cannot be negative',
      );
    });

    it('should include context in error message', () => {
      expect(() => MarginValidator.validateMarginPercent(new Decimal(-10), 'Test context')).toThrow(
        'Test context: Margin percentage cannot be negative',
      );
    });
  });

  describe('validateFinalMargin', () => {
    it('should reject prices below cost', () => {
      const totalCost = new Decimal(100);
      const finalPrice = new Decimal(90);
      const minimumMarginPercent = new Decimal(50);

      expect(() =>
        MarginValidator.validateFinalMargin(totalCost, finalPrice, minimumMarginPercent),
      ).toThrow('Final price (90.00) cannot be below total cost (100.00)');
    });

    it('should reject margins below absolute minimum', () => {
      const totalCost = new Decimal(100);
      const finalPrice = new Decimal(105); // 5% margin
      const minimumMarginPercent = new Decimal(50);

      expect(() =>
        MarginValidator.validateFinalMargin(totalCost, finalPrice, minimumMarginPercent),
      ).toThrow('Margin (5.00%) is below absolute minimum (10%)');
    });

    it('should warn when margin is below configured minimum', () => {
      const totalCost = new Decimal(100);
      const finalPrice = new Decimal(130); // 30% margin
      const minimumMarginPercent = new Decimal(50);

      const result = MarginValidator.validateFinalMargin(
        totalCost,
        finalPrice,
        minimumMarginPercent,
      );

      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain(
        'Effective margin (30.00%) is below configured minimum (50.00%)',
      );
      expect(result.effectiveMarginPercent.toNumber()).toBeCloseTo(30, 2);
    });

    it('should warn when margin is low', () => {
      const totalCost = new Decimal(100);
      const finalPrice = new Decimal(115); // 15% margin
      const minimumMarginPercent = new Decimal(10);

      const result = MarginValidator.validateFinalMargin(
        totalCost,
        finalPrice,
        minimumMarginPercent,
      );

      expect(result.warnings).toContain('Low margin warning: 15.00% is below recommended 20%');
    });

    it('should accept valid margins', () => {
      const totalCost = new Decimal(100);
      const finalPrice = new Decimal(150); // 50% margin
      const minimumMarginPercent = new Decimal(50);

      const result = MarginValidator.validateFinalMargin(
        totalCost,
        finalPrice,
        minimumMarginPercent,
      );

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.effectiveMarginPercent.toNumber()).toBeCloseTo(50, 2);
    });

    it('should throw error for zero cost', () => {
      expect(() =>
        MarginValidator.validateFinalMargin(new Decimal(0), new Decimal(100), new Decimal(50)),
      ).toThrow('Total cost cannot be zero');
    });
  });

  describe('validateVolumeDiscounts', () => {
    it('should reject negative discounts', () => {
      const discounts: VolumeDiscount[] = [{ minQuantity: 10, discountPercent: new Decimal(-5) }];

      expect(() => MarginValidator.validateVolumeDiscounts(discounts, new Decimal(50))).toThrow(
        'Volume discount cannot be negative for quantity 10',
      );
    });

    it('should reject discounts that violate margin requirements', () => {
      const discounts: VolumeDiscount[] = [
        { minQuantity: 10, discountPercent: new Decimal(45) }, // Would leave only 5% margin with 50% floor
      ];

      expect(() => MarginValidator.validateVolumeDiscounts(discounts, new Decimal(50))).toThrow(
        /Volume discount 45.00% .* would violate minimum margin requirements/,
      );
    });

    it('should ensure discounts increase with quantity', () => {
      const discounts: VolumeDiscount[] = [
        { minQuantity: 10, discountPercent: new Decimal(10) },
        { minQuantity: 50, discountPercent: new Decimal(5) }, // Less discount for more quantity
        { minQuantity: 100, discountPercent: new Decimal(15) },
      ];

      expect(() => MarginValidator.validateVolumeDiscounts(discounts, new Decimal(50))).toThrow(
        'Volume discounts must increase with quantity',
      );
    });

    it('should accept valid discount structure', () => {
      const discounts: VolumeDiscount[] = [
        { minQuantity: 10, discountPercent: new Decimal(5) },
        { minQuantity: 50, discountPercent: new Decimal(10) },
        { minQuantity: 100, discountPercent: new Decimal(15) },
      ];

      expect(() =>
        MarginValidator.validateVolumeDiscounts(discounts, new Decimal(50)),
      ).not.toThrow();
    });
  });

  describe('calculateMinimumPrice', () => {
    it('should calculate correct minimum price', () => {
      const totalCost = new Decimal(100);
      const minimumMarginPercent = new Decimal(50);

      const minPrice = MarginValidator.calculateMinimumPrice(totalCost, minimumMarginPercent);
      expect(minPrice.toNumber()).toBe(150);
    });

    it('should handle zero margin', () => {
      const totalCost = new Decimal(100);
      const minimumMarginPercent = new Decimal(0);

      const minPrice = MarginValidator.calculateMinimumPrice(totalCost, minimumMarginPercent);
      expect(minPrice.toNumber()).toBe(100);
    });
  });

  describe('adjustDiscountForMargin', () => {
    it('should not adjust discount when margin is maintained', () => {
      const basePrice = new Decimal(200);
      const totalCost = new Decimal(100);
      const requestedDiscount = new Decimal(20);
      const minimumMarginPercent = new Decimal(50);

      const result = MarginValidator.adjustDiscountForMargin(
        basePrice,
        totalCost,
        requestedDiscount,
        minimumMarginPercent,
      );

      expect(result.adjustedDiscount.toNumber()).toBe(20);
      expect(result.warning).toBeUndefined();
    });

    it('should reduce discount to maintain minimum margin', () => {
      const basePrice = new Decimal(200);
      const totalCost = new Decimal(100);
      const requestedDiscount = new Decimal(60); // Would result in $140 price, below $150 minimum
      const minimumMarginPercent = new Decimal(50);

      const result = MarginValidator.adjustDiscountForMargin(
        basePrice,
        totalCost,
        requestedDiscount,
        minimumMarginPercent,
      );

      expect(result.adjustedDiscount.toNumber()).toBe(50); // Max discount to maintain $150 price
      expect(result.warning).toContain('Discount reduced from 60.00 to 50.00');
    });

    it('should set discount to zero when base price is already too low', () => {
      const basePrice = new Decimal(140);
      const totalCost = new Decimal(100);
      const requestedDiscount = new Decimal(20);
      const minimumMarginPercent = new Decimal(50);

      const result = MarginValidator.adjustDiscountForMargin(
        basePrice,
        totalCost,
        requestedDiscount,
        minimumMarginPercent,
      );

      expect(result.adjustedDiscount.toNumber()).toBe(0);
      expect(result.warning).toContain('Discount reduced from 20.00 to 0.00');
    });
  });
});

describe('ConfigValidator', () => {
  describe('validateTenantConfig', () => {
    const validConfig: TenantPricingConfig = {
      marginFloorPercent: new Decimal(50),
      overheadPercent: new Decimal(20),
      energyTariffPerKwh: new Decimal(0.15),
      laborRatePerHour: new Decimal(25),
      rushUpchargePercent: new Decimal(30),
      volumeDiscounts: [],
      gridCo2eFactor: new Decimal(0.5),
      logisticsCo2eFactor: new Decimal(0.1),
    };

    it('should accept valid configuration', () => {
      expect(() => ConfigValidator.validateTenantConfig(validConfig)).not.toThrow();
    });

    it('should reject negative margin floor', () => {
      const config = { ...validConfig, marginFloorPercent: new Decimal(-10) };
      expect(() => ConfigValidator.validateTenantConfig(config)).toThrow(
        'Margin floor percentage must be positive',
      );
    });

    it('should reject zero margin floor', () => {
      const config = { ...validConfig, marginFloorPercent: new Decimal(0) };
      expect(() => ConfigValidator.validateTenantConfig(config)).toThrow(
        'Margin floor percentage cannot be zero',
      );
    });

    it('should reject negative overhead', () => {
      const config = { ...validConfig, overheadPercent: new Decimal(-5) };
      expect(() => ConfigValidator.validateTenantConfig(config)).toThrow(
        'Overhead percentage must be non-negative',
      );
    });

    it('should validate volume discounts', () => {
      const config = {
        ...validConfig,
        volumeDiscounts: [
          { minQuantity: 10, discountPercent: new Decimal(45) }, // Too high for 50% margin floor
        ],
      };
      expect(() => ConfigValidator.validateTenantConfig(config)).toThrow(/Volume discount/);
    });

    it('should reject negative sustainability factors', () => {
      let config = { ...validConfig, gridCo2eFactor: new Decimal(-0.5) };
      expect(() => ConfigValidator.validateTenantConfig(config)).toThrow(
        'Grid CO2e factor must be non-negative',
      );

      config = { ...validConfig, logisticsCo2eFactor: new Decimal(-0.1) };
      expect(() => ConfigValidator.validateTenantConfig(config)).toThrow(
        'Logistics CO2e factor must be non-negative',
      );
    });
  });
});

describe('CostValidator', () => {
  describe('validateCostComponent', () => {
    it('should accept valid cost values', () => {
      expect(() => CostValidator.validateCostComponent(new Decimal(100), 'Material')).not.toThrow();
      expect(() => CostValidator.validateCostComponent(new Decimal(0), 'Material')).not.toThrow();
      expect(() =>
        CostValidator.validateCostComponent(new Decimal(0.01), 'Material'),
      ).not.toThrow();
    });

    it('should reject negative costs', () => {
      expect(() => CostValidator.validateCostComponent(new Decimal(-10), 'Material')).toThrow(
        'Material cost cannot be negative',
      );
    });

    it('should reject infinite costs', () => {
      expect(() => CostValidator.validateCostComponent(new Decimal(Infinity), 'Material')).toThrow(
        'Material cost must be finite',
      );
    });
  });

  describe('validateTotalCosts', () => {
    it('should accept valid cost breakdown', () => {
      expect(() =>
        CostValidator.validateTotalCosts(
          new Decimal(50), // material
          new Decimal(30), // machine
          new Decimal(5), // energy
          new Decimal(20), // labor
          new Decimal(15), // overhead
        ),
      ).not.toThrow();
    });

    it('should reject negative component costs', () => {
      expect(() =>
        CostValidator.validateTotalCosts(
          new Decimal(-50), // negative material
          new Decimal(30),
          new Decimal(5),
          new Decimal(20),
          new Decimal(15),
        ),
      ).toThrow('Material cost cannot be negative');
    });

    it('should reject zero total cost', () => {
      expect(() =>
        CostValidator.validateTotalCosts(
          new Decimal(0),
          new Decimal(0),
          new Decimal(0),
          new Decimal(0),
          new Decimal(0),
        ),
      ).toThrow('Total cost cannot be zero');
    });

    it('should validate all components', () => {
      // Test each component separately
      const validCosts = [
        new Decimal(50),
        new Decimal(30),
        new Decimal(5),
        new Decimal(20),
        new Decimal(15),
      ];

      // Material
      expect(() =>
        CostValidator.validateTotalCosts(
          new Decimal(-1),
          ...(validCosts.slice(1) as [Decimal, Decimal, Decimal, Decimal]),
        ),
      ).toThrow('Material cost cannot be negative');

      // Machine
      expect(() =>
        CostValidator.validateTotalCosts(
          validCosts[0],
          new Decimal(-1),
          ...(validCosts.slice(2) as [Decimal, Decimal, Decimal]),
        ),
      ).toThrow('Machine cost cannot be negative');

      // Energy
      expect(() =>
        CostValidator.validateTotalCosts(
          ...(validCosts.slice(0, 2) as [Decimal, Decimal]),
          new Decimal(-1),
          ...(validCosts.slice(3) as [Decimal, Decimal]),
        ),
      ).toThrow('Energy cost cannot be negative');

      // Labor
      expect(() =>
        CostValidator.validateTotalCosts(
          ...(validCosts.slice(0, 3) as [Decimal, Decimal, Decimal]),
          new Decimal(-1),
          validCosts[4],
        ),
      ).toThrow('Labor cost cannot be negative');

      // Overhead
      expect(() =>
        CostValidator.validateTotalCosts(
          ...(validCosts.slice(0, 4) as [Decimal, Decimal, Decimal, Decimal]),
          new Decimal(-1),
        ),
      ).toThrow('Overhead cost cannot be negative');
    });
  });
});
