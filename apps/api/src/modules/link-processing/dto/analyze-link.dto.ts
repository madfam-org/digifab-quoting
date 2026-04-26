import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUrl, IsOptional, IsEnum, IsObject, IsString } from 'class-validator';
import { UserPersona, ProcessType } from '@cotiza/shared';

export enum SourceType {
  INSTRUCTABLES = 'instructables',
  THINGIVERSE = 'thingiverse',
  GITHUB = 'github',
  HACKSTER = 'hackster',
  MAKE_MAGAZINE = 'make',
  CUSTOM_BLOG = 'blog',
  UNKNOWN = 'unknown',
}

export enum AnalysisStatus {
  PENDING = 'pending',
  FETCHING = 'fetching',
  PARSING = 'parsing',
  ANALYZING = 'analyzing',
  PRICING = 'pricing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class AnalyzeLinkDto {
  @ApiProperty({
    description: 'URL to analyze for BOM and project information',
    example: 'https://www.instructables.com/Arduino-Weather-Station/',
  })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({
    description: 'Target user persona for quote customization',
    enum: UserPersona,
    example: UserPersona.DIY_MAKER,
  })
  @IsOptional()
  @IsEnum(UserPersona)
  persona?: UserPersona;

  @ApiPropertyOptional({
    description: 'User preferences for quote optimization',
    example: {
      budget_range: 'low',
      time_priority: 'speed',
      quality_level: 'prototype',
    },
  })
  @IsOptional()
  @IsObject()
  preferences?: {
    budget_range?: 'low' | 'medium' | 'high';
    time_priority?: 'speed' | 'quality' | 'cost';
    quality_level?: 'prototype' | 'production' | 'premium';
  };
}

export class BOMItemDto {
  @ApiProperty({ description: 'Component name', example: 'Arduino Uno R3' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Quantity needed', example: 1 })
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit cost if available', example: 25.99 })
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Supplier/vendor', example: 'SparkFun' })
  supplier?: string;

  @ApiPropertyOptional({ description: 'Part number', example: 'DEV-11021' })
  partNumber?: string;

  @ApiProperty({ description: 'Component category', example: 'electronics' })
  category: string;

  @ApiPropertyOptional({
    description: 'Recommended manufacturing method',
    enum: ProcessType,
    example: ProcessType.PRINTING_3D_FFF,
  })
  manufacturingMethod?: ProcessType;

  @ApiPropertyOptional({ description: 'Material recommendation', example: 'PLA' })
  material?: string;

  @ApiPropertyOptional({ description: 'Component specifications' })
  specifications?: Record<string, any>;
}

export class ProjectContentDto {
  @ApiProperty({ description: 'Project title', example: 'Arduino Weather Station' })
  title: string;

  @ApiProperty({ description: 'Project description' })
  description: string;

  @ApiPropertyOptional({ description: 'Project images' })
  images?: string[];

  @ApiPropertyOptional({ description: 'Downloadable files (STL, CAD, etc.)' })
  files?: Array<{
    name: string;
    url: string;
    type: string;
    size?: number;
  }>;

  @ApiPropertyOptional({ description: 'Step-by-step instructions' })
  instructions?: Array<{
    step: number;
    title: string;
    description: string;
    images?: string[];
  }>;

  @ApiPropertyOptional({ description: 'Project tags' })
  tags?: string[];

  @ApiProperty({
    description: 'Project difficulty level',
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
  })
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';

  @ApiPropertyOptional({ description: 'Estimated build time in hours' })
  estimatedTime?: number;
}

export class QuoteRecommendationDto {
  @ApiProperty({ description: 'Component being quoted' })
  component: BOMItemDto;

  @ApiProperty({ description: 'Recommended service type', enum: ProcessType })
  recommendedService: ProcessType;

  @ApiProperty({ description: 'Cost breakdown' })
  costBreakdown: {
    material: number;
    manufacturing: number;
    margin: number;
    total: number;
  };

  @ApiProperty({ description: 'Recommendation confidence (0-1)' })
  confidence: number;

  @ApiProperty({ description: 'Reason for recommendation' })
  reasonCode: string;
}

export class PersonaQuoteDto {
  @ApiProperty({ description: 'Target persona', enum: UserPersona })
  persona: UserPersona;

  @ApiProperty({ description: 'Personalized recommendations' })
  recommendations: QuoteRecommendationDto[];

  @ApiProperty({ description: 'Alternative options' })
  alternatives: QuoteRecommendationDto[];

  @ApiProperty({ description: 'Total estimated cost' })
  totalCost: number;

  @ApiProperty({ description: 'Estimated lead time in days' })
  leadTime: number;

  @ApiProperty({ description: 'Persona-specific customizations' })
  customizations: Array<{
    type: string;
    description: string;
    value: any;
  }>;
}

export class LinkAnalysisResponseDto {
  @ApiProperty({ description: 'Analysis ID for tracking' })
  id: string;

  @ApiProperty({ description: 'Original URL analyzed' })
  url: string;

  @ApiProperty({ description: 'Source type detected', enum: SourceType })
  sourceType: SourceType;

  @ApiProperty({ description: 'Current analysis status', enum: AnalysisStatus })
  status: AnalysisStatus;

  @ApiProperty({ description: 'Progress percentage (0-100)' })
  progress: number;

  @ApiPropertyOptional({ description: 'Current processing stage message' })
  message?: string;

  @ApiPropertyOptional({ description: 'Estimated completion time' })
  estimatedCompletion?: Date;

  @ApiPropertyOptional({ description: 'Extracted project content' })
  project?: ProjectContentDto;

  @ApiPropertyOptional({ description: 'Bill of materials' })
  bom?: {
    totalItems: number;
    estimatedCost: number;
    categories: string[];
    items: BOMItemDto[];
  };

  @ApiPropertyOptional({ description: 'Generated quotes by persona' })
  quotes?: PersonaQuoteDto[];

  @ApiPropertyOptional({ description: 'Any errors encountered' })
  errors?: Array<{
    code: string;
    message: string;
    details?: any;
  }>;
}
