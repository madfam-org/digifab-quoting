import { Decimal } from 'decimal.js';
import { BasePricingCalculator } from './base.calculator';
import { PricingResult, ProcessingTime, MaterialUsage } from '../types';
import { GeometryMetrics } from '@cotiza/shared';

export class LaserPricingCalculator extends BasePricingCalculator {
  private readonly CUTTING_SPEEDS: Record<string, Record<number, number>> = {
    Acrylic: {
      3: 15, // mm thickness: mm/s
      6: 8,
      10: 4,
      20: 1.5,
    },
    MDF: {
      3: 20,
      6: 10,
      10: 5,
      20: 2,
    },
    Plywood: {
      3: 18,
      6: 9,
      10: 4.5,
      20: 1.8,
    },
  };

  private readonly PIERCE_TIMES: Record<number, number> = {
    3: 0.5, // mm thickness: seconds
    6: 1.0,
    10: 2.0,
    20: 4.0,
  };

  calculate(): PricingResult {
    const time = this.calculateProcessingTime();
    const usage = this.calculateMaterialUsage();

    // Calculate costs
    const materialCost = this.calculateMaterialCost(usage);
    const machineCost = this.calculateMachineCost(time);
    const energyCost = this.calculateEnergyCost(time);
    const laborCost = this.calculateLaborCost(time);

    const subtotal = materialCost.plus(machineCost).plus(energyCost).plus(laborCost);

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
        laborCost,
        overheadCost,
        marginAmount,
        discount,
      ),
      sustainability,
      confidence: 0.98, // Very high confidence for laser cutting
      warnings: [...this.generateWarnings(usage), ...discountWarnings, ...pricingWarnings],
    };
  }

  calculateProcessingTime(): ProcessingTime {
    const { geometry, material, machine, selections } = this.input;

    // Get material thickness from selections
    const thickness = selections.materialThickness || 3; // mm

    // Get cutting speed for material and thickness
    const materialSpeeds = this.CUTTING_SPEEDS[material.name] || this.CUTTING_SPEEDS['Acrylic'];
    const cuttingSpeed = this.interpolateSpeed(materialSpeeds, thickness);

    // Calculate cutting time
    const cutLengthM = (geometry.lengthCutMm || 0) / 1000; // Convert to meters
    const cuttingSeconds = (cutLengthM * 1000) / cuttingSpeed;

    // Calculate pierce time
    const pierceCount = this.estimatePierceCount(geometry);
    const pierceTime = this.interpolatePierceTime(thickness) * pierceCount;

    // Add time for engraving if requested
    const engravingMinutes = selections.engraving ? this.calculateEngravingTime(geometry) : 0;

    const setupMinutes = machine.setupMinutes;
    const processingMinutes = Math.ceil((cuttingSeconds + pierceTime) / 60 + engravingMinutes);
    const postProcessingMinutes = 5; // Minimal post-processing for laser

    return {
      setupMinutes,
      processingMinutes,
      postProcessingMinutes,
      totalMinutes: setupMinutes + processingMinutes + postProcessingMinutes,
    };
  }

  calculateMaterialUsage(): MaterialUsage {
    const { geometry, selections } = this.input;

    // Calculate sheet area needed
    const partAreaCm2 = geometry.surfaceAreaCm2 || (geometry.bboxMm.x * geometry.bboxMm.y) / 100;

    // Add nesting efficiency
    const nestingEfficiency = 0.85; // 85% material utilization
    const sheetAreaCm2 = partAreaCm2 / nestingEfficiency;

    // Convert to volume using thickness
    const thickness = selections.materialThickness || 3; // mm
    const netVolumeCm3 = partAreaCm2 * (thickness / 10);
    const grossVolumeCm3 = sheetAreaCm2 * (thickness / 10);

    const wasteFactor = (grossVolumeCm3 - netVolumeCm3) / grossVolumeCm3;

    return {
      netVolumeCm3,
      grossVolumeCm3,
      wasteFactor,
    };
  }

  private interpolateSpeed(speeds: Record<number, number>, thickness: number): number {
    const thicknesses = Object.keys(speeds)
      .map(Number)
      .sort((a, b) => a - b);

    // Find the two closest thicknesses
    let lowerThickness = thicknesses[0];
    let upperThickness = thicknesses[thicknesses.length - 1];

    for (let i = 0; i < thicknesses.length - 1; i++) {
      if (thickness >= thicknesses[i] && thickness <= thicknesses[i + 1]) {
        lowerThickness = thicknesses[i];
        upperThickness = thicknesses[i + 1];
        break;
      }
    }

    if (thickness <= lowerThickness) return speeds[lowerThickness];
    if (thickness >= upperThickness) return speeds[upperThickness];

    // Linear interpolation
    const ratio = (thickness - lowerThickness) / (upperThickness - lowerThickness);
    return speeds[lowerThickness] + ratio * (speeds[upperThickness] - speeds[lowerThickness]);
  }

  private interpolatePierceTime(thickness: number): number {
    const thicknesses = Object.keys(this.PIERCE_TIMES)
      .map(Number)
      .sort((a, b) => a - b);

    for (let i = 0; i < thicknesses.length - 1; i++) {
      if (thickness >= thicknesses[i] && thickness <= thicknesses[i + 1]) {
        const ratio = (thickness - thicknesses[i]) / (thicknesses[i + 1] - thicknesses[i]);
        return (
          this.PIERCE_TIMES[thicknesses[i]] +
          ratio * (this.PIERCE_TIMES[thicknesses[i + 1]] - this.PIERCE_TIMES[thicknesses[i]])
        );
      }
    }

    if (thickness <= thicknesses[0]) return this.PIERCE_TIMES[thicknesses[0]];
    return this.PIERCE_TIMES[thicknesses[thicknesses.length - 1]];
  }

  private estimatePierceCount(geometry: GeometryMetrics): number {
    // Base pierce for outer contour
    let pierces = 1;

    // Add pierces for holes
    if (geometry.holesCount) {
      pierces += geometry.holesCount;
    }

    // Estimate internal features based on cut length
    if (geometry.lengthCutMm) {
      const estimatedFeatures = Math.floor(geometry.lengthCutMm / 500);
      pierces += estimatedFeatures;
    }

    return pierces;
  }

  private calculateEngravingTime(geometry: GeometryMetrics): number {
    // Simplified engraving time based on area
    const engravingAreaCm2 = geometry.surfaceAreaCm2 * 0.2; // Assume 20% of area
    const engravingSpeedCm2PerMin = 50; // Typical engraving speed

    return engravingAreaCm2 / engravingSpeedCm2PerMin;
  }

  protected calculateMaterialCost(usage: MaterialUsage): Decimal {
    const { material, selections } = this.input;

    // For sheet materials, cost is often per sheet or per m²
    const thickness = selections.materialThickness || 3;
    const areaM2 = new Decimal(usage.grossVolumeCm3)
      .div(thickness / 10) // Get area in cm²
      .div(10000); // Convert to m²

    // Assume price is per m² for laser materials
    return areaM2.mul(material.pricePerUom).mul(thickness / 3); // Adjust for thickness
  }

  private generateWarnings(usage: MaterialUsage): string[] {
    const warnings: string[] = [];
    const { geometry, material, selections } = this.input;

    const thickness = selections.materialThickness || 3;

    // Material thickness warnings
    if (thickness > 10 && material.name === 'Acrylic') {
      warnings.push('Thick acrylic may require multiple passes');
    }

    // Small features warning
    const minFeatureSize = thickness * 0.5;
    if (selections.tolerance === 'tight') {
      warnings.push(`Minimum feature size is ${minFeatureSize}mm for this thickness`);
    }

    // Large sheet warning
    if (usage.grossVolumeCm3 / (thickness / 10) > 10000) {
      // > 1m²
      warnings.push('Large sheet size may require special handling');
    }

    // Complex cutting path
    if (geometry.lengthCutMm && geometry.lengthCutMm > 5000) {
      warnings.push('Complex cutting path may affect edge quality');
    }

    return warnings;
  }
}
