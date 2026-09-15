import {
  COMPLEX_COMMAND_TYPES,
  createComplexAnalysisDocument,
  parseComplexExpressionAst,
  type AnalysisArtifactHandle,
  type ComplexAnalysisDocument,
  type ComplexAnalysisStructuralSource,
  type ComplexBranchPolicy,
  type ScientificSourceGeneration,
} from "@math3d/core";
import { createInMemoryArtifactRegistry, type ArtifactResolution, type InMemoryArtifactRegistry } from "@math3d/kernel";
import { C, type Complex } from "./complex";
import { compileComplexExpressionAstPreview } from "./complexExpr";
import { ComplexAnalysisCommandAdapter } from "./complexCommandAdapter";

export const COMPLEX_PREVIEW_LAYERS = [
  "domain-coloring", "z-grid", "w-grid", "real", "imaginary", "modulus", "argument",
  "vector-field", "u-level-curves", "v-level-curves", "cauchy-riemann", "conformal-field",
  "path-mapping", "value-surface",
] as const;
export type ComplexPreviewLayer = (typeof COMPLEX_PREVIEW_LAYERS)[number];
export type ComplexPreviewQuality = "low" | "high";

export type ComplexPreviewBundle = Readonly<{
  source: ScientificSourceGeneration;
  quality: ComplexPreviewQuality;
  dimensions: Readonly<{ columns: number; rows: number }>;
  handles: Readonly<Record<ComplexPreviewLayer, AnalysisArtifactHandle>>;
  ignored: boolean;
  reason?: "stale-source";
}>;

export type ComplexPreviewMapSpec = Readonly<{
  inputMode: "reim" | "fz";
  fExpr: string;
  reExpr: string;
  imExpr: string;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  nu: number;
  nv: number;
  mapMode: "standard" | "riemann";
  sheetCount: number;
  sheetIndex: number;
  branchCutAngle: number;
}>;

const sourceGeneration = (document: ComplexAnalysisDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation: document.identity.revision,
});
const sameSource = (left: ScientificSourceGeneration, right: ScientificSourceGeneration) =>
  left.documentId === right.documentId && left.revision === right.revision && left.structuralHash === right.structuralHash && left.generation === right.generation;
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const bytesOf = (values: Float32Array): Uint8Array => new Uint8Array(values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength));

const dimensionsFor = (document: ComplexAnalysisDocument, quality: ComplexPreviewQuality) => {
  const cap = quality === "low" ? 32 : 256;
  let columns = Math.max(2, Math.min(cap, document.sampling.columns));
  let rows = Math.max(2, Math.min(cap, document.sampling.rows));
  const maximum = Math.min(document.sampling.maximumSamples, cap * cap);
  while (columns * rows > maximum && (columns > 2 || rows > 2)) {
    if (columns >= rows && columns > 2) columns -= 1;
    else if (rows > 2) rows -= 1;
  }
  return { columns, rows };
};

