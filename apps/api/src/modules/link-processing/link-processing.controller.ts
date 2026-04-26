import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LinkProcessingService } from './link-processing.service';
import { AnalyzeLinkDto, LinkAnalysisResponseDto } from './dto/analyze-link.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../../types/auth-request';
import {
  ValidationErrorResponseDto,
  NotFoundResponseDto,
  UnauthorizedResponseDto,
} from '../../common/dto/api-response.dto';

@ApiTags('link-processing')
@Controller('links')
@ApiHeader({
  name: 'X-Tenant-ID',
  description: 'Tenant identifier for multi-tenant operations',
  required: false,
})
export class LinkProcessingController {
  constructor(private readonly linkProcessingService: LinkProcessingService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Analyze project link for BOM and quotes',
    description:
      'Starts analysis of a maker project URL to extract BOM and generate personalized quotes',
  })
  @ApiResponse({
    status: 202,
    description: 'Analysis started successfully',
    type: LinkAnalysisResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid URL or unsupported source',
    type: ValidationErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing JWT token',
    type: UnauthorizedResponseDto,
  })
  async analyzeLink(
    @Request() req: AuthenticatedRequest,
    @Body() analyzeLinkDto: AnalyzeLinkDto,
  ): Promise<LinkAnalysisResponseDto> {
    return this.linkProcessingService.startAnalysis(req.user.tenantId, req.user.id, analyzeLinkDto);
  }

  @Post('analyze/guest')
  @HttpCode(HttpStatus.ACCEPTED)
  @Public()
  @ApiOperation({
    summary: 'Analyze project link as guest user',
    description: 'Allows guest users to analyze project links with limited features',
  })
  @ApiResponse({
    status: 202,
    description: 'Guest analysis started successfully',
    type: LinkAnalysisResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid URL or unsupported source',
    type: ValidationErrorResponseDto,
  })
  async analyzeAsGuest(@Body() analyzeLinkDto: AnalyzeLinkDto): Promise<LinkAnalysisResponseDto> {
    // For guest users, we'll use a default tenant or guest context
    return this.linkProcessingService.startAnalysis('guest', 'guest-user', analyzeLinkDto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get link analysis status',
    description: 'Retrieve the current status and results of a link analysis',
  })
  @ApiParam({
    name: 'id',
    description: 'Link analysis ID',
    example: 'link_123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Analysis status and results',
    type: LinkAnalysisResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Analysis not found',
    type: NotFoundResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or missing JWT token',
    type: UnauthorizedResponseDto,
  })
  async getAnalysis(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<LinkAnalysisResponseDto> {
    return this.linkProcessingService.getAnalysis(req.user.tenantId, id);
  }

  @Get(':id/guest')
  @Public()
  @ApiOperation({
    summary: 'Get guest link analysis status',
    description: 'Retrieve guest analysis status (no authentication required)',
  })
  @ApiParam({
    name: 'id',
    description: 'Link analysis ID',
    example: 'link_123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Guest analysis status and results',
    type: LinkAnalysisResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Analysis not found',
    type: NotFoundResponseDto,
  })
  async getGuestAnalysis(@Param('id') id: string): Promise<LinkAnalysisResponseDto> {
    return this.linkProcessingService.getAnalysis('guest', id);
  }

  @Post(':id/convert-to-quote')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Convert link analysis to formal quote',
    description: 'Convert a completed link analysis into a formal quote with selected items',
  })
  @ApiParam({
    name: 'id',
    description: 'Link analysis ID',
  })
  @ApiResponse({
    status: 201,
    description: 'Quote created successfully',
    schema: {
      properties: {
        quoteId: { type: 'string', example: 'quote_123456' },
        message: { type: 'string', example: 'Quote created from link analysis' },
      },
    },
  })
  async convertToQuote(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { selectedItems?: string[]; persona?: string },
  ): Promise<{ quoteId: string; message: string }> {
    return this.linkProcessingService.convertToQuote(
      req.user.tenantId,
      req.user.id,
      id,
      body.selectedItems,
      body.persona,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List user link analyses',
    description: 'Get a list of all link analyses for the current user',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by analysis status',
    example: 'completed',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number for pagination',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'List of link analyses',
    schema: {
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/LinkAnalysisResponseDto' },
        },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  })
  async listAnalyses(
    @Request() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<{
    data: LinkAnalysisResponseDto[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    return this.linkProcessingService.listAnalyses(req.user.tenantId, req.user.id, {
      status,
      page: page || 1,
      limit: limit || 20,
    });
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Retry failed analysis',
    description: 'Restart analysis for a failed link processing job',
  })
  @ApiParam({
    name: 'id',
    description: 'Link analysis ID to retry',
  })
  @ApiResponse({
    status: 202,
    description: 'Analysis retry initiated',
    type: LinkAnalysisResponseDto,
  })
  async retryAnalysis(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<LinkAnalysisResponseDto> {
    return this.linkProcessingService.retryAnalysis(req.user.tenantId, id);
  }
}
