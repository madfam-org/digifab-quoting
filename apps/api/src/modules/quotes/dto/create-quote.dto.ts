import { IsEnum, IsObject, IsOptional, ValidateNested, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, QuoteType } from '@cotiza/shared';

export class QuoteObjectiveDto implements Record<string, number> {
  @ApiProperty({
    example: 0.5,
    minimum: 0,
    maximum: 1,
    description: 'Weight for cost optimization (0-1). Higher values prioritize lower cost.',
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  cost!: number;

  @ApiProperty({
    example: 0.3,
    minimum: 0,
    maximum: 1,
    description:
      'Weight for lead time optimization (0-1). Higher values prioritize faster delivery.',
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  lead!: number;

  @ApiProperty({
    example: 0.2,
    minimum: 0,
    maximum: 1,
    description: 'Weight for sustainability (0-1). Higher values prioritize eco-friendly options.',
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  green!: number;

  // Index signature to satisfy Prisma's InputJsonValue requirement
  [key: string]: number;
}

export class CreateQuoteDto {
  @ApiProperty({
    enum: ['MXN', 'USD'],
    default: 'MXN',
    description: 'Currency for the quote. Prices will be calculated in this currency.',
    example: 'MXN',
  })
  @IsEnum(['MXN', 'USD'])
  currency!: Currency;

  @ApiProperty({
    type: QuoteObjectiveDto,
    description: 'Optimization objectives for quote calculation. Weights must sum to 1.0.',
    example: {
      cost: 0.5,
      lead: 0.3,
      green: 0.2,
    },
  })
  @IsObject()
  @ValidateNested()
  @Type(() => QuoteObjectiveDto)
  objective!: QuoteObjectiveDto;

  @ApiPropertyOptional({
    description: 'Additional metadata for the quote',
    example: {
      projectName: 'Custom Parts Q1',
      department: 'Engineering',
      poNumber: 'PO-12345',
    },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    enum: QuoteType,
    default: QuoteType.FAB,
    description:
      'Quote mode. "fab" (default) runs the fabrication pricing engine. "services" skips it ' +
      'and uses line-item unitPrice directly. Services mode is gated by the tenant feature ' +
      'flag `servicesQuotes` — tenants without the flag receive a 400.',
    example: 'fab',
  })
  @IsOptional()
  @IsEnum(QuoteType)
  quoteType?: QuoteType;
}

export class QuoteResponseDto {
  @ApiProperty({
    description: 'Unique quote identifier',
    example: 'quote_123e4567-e89b-12d3-a456-426614174000',
  })
  id!: string;

  @ApiProperty({
    description: 'Quote number for reference',
    example: 'Q-2024-0001',
  })
  quoteNumber!: string;

  @ApiProperty({
    description: 'Quote status',
    enum: ['draft', 'calculating', 'ready', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'],
    example: 'draft',
  })
  status!: string;

  @ApiProperty({
    description: 'Quote currency',
    example: 'MXN',
  })
  currency!: string;

  @ApiProperty({
    description: 'Total quote amount',
    example: 1500.0,
  })
  totalAmount!: number;

  @ApiProperty({
    description: 'Quote creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Quote expiration date',
    example: '2024-01-15T00:00:00.000Z',
  })
  expiresAt!: Date;
}
