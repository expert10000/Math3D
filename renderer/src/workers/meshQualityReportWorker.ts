/// <reference lib="webworker" />

import {
  computeMeshQualityReport,
  type MeshQualityReport,
  type MeshQualityReportPhase,
} from "../mesh/meshQualityReport";

type ComputeRequest = {
  type: "compute";
  jobId: string;
  positions: Float32Array;
  indices: Uint32Array | null;
  highAspectRatioThreshold: number;
  maxListedDefects: number;
};

type ProgressMessage = {
  type: "progress";
  jobId: string;
  phase: MeshQualityReportPhase;
  progress: number;
};

type ResultMessage =
  | {
      type: "result";
      jobId: string;
      ok: true;
      report: MeshQualityReport;
    }
  | {
      type: "result";
      jobId: string;
      ok: false;
      error: string;
    };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const asFloat32 = (value: Float32Array): Float32Array =>
  value instanceof Float32Array ? value : new Float32Array(value as unknown as ArrayLike<number>);

const asUint32OrNull = (value: Uint32Array | null): Uint32Array | null => {
  if (!value) return null;
  return value instanceof Uint32Array ? value : new Uint32Array(value as unknown as ArrayLike<number>);
};

const postProgress = (msg: ProgressMessage) => {
  ctx.postMessage(msg);
};

const postResult = (msg: ResultMessage) => {
  ctx.postMessage(msg);
};

ctx.onmessage = (event: MessageEvent<ComputeRequest>) => {
  const req = event.data;
  if (!req || req.type !== "compute" || typeof req.jobId !== "string" || !req.jobId) return;
  try {
    const positions = asFloat32(req.positions);
    const indices = asUint32OrNull(req.indices);
    const report = computeMeshQualityReport(
      {
        positions,
        indices,
      },
      {
        highAspectRatioThreshold: req.highAspectRatioThreshold,
        maxListedDefects: req.maxListedDefects,
        onProgress: (progressEvent) => {
          postProgress({
            type: "progress",
            jobId: req.jobId,
            phase: progressEvent.phase,
            progress: progressEvent.progress,
          });
        },
      }
    );
    postResult({
      type: "result",
      jobId: req.jobId,
      ok: true,
      report,
    });
  } catch (error: any) {
    postResult({
      type: "result",
      jobId: req.jobId,
      ok: false,
      error: String(error?.message ?? error ?? "Failed to compute mesh quality report."),
    });
  }
};

