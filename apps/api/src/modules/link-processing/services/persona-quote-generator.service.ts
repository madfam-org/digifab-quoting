import { Injectable, Logger } from '@nestjs/common';
import { UserPersona, ProcessType } from '@cotiza/shared';
import { BOMItemDto, QuoteRecommendationDto, PersonaQuoteDto } from '../dto/analyze-link.dto';
import { ParsedBOM } from './bom-parser.service';

interface PersonaRules {
  priorities: string[];
  manufacturing_preferences: ProcessType[];
  budget_sensitivity: 'low' | 'medium' | 'high';
  time_flexibility: 'low' | 'medium' | 'high';
  quality_requirements: 'prototype' | 'production' | 'premium';
  recommendations: {
    suggest_alternatives: boolean;
    include_diy_options: boolean;
    show_cost_breakdowns: boolean;
    educational_content: boolean;
    bulk_discounts?: boolean;
    quality_certifications?: boolean;
    lead_time_guarantees?: boolean;
    technical_support?: boolean;
  };
}

@Injectable()
export class PersonaQuoteGeneratorService {
  private readonly logger = new Logger(PersonaQuoteGeneratorService.name);

  constructor() {}

  async generatePersonaQuotes(
    tenantId: string,
    parsedBOM: ParsedBOM,
    requestedPersona?: UserPersona,
    preferences?: any,
  ): Promise<PersonaQuoteDto[]> {
    this.logger.log(`Generating persona-based quotes for ${parsedBOM.items.length} items`);

    const personasToGenerate = requestedPersona
      ? [requestedPersona]
      : [
          UserPersona.DIY_MAKER,
          UserPersona.PROFESSIONAL_SHOP,
          UserPersona.EDUCATOR,
          UserPersona.PRODUCT_DESIGNER,
          UserPersona.PROCUREMENT_SPECIALIST,
        ];

    const quotes: PersonaQuoteDto[] = [];

    for (const persona of personasToGenerate) {
      try {
        const quote = await this.generateQuoteForPersona(tenantId, parsedBOM, persona, preferences);
        quotes.push(quote);
      } catch (error) {
        this.logger.error(`Failed to generate quote for persona ${persona}:`, error);
      }
    }

    return quotes;
  }

  private async generateQuoteForPersona(
    tenantId: string,
    parsedBOM: ParsedBOM,
    persona: UserPersona,
    preferences?: any,
  ): Promise<PersonaQuoteDto> {
    const rules = this.getPersonaRules(persona);

    // Filter and prioritize items based on persona preferences
    const relevantItems = this.filterItemsForPersona(parsedBOM.items, rules);

    // Generate recommendations for each item
    const recommendations: QuoteRecommendationDto[] = [];
    const alternatives: QuoteRecommendationDto[] = [];

    for (const item of relevantItems) {
      try {
        const recommendation = await this.generateItemRecommendation(tenantId, item, rules);
        recommendations.push(recommendation);

        // Generate alternatives if persona wants them
        if (rules.recommendations.suggest_alternatives) {
          const alternativeRecs = await this.generateAlternatives(tenantId, item, rules);
          alternatives.push(...alternativeRecs);
        }
      } catch (error) {
        this.logger.error(`Failed to generate recommendation for item ${item.name}:`, error);
      }
    }

    // Calculate totals and lead times
    const totalCost = recommendations.reduce((sum, rec) => sum + rec.costBreakdown.total, 0);
    const leadTime = this.calculateLeadTime(recommendations, rules);

    // Generate persona-specific customizations
    const customizations = this.generatePersonaCustomizations(rules, preferences);

    return {
      persona,
      recommendations,
      alternatives,
      totalCost,
      leadTime,
      customizations,
    };
  }

