import { z } from 'zod';

/**
 * Single source of truth for the contract between the NestJS
 * {@link FileAnalysisProcessor} (consumer) and the Python FastAPI geometry
 * worker (producer).
 *
 * The worker serves `POST /analyze` and expects a JSON body shaped like
 * {@link WorkerAnalyzeRequest} (it downloads the file itself from `file_url`).
 * It responds with {@link workerAnalyzeResponseSchema}:
 * `{ metrics, issues, risk_score, processing_time_ms, cached }` where
 * `metrics` carries `volume_cm3` / `surface_area_cm2` / `bbox_mm`.
 *
 * These names mirror the worker's pydantic models exactly
 * (apps/worker/main.py `GeometryAnalysisRequest` / `GeometryAnalysisResponse`).
 * Keep this file and those models in lockstep — the response schema is
 * validated at runtime so any drift throws loudly instead of silently
 * degrading to a no-geometry analysis.
 */

/** Request body accepted by the worker's `POST /analyze` route. */
export interface WorkerAnalyzeRequest {
  file_url: string;
  file_type: string;
  process_type: string;
  options: Record<string, unknown>;
  job_id?: string;
}

/** Worker route path (relative to `WORKER_SERVICE_URL`). */
export const WORKER_ANALYZE_PATH = '/analyze';

const workerBoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const workerMetricsSchema = z.object({
  volume_cm3: z.number(),
  surface_area_cm2: z.number(),
  bbox_mm: workerBoundingBoxSchema,
  length_cut_mm: z.number().nullish(),
  holes_count: z.number().nullish(),
  overhang_area: z.number().nullish(),
  wall_thickness_min: z.number().nullish(),
  wall_thickness_avg: z.number().nullish(),
  triangle_count: z.number().nullish(),
  is_watertight: z.boolean().nullish(),
});

const workerIssueSchema = z.object({
  type: z.string(),
  severity: z.string(),
  description: z.string(),
  location: z.string().nullish(),
});

export const workerAnalyzeResponseSchema = z.object({
  metrics: workerMetricsSchema,
  issues: z.array(workerIssueSchema).default([]),
  risk_score: z.number(),
  processing_time_ms: z.number().nullish(),
  cached: z.boolean().nullish(),
});

export type WorkerAnalyzeResponse = z.infer<typeof workerAnalyzeResponseSchema>;
export type WorkerAnalyzeMetrics = z.infer<typeof workerMetricsSchema>;
export type WorkerAnalyzeIssue = z.infer<typeof workerIssueSchema>;

/**
 * Parse and validate a raw worker response. Throws a descriptive error when
 * the payload does not match the agreed contract so a future producer/consumer
 * drift surfaces loudly (job failure) rather than being masked as a
 * no-geometry success.
 */
export function parseWorkerAnalyzeResponse(raw: unknown): WorkerAnalyzeResponse {
  const parsed = workerAnalyzeResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(
      `Worker ${WORKER_ANALYZE_PATH} returned an unexpected response shape: ${issues}`,
    );
  }
  return parsed.data;
}

const PROCESS_TYPE_BY_FORMAT: Record<string, string> = {
  stl: '3d_fff',
  obj: '3d_fff',
  '3mf': '3d_fff',
  step: 'cnc_3axis',
  stp: 'cnc_3axis',
  iges: 'cnc_3axis',
  igs: 'cnc_3axis',
  dxf: 'laser_2d',
  dwg: 'laser_2d',
  svg: 'laser_2d',
};

/**
 * The worker requires a `process_type` to select DFM checks. Core geometry
 * metrics (volume/surface/bbox) are computed regardless of it, so when the
 * enqueuing code has not chosen a process yet we derive a sensible default
 * from the file format. An explicit `processType` in the options wins.
 */
export function deriveProcessType(
  fileType: string,
  options?: Record<string, unknown> | null,
): string {
  const explicit = options?.processType;
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit;
  }
  return PROCESS_TYPE_BY_FORMAT[fileType.toLowerCase()] ?? '3d_fff';
}

/** Map the worker's `low|medium|high` severity to the FileAnalysis scale. */
export function mapSeverity(severity: string): 'critical' | 'warning' | 'info' {
  switch (severity.toLowerCase()) {
    case 'high':
      return 'critical';
    case 'medium':
      return 'warning';
    default:
      return 'info';
  }
}
