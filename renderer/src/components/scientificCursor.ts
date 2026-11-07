import { isScientificSourceGeneration, matchesScientificSourceGeneration, normalizeAdapterFrame, KERNEL_WORKSPACE_MODULES,
  type AdapterFrame, type KernelWorkspaceModule, type ScientificSourceGeneration } from "@math3d/core";

export type ScientificCursor = Readonly<{
  kind: "quantum";
  runId: string;
  resultSha256: string;
  datasetId: string;
  reciprocalPoint?: Readonly<{ k: readonly [number, number]; basisId: string; bandId?: string; sampleIndex: number }>;
  spatialPoint?: Readonly<{ xyz: readonly [number, number, number]; coordinateSystemId: string }>;
  timePoint?: Readonly<{ value: number; unit: string; frameId: string; sampleIndex: number }>;
  originViewId: string;
  sequence: number;
}>;

/** Project coordinates are transient; saved selections remain owned by the Project contract. */
export type ProjectScientificCursor = Readonly<{
  kind: "project";
  source: ScientificSourceGeneration;
  sourceModule: KernelWorkspaceModule;
  frame: AdapterFrame;
  position: readonly number[];
  resourceSha256: string | null;
  mode: "hover" | "locked";
  originViewId: string;
  sequence: number;
}>;
type CursorDraft = Omit<ScientificCursor, "kind" | "sequence">;
export type ProjectCursorDraft = Omit<ProjectScientificCursor, "kind" | "sequence">;
export type ScientificCursorEvent = ScientificCursor | ProjectScientificCursor;
type Listener = (cursor: ScientificCursorEvent) => void;

/** One owner allocates sequence numbers. Subscribers never republish projected selections. */
export class ScientificCursorBus {
  private current: ScientificCursorEvent | null = null;
  private sequence = 0;
  private listeners = new Set<Listener>();

  publish(draft: CursorDraft): ScientificCursor {
    if (!draft.runId || !/^[a-f0-9]{64}$/.test(draft.resultSha256) || !draft.datasetId || !draft.originViewId ||
        Number(draft.reciprocalPoint !== undefined) + Number(draft.spatialPoint !== undefined) +
        Number(draft.timePoint !== undefined) !== 1)
      throw new TypeError("Invalid scientific cursor identity or coordinates.");
    const coordinates = draft.reciprocalPoint?.k ?? draft.spatialPoint?.xyz ??
      (draft.timePoint ? [draft.timePoint.value] : undefined);
    if (!coordinates || coordinates.length !== (draft.spatialPoint ? 3 : 1 + Number(Boolean(draft.reciprocalPoint))) ||
        !coordinates.every(Number.isFinite) ||
        draft.reciprocalPoint && (!draft.reciprocalPoint.basisId ||
          !Number.isSafeInteger(draft.reciprocalPoint.sampleIndex) || draft.reciprocalPoint.sampleIndex < 0 ||
          draft.reciprocalPoint.bandId === "") ||
        draft.spatialPoint && !draft.spatialPoint.coordinateSystemId || draft.timePoint &&
        (!draft.timePoint.unit || !draft.timePoint.frameId || !Number.isSafeInteger(draft.timePoint.sampleIndex) || draft.timePoint.sampleIndex < 0))
      throw new TypeError("Scientific cursor coordinates must be finite.");
    const cursor: ScientificCursor = { ...structuredClone(draft), kind: "quantum", sequence: ++this.sequence };
    this.current = cursor;
    for (const listener of this.listeners) listener(cursor);
    return cursor;
  }

  publishProject(draft: ProjectCursorDraft, currentSource: ScientificSourceGeneration | null): ProjectScientificCursor {
    if (!isScientificSourceGeneration(draft.source) || !currentSource ||
        !isScientificSourceGeneration(currentSource) ||
        !matchesScientificSourceGeneration(draft.source, currentSource) ||
        !normalizeAdapterFrame(draft.frame).ok ||
        !Array.isArray(draft.position) || draft.position.length !== draft.frame.axes.length ||
        !draft.position.every(value => Number.isFinite(value) && Math.abs(value) <= 1e12) ||
        !/^[A-Za-z0-9._:-]{1,160}$/.test(draft.originViewId) ||
        !KERNEL_WORKSPACE_MODULES.includes(draft.sourceModule) ||
        !["hover", "locked"].includes(draft.mode) ||
        !(draft.resourceSha256 === null || /^[a-f0-9]{64}$/.test(draft.resourceSha256)))
      throw new TypeError("Project cursor requires a current source, declared frame, and finite coordinates.");
    const cursor: ProjectScientificCursor = { ...structuredClone(draft), kind: "project", sequence: ++this.sequence };
    this.current = cursor;
    for (const listener of this.listeners) listener(cursor);
    return cursor;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.current) listener(this.current);
    return () => { this.listeners.delete(listener); };
  }

  snapshot(): ScientificCursorEvent | null { return this.current; }
}

