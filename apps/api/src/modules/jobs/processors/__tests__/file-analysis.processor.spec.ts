import { of, throwError } from 'rxjs';
import { FileAnalysisProcessor } from '../file-analysis.processor';
import { FileAnalysisJobData } from '../../interfaces/job.interface';

/**
 * Regression coverage for the worker `/analyze` contract drift: the processor
 * must POST to the worker's real route/shape, map the worker's real response
 * (`metrics.volume_cm3` ...) so `FileAnalysis.volume` is populated, and fail
 * loudly (rather than persisting a fabricated no-geometry row) on worker
 * errors or malformed responses.
 */
describe('FileAnalysisProcessor', () => {
  const PRESIGNED_URL = 'https://s3.example.com/presigned?sig=abc';

  const validWorkerResponse = {
    metrics: {
      volume_cm3: 42.5,
      surface_area_cm2: 120.25,
      bbox_mm: { x: 30, y: 20, z: 10 },
      triangle_count: 15000,
      is_watertight: true,
    },
    issues: [
      {
        type: 'thin_wall',
        severity: 'high',
        description: 'Wall thinner than 1mm',
        location: 'top face',
      },
    ],
    risk_score: 50,
    processing_time_ms: 1234,
    cached: false,
  };

  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let filesService: { getFileUrl: jest.Mock; downloadFile: jest.Mock };
  let httpService: { post: jest.Mock };
  let configService: { get: jest.Mock };
  let fileAnalysisCreate: jest.Mock;
  let fileUpdate: jest.Mock;
  let prisma: { $transaction: jest.Mock };

  function makeJob(): jest.Mocked<any> {
    const data: FileAnalysisJobData = {
      tenantId: 'tenant-1',
      fileId: 'file-1',
      fileUrl: 'uploads/tenant-1/model.stl',
      fileName: 'model.stl',
      fileType: 'stl',
      analysisOptions: {
        performDfm: true,
        extractGeometry: true,
        calculateVolume: true,
        detectFeatures: true,
      },
    };
    return {
      id: 'job-1',
      data,
      progress: jest.fn(() => ({ percentage: 30 })),
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<any>;
  }

  function buildProcessor(): FileAnalysisProcessor {
    return new FileAnalysisProcessor(
      logger as never,
      prisma as never,
      filesService as never,
      httpService as never,
      configService as never,
    );
  }

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    filesService = {
      getFileUrl: jest.fn().mockResolvedValue(PRESIGNED_URL),
      downloadFile: jest.fn(),
    };
    httpService = { post: jest.fn() };
    // Large progress interval so the internal setInterval never fires in tests.
    configService = {
      get: jest.fn((key: string, def?: unknown) => {
        if (key === 'FILE_ANALYSIS_PROGRESS_INTERVAL_MS') return 1_000_000;
        return def;
      }),
    };

    fileAnalysisCreate = jest.fn().mockResolvedValue({});
    fileUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      file: {
        update: fileUpdate,
        findUnique: jest.fn().mockResolvedValue({ metadata: {} }),
      },
      fileAnalysis: { create: fileAnalysisCreate },
    };
    prisma = {
      $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
  });

  it('POSTs the worker real contract and persists volume on success', async () => {
    httpService.post.mockReturnValue(of({ data: validWorkerResponse }));
    const processor = buildProcessor();

    const result = await processor.handleFileAnalysis(makeJob());

    // Correct route (NOT /api/v1/analyze) and JSON body with file_url.
    expect(httpService.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = httpService.post.mock.calls[0];
    expect(url).toBe('http://localhost:8000/analyze');
    expect(body).toMatchObject({
      file_url: PRESIGNED_URL,
      file_type: 'stl',
      process_type: '3d_fff',
      job_id: 'job-1',
    });
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(filesService.downloadFile).not.toHaveBeenCalled();

    // Geometry mapped from metrics.* and persisted so pricing can read volume.
    expect(result.success).toBe(true);
    expect(fileAnalysisCreate).toHaveBeenCalledTimes(1);
    const created = fileAnalysisCreate.mock.calls[0][0].data;
    expect(created.volume).toBe(42.5);
    expect(created.surfaceArea).toBe(120.25);
    expect(created.boundingBoxX).toBe(30);
    expect(created.boundingBoxY).toBe(20);
    expect(created.boundingBoxZ).toBe(10);
    expect(created.triangleCount).toBe(15000);
    // risk_score 50 -> dfmScore 50 (higher = better); high issue -> not manufacturable.
    expect(created.dfmScore).toBe(50);
    expect(created.manufacturable).toBe(false);
    expect(created.dfmIssues[0]).toMatchObject({ severity: 'critical', type: 'thin_wall' });
  });

  it('fails explicitly (no fabricated row) when the worker call errors', async () => {
    httpService.post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));
    const processor = buildProcessor();

    const result = await processor.handleFileAnalysis(makeJob());

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('FILE_ANALYSIS_FAILED');
    // No silent no-geometry fallback: nothing is persisted.
    expect(fileAnalysisCreate).not.toHaveBeenCalled();
    expect(fileUpdate).not.toHaveBeenCalled();
  });

  it('fails loudly on a malformed / drifted response shape', async () => {
    // Old-style payload the processor used to (mis)read: geometry/dfm_analysis.
    httpService.post.mockReturnValue(
      of({ data: { geometry: {}, dfm_analysis: { score: 100 }, features: {} } }),
    );
    const processor = buildProcessor();

    const result = await processor.handleFileAnalysis(makeJob());

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('unexpected response shape');
    expect(fileAnalysisCreate).not.toHaveBeenCalled();
  });
});
