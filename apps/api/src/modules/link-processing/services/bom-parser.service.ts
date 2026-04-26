import { Injectable, Logger } from '@nestjs/common';
import { ProcessType } from '@cotiza/shared';
import { BOMItemDto } from '../dto/analyze-link.dto';
import { RawContent } from './content-fetcher.service';

export interface ParsedBOM {
  items: BOMItemDto[];
  totalEstimatedCost: number;
  categories: string[];
  confidence: number;
}

@Injectable()
export class BOMParserService {
  private readonly logger = new Logger(BOMParserService.name);

  async parseBOM(content: RawContent): Promise<ParsedBOM> {
    this.logger.log(`Parsing BOM for ${content.sourceType} content`);

    let bomItems: BOMItemDto[] = [];

    // Try different parsing strategies based on source type
    switch (content.sourceType) {
      case 'instructables':
        bomItems = this.parseInstructablesBOM(content);
        break;
      case 'thingiverse':
        bomItems = this.parseThingiverseBOM(content);
        break;
      case 'github':
        bomItems = this.parseGitHubBOM(content);
        break;
      case 'hackster':
        bomItems = this.parseHacksterBOM(content);
        break;
      default:
        bomItems = this.parseGenericBOM(content);
    }

    // Normalize and enrich the BOM items
    const normalizedItems = await this.normalizeItems(bomItems);

    // Calculate statistics
    const totalEstimatedCost = this.calculateTotalCost(normalizedItems);
    const categories = this.extractCategories(normalizedItems);
    const confidence = this.calculateConfidence(normalizedItems, content);

    return {
      items: normalizedItems,
      totalEstimatedCost,
      categories,
      confidence,
    };
  }

  private parseInstructablesBOM(content: RawContent): BOMItemDto[] {
    const items: BOMItemDto[] = [];
    const supplies = content.metadata.supplies || [];
    const tools = content.metadata.tools || [];

    // Parse supplies (main BOM items)
    supplies.forEach((supply: any) => {
      const item = this.createBOMItem(supply.name, parseInt(supply.quantity) || 1, 'component');

      // Try to extract additional info from notes
      if (supply.notes) {
        const costMatch = supply.notes.match(/\$(\d+(?:\.\d{2})?)/);
        if (costMatch) {
          item.unitCost = parseFloat(costMatch[1]);
        }
      }

      items.push(item);
    });

    // Parse tools (might need fabrication)
    tools.forEach((tool: string) => {
      if (this.isCustomTool(tool)) {
        items.push(this.createBOMItem(tool, 1, 'tool'));
      }
    });

    // Parse from HTML content for additional items
    const additionalItems = this.parseHTMLForBOM(content.rawHtml);
    items.push(...additionalItems);

    return items;
  }

  private parseThingiverseBOM(content: RawContent): BOMItemDto[] {
    const items: BOMItemDto[] = [];

    // Add 3D printed parts based on files
    const files = content.metadata.files || [];
    files.forEach((file: any) => {
      if (this.is3DFile(file.name)) {
        items.push(
          this.createBOMItem(
            `3D Printed: ${file.name.replace(/\.(stl|obj|ply|3mf)$/i, '')}`,
            1,
            '3d_printed',
            ProcessType.PRINTING_3D_FFF,
          ),
        );
      }
    });

    // Parse description for hardware requirements
    const hardwareItems = this.parseTextForHardware(content.description);
    items.push(...hardwareItems);

    // Parse from HTML for additional components
    const additionalItems = this.parseHTMLForBOM(content.rawHtml);
    items.push(...additionalItems);

    return items;
  }

  private parseGitHubBOM(content: RawContent): BOMItemDto[] {
    const items: BOMItemDto[] = [];

    // If no dedicated BOM files, parse README
    const readmeText = content.metadata.readme || content.description;
    const bomItems = this.parseTextForComponents(readmeText);
    items.push(...bomItems);

    // Look for 3D files
    const files = content.metadata.files || [];
    files.forEach((file: any) => {
      if (this.is3DFile(file.name)) {
        items.push(
          this.createBOMItem(
            `3D Model: ${file.name}`,
            1,
            '3d_printed',
            ProcessType.PRINTING_3D_FFF,
          ),
        );
      }
    });

    return items;
  }

  private parseHacksterBOM(content: RawContent): BOMItemDto[] {
    const items: BOMItemDto[] = [];
    const components = content.metadata.components || [];

    components.forEach((component: any) => {
      items.push(
        this.createBOMItem(component.name, parseInt(component.quantity) || 1, 'electronics'),
      );
    });

    return items;
  }

  private parseGenericBOM(content: RawContent): BOMItemDto[] {
    const items: BOMItemDto[] = [];

    // Parse from description and HTML content
    const textItems = this.parseTextForComponents(content.description);
    const htmlItems = this.parseHTMLForBOM(content.rawHtml);

    items.push(...textItems, ...htmlItems);

    return items;
  }

