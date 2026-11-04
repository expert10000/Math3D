import { structuralHash, type StructuralHash } from "./documentIdentity";
import type { DerivedFieldDocument } from "./derivedFieldDocument";
import { compileProjectDerivedFieldEvaluator } from "./derivedFieldEvaluation";
import { parseMath3DProject, serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { extractVectorField3DSpeedIsosurface, planVectorField3DIsosurface,
  type VectorField3DIsosurface } from "./vectorField3DIsosurface";
import type { VectorField3DClipBounds, VectorField3DDocument } from "./vectorField3DDocument";

type Vec3 = readonly [number, number, number];
export type DerivedScalarIsosurface = VectorField3DIsosurface & Readonly<{
  derived: Readonly<{ documentId: string; revision: number; structuralHash: string;
    recipeHash: StructuralHash }>;
  vectorSource: VectorField3DIsosurface["source"];
  vectorSources: readonly VectorField3DIsosurface["source"][];
  sampleHash: StructuralHash;
  timeBudgetMs: number; elapsedMs: number;
}>;

/** Bounded analytic scalar DAG extraction; scientific bundles require a separately verified sampler. */
export function extractProjectDerivedScalarIsosurface(project: Math3DProject,
  derivedId: string, clipBounds: VectorField3DClipBounds, level: number,
  triangleBudget = 20_000, timeBudgetMs = 3000,
  now: () => number = () => performance.now()): DerivedScalarIsosurface {
  if (!Number.isFinite(level) || Math.abs(level) > 1e9 ||
      !Number.isSafeInteger(triangleBudget) || triangleBudget < 1 || triangleBudget > 100_000 ||
      !Number.isSafeInteger(timeBudgetMs) || timeBudgetMs < 1 || timeBudgetMs > 30_000)
    throw new RangeError("Derived isosurface level or budget is invalid.");
  const started = now(), deadline = started + timeBudgetMs;
  const current = parseMath3DProject(serializeMath3DProject(project));
  const byId = new Map<string, DerivedFieldDocument>(current.workspace.derivedFields?.map(item =>
    [item.identity.id, item]));
  const derived = byId.get(derivedId);
  if (!derived || derived.output.kind !== "scalar" || derived.output.axes.length !== 3)
    throw new TypeError("Choose a saved 3D scalar derived field.");
  const vectorSources = new Map<string, VectorField3DDocument>();
  const collect = (node: DerivedFieldDocument) => {
    for (const input of [node.input, ...(node.secondaryInput ? [node.secondaryInput] : [])]) {
      if (input.kind === "derived") {
        const parent = byId.get(input.documentId);
        if (!parent) throw new TypeError("Derived field parent is unavailable.");
        collect(parent);
      } else {
        const item = current.workspace.entries.find(entry => entry.module === "vector3d" &&
          entry.expected.id === input.documentId);
        if (item?.checkpoint.format !== "math3d.vector-field3d-document" ||
            item.expected.revision !== input.revision ||
            item.expected.structuralHash !== input.structuralHash ||
            item.checkpoint.source.field.kind !== "expressions")
          throw new TypeError("A current analytic vector source is required.");
        vectorSources.set(input.documentId, item.checkpoint);
      }
    }
  };
  collect(derived);
  let input = derived.input;
  while (input.kind === "derived") {
    const parent = byId.get(input.documentId);
    if (!parent) throw new TypeError("Derived field parent is unavailable.");
    input = parent.input;
  }
  const entry = current.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === input.documentId);
  if (entry?.checkpoint.format !== "math3d.vector-field3d-document")
    throw new TypeError("Derived vector source is unavailable.");
  const vectorSource: VectorField3DDocument = entry.checkpoint;
  const evaluator = compileProjectDerivedFieldEvaluator(current, derivedId);
  const plan = planVectorField3DIsosurface(vectorSource, clipBounds, 8000);
  const shape = plan.coordinates.map(axis => axis.length) as [number, number, number];
  const values = new Float64Array(shape[0] * shape[1] * shape[2]);
  let cursor = 0;
  for (let x = 0; x < shape[0]; x++) for (let y = 0; y < shape[1]; y++)
    for (let z = 0; z < shape[2]; z++) {
      if (now() >= deadline) throw new RangeError("Derived isosurface sampling time budget reached.");
      const point: Vec3 = [plan.coordinates[0][x]!, plan.coordinates[1][y]!,
        plan.coordinates[2][z]!];
      const value = evaluator.sample(point);
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new TypeError("Derived scalar is undefined inside the extraction box.");
      values[cursor++] = value;
    }
  if (now() >= deadline) throw new RangeError("Derived isosurface sampling time budget reached.");
  const sampleHash = structuralHash({ derived: derived.identity,
    coordinates: plan.coordinates, values: Array.from(values) });
  if (now() >= deadline) throw new RangeError("Derived isosurface sampling time budget reached.");
  const surface = extractVectorField3DSpeedIsosurface(vectorSource, plan, values,
    level, triangleBudget, { allowSigned: true, unit: derived.output.unit,
      deadlineAt: deadline, now });
  return { ...surface, source: { documentId: derived.identity.id,
    revision: derived.identity.revision, structuralHash: derived.identity.structuralHash },
    vectorSource: surface.source,
    vectorSources: [...vectorSources.values()].map(source => ({ documentId: source.identity.id,
      revision: source.identity.revision, structuralHash: source.identity.structuralHash })),
    sourceHash: null, sourceReferences: null,
    derived: { documentId: derived.identity.id, revision: derived.identity.revision,
      structuralHash: derived.identity.structuralHash,
      recipeHash: structuralHash({ input: derived.input,
        secondaryInput: derived.secondaryInput ?? null, operation: derived.operation }) },
    sampleHash, timeBudgetMs, elapsedMs: Math.max(0, now() - started) };
}
