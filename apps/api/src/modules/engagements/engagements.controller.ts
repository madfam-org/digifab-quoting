/**
 * GET /api/v1/engagements/:phyndcrmEngagementId
 *   Returns the engagement projection + counts of quotes grouped by type.
 *
 * GET /api/v1/engagements/:phyndcrmEngagementId/quotes
 *   Returns quotes for the engagement, grouped by quoteType. Used by
 *   the PhyndCRM portal to render the two-cards-per-engagement layout
 *   (e.g. for the tablaco flow: physical + digital quotes side-by-side).
 */
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../types/auth-request';

import { EngagementsService } from './engagements.service';

@ApiTags('engagements')
@Controller('engagements')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized — invalid or missing JWT' })
export class EngagementsController {
  constructor(private readonly engagements: EngagementsService) {}

  @Get(':phyndcrmEngagementId')
  @ApiOperation({
    summary: 'Get engagement projection',
    description:
      'Returns the Cotiza projection of a PhyndCRM engagement, with counts of quotes grouped by type.',
  })
  @ApiParam({
    name: 'phyndcrmEngagementId',
    description: 'The engagement ID issued by PhyndCRM (cross-ecosystem canonical ID).',
  })
  @ApiOkResponse({ description: 'Engagement projection with quote type counts' })
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('phyndcrmEngagementId') phyndcrmEngagementId: string,
  ) {
    return this.engagements.findByPhynecrmId(req.user.tenantId, phyndcrmEngagementId);
  }

  @Get(':phyndcrmEngagementId/quotes')
  @ApiOperation({
    summary: 'List quotes for an engagement, grouped by quoteType',
    description:
      'Used by the portal to render the two-cards-per-engagement layout. Returns `{ fab: [...], services: [...] }`.',
  })
  @ApiOkResponse({ description: 'Quotes grouped by quoteType' })
  async listQuotes(
    @Req() req: AuthenticatedRequest,
    @Param('phyndcrmEngagementId') phyndcrmEngagementId: string,
  ) {
    return this.engagements.listQuotesForEngagement(req.user.tenantId, phyndcrmEngagementId);
  }
}
