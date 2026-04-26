import { Decimal } from 'decimal.js';
import { BasePricingCalculator } from './base.calculator';
import { PricingResult, ProcessingTime, MaterialUsage } from '../types';
import { GeometryMetrics } from '@cotiza/shared';

export class SLAPricingCalculator extends BasePricingCalculator {
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
      confidence: 0.95, // High confidence for SLA
      warnings: [...this.generateWarnings(usage), ...discountWarnings, ...pricingWarnings],
    };
  }

  calculateProcessingTime(): ProcessingTime {
    const { geometry, selections, machine } = this.input;

    // SLA prints by layers, time depends on layer count and exposure time
    const layerHeight = selections.layerHeight || 0.05; // 50 microns default
    const layerCount = Math.ceil(geometry.bboxMm.z / layerHeight);

    // Exposure time per layer (seconds)
    const exposureTimePerLayer = 8; // Typical for standard resin
    const peelTimePerLayer = 3; // Time to peel and reposition
    const totalTimePerLayer = exposureTimePerLayer + peelTimePerLayer;

    const setupMinutes = machine.setupMinutes;
    const processingMinutes = Math.ceil((layerCount * totalTimePerLayer) / 60);
    const postProcessingMinutes = this.calculatePostProcessing();

    return {
      setupMinutes,
      processingMinutes,
      postProcessingMinutes,
      totalMinutes: setupMinutes + processingMinutes + postProcessingMinutes,
    };
  }

  calculateMaterialUsage(): MaterialUsage {
    const { geometry } = this.input;

    // SLA uses actual volume plus supports
    const netVolumeCm3 = geometry.volumeCm3;

    // Support calculation (more supports needed for SLA)
    const supportVolumeCm3 = this.calculateSupportVolume(geometry);

    // Packing efficiency and waste
    const packingEfficiency = 0.92; // 92% efficiency
    const wasteFactor = 0.08; // 8% waste (failed prints, tank cleaning)

    const grossVolumeCm3 = (netVolumeCm3 + supportVolumeCm3) / packingEfficiency;

    return {
      netVolumeCm3,
      grossVolumeCm3,
      wasteFactor,
      supportVolumeCm3,
    };
  }

  private calculateSupportVolume(geometry: GeometryMetrics): number {
    // More sophisticated support calculation for SLA
    let supportVolume = 0;

    // Base supports (raft)
    const raftArea = geometry.bboxMm.x * geometry.bboxMm.y;
    const raftVolume = (raftArea * 2) / 1000; // 2mm raft in cm³
    supportVolume += raftVolume;

    // Overhang supports
    if (geometry.overhangArea && geometry.overhangArea > 0) {
      // SLA typically needs more support than FFF
      supportVolume += geometry.volumeCm3 * 0.15;
    }

    // Island supports (simplified)
    supportVolume += geometry.volumeCm3 * 0.05;

    return supportVolume;
  }

  private calculatePostProcessing(): number {
    const { geometry } = this.input;

    let minutes = 0;

    // Washing (IPA bath)
    minutes += 10;

    // Support removal (more complex for SLA)
    minutes += 15;

    // UV curing
    minutes += 30;

    // Surface finishing if needed
    if (geometry.surfaceAreaCm2 > 100) {
      minutes += 10;
    }

    return minutes;
  }

  private generateWarnings(usage: MaterialUsage): string[] {
    const warnings: string[] = [];
    const { geometry, selections } = this.input;

    // Check build volume
    if (geometry.bboxMm.z > 200) {
      warnings.push('Part height may exceed typical SLA build volume');
    }

    // Check for thin walls
    if (selections.tolerance === 'tight') {
      warnings.push('Tight tolerances may require manual finishing');
    }

    // Check resin volume
    if (usage.grossVolumeCm3 > 500) {
      warnings.push('Large resin volume may require multiple batches');
    }

    // Check if part has many overhangs
    if (usage.supportVolumeCm3 && usage.supportVolumeCm3 > usage.netVolumeCm3 * 0.5) {
      warnings.push('Extensive supports required, consider part orientation');
    }

    return warnings;
  }
}