const sampleGrids = async (document: ComplexAnalysisDocument, quality: ComplexPreviewQuality) => {
  const dimensions = dimensionsFor(document, quality);
  const count = dimensions.columns * dimensions.rows;
  const u = new Float32Array(count);
  const v = new Float32Array(count);
  const re = new Float32Array(count);
  const im = new Float32Array(count);
  const compiled = compileComplexExpressionAstPreview(document.function.normalizedAst, document.function.allowedVariables);
  if (!compiled.fn) throw new TypeError(compiled.error?.message ?? "Complex preview AST could not be compiled.");
  for (let row = 0; row < dimensions.rows; row += 1) {
    if (row > 0 && row % 16 === 0) await nextFrame();
    const y = document.domain.im.min + (document.domain.im.max - document.domain.im.min) * row / Math.max(1, dimensions.rows - 1);
    for (let column = 0; column < dimensions.columns; column += 1) {
      const x = document.domain.re.min + (document.domain.re.max - document.domain.re.min) * column / Math.max(1, dimensions.columns - 1);
      const index = row * dimensions.columns + column;
      const value = compiled.fn({ z: C(x, y), u: x, v: y });
      u[index] = x; v[index] = y; re[index] = value.re; im[index] = value.im;
    }
  }
  const pair = (left: Float32Array, right: Float32Array) => {
    const values = new Float32Array(count * 2);
    for (let index = 0; index < count; index += 1) { values[index * 2] = left[index]!; values[index * 2 + 1] = right[index]!; }
    return values;
  };
  const scalar = (map: (real: number, imaginary: number, index: number) => number) => {
    const values = new Float32Array(count);
    for (let index = 0; index < count; index += 1) values[index] = map(re[index]!, im[index]!, index);
    return values;
  };
  const du = (document.domain.re.max - document.domain.re.min) / Math.max(1, dimensions.columns - 1);
  const dv = (document.domain.im.max - document.domain.im.min) / Math.max(1, dimensions.rows - 1);
  const derivative = (index: number) => {
    const row = Math.floor(index / dimensions.columns);
    const column = index % dimensions.columns;
    const left = row * dimensions.columns + Math.max(0, column - 1);
    const right = row * dimensions.columns + Math.min(dimensions.columns - 1, column + 1);
    const down = Math.max(0, row - 1) * dimensions.columns + column;
    const up = Math.min(dimensions.rows - 1, row + 1) * dimensions.columns + column;
    return {
      ux: (re[right]! - re[left]!) / Math.max(du, 1e-12) / (right === left ? 1 : column > 0 && column < dimensions.columns - 1 ? 2 : 1),
      uy: (re[up]! - re[down]!) / Math.max(dv, 1e-12) / (up === down ? 1 : row > 0 && row < dimensions.rows - 1 ? 2 : 1),
      vx: (im[right]! - im[left]!) / Math.max(du, 1e-12) / (right === left ? 1 : column > 0 && column < dimensions.columns - 1 ? 2 : 1),
      vy: (im[up]! - im[down]!) / Math.max(dv, 1e-12) / (up === down ? 1 : row > 0 && row < dimensions.rows - 1 ? 2 : 1),
    };
  };
  const cr = new Float32Array(count * 2);
  const conformal = new Float32Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    const d = derivative(index);
    cr[index * 2] = d.ux - d.vy; cr[index * 2 + 1] = d.uy + d.vx;
    conformal[index * 2] = Math.hypot(d.ux, d.vx); conformal[index * 2 + 1] = Math.atan2(d.vx, d.ux);
  }
  const paths = document.contours.flatMap((contour) => contour.points);
  const pathValues = new Float32Array(paths.length * 4);
  paths.forEach((point, index) => {
    const value = compiled.fn!({ z: C(point.re, point.im), u: point.re, v: point.im });
    pathValues.set([point.re, point.im, value.re, value.im], index * 4);
  });
  const valueSurface = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) valueSurface.set([u[index]!, v[index]!, re[index]!], index * 3);
  return { dimensions, layers: {
    "domain-coloring": pair(scalar((real, imaginary) => Math.atan2(imaginary, real)), scalar((real, imaginary) => Math.log1p(Math.hypot(real, imaginary)))),
    "z-grid": pair(u, v), "w-grid": pair(re, im), real: re, imaginary: im,
    modulus: scalar((real, imaginary) => Math.hypot(real, imaginary)), argument: scalar((real, imaginary) => Math.atan2(imaginary, real)),
    "vector-field": pair(re, im), "u-level-curves": scalar((real) => real), "v-level-curves": scalar((_real, imaginary) => imaginary),
    "cauchy-riemann": cr, "conformal-field": conformal, "path-mapping": pathValues, "value-surface": valueSurface,
  } satisfies Record<ComplexPreviewLayer, Float32Array> };
};

export class ComplexPreviewArtifactManager {
  readonly registry: InMemoryArtifactRegistry;
  readonly #resolveDocument: () => ComplexAnalysisDocument;
  readonly #ownerId: string;

  constructor(resolveDocument: () => ComplexAnalysisDocument, ownerId = "complex-function-preview") {
    this.#resolveDocument = resolveDocument;
    this.#ownerId = ownerId;
    this.registry = createInMemoryArtifactRegistry({ resolveSource: (documentId) => {
      const document = this.#resolveDocument();
      return document.identity.id === documentId ? sourceGeneration(document) : null;
    } });
  }

