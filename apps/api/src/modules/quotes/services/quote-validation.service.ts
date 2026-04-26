import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Quote as PrismaQuote, QuoteItem as PrismaQuoteItem } from '@prisma/client';

export interface QuoteValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class QuoteValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validateQuoteForCalculation(
    tenantId: string,
    quote: PrismaQuote & { items: PrismaQuoteItem[] },
  ): Promise<QuoteValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check quote status
    if (quote.status === 'cancelled') {
      errors.push('Cannot calculate cancelled quote');
    }

    if (quote.status === 'expired') {
      warnings.push('Quote has expired - calculations may not reflect current pricing');
    }

    // Check items exist
    if (!quote.items || quote.items.length === 0) {
      errors.push('Quote must have at least one item');
    }

    // Validate each item
    for (const item of quote.items) {
      const itemErrors = await this.validateQuoteItem(tenantId, item);
      errors.push(...itemErrors);
    }

    // Check validity dates
    if (quote.validityUntil && quote.validityUntil < new Date()) {
      warnings.push('Quote validity period has expired');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async validateQuoteForApproval(
    tenantId: string,
    quote: PrismaQuote & { items: PrismaQuoteItem[] },
  ): Promise<QuoteValidationResult> {
    const result = await this.validateQuoteForCalculation(tenantId, quote);

    // Additional approval-specific validations
    if (quote.status !== 'calculated') {
      result.errors.push('Quote must be calculated before approval');
    }

    if (!quote.total || Number(quote.total) <= 0) {
      result.errors.push('Quote total must be greater than zero');
    }

    // Check minimum order value
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const minOrderValue = (tenant?.settings as any)?.minOrderValue || 0;
    if (quote.total && quote.total < minOrderValue) {
      result.errors.push(`Quote total must be at least ${minOrderValue}`);
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  private async validateQuoteItem(tenantId: string, item: PrismaQuoteItem): Promise<string[]> {
    const errors: string[] = [];

    if (item.quantity <= 0) {
      errors.push(`Item ${item.name}: Quantity must be greater than zero`);
    }

    if (!item.process || !item.material) {
      errors.push(`Item ${item.name}: Process and material are required`);
    }

    // Validate material exists and is active
    if (item.materialId) {
      const material = await this.prisma.material.findFirst({
        where: { id: item.materialId, tenantId, active: true },
      });

      if (!material) {
        errors.push(`Item ${item.name}: Selected material is not available`);
      }
    }

    return errors;
  }

  async validateQuoteOwnership(
    tenantId: string,
    quoteId: string,
    userId?: string,
  ): Promise<boolean> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: { tenantId: true, customerId: true, origin: true },
    });

    if (!quote) {
      return false;
    }

    // Check tenant ownership
    if (quote.tenantId !== tenantId) {
      return false;
    }

    // If userId provided, check user ownership (for customer access)
    if (userId && quote.customerId !== userId) {
      return false;
    }

    return true;
  }
}
