import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Audit } from '../audit/audit.interceptor';
import { AuditAction, AuditEntity } from '../audit/audit.service';
import {
  ValidationErrorResponseDto,
  UnauthorizedResponseDto,
} from '../../common/dto/api-response.dto';
import { AuthenticatedRequest } from '../../types/auth-request';
import { Yantra4dImportDto, Yantra4dImportResponseDto } from './dto/yantra4d-import.dto';
import { Yantra4dImportService } from './services/yantra4d-import.service';

@ApiTags('quotes')
@Controller('quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Unauthorized - Invalid or missing JWT token',
  type: UnauthorizedResponseDto,
})
@ApiHeader({
  name: 'X-Tenant-ID',
  description: 'Tenant identifier for multi-tenant operations',
  required: false,
})
export class Yantra4dImportController {
  private readonly logger = new Logger(Yantra4dImportController.name);

  constructor(private readonly yantra4dImportService: Yantra4dImportService) {}

  @Post('from-yantra4d')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create quote from Yantra4D export',
    description:
      'Receives geometry and material parameters from Yantra4D, ' +
      'maps them to quote items, runs the pricing engine, and returns ' +
      'the created quote with pricing details.',
  })
  @ApiResponse({
    status: 201,
    description: 'Quote successfully created from Yantra4D data',
    type: Yantra4dImportResponseDto,
  })
  @ApiResponse({
    status: 424,
    description:
      'Market-verified ForgeSight pricing was required but unavailable; no client-ready quote was created',
  })
  @ApiBadRequestResponse({
    description: 'Invalid import payload or unsupported process/material',
    type: ValidationErrorResponseDto,
  })
  @Audit({
    entity: AuditEntity.QUOTE,
    action: AuditAction.CREATE,
    includeBody: true,
    includeResponse: true,
  })
  async importFromYantra4d(
    @Request() req: AuthenticatedRequest,
    @Body() dto: Yantra4dImportDto,
  ): Promise<Yantra4dImportResponseDto> {
    // Validate source marker
    if (dto.source !== 'yantra4d') {
      throw new BadRequestException(`Invalid source: expected "yantra4d", got "${dto.source}"`);
    }

    this.logger.log(
      `Importing quote from Yantra4D: project=${dto.project.slug}, ` +
        `process=${dto.item.process}, material=${dto.item.material}, ` +
        `qty=${dto.item.quantity}, volume=${dto.geometry.volume_cm3}cm3`,
    );

    return this.yantra4dImportService.createQuoteFromYantra4d(req.user.tenantId, req.user.id, dto);
  }
}