  private getPersonaRules(persona: UserPersona): PersonaRules {
    const rules: Record<UserPersona, PersonaRules> = {
      [UserPersona.DIY_MAKER]: {
        priorities: ['cost', 'learning', 'customization'],
        manufacturing_preferences: [ProcessType.PRINTING_3D_FFF, ProcessType.LASER_CUTTING],
        budget_sensitivity: 'high',
        time_flexibility: 'high',
        quality_requirements: 'prototype',
        recommendations: {
          suggest_alternatives: true,
          include_diy_options: true,
          show_cost_breakdowns: true,
          educational_content: true,
        },
      },

      [UserPersona.PROFESSIONAL_SHOP]: {
        priorities: ['quality', 'speed', 'reliability'],
        manufacturing_preferences: [
          ProcessType.CNC_MILLING_3AXIS,
          ProcessType.PRINTING_3D_SLA,
          ProcessType.LASER_CUTTING,
        ],
        budget_sensitivity: 'medium',
        time_flexibility: 'low',
        quality_requirements: 'production',
        recommendations: {
          suggest_alternatives: true,
          include_diy_options: false,
          show_cost_breakdowns: true,
          educational_content: false,
          bulk_discounts: true,
          quality_certifications: true,
          lead_time_guarantees: true,
          technical_support: true,
        },
      },

      [UserPersona.EDUCATOR]: {
        priorities: ['educational_value', 'safety', 'cost'],
        manufacturing_preferences: [ProcessType.PRINTING_3D_FFF, ProcessType.LASER_CUTTING],
        budget_sensitivity: 'high',
        time_flexibility: 'medium',
        quality_requirements: 'prototype',
        recommendations: {
          suggest_alternatives: true,
          include_diy_options: true,
          show_cost_breakdowns: true,
          educational_content: true,
          bulk_discounts: true,
        },
      },

      [UserPersona.PRODUCT_DESIGNER]: {
        priorities: ['quality', 'aesthetics', 'functionality'],
        manufacturing_preferences: [
          ProcessType.PRINTING_3D_SLA,
          ProcessType.CNC_MILLING_3AXIS,
          ProcessType.PRINTING_3D_FFF,
        ],
        budget_sensitivity: 'medium',
        time_flexibility: 'medium',
        quality_requirements: 'production',
        recommendations: {
          suggest_alternatives: true,
          include_diy_options: false,
          show_cost_breakdowns: true,
          educational_content: false,
          quality_certifications: true,
        },
      },

      [UserPersona.PROCUREMENT_SPECIALIST]: {
        priorities: ['cost', 'supplier_reliability', 'scalability'],
        manufacturing_preferences: [
          ProcessType.CNC_MILLING_3AXIS,
          ProcessType.PRINTING_3D_SLA,
          ProcessType.LASER_CUTTING,
        ],
        budget_sensitivity: 'high',
        time_flexibility: 'medium',
        quality_requirements: 'production',
        recommendations: {
          suggest_alternatives: true,
          include_diy_options: false,
          show_cost_breakdowns: true,
          educational_content: false,
          bulk_discounts: true,
          quality_certifications: true,
          lead_time_guarantees: true,
          technical_support: true,
        },
      },
    };

    return rules[persona];
  }

