import { Decimal } from 'decimal.js';
import { TenantPricingConfig, VolumeDiscount } from '../types';

export class PricingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingValidationError';
  }
}

export class MarginValidator {
  private static readonly ABSOLUTE_MINIMUM_MARGIN_PERCENT = 10; // Never go below 10% margin
  private static readonly WARNING_MARGIN_PERCENT = 20; // Warn below 20% margin

  /**
   * Validates that the margin percentage is not negative
   */
  static validateMarginPercent(marginPercent: Decimal, context?: string): void {
    if (marginPercent.isNegative()) {
      throw new PricingValidationError(
        `${context ? context + ': ' : ''}Margin percentage cannot be negative (${marginPercent.toFixed(2)}%)`,
      );
    }
  }

  /**
   * Validates that the final price maintains minimum margin requirements
   */
  static validateFinalMargin(
    totalCost: Decimal,
    finalPrice: Decimal,
    minimumMarginPercent: Decimal,
    context?: string,
  ): { isValid: boolean; warnings: string[]; effectiveMarginPercent: Decimal } {
    const warnings: string[] = [];

    if (totalCost.isZero()) {
      throw new PricingValidationError('Total cost cannot be zero');
    }

    const effectiveMargin = finalPrice.minus(totalCost);
    const effectiveMarginPercent = effectiveMargin.div(totalCost).mul(100);

    // Never allow selling below cost
    if (finalPrice.lessThan(totalCost)) {
      throw new PricingValidationError(
        `${context ? context + ': ' : ''}Final price (${finalPrice.toFixed(2)}) cannot be below total cost (${totalCost.toFixed(2)})`,
      );
    }

    // Check absolute minimum margin
    if (effectiveMarginPercent.lessThan(this.ABSOLUTE_MINIMUM_MARGIN_PERCENT)) {
      throw new PricingValidationError(
        `${context ? context + ': ' : ''}Margin (${effectiveMarginPercent.toFixed(2)}%) is below absolute minimum (${this.ABSOLUTE_MINIMUM_MARGIN_PERCENT}%)`,
      );
    }

    // Check against configured minimum margin
    if (effectiveMarginPercent.lessThan(minimumMarginPercent)) {
      warnings.push(
        `Effective margin (${effectiveMarginPercent.toFixed(2)}%) is below configured minimum (${minimumMarginPercent.toFixed(2)}%)`,
      );
    }

    // Warning if margin is low
    if (effectiveMarginPercent.lessThan(this.WARNING_MARGIN_PERCENT)) {
      warnings.push(
        `Low margin warning: ${effectiveMarginPercent.toFixed(2)}% is below recommended ${this.WARNING_MARGIN_PERCENT}%`,
      );
    }

    return {
      isValid: effectiveMarginPercent.greaterThanOrEqualTo(minimumMarginPercent),
      warnings,
      effectiveMarginPercent,
    };
  }

  /**
   * Validates volume discounts to ensure they don't violate margin rules
   */
  static validateVolumeDiscounts(
    volumeDiscounts: VolumeDiscount[],
    minimumMarginPercent: Decimal,
  ): void {
    const maxAllowableDiscount = new Decimal(100)
      .minus(minimumMarginPercent)
      .minus(this.ABSOLUTE_MINIMUM_MARGIN_PERCENT);

    volumeDiscounts.forEach((discount) => {
      if (discount.discountPercent.isNegative()) {
        throw new PricingValidationError(
          `Volume discount cannot be negative for quantity ${discount.minQuantity}`,
        );
      }

      if (discount.discountPercent.greaterThan(maxAllowableDiscount)) {
        throw new PricingValidationError(
          `Volume discount ${discount.discountPercent.toFixed(2)}% for quantity ${discount.minQuantity} would violate minimum margin requirements (max allowed: ${maxAllowableDiscount.toFixed(2)}%)`,
        );
      }
    });

    // Ensure discounts are properly ordered
    const sortedDiscounts = [...volumeDiscounts].sort((a, b) => a.minQuantity - b.minQuantity);
    for (let i = 1; i < sortedDiscounts.length; i++) {
      if (sortedDiscounts[i].discountPercent.lessThan(sortedDiscounts[i - 1].discountPercent)) {
        throw new PricingValidationError('Volume discounts must increase with quantity');
      }
    }
  }