  private parseHTMLForBOM(html: string): BOMItemDto[] {
    // This would need a proper HTML parser in production
    // For now, we'll do basic text extraction
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const bomItems = this.parseTextForComponents(text);

    return bomItems;
  }

  private parseTextForComponents(text: string): BOMItemDto[] {
    const items: BOMItemDto[] = [];

    // Common component patterns
    const patterns = [
      // Quantity + Component: "2x Arduino Uno", "1 Arduino Uno"
      /(\d+)x?\s+([A-Z][a-zA-Z0-9\s\-_]+(?:resistor|capacitor|arduino|sensor|motor|led|wire|cable|screw|bolt|nut))/gi,
      // Bullet points with components
      /[•\-*]\s*([A-Z][a-zA-Z0-9\s\-_]{5,}(?:resistor|capacitor|arduino|sensor|motor|led|wire|cable))/gi,
      // Shopping list format
      /(?:buy|need|required?):\s*([A-Z][a-zA-Z0-9\s\-_]{5,})/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const quantity = match[1] ? parseInt(match[1]) : 1;
        const name = (match[2] || match[1]).trim();

        if (name.length > 3 && !this.isCommonWord(name)) {
          items.push(this.createBOMItem(name, quantity, this.categorizeComponent(name)));
        }
      }
    });

    return this.deduplicateItems(items);
  }

  private parseTextForHardware(text: string): BOMItemDto[] {
    const items: BOMItemDto[] = [];

    // Hardware-specific patterns
    const hardwarePatterns = [
      /(\d+)x?\s*(M\d+\s*x\s*\d+(?:mm)?\s*(?:screw|bolt))/gi,
      /(\d+)x?\s*(M\d+\s*nut)/gi,
      /(\d+)x?\s*(\d+mm\s*(?:bearing|washer))/gi,
    ];

    hardwarePatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const quantity = match[1] ? parseInt(match[1]) : 1;
        const name = match[2].trim();

        items.push(this.createBOMItem(name, quantity, 'hardware'));
      }
    });

    return items;
  }

  private createBOMItem(
    name: string,
    quantity: number,
    category: string,
    manufacturingMethod?: ProcessType,
  ): BOMItemDto {
    return {
      name: this.cleanComponentName(name),
      quantity,
      category,
      manufacturingMethod: manufacturingMethod || this.suggestManufacturingMethod(name, category),
      specifications: this.extractSpecifications(name),
    };
  }

  private async normalizeItems(items: BOMItemDto[]): Promise<BOMItemDto[]> {
    return items.map((item) => {
      // Normalize component names
      item.name = this.normalizeComponentName(item.name);

      // Enhance with additional data
      item.material = this.suggestMaterial(item);
      item.unitCost = item.unitCost || this.estimateCost(item);

      // Add supplier suggestions
      item.supplier = this.suggestSupplier(item);

      return item;
    });
  }

  private normalizeComponentName(name: string): string {
    // Remove common prefixes/suffixes
    return name
      .replace(/^(buy|need|required?)\s*/i, '')
      .replace(/\s*(each|pcs?|pieces?)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanComponentName(name: string): string {
    return name
      .replace(/[^\w\s\-.]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private categorizeComponent(name: string): string {
    const nameLower = name.toLowerCase();

    if (
      nameLower.includes('arduino') ||
      nameLower.includes('raspberry') ||
      nameLower.includes('microcontroller')
    ) {
      return 'electronics';
    }
    if (
      nameLower.includes('resistor') ||
      nameLower.includes('capacitor') ||
      nameLower.includes('led')
    ) {
      return 'electronics';
    }
    if (nameLower.includes('sensor') || nameLower.includes('module')) {
      return 'electronics';
    }
    if (nameLower.includes('screw') || nameLower.includes('bolt') || nameLower.includes('nut')) {
      return 'hardware';
    }
    if (nameLower.includes('wire') || nameLower.includes('cable')) {
      return 'wiring';
    }
    if (nameLower.includes('3d print') || nameLower.includes('printed')) {
      return '3d_printed';
    }

    return 'component';
  }

  private suggestManufacturingMethod(name: string, category: string): ProcessType {
    const nameLower = name.toLowerCase();

    if (category === '3d_printed' || nameLower.includes('3d print') || nameLower.includes('.stl')) {
      return ProcessType.PRINTING_3D_FFF;
    }
    if (category === 'hardware' && (nameLower.includes('bracket') || nameLower.includes('mount'))) {
      return ProcessType.CNC_MILLING_3AXIS;
    }
    if (nameLower.includes('acrylic') || nameLower.includes('wood') || nameLower.includes('cut')) {
      return ProcessType.LASER_CUTTING;
    }

    // Default to purchasing for standard components
    return undefined;
  }

  private suggestMaterial(item: BOMItemDto): string {
    if (item.manufacturingMethod === ProcessType.PRINTING_3D_FFF) {
      // Suggest material based on application
      if (
        item.name.toLowerCase().includes('outdoor') ||
        item.name.toLowerCase().includes('strong')
      ) {
        return 'PETG';
      }
      return 'PLA';
    }

    if (item.manufacturingMethod === ProcessType.CNC_MILLING_3AXIS) {
      return 'Aluminum 6061';
    }

    if (item.manufacturingMethod === ProcessType.LASER_CUTTING) {
      return 'Acrylic 3mm';
    }

    return undefined;
  }

  private estimateCost(item: BOMItemDto): number {
    // Basic cost estimation based on category and manufacturing method
    if (!item.manufacturingMethod) {
      // Standard components - estimate based on category
      const costs = {
        electronics: 15,
        hardware: 2,
        wiring: 5,
        component: 10,
      };
      return costs[item.category] || 10;
    }

    // Manufacturing costs
    if (item.manufacturingMethod === ProcessType.PRINTING_3D_FFF) {
      return 8; // Base cost for 3D printed part
    }

    return 15; // Default manufacturing cost
  }

  private suggestSupplier(item: BOMItemDto): string {
    if (item.category === 'electronics') {
      return Math.random() > 0.5 ? 'SparkFun' : 'Adafruit';
    }
    if (item.category === 'hardware') {
      return 'McMaster-Carr';
    }
    return 'Amazon';
  }

  private extractSpecifications(name: string): Record<string, any> {
    const specs: Record<string, any> = {};

    // Extract common specifications
    const voltageMatch = name.match(/(\d+(?:\.\d+)?)\s*V/i);
    if (voltageMatch) {
      specs.voltage = `${voltageMatch[1]}V`;
    }

    const currentMatch = name.match(/(\d+(?:\.\d+)?)\s*mA/i);
    if (currentMatch) {
      specs.current = `${currentMatch[1]}mA`;
    }

    const resistanceMatch = name.match(/(\d+(?:\.\d+)?)\s*(?:ohm|Ω|k)/i);
    if (resistanceMatch) {
      specs.resistance = resistanceMatch[0];
    }

    const sizeMatch = name.match(/(\d+)x(\d+)(?:x(\d+))?\s*mm/i);
    if (sizeMatch) {
      specs.dimensions = {
        length: parseInt(sizeMatch[1]),
        width: parseInt(sizeMatch[2]),
        height: sizeMatch[3] ? parseInt(sizeMatch[3]) : undefined,
        unit: 'mm',
      };
    }

    return specs;
  }

  private isCustomTool(tool: string): boolean {
    const customToolKeywords = ['jig', 'fixture', 'custom', 'holder', 'bracket', 'mount'];
    return customToolKeywords.some((keyword) => tool.toLowerCase().includes(keyword));
  }

  private is3DFile(filename: string): boolean {
    const extensions = ['.stl', '.obj', '.ply', '.3mf', '.step', '.stp'];
    return extensions.some((ext) => filename.toLowerCase().endsWith(ext));
  }

  private isCommonWord(word: string): boolean {
    const commonWords = [
      'the',
      'and',
      'for',
      'you',
      'with',
      'this',
      'that',
      'have',
      'need',
      'make',
      'using',
    ];
    return commonWords.includes(word.toLowerCase()) || word.length < 3;
  }

  private deduplicateItems(items: BOMItemDto[]): BOMItemDto[] {
    const seen = new Map<string, BOMItemDto>();

    items.forEach((item) => {
      const key = item.name.toLowerCase().trim();
      if (seen.has(key)) {
        // Merge quantities
        seen.get(key)!.quantity += item.quantity;
      } else {
        seen.set(key, { ...item });
      }
    });

    return Array.from(seen.values());
  }

  private calculateTotalCost(items: BOMItemDto[]): number {
    return items.reduce((total, item) => {
      return total + (item.unitCost || 0) * item.quantity;
    }, 0);
  }

  private extractCategories(items: BOMItemDto[]): string[] {
    const categories = new Set<string>();
    items.forEach((item) => categories.add(item.category));
    return Array.from(categories);
  }

  private calculateConfidence(items: BOMItemDto[], content: RawContent): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence for structured sources
    if (['instructables', 'hackster'].includes(content.sourceType)) {
      confidence += 0.3;
    }

    // Higher confidence if we found many items
    if (items.length > 5) {
      confidence += 0.1;
    }

    // Higher confidence if items have cost information
    const itemsWithCosts = items.filter((item) => item.unitCost).length;
    confidence += (itemsWithCosts / items.length) * 0.2;

    return Math.min(confidence, 1.0);
  }
}