  private filterItemsForPersona(items: BOMItemDto[], rules: PersonaRules): BOMItemDto[] {
    return items.filter((item) => {
      // Filter out items that don't match persona preferences
      if (
        item.manufacturingMethod &&
        !rules.manufacturing_preferences.includes(item.manufacturingMethod)
      ) {
        // For professional personas, skip DIY-only items
        if (rules.recommendations.include_diy_options === false && item.category === 'diy_tool') {
          return false;
        }
      }

      // Filter by safety requirements for educators
      if (rules.priorities.includes('safety')) {
        const unsafeKeywords = ['sharp', 'dangerous', 'toxic', 'high voltage'];
        if (
          unsafeKeywords.some(
            (keyword) =>
              item.name.toLowerCase().includes(keyword) ||
              (item.specifications?.notes &&
                item.specifications.notes.toLowerCase().includes(keyword)),
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }

  private async generateItemRecommendation(
    tenantId: string,
    item: BOMItemDto,
    rules: PersonaRules,
  ): Promise<QuoteRecommendationDto> {
    let recommendedService = item.manufacturingMethod;
    let material = item.material;
    let confidence = 0.8;

    // If no manufacturing method specified, suggest based on persona
    if (!recommendedService) {
      if (item.category === 'electronics' || item.category === 'hardware') {
        // Standard component - no manufacturing needed
        return this.createPurchaseRecommendation(item, rules);
      }

      // Suggest manufacturing method based on persona preferences
      recommendedService = this.suggestManufacturingMethod(item, rules);
      confidence = 0.6;
    }

    // Optimize material choice for persona
    if (!material && recommendedService) {
      material = this.suggestMaterial(recommendedService, rules);
    }

    // Get pricing estimate
    const costBreakdown = await this.estimateManufacturingCost(
      tenantId,
      recommendedService,
      material,
      item,
      rules,
    );

    // Generate reason code
    const reasonCode = this.generateReasonCode(recommendedService, rules, item);

    return {
      component: item,
      recommendedService,
      costBreakdown,
      confidence,
      reasonCode,
    };
  }

  private createPurchaseRecommendation(
    item: BOMItemDto,
    rules: PersonaRules,
  ): QuoteRecommendationDto {
    const unitCost = item.unitCost || this.estimateComponentCost(item, rules);
    const total = unitCost * item.quantity;

    return {
      component: item,
      recommendedService: undefined, // Indicates purchase
      costBreakdown: {
        material: 0,
        manufacturing: 0,
        margin: total * 0.1, // 10% margin
        total: total * 1.1,
      },
      confidence: 0.9,
      reasonCode: 'standard_component',
    };
  }

  private suggestManufacturingMethod(item: BOMItemDto, rules: PersonaRules): ProcessType {
    const itemName = item.name.toLowerCase();

    // Suggest based on item characteristics and persona preferences
    if (
      itemName.includes('bracket') ||
      itemName.includes('mount') ||
      itemName.includes('housing')
    ) {
      if (
        rules.quality_requirements === 'production' &&
        rules.manufacturing_preferences.includes(ProcessType.CNC_MILLING_3AXIS)
      ) {
        return ProcessType.CNC_MILLING_3AXIS;
      }
      return ProcessType.PRINTING_3D_FFF;
    }

    if (itemName.includes('panel') || itemName.includes('plate') || itemName.includes('flat')) {
      return ProcessType.LASER_CUTTING;
    }

    // Default to first preference
    return rules.manufacturing_preferences[0] || ProcessType.PRINTING_3D_FFF;
  }

  private suggestMaterial(process: ProcessType, rules: PersonaRules): string {
    switch (process) {
      case ProcessType.PRINTING_3D_FFF:
        if (rules.quality_requirements === 'production') {
          return 'PETG';
        }
        return 'PLA';

      case ProcessType.PRINTING_3D_SLA:
        if (rules.priorities.includes('aesthetics')) {
          return 'Clear Resin';
        }
        return 'Standard Resin';

      case ProcessType.CNC_MILLING_3AXIS:
        if (rules.quality_requirements === 'production') {
          return 'Aluminum 6061';
        }
        return 'Aluminum 6061';

      case ProcessType.LASER_CUTTING:
        if (rules.priorities.includes('aesthetics')) {
          return 'Acrylic Clear 3mm';
        }
        return 'Plywood 3mm';

      default:
        return 'PLA';
    }
  }

  private async estimateManufacturingCost(
    _tenantId: string,
    process: ProcessType,
    material: string,
    item: BOMItemDto,
    rules: PersonaRules,
  ): Promise<{ material: number; manufacturing: number; margin: number; total: number }> {
    try {
      // Use actual pricing service if available
      // For now, we'll use simplified estimation
      const baseManufacturingCost = this.getBaseManufacturingCost(process);
      const materialCost = this.getMaterialCost(material, process);

      const subtotal = (baseManufacturingCost + materialCost) * item.quantity;

      // Apply persona-specific margin
      const marginRate = this.getMarginRate(rules);
      const margin = subtotal * marginRate;

      return {
        material: materialCost * item.quantity,
        manufacturing: baseManufacturingCost * item.quantity,
        margin,
        total: subtotal + margin,
      };
    } catch (error) {
      this.logger.error(`Failed to estimate cost for ${process}:`, error);
      // Fallback to basic estimation
      return {
        material: 5,
        manufacturing: 10,
        margin: 2,
        total: 17 * item.quantity,
      };
    }
  }

  private getBaseManufacturingCost(process: ProcessType): number {
    const costs = {
      [ProcessType.PRINTING_3D_FFF]: 8,
      [ProcessType.PRINTING_3D_SLA]: 15,
      [ProcessType.CNC_MILLING_3AXIS]: 25,
      [ProcessType.LASER_CUTTING]: 12,
    };

    return costs[process] || 10;
  }

  private getMaterialCost(material: string, _process: ProcessType): number {
    const materialCosts = {
      PLA: 3,
      PETG: 4,
      ABS: 3.5,
      'Standard Resin': 8,
      'Clear Resin': 12,
      'Aluminum 6061': 15,
      'Acrylic Clear 3mm': 5,
      'Plywood 3mm': 2,
    };

    return materialCosts[material] || 5;
  }

  private getMarginRate(rules: PersonaRules): number {
    // Different margins for different personas
    if (rules.budget_sensitivity === 'high') {
      return 0.15; // 15% margin for price-sensitive customers
    }
    if (rules.quality_requirements === 'premium') {
      return 0.35; // 35% margin for premium quality
    }
    return 0.25; // 25% standard margin
  }

  private estimateComponentCost(item: BOMItemDto, rules: PersonaRules): number {
    const baseCosts = {
      electronics: 15,
      hardware: 2,
      wiring: 5,
      component: 10,
    };

    let cost = baseCosts[item.category] || 10;

    // Adjust for persona preferences
    if (rules.quality_requirements === 'production') {
      cost *= 1.5; // Higher quality components cost more
    }

    return cost;
  }

  private generateReasonCode(process: ProcessType, rules: PersonaRules, _item: BOMItemDto): string {
    if (!process) return 'standard_purchase';

    if (rules.priorities[0] === 'cost') {
      return 'cost_optimized';
    }
    if (rules.priorities[0] === 'quality') {
      return 'quality_optimized';
    }
    if (rules.priorities[0] === 'speed') {
      return 'time_optimized';
    }

    return 'persona_matched';
  }

  private async generateAlternatives(
    tenantId: string,
    item: BOMItemDto,
    rules: PersonaRules,
  ): Promise<QuoteRecommendationDto[]> {
    const alternatives: QuoteRecommendationDto[] = [];

    // Generate alternative manufacturing methods
    const alternativeMethods = rules.manufacturing_preferences.filter(
      (method) => method !== item.manufacturingMethod,
    );

    for (const method of alternativeMethods.slice(0, 2)) {
      // Limit to 2 alternatives
      try {
        const altRecommendation = await this.generateItemRecommendation(
          tenantId,
          { ...item, manufacturingMethod: method },
          rules,
        );
        altRecommendation.reasonCode = 'alternative_method';
        alternatives.push(altRecommendation);
      } catch (error) {
        this.logger.error(`Failed to generate alternative for ${method}:`, error);
      }
    }

    return alternatives;
  }

  private calculateLeadTime(
    recommendations: QuoteRecommendationDto[],
    rules: PersonaRules,
  ): number {
    const baseTimes = {
      [ProcessType.PRINTING_3D_FFF]: 2,
      [ProcessType.PRINTING_3D_SLA]: 3,
      [ProcessType.CNC_MILLING_3AXIS]: 7,
      [ProcessType.LASER_CUTTING]: 1,
    };

    let maxLeadTime = 0;

    recommendations.forEach((rec) => {
      if (rec.recommendedService) {
        const baseTime = baseTimes[rec.recommendedService] || 3;

        // Add buffer time based on persona requirements
        let leadTime = baseTime;
        if (rules.quality_requirements === 'production') {
          leadTime += 2; // Extra time for quality checks
        }

        maxLeadTime = Math.max(maxLeadTime, leadTime);
      }
    });

    // Add shipping time
    return maxLeadTime + 2;
  }

  private generatePersonaCustomizations(
    rules: PersonaRules,
    _preferences?: any,
  ): Array<{
    type: string;
    description: string;
    value: any;
  }> {
    const customizations = [];

    if (rules.recommendations.bulk_discounts) {
      customizations.push({
        type: 'bulk_discount',
        description: 'Volume discounts available for orders over 10 units',
        value: { threshold: 10, discount: 0.15 },
      });
    }

    if (rules.recommendations.quality_certifications) {
      customizations.push({
        type: 'quality_certification',
        description: 'ISO 9001 quality certification available',
        value: { certification: 'ISO 9001', cost_addon: 50 },
      });
    }

    if (rules.recommendations.lead_time_guarantees) {
      customizations.push({
        type: 'lead_time_guarantee',
        description: 'Guaranteed delivery or 10% discount',
        value: { guarantee: true, penalty: 0.1 },
      });
    }

    if (rules.recommendations.educational_content) {
      customizations.push({
        type: 'educational_resources',
        description: 'Assembly guides and educational materials included',
        value: { included: true },
      });
    }

    return customizations;
  }
}