  /**
   * Calculates the minimum allowed price based on cost and margin requirements
   */
  static calculateMinimumPrice(totalCost: Decimal, minimumMarginPercent: Decimal): Decimal {
    const marginMultiplier = new Decimal(1).plus(minimumMarginPercent.div(100));
    return totalCost.mul(marginMultiplier);
  }

  /**
   * Adjusts discount to maintain minimum margin requirements
   */
  static adjustDiscountForMargin(
    basePrice: Decimal,
    totalCost: Decimal,
    requestedDiscount: Decimal,
    minimumMarginPercent: Decimal,
  ): { adjustedDiscount: Decimal; warning?: string } {
    const minimumPrice = this.calculateMinimumPrice(totalCost, minimumMarginPercent);
    const priceAfterDiscount = basePrice.minus(requestedDiscount);

    if (priceAfterDiscount.lessThan(minimumPrice)) {
      const maxAllowableDiscount = basePrice.minus(minimumPrice);
      return {
        adjustedDiscount: maxAllowableDiscount.isNegative() ? new Decimal(0) : maxAllowableDiscount,
        warning: `Discount reduced from ${requestedDiscount.toFixed(2)} to ${maxAllowableDiscount.toFixed(2)} to maintain minimum margin`,
      };
    }

    return { adjustedDiscount: requestedDiscount };
  }
}

export class ConfigValidator {
  /**
   * Validates tenant pricing configuration
   */
  static validateTenantConfig(config: TenantPricingConfig): void {
    // Validate margin floor
    if (!config.marginFloorPercent || config.marginFloorPercent.isNegative()) {
      throw new PricingValidationError('Margin floor percentage must be positive');
    }

    if (config.marginFloorPercent.isZero()) {
      throw new PricingValidationError('Margin floor percentage cannot be zero');
    }

    // Validate overhead
    if (!config.overheadPercent || config.overheadPercent.isNegative()) {
      throw new PricingValidationError('Overhead percentage must be non-negative');
    }

    // Validate energy tariff
    if (!config.energyTariffPerKwh || config.energyTariffPerKwh.isNegative()) {
      throw new PricingValidationError('Energy tariff must be non-negative');
    }

    // Validate labor rate
    if (!config.laborRatePerHour || config.laborRatePerHour.isNegative()) {
      throw new PricingValidationError('Labor rate must be non-negative');
    }

    // Validate rush upcharge
    if (!config.rushUpchargePercent || config.rushUpchargePercent.isNegative()) {
      throw new PricingValidationError('Rush upcharge percentage must be non-negative');
    }

    // Validate volume discounts
    if (config.volumeDiscounts && config.volumeDiscounts.length > 0) {
      MarginValidator.validateVolumeDiscounts(config.volumeDiscounts, config.marginFloorPercent);
    }

    // Validate sustainability factors
    if (!config.gridCo2eFactor || config.gridCo2eFactor.isNegative()) {
      throw new PricingValidationError('Grid CO2e factor must be non-negative');
    }

    if (!config.logisticsCo2eFactor || config.logisticsCo2eFactor.isNegative()) {
      throw new PricingValidationError('Logistics CO2e factor must be non-negative');
    }
  }
}

export class CostValidator {
  /**
   * Validates individual cost components
   */
  static validateCostComponent(value: Decimal, componentName: string): void {
    if (value.isNegative()) {
      throw new PricingValidationError(`${componentName} cost cannot be negative`);
    }

    if (!value.isFinite()) {
      throw new PricingValidationError(`${componentName} cost must be finite`);
    }
  }

  /**
   * Validates that total costs are reasonable
   */
  static validateTotalCosts(
    materialCost: Decimal,
    machineCost: Decimal,
    energyCost: Decimal,
    laborCost: Decimal,
    overheadCost: Decimal,
  ): void {
    const components = {
      Material: materialCost,
      Machine: machineCost,
      Energy: energyCost,
      Labor: laborCost,
      Overhead: overheadCost,
    };

    Object.entries(components).forEach(([name, value]) => {
      this.validateCostComponent(value, name);
    });

    const totalCost = Object.values(components).reduce(
      (sum, cost) => sum.plus(cost),
      new Decimal(0),
    );

    if (totalCost.isZero()) {
      throw new PricingValidationError('Total cost cannot be zero');
    }
  }
}
