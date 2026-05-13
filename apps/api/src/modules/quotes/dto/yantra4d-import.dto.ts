import {
  IsString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Nested sub-DTOs
// ---------------------------------------------------------------------------

export class Yantra4dProjectDto {
  @ApiProperty({
    description: 'Yantra4D project slug',
    example: 'rugged-box',
  })
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @ApiProperty({
    description: 'Human-readable project name',
    example: 'Rugged Box',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'Parametric rugged storage box with configurable dimensions',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class BoundingBoxDto {
  @ApiProperty({ description: 'X dimension in mm', example: 120.5 })
  @IsNumber()
  @Min(0)
  x!: number;

  @ApiProperty({ description: 'Y dimension in mm', example: 80.3 })
  @IsNumber()
  @Min(0)
  y!: number;

  @ApiProperty({ description: 'Z dimension in mm', example: 45.0 })
  @IsNumber()
  @Min(0)
  z!: number;
}

export class Yantra4dGeometryDto {
  @ApiProperty({
    description: 'Part volume in cubic centimeters',
    example: 42.75,
  })
  @IsNumber()
  @Min(0)
  volume_cm3!: number;

  @ApiProperty({
    description: 'Part surface area in square centimeters',
    example: 185.2,
  })
  @IsNumber()
  @Min(0)
  surface_area_cm2!: number;

  @ApiProperty({
    description: 'Bounding box dimensions in millimeters',
    type: BoundingBoxDto,
  })
  @ValidateNested()
  @Type(() => BoundingBoxDto)
  bounding_box_mm!: BoundingBoxDto;
}

export class Yantra4dItemDto {
  @ApiProperty({
    description: 'Part/item display name',
    example: 'Rugged Box',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    enum: ['3d_fff', '3d_sla', 'cnc_3axis', 'laser_2d'],
    description: 'Manufacturing process type',
    example: '3d_fff',
  })
  @IsEnum(['3d_fff', '3d_sla', 'cnc_3axis', 'laser_2d'])
  process!: string;

  @ApiProperty({
    description: 'Material name',
    example: 'PLA',
  })
  @IsString()
  @IsNotEmpty()
  material!: string;

  @ApiProperty({
    description: 'Number of units to manufacture',
    example: 5,
    minimum: 1,
    maximum: 10000,
  })
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Surface finish',
    example: 'standard',
  })
  @IsOptional()
  @IsString()
  finish?: string;

  @ApiPropertyOptional({
    description: 'Additional process-specific options',
    example: { material: 'PLA', finish: 'standard', infill: 20 },
  })
  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Top-level import DTO
// ---------------------------------------------------------------------------

export class Yantra4dImportDto {
  @ApiProperty({
    description: 'Source system identifier',
    example: 'yantra4d',
    enum: ['yantra4d'],
  })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty({
    description: 'Yantra4D project information',
    type: Yantra4dProjectDto,
  })
  @ValidateNested()
  @Type(() => Yantra4dProjectDto)
  project!: Yantra4dProjectDto;

  @ApiProperty({
    description: 'Geometry metrics extracted from the rendered mesh',
    type: Yantra4dGeometryDto,
  })
  @ValidateNested()
  @Type(() => Yantra4dGeometryDto)
  geometry!: Yantra4dGeometryDto;

  @ApiProperty({
    description: 'Item/part to quote',
    type: Yantra4dItemDto,
  })
  @ValidateNested()
  @Type(() => Yantra4dItemDto)
  item!: Yantra4dItemDto;

  @ApiPropertyOptional({
    description: 'Quote currency',
    enum: ['MXN', 'USD'],
    default: 'MXN',
    example: 'MXN',
  })
  @IsOptional()
  @IsEnum(['MXN', 'USD'])
  currency?: string;

  @ApiPropertyOptional({
    description: 'Free-text notes from the requester',
    example: 'Need these parts by end of month',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Requester intent: quote must expose whether ForgeSight market verification succeeded.',
    default: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  require_market_verified?: boolean;
}

// ---------------------------------------------------------------------------
// Response DTO
// ---------------------------------------------------------------------------

export class MarketContextDto {
  @ApiProperty({
    description: 'Pricing or market provenance source',
    example: 'internal_pricing',
  })
  source!: string;

  @ApiProperty({
    description: 'Number of ForgeSight market samples used for verification',
    example: 0,
  })
  sample_count!: number;

  @ApiProperty({
    description: 'ForgeSight market data update timestamp, or null when unavailable',
    example: null,
    nullable: true,
  })
  updated_at!: string | null;

  @ApiProperty({
    description: 'ForgeSight market confidence, or 0 when unverified/internal',
    example: 0,
  })
  confidence!: number;

  @ApiProperty({
    description: 'Reason market verification fell back to internal pricing',
    example: 'forgesight_not_configured',
    nullable: true,
  })
  fallback_reason!: string | null;

  @ApiProperty({
    description: 'True only when ForgeSight returned verified market data with samples',
    example: false,
  })
  market_verified!: boolean;
}

export class Yantra4dImportResponseDto {
  @ApiProperty({
    description: 'Created quote ID',
    example: 'quote_abc123',
  })
  quoteId!: string;

  @ApiProperty({
    description: 'Quote number for reference',
    example: 'Q-2026-04-0001',
  })
  quoteNumber!: string;

  @ApiProperty({
    description: 'Quote status after creation',
    example: 'auto_quoted',
  })
  status!: string;

  @ApiProperty({
    description: 'Estimated total price',
    example: 450.0,
  })
  totalPrice!: number;

  @ApiProperty({
    description: 'Quote currency',
    example: 'MXN',
  })
  currency!: string;

  @ApiProperty({
    description: 'Number of items in the quote',
    example: 1,
  })
  itemCount!: number;

  @ApiPropertyOptional({
    description: 'Pricing breakdown per item',
  })
  items?: Array<{
    name: string;
    process: string;
    material: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    leadDays: number;
  }>;

  @ApiPropertyOptional({
    description: 'Validation warnings (non-blocking)',
  })
  warnings?: string[];

  @ApiPropertyOptional({
    description: 'Market/pricing provenance for the quote',
    type: MarketContextDto,
  })
  market_context?: MarketContextDto;
}
