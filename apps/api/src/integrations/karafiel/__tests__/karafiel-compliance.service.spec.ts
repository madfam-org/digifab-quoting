import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KarafielComplianceService, KarafielIssueContext } from '../karafiel-compliance.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const API_URL = 'https://karafiel.madfam.io';
const SERVICE_TOKEN = 'test.janua.jwt.token';
const EMISOR_RFC = 'MAD010101ABC';
const CREDENTIAL_ID = 'cred-test-001';

function mockConfigService(overrides: Record<string, unknown> = {}): Partial<ConfigService> {
  const defaults: Record<string, unknown> = {
    KARAFIEL_API_URL: API_URL,
    KARAFIEL_SERVICE_TOKEN: SERVICE_TOKEN,
    KARAFIEL_EMISOR_RFC: EMISOR_RFC,
    KARAFIEL_CREDENTIAL_ID: CREDENTIAL_ID,
    KARAFIEL_WEBHOOK_TIMEOUT: 15000,
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      return key in defaults ? defaults[key] : fallback;
    }),
  };
}

function sampleContext(overrides: Partial<KarafielIssueContext> = {}): KarafielIssueContext {
  return {
    quoteId: 'quote-abc',
    quoteNumber: 'Q-2026-04-0001',
    receptorRfc: 'XAXX010101000',
    subtotal: 1000,
    total: 1160,
    moneda: 'MXN',
    items: [
      {
        descripcion: 'CNC milling — aluminum bracket',
        cantidad: 10,
        valor_unitario: 100,
        importe: 1000,
      },
    ],
    impuestos: [{ tipo: 'traslado', impuesto: '002', tasa: 0.16, importe: 160 }],
    ...overrides,
  };
}

async function buildService(
  overrides: Record<string, unknown> = {},
): Promise<KarafielComplianceService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      KarafielComplianceService,
      { provide: ConfigService, useValue: mockConfigService(overrides) },
    ],
  }).compile();
  return module.get<KarafielComplianceService>(KarafielComplianceService);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KarafielComplianceService', () => {
  let service: KarafielComplianceService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    service = await buildService();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('OK'),
      json: jest.fn().mockResolvedValue({ uuid: 'pac-uuid-1234', status: 'stamped' }),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  // ---------- resolveReceptorRfc ----------

  describe('resolveReceptorRfc', () => {
    it('prefers quote metadata receptorRfc when present', () => {
      expect(service.resolveReceptorRfc({ receptorRfc: 'ABC010101XYZ' }, null)).toBe(
        'ABC010101XYZ',
      );
    });

    it('falls back to tenant settings when quote metadata lacks the field', () => {
      expect(service.resolveReceptorRfc({}, { receptorRfc: 'TEN010101XYZ' })).toBe('TEN010101XYZ');
    });

    it('returns null when neither source has a non-empty string', () => {
      expect(service.resolveReceptorRfc(null, null)).toBeNull();
      expect(service.resolveReceptorRfc(undefined, undefined)).toBeNull();
      expect(service.resolveReceptorRfc({ receptorRfc: '' }, {})).toBeNull();
      expect(service.resolveReceptorRfc({ receptorRfc: 42 as unknown as string }, null)).toBeNull();
    });
  });

  // ---------- issueCfdi ----------

  describe('issueCfdi', () => {
    it('POSTs to /api/v1/cfdi/issue/ with bearer token and the right body shape', async () => {
      const ctx = sampleContext();
      await service.issueCfdi(ctx);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${API_URL}/api/v1/cfdi/issue/`);
      expect((init as RequestInit).method).toBe('POST');

      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe(`Bearer ${SERVICE_TOKEN}`);

      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toMatchObject({
        credential_id: CREDENTIAL_ID,
        emisor_rfc: EMISOR_RFC,
        receptor_rfc: 'XAXX010101000',
        tipo_comprobante: 'I',
        moneda: 'MXN',
        subtotal: 1000,
        total: 1160,
        external_reference: 'Q-2026-04-0001',
      });
      expect(body.conceptos).toHaveLength(1);
      expect(body.conceptos[0]).toMatchObject({
        descripcion: 'CNC milling — aluminum bracket',
        cantidad: 10,
        valor_unitario: 100,
        importe: 1000,
      });
      expect(body.impuestos[0]).toMatchObject({ tipo: 'traslado', tasa: 0.16 });
      expect(body.metadata).toMatchObject({
        quote_id: 'quote-abc',
        quote_number: 'Q-2026-04-0001',
        source: 'cotiza',
      });
    });

    it('defaults forma_pago=03 and metodo_pago=PUE when not provided', async () => {
      await service.issueCfdi(sampleContext());
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.forma_pago).toBe('03');
      expect(body.metodo_pago).toBe('PUE');
    });

    it('skips fetch when KARAFIEL_API_URL is unset', async () => {
      const s = await buildService({ KARAFIEL_API_URL: '' });
      await s.issueCfdi(sampleContext());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips fetch when KARAFIEL_SERVICE_TOKEN is unset', async () => {
      const s = await buildService({ KARAFIEL_SERVICE_TOKEN: '' });
      await s.issueCfdi(sampleContext());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips when receptor_rfc is missing (without throwing)', async () => {
      await expect(service.issueCfdi(sampleContext({ receptorRfc: '' }))).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('skips when both emisor_rfc and credential_id cannot be resolved', async () => {
      const s = await buildService({
        KARAFIEL_EMISOR_RFC: '',
        KARAFIEL_CREDENTIAL_ID: '',
      });
      await s.issueCfdi(sampleContext());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not throw on non-2xx response (fire-and-forget)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: jest.fn().mockResolvedValue('bad gateway'),
        json: jest.fn().mockResolvedValue(null),
      } as unknown as Response);

      await expect(service.issueCfdi(sampleContext())).resolves.toBeUndefined();
    });

    it('does not throw on fetch rejection (fire-and-forget)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(service.issueCfdi(sampleContext())).resolves.toBeUndefined();
    });
  });
});
