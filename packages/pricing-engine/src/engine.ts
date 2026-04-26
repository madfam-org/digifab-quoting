import { ProcessType } from '@cotiza/shared';
import { Decimal } from 'decimal.js';
import { PricingInput, PricingResult } from './types';
import {
  FFFPricingCalculator,
  SLAPricingCalculator,
  CNCPricingCalculator,
  LaserPricingCalculator,
} from './calculators';
import { BasePricingCalculator } from './calculators/base.calculator';

type PricingCalculatorConstructor = new (input: PricingInput) => BasePricingCalculator;

export class PricingEngine {
  private calculators: Record<string, PricingCalculatorConstructor> = {
    [ProcessType.FFF]: FFFPricingCalculator,
    [ProcessType.SLA]: SLAPricingCalculator,
    [ProcessType.CNC_3AXIS]: CNCPricingCalculator,
    [ProcessType.LASER_2D]: LaserPricingCalculator,
  };

  calculate(input: PricingInput): PricingResult {
    // Validate input first
    const errors = this.validateInput(input);
    if (errors.length > 0) {
      // Return error result instead of throwing
      return {
        unitPrice: new Decimal(0),
        totalPrice: new Decimal(0),
        leadDays: 0,
        costBreakdown: {
          material: new Decimal(0),
          machine: new Decimal(0),
          energy: new Decimal(0),
          labor: new Decimal(0),
          overhead: new Decimal(0),
          margin: new Decimal(0),
        },
        sustainability: {
          score: 0,
          co2eKg: new Decimal(0),
          energyKwh: new Decimal(0),
          recycledPercent: 0,
          wastePercent: 0,
          co2e: {
            material: 0,
            energy: 0,
            logistics: 0,
            total: 0,
          },
        },
        confidence: 0,
        warnings: ['Validation failed', ...errors],
      };
    }

    const CalculatorClass = this.calculators[input.process as string];

    if (!CalculatorClass) {
      throw new Error(`No calculator found for process: ${input.process}`);
    }

    try {
      const calculator = new CalculatorClass(input);
      const result = calculator.calculate();

      // Check for invalid geometry
      if (input.geometry && input.geometry.volumeCm3 < 0) {
        result.warnings.push('Invalid geometry values');
      }

      return result;
    } catch (error) {
      // Return error result instead of throwing
      return {
        unitPrice: new Decimal(0),
        totalPrice: new Decimal(0),
        leadDays: 0,
        costBreakdown: {
          material: new Decimal(0),
          machine: new Decimal(0),
          energy: new Decimal(0),
          labor: new Decimal(0),
          overhead: new Decimal(0),
          margin: new Decimal(0),
        },
        sustainability: {
          score: 0,
          co2eKg: new Decimal(0),
          energyKwh: new Decimal(0),
          recycledPercent: 0,
          wastePercent: 0,
          co2e: {
            material: 0,
            energy: 0,
            logistics: 0,
            total: 0,
          },
        },
        confidence: 0,
        warnings: [
          `Calculation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  calculateBatch(inputs: PricingInput[]): PricingResult[] {
    return inputs.map((input) => {
      try {
        return this.calculate(input);
      } catch (error) {
        // Return error result for failed calculations
        return {
          unitPrice: new Decimal(0),
          totalPrice: new Decimal(0),
          leadDays: 0,
          costBreakdown: {
            material: new Decimal(0),
            machine: new Decimal(0),
            energy: new Decimal(0),
            labor: new Decimal(0),
            overhead: new Decimal(0),
            margin: new Decimal(0),
          },
          sustainability: {
            score: 0,
            co2eKg: new Decimal(0),
            energyKwh: new Decimal(0),
            recycledPercent: 0,
            wastePercent: 0,
            co2e: {
              material: 0,
              energy: 0,
              logistics: 0,
              total: 0,
            },
          },
          confidence: 0,
          warnings: ['Validation failed'],
        };
      }
    });
  }

  async calculateAsync(input: PricingInput): Promise<PricingResult> {
    return new Promise((resolve, reject) => {
      try {
        // For invalid input, throw error to maintain async error handling
        const errors = this.validateInput(input);
        if (
          errors.length > 0 &&
          !input.process &&
          !input.geometry &&
          !input.material &&
          !input.machine
        ) {
          reject(new Error('Invalid input'));
          return;
        }

        const result = this.calculate(input);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  async calculateBatchAsync(
    inputs: PricingInput[],
    options: { concurrency: number } = { concurrency: 5 },
  ): Promise<PricingResult[]> {
    const results: PricingResult[] = [];

    for (let i = 0; i < inputs.length; i += options.concurrency) {
      const batch = inputs.slice(i, i + options.concurrency);
      const batchResults = await Promise.all(batch.map((input) => this.calculateAsync(input)));
      results.push(...batchResults);
    }

    return results;
  }

  getSupportedProcesses(): ProcessType[] {
    return Object.keys(this.calculators) as ProcessType[];
  }

  validateInput(input: PricingInput): string[] {
    const errors: string[] = [];

    if (!input.process) {
      errors.push('Process type is required');
    } else if (!this.calculators[input.process as string]) {
      errors.push(`Unsupported process type: ${input.process}`);
    }

    if (!input.geometry) {
      errors.push('Geometry metrics are required');
    } else {
      if (!input.geometry.volumeCm3 || input.geometry.volumeCm3 <= 0) {
        errors.push('Volume must be positive');
      }
      if (!input.geometry.surfaceAreaCm2 || input.geometry.surfaceAreaCm2 <= 0) {
        errors.push('Surface area must be positive');
      }
    }

    if (!input.material) {
      errors.push('Material is required');
    }

    if (!input.machine) {
      errors.push('Machine is required');
    }

    if (!input.quantity || input.quantity <= 0) {
      errors.push('Quantity must be positive');
    }

    if (!input.tenantConfig) {
      errors.push('Tenant configuration is required');
    }

    return errors;
  }
}
