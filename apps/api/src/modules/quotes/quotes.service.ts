import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import {
  PricingResolverService,
  PRICING_DEGRADE_REASONS,
  PricingDegradeReason,
} from '../pricing/pricing-resolver.service';
import { QuoteCacheService } from '../redis/quote-cache.service';
import { Cacheable, CacheInvalidate } from '../redis/decorators/cache.decorator';
import { Quote as PrismaQuote, QuoteItem as PrismaQuoteItem, Prisma } from '@prisma/client';
import {
  QuoteStatus,
  Currency,
  ProcessType,
  QuoteType,
  ServicesBillableType,
} from '@cotiza/shared';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { AddQuoteItemDto } from './dto/add-quote-item.dto';
import { CalculateQuoteDto } from './dto/calculate-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { Decimal } from 'decimal.js';
import { createPaginatedResponse, getPrismaSkipTake } from '../../common/utils/pagination.util';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { TenantCacheService } from '../tenants/services/tenant-cache.service';
import { JobsService } from '../jobs/jobs.service';
import { JobType } from '../jobs/interfaces/job.interface';
import { FilesService } from '../files/files.service';
import { PhyndCrmEngagementService } from '../../integrations/phyndcrm/phyndcrm-engagement.service';
import { QuoteLifecycleEventsService } from '../../integrations/phyndcrm/quote-lifecycle-events.service';
import { JanuaEmailService } from '../email/janua-email.service';
import { KarafielComplianceService } from '../../integrations/karafiel/karafiel-compliance.service';
import {
  DhanamMilestoneService,
  DhanamMilestoneItem,
} from '../../integrations/dhanam/dhanam-milestone.service';
import {
  PravaraDispatchService,
  PravaraJobItem,
} from '../../integrations/pravara/pravara-dispatch.service';
import { EngagementsService } from '../engagements/engagements.service';
import { ConfigService } from '@nestjs/config';
import { JanuaBillingService } from '../billing/services/janua-billing.service';
import { DhanamRelayService } from '../billing/services/dhanam-relay.service';

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private prisma: PrismaService,
    private pricingService: PricingService,
    private pricingResolver: PricingResolverService,
    private quoteCacheService: QuoteCacheService,
    private tenantCacheService: TenantCacheService,
    private jobsService: JobsService,
    private filesService: FilesService,
    private phyndcrmEngagement: PhyndCrmEngagementService,
    private quoteLifecycle: QuoteLifecycleEventsService,
    private januaEmail: JanuaEmailService,
    private karafielCompliance: KarafielComplianceService,
    private dhanamMilestone: DhanamMilestoneService,
    private pravaraDispatch: PravaraDispatchService,
    private engagements: EngagementsService,
    private januaBilling: JanuaBillingService,
    private dhanamRelay: DhanamRelayService,
    private configService: ConfigService,
  ) {}

  async create(tenantId: string, customerId: string, dto: CreateQuoteDto): Promise<PrismaQuote> {
    const quoteType = dto.quoteType ?? QuoteType.FAB;

    // Services mode is feature-flagged per-tenant. Fail fast at create
    // time rather than carrying an unusable quote around.
    if (quoteType === QuoteType.SERVICES) {
      const features = await this.tenantCacheService.getTenantFeatures(tenantId);
      if (!features.servicesQuotes) {
        throw new BadRequestException('Services-mode quoting is not enabled for this tenant');
      }
    }

    // If the DTO cites a PhyndCRM engagement ID, auto-materialize the
    // Cotiza projection so subsequent queries (portal grouping,
    // engagement detail) can join on it. The projection is marked
    // `lastSyncedAt: NULL` until PhyndCRM pushes back a webhook.
    let engagementProjectionId: string | null = null;
    if (dto.engagementId) {
      engagementProjectionId = await this.engagements.ensureProjection(tenantId, dto.engagementId);
    }

    // Get quote validity days from tenant configuration
    const tenantConfig = await this.tenantCacheService.getTenantConfig(tenantId);
    const validityDays = (tenantConfig.settings.quoteValidityDays as number) || 14;
    const validityUntil = new Date();
    validityUntil.setDate(validityUntil.getDate() + validityDays);

    // Generate unique quote number
    const quoteNumber = await this.generateQuoteNumber(tenantId);

    return this.prisma.quote.create({
      data: {
        tenantId,
        customerId,
        number: quoteNumber,
        quoteType,
        currency: dto.currency,
        objective: dto.objective,
        validityUntil,
        status: QuoteStatus.DRAFT,
        ...(engagementProjectionId && { engagementId: engagementProjectionId }),
        ...(dto.engagementId && {
          metadata: { phyndcrmEngagementId: dto.engagementId },
        }),
      },
    });
  }

  async findAll(
    tenantId: string,
    filters: {
      customerId?: string;
      status?: QuoteStatus;
      page?: number;
      limit?: number;
    },
  ): Promise<PaginatedDto<PrismaQuote>> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const { skip, take } = getPrismaSkipTake({ page, limit });

    const where = {
      tenantId,
      ...(filters.customerId && { customerId: filters.customerId }),
      ...(filters.status && { status: filters.status as string }), // Cast enum to string for Prisma
    };

    const [data, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: {
          items: true,
          customer: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quote.count({ where }),
    ]);

    return createPaginatedResponse({ data, total }, { page, limit });
  }

  @Cacheable({ prefix: 'quote:detail', ttl: 300 }) // Cache for 5 minutes
  async findOne(
    tenantId: string,
    id: string,
  ): Promise<
    PrismaQuote & { items: Array<PrismaQuoteItem & { files: unknown[]; dfmReport: unknown }> }
  > {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        items: {
          include: {
            files: true,
            dfmReport: true,
          },
        },
        customer: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return quote;
  }

  @CacheInvalidate('quote:detail:*')
  async update(tenantId: string, id: string, dto: UpdateQuoteDto): Promise<PrismaQuote> {
    const quote = await this.findOne(tenantId, id);

    if (quote.status !== QuoteStatus.DRAFT && quote.status !== QuoteStatus.SUBMITTED) {
      throw new BadRequestException('Cannot update quote in current status');
    }

    return this.prisma.quote.update({
      where: { id },
      data: {
        objective: dto.objective as Prisma.InputJsonValue,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async addItem(tenantId: string, quoteId: string, dto: AddQuoteItemDto): Promise<PrismaQuoteItem> {
    const quote = await this.findOne(tenantId, quoteId);

    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException('Cannot add items to non-draft quote');
    }

    // Verify file belongs to tenant
    const file = await this.prisma.file.findFirst({
      where: {
        id: dto.fileId,
        tenantId,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Create quote item
    const quoteItem = await this.prisma.quoteItem.create({
      data: {
        quoteId,
        name: dto.name || file.originalName,
        process: dto.process,
        processCode: dto.process,
        material: ((dto.options as Record<string, unknown>)?.material as string) || 'PLA', // Extract material from options
        quantity: dto.quantity,
        selections: dto.options as Prisma.InputJsonValue,
      },
    });

    // Associate file with quote item
    await this.prisma.file.update({
      where: { id: dto.fileId },
      data: { quoteItemId: quoteItem.id },
    });

    // Return the item with relations loaded
    return this.prisma.quoteItem.findUnique({
      where: { id: quoteItem.id },
      include: {
        files: true,
      },
    }) as Promise<PrismaQuoteItem>;
  }

  async calculate(
    tenantId: string,
    quoteId: string,
    dto: CalculateQuoteDto,
  ): Promise<{
    quote: PrismaQuote & {
      items: Array<PrismaQuoteItem & { files: unknown[]; dfmReport: unknown }>;
    };
    errors?: Array<{ itemId?: string; error: string }>;
  }> {
    const quote = await this.findOne(tenantId, quoteId);

    // Services mode: no pricing engine, no DFM, no cache lookup. Items
    // already carry unitPrice + quantity from their dto at add-time;
    // we only recompute totals here.
    if ((quote as unknown as { quoteType?: string }).quoteType === QuoteType.SERVICES) {
      return this.calculateServices(tenantId, quoteId);
    }

    // Update objective if provided
    if (dto.objective) {
      await this.prisma.quote.update({
        where: { id: quoteId },
        data: { objective: dto.objective as unknown as Prisma.InputJsonValue },
      });
    }

    // Get all quote items to calculate
    const itemsToCalculate = dto.items || quote.items;
    const calculatedItems = [];
    const errors = [];

    for (const item of itemsToCalculate) {
      try {
        // Get or create quote item, then (re)load it with the relations the
        // pricing-input resolution needs (worker analysis + DFM report).
        let quoteItemId: string;
        if ('id' in item && item.id) {
          quoteItemId = item.id;
        } else {
          const created = await this.addItem(tenantId, quoteId, item as AddQuoteItemDto);
          quoteItemId = created.id;
        }

        const quoteItem = await this.prisma.quoteItem.findFirst({
          where: { id: quoteItemId, quoteId },
          include: {
            files: { include: { fileAnalysis: true } },
            dfmReport: true,
          },
        });
        if (!quoteItem) {
          throw new Error(`Quote item not found for id: ${quoteItemId}`);
        }

        // ------------------------------------------------------------------
        // Resolve real pricing inputs. A missing input degrades the item with
        // a machine-readable reason (quote -> NEEDS_REVIEW) instead of
        // throwing an opaque error.
        // ------------------------------------------------------------------
        const geometry = this.pricingResolver.resolveGeometry(quoteItem);
        if (!geometry) {
          // Kick off the worker analysis so a later recalculation can price
          // this item, then degrade explicitly.
          await this.queueFileAnalysisForItem(tenantId, quoteItem);
          errors.push(
            await this.degradeQuoteItem(
              quoteItem,
              PRICING_DEGRADE_REASONS.MISSING_GEOMETRY_ANALYSIS,
            ),
          );
          continue;
        }

        const materialCode =
          ((quoteItem.selections as Record<string, unknown>)?.material as string) ||
          quoteItem.material;
        const material = await this.pricingResolver.resolveMaterial(tenantId, {
          materialId: quoteItem.materialId,
          materialCode,
          process: quoteItem.processCode,
        });
        if (!material) {
          errors.push(
            await this.degradeQuoteItem(quoteItem, PRICING_DEGRADE_REASONS.MATERIAL_NOT_FOUND),
          );
          continue;
        }

        const machine = await this.pricingResolver.resolveMachine(tenantId, quoteItem.processCode);
        if (!machine) {
          errors.push(
            await this.degradeQuoteItem(quoteItem, PRICING_DEGRADE_REASONS.NO_MACHINE_FOR_PROCESS),
          );
          continue;
        }

        // Try to get cached pricing result first
        const cacheKey = {
          fileHash: (quoteItem as { files?: Array<{ hash?: string }> }).files?.[0]?.hash || '',
          service: quoteItem.processCode,
          material:
            ((quoteItem.selections as Record<string, unknown>)?.material as string) || 'default',
          quantity: quoteItem.quantity,
          options: quoteItem.selections as Record<string, unknown> | undefined,
        };

        const pricingResult = await this.quoteCacheService.getOrCalculateQuote(
          cacheKey,
          async () => {
            const result = await this.pricingService.calculateQuoteItemWithMarketIntelligence(
              tenantId,
              quoteItem.processCode as ProcessType,
              {
                volumeCm3: geometry.volumeCm3,
                surfaceAreaCm2: geometry.surfaceAreaCm2,
                boundingBox: geometry.boundingBox,
              },
              material.id,
              machine.id,
              (quoteItem.selections ?? {}) as Record<string, unknown>,
              quoteItem.quantity,
              quote.objective as { cost?: number; lead?: number; green?: number },
            );
            return {
              pricing: {
                unitCost: result.unitPrice,
                totalCost: result.totalPrice,
                margin: result.costBreakdown.margin,
                finalPrice: result.totalPrice,
              },
              manufacturing: {
                estimatedTime: result.leadDays,
                machineCost: result.costBreakdown?.machine || 0,
                materialCost: result.costBreakdown?.material || 0,
              },
              sustainability: result.sustainability as unknown as Record<string, unknown>,
              pricingProvenance: result.pricing_provenance as unknown as Record<string, unknown>,
              marketBenchmark: (result.benchmark as unknown as Record<string, unknown>) || null,
              timestamp: Date.now(),
            };
          },
        );

        // Update quote item with results. Provenance travels on metadata so
        // fallback pricing is never silently presented as market-verified.
        const updatedItem = await this.prisma.quoteItem.update({
          where: { id: quoteItem.id },
          data: {
            unitPrice: pricingResult.pricing.unitCost,
            totalPrice: pricingResult.pricing.totalCost,
            leadDays: pricingResult.manufacturing.estimatedTime,
            materialId: material.id,
            costBreakdown: {
              machine: pricingResult.manufacturing.machineCost,
              material: pricingResult.manufacturing.materialCost,
            } as Prisma.InputJsonValue,
            sustainability: (pricingResult.sustainability || {}) as Prisma.InputJsonValue,
            flags: [],
            metadata: {
              ...((quoteItem.metadata as Record<string, unknown>) || {}),
              needsReviewReason: null,
              machineId: machine.id,
              geometrySource: geometry.source,
              pricingProvenance: pricingResult.pricingProvenance || null,
              marketBenchmark: pricingResult.marketBenchmark || null,
            } as Prisma.InputJsonValue,
          },
        });

        calculatedItems.push(updatedItem);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        errors.push({
          itemId: 'id' in item ? item.id : '',
          error: errorMessage,
        });
      }
    }

    // Calculate totals
    const totals = await this.calculateTotals(
      tenantId,
      calculatedItems,
      quote.currency as Currency,
    );

    // Update quote status and totals
    const updatedQuote = await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: errors.length > 0 ? QuoteStatus.NEEDS_REVIEW : QuoteStatus.AUTO_QUOTED,
        totals,
        sustainability: this.calculateSustainabilitySummary(
          calculatedItems,
        ) as Prisma.InputJsonValue,
      },
      include: {
        items: {
          include: {
            files: true,
            dfmReport: true,
          },
        },
      },
    });

    // Quote reached AUTO_QUOTED — deliver it to the customer (email +
    // PhyndCRM `cotiza:quote_sent` event + quote artifact). Fire-and-
    // forget: delivery failures never break the calculate response.
    if (errors.length === 0) {
      void this.dispatchQuoteReady(tenantId, quoteId);
    }

    return {
      quote: updatedQuote,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Degrade a fab quote item that cannot be auto-priced: record a
   * machine-readable reason on the item (`flags` + `metadata.needsReviewReason`)
   * and return the error entry that pushes the quote into NEEDS_REVIEW.
   * Explicit degradation instead of a thrown "Machine with ID  not found".
   */
  private async degradeQuoteItem(
    quoteItem: PrismaQuoteItem,
    reason: PricingDegradeReason,
  ): Promise<{ itemId: string; error: string }> {
    try {
      await this.prisma.quoteItem.update({
        where: { id: quoteItem.id },
        data: {
          flags: Array.from(new Set([...(quoteItem.flags || []), reason])),
          metadata: {
            ...((quoteItem.metadata as Record<string, unknown>) || {}),
            needsReviewReason: reason,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record degradation reason ${reason} on quote item ${quoteItem.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
    return { itemId: quoteItem.id, error: reason };
  }

  /**
   * Fire-and-forget enqueue of the worker geometry/DFM analysis for the
   * item's file so a later recalculation has real metrics. Uses the existing
   * FILE_ANALYSIS Bull queue (FileAnalysisProcessor -> Python worker ->
   * FileAnalysis row).
   */
  private async queueFileAnalysisForItem(
    tenantId: string,
    quoteItem: PrismaQuoteItem & {
      files?: Array<{
        id: string;
        path: string;
        s3Key?: string | null;
        filename: string;
        originalName: string;
        type: string;
      }> | null;
    },
  ): Promise<void> {
    const file = quoteItem.files?.[0];
    if (!file) {
      return;
    }

    try {
      await this.jobsService.addJob(JobType.FILE_ANALYSIS, {
        tenantId,
        fileId: file.id,
        fileUrl: file.s3Key || file.path,
        fileName: file.originalName || file.filename,
        fileType: file.type,
        analysisOptions: {
          performDfm: true,
          extractGeometry: true,
          calculateVolume: true,
          detectFeatures: true,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue file analysis for quote item ${quoteItem.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  // Services-mode pricing: no engine, no DFM, no cache. Items already
  // carry unitPrice + quantity from addItem (dto). We sum them for the
  // subtotal and run the same tax/shipping rules as fab so the
  // PDF/totals view works unchanged.
  private async calculateServices(
    tenantId: string,
    quoteId: string,
  ): Promise<{
    quote: PrismaQuote & {
      items: Array<PrismaQuoteItem & { files: unknown[]; dfmReport: unknown }>;
    };
  }> {
    const quote = await this.findOne(tenantId, quoteId);

    const items = quote.items;
    for (const item of items) {
      if (item.unitPrice == null) {
        throw new BadRequestException(
          `Services quote item ${item.id} is missing unitPrice; set it at addItem time.`,
        );
      }
      const total = new Decimal(item.unitPrice).mul(item.quantity);
      if (item.totalPrice == null || !new Decimal(item.totalPrice).equals(total)) {
        await this.prisma.quoteItem.update({
          where: { id: item.id },
          data: { totalPrice: total },
        });
      }
    }

    const refreshed = await this.prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: {
        items: {
          include: { files: true, dfmReport: true },
        },
      },
    });

    const totals = await this.calculateTotals(
      tenantId,
      refreshed.items,
      refreshed.currency as Currency,
    );

    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.QUOTED,
        totals,
      },
      include: {
        items: {
          include: { files: true, dfmReport: true },
        },
      },
    });

    // Quote reached QUOTED — deliver it (email + PhyndCRM
    // `cotiza:quote_sent` + quote artifact). Fire-and-forget.
    void this.dispatchQuoteReady(tenantId, quoteId);

    return { quote: updated };
  }

  async approve(
    tenantId: string,
    quoteId: string,
    customerId: string,
  ): Promise<{
    quote: PrismaQuote;
    sessionId?: string;
    checkoutUrl?: string;
    paymentUrl?: string;
    checkoutUnavailable?: boolean;
    checkoutUnavailableReason?: string;
  }> {
    const quote = await this.findOne(tenantId, quoteId);

    if (quote.customerId !== customerId) {
      throw new BadRequestException('Unauthorized to approve this quote');
    }

    if (quote.status !== QuoteStatus.QUOTED && quote.status !== QuoteStatus.AUTO_QUOTED) {
      throw new BadRequestException('Quote cannot be approved in current status');
    }

    if (new Date(quote.validityUntil) < new Date()) {
      throw new BadRequestException('Quote has expired');
    }

    const updatedQuote = await this.prisma.quote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.APPROVED },
    });

    // ---------------------------------------------------------------
    // Mint a Dhanam checkout URL (synchronous) + relay quote.accepted
    // (fire-and-forget). Cotiza is a Dhanam billing-API client per the
    // 2026-04-25 monetization-architecture directive — it does NOT hold
    // Stripe keys. The checkout URL is what the frontend redirects the
    // user to immediately after the "Accept Quote" confirmation.
    //
    // The relay is observability/fan-out (Dhanam observes the event for
    // analytics/idempotency); the checkout call is the load-bearing
    // synchronous step. If the checkout call throws, the controller
    // surfaces a 502 — but the quote is already APPROVED in the DB so
    // the user can retry checkout from the dashboard without losing
    // approval state.
    // ---------------------------------------------------------------
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL', 'http://localhost:3002') ?? '';
    const successUrl = `${frontendUrl.replace(/\/+$/, '')}/quote/${quoteId}?payment=success`;
    const cancelUrl = `${frontendUrl.replace(/\/+$/, '')}/quote/${quoteId}?payment=cancel`;

    let checkoutUrl: string | undefined;
    let sessionId: string | undefined;
    let checkoutUnavailable = false;
    let checkoutUnavailableReason: string | undefined;
    if (this.januaBilling.isDhanamCheckoutEnabled()) {
      const session = await this.januaBilling.createCheckoutSession(
        quoteId,
        customerId,
        'cotiza_quote_payment',
        successUrl,
        cancelUrl,
      );
      checkoutUrl = session.checkoutUrl;
      sessionId = session.sessionId;
    } else {
      // LOUD degradation: the quote still flips to APPROVED (approval
      // state must never depend on billing config), but the response
      // carries an explicit flag + reason so the frontend/ops can react
      // instead of silently dropping the customer on a dead end.
      checkoutUnavailable = true;
      checkoutUnavailableReason =
        'Dhanam checkout is not configured (DHANAM_API_URL / DHANAM_API_TOKEN not set); no checkout URL could be minted';
      this.logger.error(
        `approve(): checkout unavailable for quote=${quoteId} — ${checkoutUnavailableReason}`,
      );
    }

    // Fan-out event for ecosystem observability. Errors are swallowed
    // by DhanamRelayService.relay (fire-and-forget contract).
    void this.dhanamRelay.relay('quote.accepted', {
      tenantId,
      quoteId,
      customerId,
      amount: Number(updatedQuote.total ?? updatedQuote.totalPrice ?? 0),
      currency: updatedQuote.currency,
      status: 'approved',
      metadata: {
        quote_number: updatedQuote.number,
        session_id: sessionId,
      },
    });

    // Fire-and-forget: announce the approval into PhyndCRM. Emits the
    // canonical lifecycle event `cotiza:quote_approved` (dedup
    // cotiza:<quoteId>:approved) plus the milestone alias
    // `quote_approved` (dedup cotiza:<quoteId>:milestone:quote_approved).
    // Replaces the legacy `quote.approved` event_type. Emitted even
    // when the quote has no engagement link — metadata carries
    // contact_email + cotiza_customer_id so PhyndCRM can resolve.
    // Failures never block the approve flow.
    const quoteTypeLabel =
      (updatedQuote as unknown as { quoteType?: string }).quoteType === QuoteType.SERVICES
        ? 'services'
        : 'fabrication';
    this.quoteLifecycle.emit('approved', updatedQuote, {
      contactEmail: (quote as unknown as { customer?: { email?: string } }).customer?.email,
      message: `${quoteTypeLabel === 'services' ? 'Services' : 'Fabrication'} proposal approved`,
      metadata: {
        quote_type: quoteTypeLabel,
        ...(sessionId && { session_id: sessionId }),
        ...(checkoutUnavailable && {
          checkout_unavailable: true,
          checkout_unavailable_reason: checkoutUnavailableReason,
        }),
      },
    });

    const engagementId = this.phyndcrmEngagement.getEngagementId(
      updatedQuote.metadata as Record<string, unknown> | null,
    );
    if (engagementId) {
      // Push the signed-proposal artifact. generatePdf() either returns
      // a fresh 7-day presigned S3 URL (when an existing PDF is on hand)
      // or a placeholder status URL (when generation is queued). Either
      // way, surfacing it in the portal is non-blocking.
      void this.pushProposalArtifact(tenantId, engagementId, updatedQuote);
    }

    return {
      quote: updatedQuote,
      checkoutUrl,
      sessionId,
      ...(checkoutUnavailable && { checkoutUnavailable, checkoutUnavailableReason }),
    };
  }

  private async pushProposalArtifact(
    tenantId: string,
    engagementId: string,
    quote: PrismaQuote,
  ): Promise<void> {
    try {
      const { url } = await this.generatePdf(tenantId, quote.id);
      await this.phyndcrmEngagement.recordArtifact({
        engagement_id: engagementId,
        type: 'signed_proposal',
        entity_type: 'quote',
        entity_id: quote.id,
        url,
        title: `Proposal ${quote.number}`,
        metadata: {
          quote_id: quote.id,
          quote_number: quote.number,
          currency: quote.currency,
        },
      });
    } catch {
      // Non-blocking. Staff can add the PDF to the engagement manually
      // via engagements.addArtifact if the auto-push fails.
    }
  }

  // ---------------------------------------------------------------
  // Quote-ready delivery — fired when a quote transitions to QUOTED
  // (services calculate) or AUTO_QUOTED (fab calculate). Sends the
  // transactional "quote ready" email to the customer (Janua
  // centralized email preferred, Bull quote-ready template as
  // fallback), emits the PhyndCRM `cotiza:quote_sent` lifecycle event,
  // and pushes a quote artifact into the engagement timeline when the
  // quote is linked to one.
  //
  // Entirely fire-and-forget: never throws, never blocks the quote
  // transition. Transactional email — no marketing-consent gate.
  // ---------------------------------------------------------------
  async dispatchQuoteReady(tenantId: string, quoteId: string): Promise<void> {
    try {
      const quote = await this.prisma.quote.findFirst({
        where: { id: quoteId, tenantId },
        include: {
          items: { select: { id: true } },
          customer: { select: { id: true, email: true, name: true } },
        },
      });
      if (!quote) return;
      if (quote.status !== QuoteStatus.QUOTED && quote.status !== QuoteStatus.AUTO_QUOTED) {
        return;
      }

      const contactEmail = quote.customer?.email ?? null;
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL', 'http://localhost:3002') ?? '';
      const quoteUrl = `${frontendUrl.replace(/\/+$/, '')}/quote/${quote.id}`;
      const totals = (quote.totals ?? {}) as { grandTotal?: number };
      const total = Number(quote.total ?? quote.totalPrice ?? totals.grandTotal ?? 0);

      if (contactEmail) {
        try {
          if (this.januaEmail.available) {
            await this.januaEmail.sendQuoteReadyEmail(
              contactEmail,
              quote.number,
              total,
              quote.currency,
              quote.validityUntil?.toISOString(),
              quote.items.length,
              quoteUrl,
            );
          } else {
            // Fallback: local Bull queue + the existing quote-ready
            // handlebars template in email-notification.processor.ts.
            await this.jobsService.addJob(JobType.EMAIL_NOTIFICATION, {
              tenantId,
              type: 'quote-ready',
              recipientEmail: contactEmail,
              recipientName: quote.customer?.name ?? undefined,
              templateData: {
                quoteNumber: quote.number,
                itemCount: quote.items.length,
                total,
                currency: quote.currency,
                validUntil: quote.validityUntil?.toISOString(),
                quoteUrl,
              },
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `dispatchQuoteReady: quote-ready email failed for quote=${quote.id}: ${msg}`,
          );
        }
      } else {
        this.logger.warn(
          `dispatchQuoteReady: no customer email for quote=${quote.id} — skipping quote-ready email`,
        );
      }

      // PhyndCRM lifecycle event (cotiza:quote_sent) — fire-and-forget.
      this.quoteLifecycle.emit('sent', quote, {
        contactEmail,
        message: `Quote ${quote.number} sent to customer`,
        metadata: { quote_url: quoteUrl },
      });

      // Quote artifact (mirrors the signed-proposal artifact push in
      // approve(), with type 'quote'). Engagement-linked quotes only —
      // the artifacts endpoint requires an engagement.
      const engagementId = this.phyndcrmEngagement.getEngagementId(
        quote.metadata as Record<string, unknown> | null,
      );
      if (engagementId) {
        void this.pushQuoteArtifact(tenantId, engagementId, quote);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`dispatchQuoteReady failed for quote=${quoteId}: ${msg}`);
    }
  }

  private async pushQuoteArtifact(
    tenantId: string,
    engagementId: string,
    quote: PrismaQuote,
  ): Promise<void> {
    try {
      const { url } = await this.generatePdf(tenantId, quote.id);
      await this.phyndcrmEngagement.recordArtifact({
        engagement_id: engagementId,
        type: 'quote',
        entity_type: 'quote',
        entity_id: quote.id,
        url,
        title: `Quote ${quote.number}`,
        metadata: {
          quote_id: quote.id,
          quote_number: quote.number,
          currency: quote.currency,
        },
      });
    } catch {
      // Non-blocking, mirrors pushProposalArtifact.
    }
  }

  // ---------------------------------------------------------------
  // Customer first-view tracking. Called (fire-and-forget) from the
  // customer-facing GET /quotes/:id handler when the requester is the
  // quote's customer. Stamps metadata.firstViewedAt exactly once and
  // emits the PhyndCRM `cotiza:quote_viewed` event (also dedup-keyed
  // server-side as cotiza:<quoteId>:viewed as a second guard).
  // ---------------------------------------------------------------
  async recordCustomerView(
    tenantId: string,
    quoteId: string,
    viewer: { id: string; email?: string },
  ): Promise<void> {
    try {
      // Fresh read (findOne is cached) so the first-view stamp is
      // accurate even when the detail response came from cache.
      const quote = await this.prisma.quote.findFirst({
        where: { id: quoteId, tenantId },
      });
      if (!quote) return;
      if (!quote.customerId || quote.customerId !== viewer.id) return;

      const metadata = (quote.metadata ?? {}) as Record<string, unknown>;
      if (metadata.firstViewedAt) return;

      const firstViewedAt = new Date().toISOString();
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: {
          metadata: { ...metadata, firstViewedAt } as Prisma.InputJsonValue,
        },
      });

      this.quoteLifecycle.emit('viewed', quote, {
        contactEmail: viewer.email,
        message: `Quote ${quote.number} viewed by customer`,
        metadata: { first_viewed_at: firstViewedAt },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`recordCustomerView failed for quote=${quoteId}: ${msg}`);
    }
  }

  // ---------------------------------------------------------------
  // Customer rejects a ready quote. Terminal REJECTED transition +
  // PhyndCRM `cotiza:quote_rejected` lifecycle event.
  // ---------------------------------------------------------------
  @CacheInvalidate('quote:detail:*')
  async reject(
    tenantId: string,
    quoteId: string,
    customerId: string,
    reason?: string,
  ): Promise<PrismaQuote> {
    const quote = await this.findOne(tenantId, quoteId);

    if (quote.customerId !== customerId) {
      throw new BadRequestException('Unauthorized to reject this quote');
    }

    const allowedStatuses: QuoteStatus[] = [QuoteStatus.QUOTED, QuoteStatus.AUTO_QUOTED];
    if (!allowedStatuses.includes(quote.status as QuoteStatus)) {
      throw new BadRequestException('Quote cannot be rejected in current status');
    }

    const metadata = {
      ...((quote.metadata ?? {}) as Record<string, unknown>),
      rejectedAt: new Date().toISOString(),
      ...(reason && { rejectionReason: reason }),
    };

    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.REJECTED,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    this.quoteLifecycle.emit('rejected', updated, {
      contactEmail: (quote as unknown as { customer?: { email?: string } }).customer?.email,
      message: `Quote ${updated.number} rejected by customer`,
      metadata: reason ? { rejection_reason: reason } : undefined,
    });

    return updated;
  }

  // ---------------------------------------------------------------
  // Phase D outbound integrations — fired when a quote reaches ORDERED
  // (post-payment). Called from OrdersService.createOrderFromQuote
  // after the status flip to ORDERED.
  //
  // Each integration is fire-and-forget: Promise.allSettled ensures one
  // failing downstream service never blocks the others, and no
  // exception bubbles up to break the order-creation flow.
  //
  // Branches:
  //  - Karafiel — CFDI stamping (skipped unless receptor RFC present)
  //  - Dhanam   — milestone invoices (services-mode MILESTONE items)
  //  - Pravara  — MES dispatch (FAB items only)
  // ---------------------------------------------------------------
  async handleOrdered(tenantId: string, quoteId: string, orderId?: string): Promise<void> {
    let quote: PrismaQuote & {
      items: PrismaQuoteItem[];
      customer?: { email: string } | null;
    };
    try {
      const loaded = await this.prisma.quote.findFirst({
        where: { id: quoteId, tenantId },
        include: { items: true, customer: { select: { email: true } } },
      });
      if (!loaded) {
        this.logger.warn('handleOrdered: quote not found (tenant=%s quote=%s)', tenantId, quoteId);
        return;
      }
      quote = loaded;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('handleOrdered: failed to load quote=%s: %s', quoteId, msg);
      return;
    }

    const metadata = (quote.metadata ?? {}) as Record<string, unknown>;
    const engagementId = this.phyndcrmEngagement.getEngagementId(metadata);

    // PhyndCRM lifecycle event: the quote is now ORDERED (payment
    // landed, order minted). handleOrdered only runs on fresh order
    // creation, so replayed payment webhooks never re-emit this.
    this.quoteLifecycle.emit('ordered', quote, {
      contactEmail: quote.customer?.email,
      message: `Quote ${quote.number} ordered (payment received)`,
      metadata: orderId ? { order_id: orderId } : undefined,
    });

    // Load tenant for RFC/branding. Non-fatal if missing.
    let tenantSettings: Record<string, unknown> = {};
    let tenantBranding: Record<string, unknown> = {};
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
      if (tenant) {
        tenantSettings = (tenant.settings ?? {}) as Record<string, unknown>;
        tenantBranding = (tenant.branding ?? {}) as Record<string, unknown>;
      }
    } catch {
      // best-effort
    }

    // --- Karafiel: CFDI stamping ------------------------------------
    const receptorRfc = this.karafielCompliance.resolveReceptorRfc(metadata, tenantSettings);
    const emisorRfc =
      (typeof tenantBranding.emisorRfc === 'string' && tenantBranding.emisorRfc) ||
      (typeof tenantSettings.emisorRfc === 'string' && tenantSettings.emisorRfc) ||
      undefined;

    const karafielPromise = receptorRfc
      ? this.karafielCompliance.issueCfdi({
          quoteId: quote.id,
          quoteNumber: quote.number,
          receptorRfc,
          emisorRfc,
          subtotal: Number(quote.subtotal ?? 0),
          total: Number(quote.total ?? quote.totalPrice ?? 0),
          moneda: quote.currency,
          items: quote.items.map((it) => ({
            descripcion: it.name,
            cantidad: it.quantity,
            valor_unitario: Number(it.unitPrice ?? 0),
            importe: Number(it.totalPrice ?? 0),
          })),
          metadata: { engagement_id: engagementId ?? undefined },
        })
      : Promise.resolve();

    // --- Dhanam: milestone invoices ---------------------------------
    const milestoneItems = this.extractMilestoneItems(quote.items, quote.currency);
    const dhanamPromise = this.dhanamMilestone.createInvoicesForMilestones({
      tenantId,
      quoteId: quote.id,
      quoteNumber: quote.number,
      customerId: quote.customerId ?? '',
      currency: quote.currency,
      engagementId: engagementId ?? undefined,
      orderId,
      items: milestoneItems,
    });

    // --- Pravara: MES dispatch (FAB items only) ---------------------
    const fabItems = this.extractFabItems(
      quote.items,
      (quote as unknown as { quoteType?: string }).quoteType,
    );
    const pravaraPromise = this.pravaraDispatch.dispatchJob({
      tenantId,
      quoteId: quote.id,
      quoteNumber: quote.number,
      engagementId: engagementId ?? undefined,
      currency: quote.currency,
      items: fabItems,
    });

    const results = await Promise.allSettled([karafielPromise, dhanamPromise, pravaraPromise]);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const names = ['karafiel', 'dhanam', 'pravara'];
        this.logger.warn(
          'handleOrdered[%s] settled as rejected for quote=%s: %s',
          names[i],
          quoteId,
          r.reason instanceof Error ? r.reason.message : String(r.reason),
        );
      }
    });
  }

  private extractMilestoneItems(
    items: PrismaQuoteItem[],
    fallbackCurrency: string,
  ): DhanamMilestoneItem[] {
    const out: DhanamMilestoneItem[] = [];
    for (const item of items) {
      const details = item.servicesDetails as {
        billableType?: string;
        milestones?: Array<Record<string, unknown>>;
      } | null;
      if (!details || details.billableType !== ServicesBillableType.MILESTONE) {
        continue;
      }
      const milestones = Array.isArray(details.milestones) ? details.milestones : [];
      for (const ms of milestones) {
        if (typeof ms.id !== 'string' || typeof ms.name !== 'string') continue;
        const amount = typeof ms.amount === 'number' ? ms.amount : 0;
        out.push({
          quoteItemId: item.id,
          milestoneId: ms.id,
          name: ms.name,
          amount,
          currency: fallbackCurrency,
          dueDate: typeof ms.dueDate === 'string' ? ms.dueDate : undefined,
        });
      }
    }
    return out;
  }

  private extractFabItems(
    items: PrismaQuoteItem[],
    quoteType: string | undefined,
  ): PravaraJobItem[] {
    // SERVICES-only quote with zero fab items: return empty list
    // (service will skip the dispatch). A mixed/FAB quote contributes
    // every item that has no servicesDetails block (= fab item).
    return items
      .filter((it) => {
        const hasServicesDetails = it.servicesDetails !== null && it.servicesDetails !== undefined;
        if (quoteType === QuoteType.SERVICES) {
          // defensively allow fab items inside services-mode quotes
          return !hasServicesDetails;
        }
        return !hasServicesDetails;
      })
      .map<PravaraJobItem>((it) => ({
        quoteItemId: it.id,
        process: it.process,
        material: it.material,
        quantity: it.quantity,
        selections: (it.selections ?? {}) as Record<string, unknown>,
        files: [],
        leadTimeDays: it.leadTime ?? it.leadDays ?? undefined,
        unitPrice: it.unitPrice ? Number(it.unitPrice) : undefined,
        totalPrice: it.totalPrice ? Number(it.totalPrice) : undefined,
      }));
  }

  @CacheInvalidate('quote:detail:*')
  async cancel(tenantId: string, quoteId: string): Promise<PrismaQuote> {
    const quote = await this.findOne(tenantId, quoteId);

    const allowedStatuses: QuoteStatus[] = [
      QuoteStatus.DRAFT,
      QuoteStatus.SUBMITTED,
      QuoteStatus.AUTO_QUOTED,
      QuoteStatus.QUOTED,
      QuoteStatus.NEEDS_REVIEW,
    ];
    if (!allowedStatuses.includes(quote.status as QuoteStatus)) {
      throw new BadRequestException('Quote cannot be cancelled in current status');
    }

    return this.prisma.quote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.CANCELLED },
    });
  }

  private async calculateTotals(
    tenantId: string,
    items: Array<PrismaQuoteItem>,
    currency: Currency,
  ): Promise<{
    subtotal: number;
    tax: number;
    shipping: number;
    grandTotal: number;
    currency: Currency;
  }> {
    const subtotal = items.reduce(
      (sum, item) => sum.plus(new Decimal(item.totalPrice || 0)),
      new Decimal(0),
    );

    // Get tenant pricing settings for tax and shipping calculation
    const pricingSettings = await this.tenantCacheService.getPricingSettings(tenantId);

    // Calculate tax based on tenant configuration
    const taxRate = new Decimal((pricingSettings.taxRate as number) || 0.16); // Default 16% IVA
    const tax = subtotal.mul(taxRate);

    // Calculate shipping based on tenant configuration
    const freeShippingThreshold = new Decimal(
      (pricingSettings.freeShippingThreshold as number) || 1000,
    );
    const standardShippingRate = new Decimal(
      (pricingSettings.standardShippingRate as number) || 150,
    );

    // Apply free shipping if order meets threshold, otherwise apply standard rate
    const shipping = subtotal.gte(freeShippingThreshold) ? new Decimal(0) : standardShippingRate;

    const grandTotal = subtotal.plus(tax).plus(shipping);

    return {
      subtotal: subtotal.toNumber(),
      tax: tax.toNumber(),
      shipping: shipping.toNumber(),
      grandTotal: grandTotal.toNumber(),
      currency,
    };
  }

  private calculateSustainabilitySummary(
    items: Array<{
      sustainability?: { co2eKg?: number; score?: number; energyKwh?: number } | null;
    }>,
  ): {
    score: number;
    co2eKg: number;
    energyKwh: number;
  } | null {
    if (items.length === 0) return null;

    const totalCo2e = items.reduce(
      (sum, item) => sum.plus(new Decimal(item.sustainability?.co2eKg || 0)),
      new Decimal(0),
    );

    const avgScore =
      items.reduce((sum, item) => sum + (item.sustainability?.score || 0), 0) / items.length;

    const totalEnergyKwh = items.reduce(
      (sum, item) => sum.plus(new Decimal(item.sustainability?.energyKwh || 0)),
      new Decimal(0),
    );

    return {
      score: Math.round(avgScore),
      co2eKg: totalCo2e.toNumber(),
      energyKwh: totalEnergyKwh.toNumber(),
    };
  }

  private async generateQuoteNumber(tenantId: string): Promise<string> {
    // Get the current date components
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Get the count of quotes for this tenant in the current month
    const startOfMonth = new Date(year, now.getMonth(), 1);
    const endOfMonth = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = await this.prisma.quote.count({
      where: {
        tenantId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    // Generate quote number in format: Q-YYYY-MM-XXXX
    const sequence = String(count + 1).padStart(4, '0');
    return `Q-${year}-${month}-${sequence}`;
  }

  async generatePdf(
    tenantId: string,
    quoteId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    // Get quote with all related data
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: {
        customer: true,
        items: {
          include: {
            files: true,
          },
        },
        tenant: {
          select: {
            name: true,
            code: true,
            settings: true,
          },
        },
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    // Check if PDF already exists and is recent (less than 24 hours old)
    const existingPdf = await this.prisma.file.findFirst({
      where: {
        tenantId,
        metadata: {
          path: ['$.quoteId'],
          equals: quoteId,
        },
        type: 'pdf',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existingPdf) {
      // Return existing PDF URL
      const url = await this.filesService.getFileUrl(tenantId, existingPdf.id);
      return {
        url,
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      };
    }

    // Queue PDF generation job
    const job = await this.jobsService.addJob(JobType.REPORT_GENERATION, {
      tenantId,
      reportType: 'quote',
      entityId: quoteId,
      format: 'pdf',
      data: {
        id: quote.id,
        number: quote.number,
        createdAt: quote.createdAt,
        validUntil: quote.validityUntil,
        status: quote.status,
        currency: quote.currency,
        customer: (quote as any).customer,
        items: (quote as any).items?.map((item: any) => ({
          name: item.part?.filename || 'Part',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          currency: quote.currency,
          material: {
            name: item.material?.name || item.material,
          },
          manufacturingProcess: {
            name: item.process?.name || item.process,
          },
          files: [
            {
              originalName: item.part?.filename || 'file',
            },
          ],
        })),
        subtotal: quote.subtotal,
        tax: quote.tax,
        shipping: quote.shipping,
        total: quote.totalPrice,
        tenantId: quote.tenantId,
      },
      options: {
        includeItemDetails: true,
        language: 'en', // Could be determined from user preferences
      },
    });

    // For now, return a placeholder URL while the PDF is being generated
    // In production, you might want to implement a webhook or polling mechanism
    return {
      url: `${process.env.API_URL}/api/v1/quotes/${quoteId}/pdf/status?jobId=${job.id}`,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }
}
