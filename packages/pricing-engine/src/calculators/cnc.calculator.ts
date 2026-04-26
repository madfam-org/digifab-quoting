import { Decimal } from 'decimal.js';
import { BasePricingCalculator } from './base.calculator';
import { PricingResult, ProcessingTime, MaterialUsage } from '../types';
import { GeometryMetrics, QuoteItemSelections } from '@cotiza/shared';

export class CNCPricingCalculator extends BasePricingCalculator {
  private readonly MRR_RATES: Record<string, number> = {
    'Al 6061': 3.0, // cm³/min
    'Steel 1018': 1.0, // cm³/min
    Acrylic: 6.0, // cm³/min
  };

  calculate(): PricingResult {
    const time = this.calculateProcessingTime();
    const usage = this.calculateMaterialUsage();

    // Calculate costs
    const materialCost = this.calculateMaterialCost(usage);
    const machineCost = this.calculateMachineCost(time);
    const energyCost = this.calculateEnergyCost(time);
    const laborCost = this.calculateLaborCost(time);
    const toolingCost = this.calculateToolingCost(time);

    const subtotal = materialCost
      .plus(machineCost)
      .plus(energyCost)
      .plus(laborCost)
      .plus(toolingCost);

    const overheadCost = this.calculateOverheadCost(subtotal);
    const costTotal = subtotal.plus(overheadCost);
    const marginAmount = this.calculateMargin(costTotal);

    const basePrice = costTotal.plus(marginAmount);
    const { discount, warnings: discountWarnings } = this.calculateVolumeDiscount(
      basePrice,
      costTotal,
    );
    const unitPrice = basePrice.minus(discount);
    const totalPrice = unitPrice.mul(this.input.quantity);

    // Validate final pricing
    const { warnings: pricingWarnings } = this.validateFinalPricing(
      costTotal,
      unitPrice,
      marginAmount,
      discount,
    );

    // Calculate sustainability
    const energyKwh = new Decimal(time.processingMinutes)
      .div(60)
      .mul(this.input.machine.powerW)
      .div(1000);
    const sustainability = this.calculateSustainability(energyKwh, usage);

    const leadDays = this.calculateLeadTime();

    return {
      unitPrice,
      totalPrice,
      leadDays,
      costBreakdown: this.buildCostBreakdown(
        materialCost,
        machineCost,
        energyCost,
        laborCost.plus(toolingCost),
        overheadCost,
        marginAmount,
        discount,
      ),
      sustainability,
      confidence: 0.85, // Lower confidence for CNC (more variables)
      warnings: [...this.generateWarnings(usage, time), ...discountWarnings, ...pricingWarnings],
    };
  }

  calculateProcessingTime(): ProcessingTime {
    const { geometry, material, machine, selections } = this.input;

    // Calculate material removal volume
    const stockVolume = this.calculateStockVolume(geometry);
    const removalVolume = stockVolume - geometry.volumeCm3;

    // Get material removal rate
    const mrr = this.MRR_RATES[material.name] || 2.0;

    // Complexity factor based on geometry
    const complexityFactor = this.calculateComplexityFactor(geometry, selections);

    // Base cutting time
    const cuttingMinutes = (removalVolume / mrr) * complexityFactor;

    // Tool changes
    const toolChangeMinutes = this.estimateToolChanges(geometry) * 5;

    const setupMinutes = machine.setupMinutes + 15; // Extra setup for CNC
    const processingMinutes = Math.ceil(cuttingMinutes + toolChangeMinutes);
    const postProcessingMinutes = this.calculatePostProcessing(selections);

    return {
      setupMinutes,
      processingMinutes,
      postProcessingMinutes,
      totalMinutes: setupMinutes + processingMinutes + postProcessingMinutes,
    };
  }

  calculateMaterialUsage(): MaterialUsage {
    const { geometry } = this.input;

    const stockVolume = this.calculateStockVolume(geometry);
    const netVolumeCm3 = geometry.volumeCm3;
    const wasteFactor = (stockVolume - netVolumeCm3) / stockVolume;

    return {
      netVolumeCm3,
      grossVolumeCm3: stockVolume,
      wasteFactor,
    };
  }

  private calculateStockVolume(geometry: GeometryMetrics): number {
    // Add stock allowance
    const stockAllowance = 5; // mm on each side
    const stockX = (geometry.bboxMm.x + stockAllowance * 2) / 10;
    const stockY = (geometry.bboxMm.y + stockAllowance * 2) / 10;
    const stockZ = (geometry.bboxMm.z + stockAllowance * 2) / 10;

    return stockX * stockY * stockZ;
  }

  private calculateComplexityFactor(
    geometry: GeometryMetrics,
    selections: QuoteItemSelections,
  ): number {
    let factor = 1.0;

    // Tolerance affects cutting speed
    if (selections.tolerance === 'tight') {
      factor *= 1.5;
    } else if (selections.tolerance === 'standard') {
      factor *= 1.2;
    }

    // Surface finish affects number of passes
    if (selections.finish === 'polished') {
      factor *= 1.4;
    } else if (selections.finish === 'smooth') {
      factor *= 1.2;
    }

    // Holes and features
    if (geometry.holesCount && geometry.holesCount > 0) {
      factor *= 1 + geometry.holesCount * 0.05;
    }

    // Aspect ratio (tall thin parts are harder)
    const aspectRatio = Math.max(
      geometry.bboxMm.x / geometry.bboxMm.z,
      geometry.bboxMm.y / geometry.bboxMm.z,
    );
    if (aspectRatio > 10) {
      factor *= 1.3;
    }

    return Math.min(factor, 2.0); // Cap at 2x
  }

  private estimateToolChanges(geometry: GeometryMetrics): number {
    let changes = 1; // At least one tool

    if (geometry.holesCount && geometry.holesCount > 0) {
      changes += Math.ceil(geometry.holesCount / 10);
    }

    // Different tools for roughing and finishing
    changes += 1;

    return changes;
  }

  private calculateToolingCost(time: ProcessingTime): Decimal {
    // Simplified tooling wear cost
    const toolingRatePerHour = new Decimal(10); // $/hour
    const processingHours = new Decimal(time.processingMinutes).div(60);

    return processingHours.mul(toolingRatePerHour);
  }

  private calculatePostProcessing(selections: QuoteItemSelections): number {
    let minutes = 10; // Base deburring

    if (selections.finish === 'polished') {
      minutes += 30;
    } else if (selections.finish === 'smooth') {
      minutes += 15;
    }

    // Inspection time for tight tolerances
    if (selections.tolerance === 'tight') {
      minutes += 20;
    }

    return minutes;
  }

  private generateWarnings(usage: MaterialUsage, time: ProcessingTime): string[] {
    const warnings: string[] = [];
    const { geometry, material, selections } = this.input;

    // Material-specific warnings
    if (material.name === 'Steel 1018' && time.processingMinutes > 480) {
      warnings.push('Long machining time for steel, consider design optimization');
    }

    // Tolerance warnings
    if (selections.tolerance === 'tight' && geometry.holesCount && geometry.holesCount > 10) {
      warnings.push('Many features with tight tolerances will increase cost');
    }

    // Thin wall warning
    const minDimension = Math.min(geometry.bboxMm.x, geometry.bboxMm.y, geometry.bboxMm.z);
    if (minDimension < 2) {
      warnings.push('Very thin features may be difficult to machine');
    }

    // High waste warning
    if (usage.wasteFactor > 0.7) {
      warnings.push('High material waste, consider near-net-shape stock');
    }

    return warnings;
  }
}
