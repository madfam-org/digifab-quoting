/**
 * Karafiel Compliance Integration
 *
 * Fires a CFDI (MX digital tax receipt) + NOM-151 stamping request at
 * Karafiel's PAC-backed API when a Cotiza quote transitions to ORDERED.
 * Karafiel sits behind Janua OIDC, so this is a service-to-service call
 * authenticated with a Janua-minted bearer token.
 *
 * Fire-and-forget — CFDI stamping is slow (multi-second PAC round-trips)
 * and must never block the post-payment flow. On transient errors we
 * log at warn level; staff can re-issue from the Karafiel UI.
 *
 * Environment:
 *   KARAFIEL_API_URL           Base URL (e.g. https://karafiel.madfam.io)
 *   KARAFIEL_SERVICE_TOKEN     Janua-minted bearer token (JWT)
 *   KARAFIEL_EMISOR_RFC        MADFAM's issuing RFC (fallback when tenant
 *                              branding doesn't carry one)
 *   KARAFIEL_CREDENTIAL_ID     Karafiel-side credential (CSD / PAC)
 *                              identifier for the emisor
 *   KARAFIEL_WEBHOOK_TIMEOUT   HTTP timeout in ms (default: 15000)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface KarafielConcepto {
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  importe: number;
  clave_prod_serv?: string;
  clave_unidad?: string;
  unidad?: string;
}

export interface KarafielImpuesto {
  tipo: 'traslado' | 'retencion';
  impuesto: string; // 002 = IVA
  tasa: number;
  importe: number;
}

export interface KarafielIssueRequest {
  credential_id: string;
  emisor_rfc: string;
  receptor_rfc: string;
  tipo_comprobante: 'I' | 'E' | 'T' | 'N' | 'P';
  forma_pago: string;
  metodo_pago: string;
  moneda: string;
  conceptos: KarafielConcepto[];
  impuestos?: KarafielImpuesto[];
  total: number;
  subtotal: number;
  external_reference?: string;
  metadata?: Record<string, unknown>;
}

export interface KarafielIssueContext {
  quoteId: string;
  quoteNumber: string;
  receptorRfc: string;
  emisorRfc?: string;
  credentialId?: string;
  subtotal: number;
  total: number;
  moneda: string;
  items: Array<{
    descripcion: string;
    cantidad: number;
    valor_unitario: number;
    importe: number;
  }>;
  impuestos?: KarafielImpuesto[];
  formaPago?: string;
  metodoPago?: string;
  metadata?: Record<string, unknown>;
}

// -----------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------

@Injectable()
export class KarafielComplianceService {
  private readonly logger = new Logger(KarafielComplianceService.name);
  private readonly apiUrl: string;
  private readonly serviceToken: string;
  private readonly defaultEmisorRfc: string;
  private readonly defaultCredentialId: string;
  private readonly timeout: number;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>('KARAFIEL_API_URL', '');
    this.serviceToken = this.config.get<string>('KARAFIEL_SERVICE_TOKEN', '');
    this.defaultEmisorRfc = this.config.get<string>('KARAFIEL_EMISOR_RFC', '');
    this.defaultCredentialId = this.config.get<string>(
      'KARAFIEL_CREDENTIAL_ID',
      '',
    );
    this.timeout = this.config.get<number>('KARAFIEL_WEBHOOK_TIMEOUT', 15000);
  }

  // Resolve the receptor RFC from quote/tenant metadata. Returns null
  // when absent — caller should skip issuance.
  resolveReceptorRfc(
    quoteMetadata: Record<string, unknown> | null | undefined,
    tenantSettings?: Record<string, unknown> | null,
  ): string | null {
    const fromQuote = quoteMetadata?.receptorRfc;
    if (typeof fromQuote === 'string' && fromQuote.length > 0) return fromQuote;

    const fromTenant = tenantSettings?.receptorRfc;
    if (typeof fromTenant === 'string' && fromTenant.length > 0) {
      return fromTenant;
    }
    return null;
  }

  async issueCfdi(ctx: KarafielIssueContext): Promise<void> {
    if (!this.apiUrl || !this.serviceToken) {
      this.logger.debug(
        'Karafiel CFDI skipped: KARAFIEL_API_URL or KARAFIEL_SERVICE_TOKEN not configured',
      );
      return;
    }

    if (!ctx.receptorRfc) {
      this.logger.warn(
        'Karafiel CFDI skipped: receptor_rfc missing for quote=%s',
        ctx.quoteId,
      );
      return;
    }

    const emisorRfc = ctx.emisorRfc || this.defaultEmisorRfc;
    const credentialId = ctx.credentialId || this.defaultCredentialId;
    if (!emisorRfc || !credentialId) {
      this.logger.warn(
        'Karafiel CFDI skipped: emisor_rfc or credential_id not resolved for quote=%s',
        ctx.quoteId,
      );
      return;
    }

    const payload: KarafielIssueRequest = {
      credential_id: credentialId,
      emisor_rfc: emisorRfc,
      receptor_rfc: ctx.receptorRfc,
      tipo_comprobante: 'I',
      forma_pago: ctx.formaPago ?? '03', // 03 = transferencia electrónica
      metodo_pago: ctx.metodoPago ?? 'PUE', // PUE = pago en una exhibición
      moneda: ctx.moneda,
      conceptos: ctx.items.map((it) => ({
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        valor_unitario: it.valor_unitario,
        importe: it.importe,
      })),
      impuestos: ctx.impuestos,
      subtotal: ctx.subtotal,
      total: ctx.total,
      external_reference: ctx.quoteNumber,
      metadata: {
        quote_id: ctx.quoteId,
        quote_number: ctx.quoteNumber,
        source: 'cotiza',
        ...(ctx.metadata ?? {}),
      },
    };

    const url = `${this.apiUrl.replace(/\/$/, '')}/api/v1/cfdi/issue/`;
    const body = JSON.stringify(payload);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.serviceToken}`,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await safeText(response);
        this.logger.warn(
          'Karafiel CFDI issue returned %d for quote=%s: %s',
          response.status,
          ctx.quoteId,
          text,
        );
        return;
      }

      const parsed = await safeJson(response);
      const pacUuid =
        (parsed && (parsed.uuid || parsed.pac_uuid || parsed.folio_fiscal)) ??
        '(unknown)';
      this.logger.log(
        'Karafiel CFDI issued: quote=%s pac_uuid=%s',
        ctx.quoteId,
        pacUuid,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Karafiel CFDI issue failed (quote=%s): %s',
        ctx.quoteId,
        msg,
      );
    }
  }
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '(no body)';
  }
}

async function safeJson(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