  async build(document: ComplexAnalysisDocument, quality: ComplexPreviewQuality, hooks: { beforePublish?: () => void | Promise<void> } = {}): Promise<ComplexPreviewBundle> {
    const source = sourceGeneration(document);
    const currentAtStart = sourceGeneration(this.#resolveDocument());
    const dimensions = dimensionsFor(document, quality);
    const handles = Object.fromEntries(COMPLEX_PREVIEW_LAYERS.map((layer) => [layer, { artifactId: `complex-preview:${quality}:${source.revision}:${source.structuralHash.slice(-16)}:${layer}`, kind: layer === "value-surface" ? "mesh" : "sampled-grid", role: `complex-preview/${quality}/${layer}` }])) as Record<ComplexPreviewLayer, AnalysisArtifactHandle>;
    if (!sameSource(source, currentAtStart)) return { source, quality, dimensions, handles, ignored: true, reason: "stale-source" };
    this.registry.invalidateDocumentSource(source);
    for (const layer of COMPLEX_PREVIEW_LAYERS) {
      this.registry.declare({ handle: handles[layer], source, ownerId: this.#ownerId, encoding: "float32-le" });
      this.registry.beginComputation(handles[layer].artifactId, this.#ownerId, source);
    }
    const sampled = await sampleGrids(document, quality);
    await hooks.beforePublish?.();
    if (!sameSource(source, sourceGeneration(this.#resolveDocument()))) return { source, quality, dimensions: sampled.dimensions, handles, ignored: true, reason: "stale-source" };
    for (const layer of COMPLEX_PREVIEW_LAYERS) this.registry.publish({ artifactId: handles[layer].artifactId, source, ownerId: this.#ownerId, bytes: bytesOf(sampled.layers[layer]) });
    return { source, quality, dimensions: sampled.dimensions, handles, ignored: false };
  }

  resolve(handle: AnalysisArtifactHandle, source: ScientificSourceGeneration): ArtifactResolution { return this.registry.resolve(handle, source); }

  createDragPreview(document: ComplexAnalysisDocument, center: Complex, requestedSamples = 64): readonly Complex[] {
    const count = Math.max(1, Math.min(256, Math.round(requestedSamples)));
    const compiled = compileComplexExpressionAstPreview(document.function.normalizedAst, document.function.allowedVariables);
    if (!compiled.fn) return [];
    return Object.freeze(Array.from({ length: count }, (_, index) => {
      const angle = 2 * Math.PI * index / count;
      const z = C(center.re + 0.05 * Math.cos(angle), center.im + 0.05 * Math.sin(angle));
      return Object.freeze(compiled.fn!({ z, u: z.re, v: z.im }));
    }));
  }
}

const structuralSourceFromSpec = (spec: ComplexPreviewMapSpec): ComplexAnalysisStructuralSource => {
  const sourceText = spec.inputMode === "fz" ? spec.fExpr : `(${spec.reExpr})+i*(${spec.imExpr})`;
  const parsed = parseComplexExpressionAst(sourceText, ["z", "u", "v"]);
  if (!parsed.ast) throw new TypeError(parsed.error?.message ?? "Complex preview expression is invalid.");
  const sheetCount = spec.mapMode === "riemann" ? Math.max(2, Math.round(spec.sheetCount)) : 1;
  const activeSheet = Math.min(sheetCount - 1, Math.max(0, Math.round(spec.sheetIndex)));
  return {
    function: { sourceText, astVersion: 1, normalizedAst: parsed.ast, allowedVariables: ["z", "u", "v"] }, parameters: [], assumptions: [],
    domain: { re: { min: Math.min(spec.uMin, spec.uMax), max: Math.max(spec.uMin, spec.uMax) }, im: { min: Math.min(spec.vMin, spec.vMax), max: Math.max(spec.vMin, spec.vMax) }, exclusions: [] },
    sampling: { strategy: "uniform-grid", columns: Math.max(2, Math.round(spec.nu)), rows: Math.max(2, Math.round(spec.nv)), maximumSamples: Math.max(65_536, Math.round(spec.nu) * Math.round(spec.nv)), tolerance: 1e-8 }, contours: [],
    branchPolicy: { profile: sheetCount > 1 ? "custom" : "principal", cut: { kind: "principal", angleRadians: Number.isFinite(spec.branchCutAngle) ? spec.branchCutAngle : Math.PI, points: [] }, includeInfinity: sheetCount > 1, sheetCount, activeSheet },
    covering: null, mobius: null,
  };
};

export class ComplexFunctionPreviewSession {
  readonly commands: ComplexAnalysisCommandAdapter;
  readonly artifacts: ComplexPreviewArtifactManager;

  constructor(spec: ComplexPreviewMapSpec) {
    this.commands = new ComplexAnalysisCommandAdapter(createComplexAnalysisDocument(structuralSourceFromSpec(spec), { stableKey: "function-explorer-session" }));
    this.artifacts = new ComplexPreviewArtifactManager(() => this.commands.document());
  }

  synchronize(spec: ComplexPreviewMapSpec): { document: ComplexAnalysisDocument; error?: string } {
    try {
      const source = structuralSourceFromSpec(spec);
      return { document: this.commands.commitCandidate(source) };
    } catch (error) {
      return { document: this.commands.document(), error: String((error as Error).message ?? error) };
    }
  }

  build(quality: ComplexPreviewQuality) { return this.artifacts.build(this.commands.document(), quality); }
}