export const scientificCursorBus = new ScientificCursorBus();

export type CursorProjection<T> = Readonly<{ status: "matched"; value: T } | {
  status: "outside" | "ambiguous" | "mismatched-grid" | "incompatible-source";
  reason: string;
}>;

/** Exact regular-grid projection; half-way ties are exposed instead of silently rounded. */
export function projectSpatialCursor(cursor: ScientificCursor, target: Readonly<{
  runId: string; resultSha256: string; coordinateSystemId: string;
  shape: readonly [number, number, number]; origin: readonly [number, number, number]; spacing: readonly [number, number, number];
}>): CursorProjection<[number, number, number]> {
  if (cursor.runId !== target.runId || cursor.resultSha256 !== target.resultSha256 ||
      cursor.spatialPoint?.coordinateSystemId !== target.coordinateSystemId)
    return { status: "incompatible-source", reason: "Run, result or coordinate system differs." };
  const grid: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const step = target.spacing[axis];
    if (!Number.isFinite(step) || step <= 0) return { status: "mismatched-grid", reason: "Invalid target grid spacing." };
    const fractional = (cursor.spatialPoint.xyz[axis] - target.origin[axis]) / step;
    if (fractional < -1e-8 || fractional > target.shape[axis] - 1 + 1e-8)
      return { status: "outside", reason: "Point is outside the target grid." };
    if (Math.abs(fractional - Math.floor(fractional) - 0.5) < 1e-8)
      return { status: "ambiguous", reason: "Point is equally close to two grid samples." };
    const nearest = Math.round(fractional);
    if (Math.abs(fractional - nearest) > 1e-7)
      return { status: "mismatched-grid", reason: "Point is not an exact sample on the target grid." };
    grid.push(nearest);
  }
  return { status: "matched", value: grid as [number, number, number] };
}

export function projectQwzCursor(cursor: ScientificCursor, target: Readonly<{
  runId: string; resultSha256: string; basisId: string; sampleCount: number;
  sample: Readonly<{ index: number; k: readonly [number, number] }>;
}>): CursorProjection<number> {
  const point = cursor.reciprocalPoint;
  if (!point || cursor.runId !== target.runId || cursor.resultSha256 !== target.resultSha256 ||
      point.basisId !== target.basisId)
    return { status: "incompatible-source", reason: "Run, result or reciprocal basis differs." };
  if (point.sampleIndex < 0 || point.sampleIndex >= target.sampleCount ||
      target.sample.index !== point.sampleIndex)
    return { status: "mismatched-grid", reason: "Sample indices do not align." };
  if (Math.abs(point.k[0] - target.sample.k[0]) > 1e-8 ||
      Math.abs(point.k[1] - target.sample.k[1]) > 1e-8)
    return { status: "mismatched-grid", reason: "Physical k coordinates do not align." };
  return { status: "matched", value: point.sampleIndex };
}

/** Exact physical-time projection; irregular grids are never silently interpolated. */
export function projectTimeCursor(cursor: ScientificCursor, target: Readonly<{
  runId: string; resultSha256: string; unit: string; frameIds: readonly string[]; values: readonly number[];
}>): CursorProjection<number> {
  const point = cursor.timePoint;
  if (!point || cursor.runId !== target.runId || cursor.resultSha256 !== target.resultSha256 || point.unit !== target.unit)
    return { status: "incompatible-source", reason: "Run, result or physical time unit differs." };
  const index = target.frameIds.indexOf(point.frameId);
  if (index >= 0 && Math.abs(target.values[index] - point.value) <= 1e-10)
    return { status: "matched", value: index };
  const matches = target.values.flatMap((value, i) => Math.abs(value - point.value) <= 1e-10 ? [i] : []);
  if (matches.length > 1) return { status: "ambiguous", reason: "Multiple frames share this physical time." };
  return matches.length === 1 ? { status: "matched", value: matches[0] } :
    { status: "mismatched-grid", reason: "No exact physical time sample exists in the target timeline." };
}
