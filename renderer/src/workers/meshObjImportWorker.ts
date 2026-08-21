/// <reference lib="webworker" />

import type {
  MeshObjImportWorkerFallback,
  MeshObjImportWorkerRequest,
  MeshObjImportWorkerResponse,
  MeshObjImportWorkerSuccess,
} from "./meshObjImportTypes";

const ctx = self as DedicatedWorkerGlobalScope;

const parseObjIndex = (raw: string, vertexCount: number): number | null => {
  if (raw.trim().startsWith("-")) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  const index = parsed < 0 ? vertexCount + parsed : parsed - 1;
  return index >= 0 && index < vertexCount ? index : null;
};

const parseSimpleObj = (
  text: string
):
  | {
      ok: true;
      positions: Float32Array;
      indices: Uint32Array;
      vertexCount: number;
      triangleCount: number;
      timings: Omit<MeshObjImportWorkerSuccess["timings"], "decodeMs" | "totalMs">;
    }
  | {
      ok: false;
      reason: string;
      timings: Omit<MeshObjImportWorkerFallback["timings"], "decodeMs" | "totalMs">;
    } => {
  const positions: number[] = [];
  const indices: number[] = [];
  let sawFace = false;
  let detectMs = 0;
  let vertexParseMs = 0;
  let faceParseMs = 0;
  let indexBuildMs = 0;

  const fail = (reason: string) => ({
    ok: false as const,
    reason,
    timings: { detectMs, vertexParseMs, faceParseMs, indexBuildMs },
  });

  for (const rawLine of text.split(/\r?\n/)) {
    const detectStart = performance.now();
    const commentAt = rawLine.indexOf("#");
    const line = (commentAt >= 0 ? rawLine.slice(0, commentAt) : rawLine).trim();
    if (!line) {
      detectMs += performance.now() - detectStart;
      continue;
    }
    const recordType = line.split(/\s+/, 1)[0] ?? "";
    detectMs += performance.now() - detectStart;

    if (recordType === "v") {
      const vertexStart = performance.now();
      const parts = line.split(/\s+/);
      if (parts.length < 4) return fail("vertex record has fewer than 3 coordinates");
      const x = Number.parseFloat(parts[1] ?? "");
      const y = Number.parseFloat(parts[2] ?? "");
      const z = Number.parseFloat(parts[3] ?? "");
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return fail("vertex record contains a non-finite coordinate");
      }
      positions.push(x, y, z);
      vertexParseMs += performance.now() - vertexStart;
      continue;
    }

    if (recordType === "f") {
      const faceStart = performance.now();
      sawFace = true;
      const vertexCount = Math.floor(positions.length / 3);
      const tokens = line.split(/\s+/).slice(1);
      if (tokens.length < 3) return fail("face record has fewer than 3 vertices");
      const face: number[] = [];
      for (const token of tokens) {
        if (!token || token.includes("/")) return fail("face record uses OBJ slash vertex references");
        const index = parseObjIndex(token, vertexCount);
        if (index == null) return fail("face record contains an unsupported index");
        face.push(index);
      }
      faceParseMs += performance.now() - faceStart;
      const indexStart = performance.now();
      for (let i = 1; i + 1 < face.length; i += 1) {
        indices.push(face[0] as number, face[i] as number, face[i + 1] as number);
      }
      indexBuildMs += performance.now() - indexStart;
      continue;
    }

    if (recordType === "vt" || recordType === "vn") {
      return fail(`OBJ ${recordType} records require the general loader`);
    }

    return fail(`unsupported OBJ record: ${recordType || "blank"}`);
  }

  if (!sawFace || positions.length < 9 || indices.length < 3) {
    return fail("OBJ did not contain enough simple vertex/face data");
  }

  return {
    ok: true,
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    vertexCount: Math.floor(positions.length / 3),
    triangleCount: Math.floor(indices.length / 3),
    timings: { detectMs, vertexParseMs, faceParseMs, indexBuildMs },
  };
};

ctx.onmessage = (event: MessageEvent<MeshObjImportWorkerRequest>) => {
  const message = event.data;
  if (!message || message.type !== "parse-simple-obj") return;
  const workerStartedAt = performance.now();
  const decodeStart = performance.now();
  const text = new TextDecoder().decode(message.buffer);
  const decodeMs = performance.now() - decodeStart;
  const parsed = parseSimpleObj(text);
  const workerFinishedAt = performance.now();
  const base = {
    jobId: message.jobId,
    label: message.label,
    sentAt: message.sentAt,
    workerStartedAt,
    workerFinishedAt,
  };
  const timings = {
    decodeMs,
    ...parsed.timings,
    totalMs: workerFinishedAt - workerStartedAt,
  };

  if (!parsed.ok) {
    const response: MeshObjImportWorkerFallback = {
      type: "simple-obj-fallback",
      ...base,
      reason: parsed.reason,
      timings,
    };
    ctx.postMessage(response satisfies MeshObjImportWorkerResponse);
    return;
  }

  const response: MeshObjImportWorkerSuccess = {
    type: "simple-obj-ready",
    ...base,
    positions: parsed.positions,
    indices: parsed.indices,
    vertexCount: parsed.vertexCount,
    triangleCount: parsed.triangleCount,
    timings,
  };
  ctx.postMessage(response satisfies MeshObjImportWorkerResponse, [
    response.positions.buffer,
    response.indices.buffer,
  ]);
};
