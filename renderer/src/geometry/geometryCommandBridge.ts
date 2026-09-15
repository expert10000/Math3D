import {
  GEOMETRY_COMMAND_TYPES,
  geometryDocumentToSceneDocument,
  type CanonicalJsonValue,
  type CommandOrigin,
  type GeometryObject as CoreGeometryObject,
  type GeometrySourceObject,
} from "@math3d/core";
import { createGeometryObject, type GeometryObject } from "./proceduralObjects";
import { GeometryDocumentAdapter, type GeometryAdapterCommand } from "./geometryDocumentAdapter";
import { executeSceneScript } from "./scripting/sceneScriptExecutor";
import { serializeSceneToScript } from "./scripting/sceneScriptSerializer";
import type { SceneScriptExecutionResult } from "./scripting/sceneScriptTypes";

export type GeometryConversionDiagnostic = Readonly<{
  severity: "warning" | "error";
  code: string;
  message: string;
  entityId?: string;
}>;

export type ScratchConstructionGraph = Readonly<{
  nodes: readonly CanonicalJsonValue[];
  checkDefs: readonly CanonicalJsonValue[];
  constraints: readonly CanonicalJsonValue[];
  selectedNodeId: string | null;
  scriptText: string;
}>;

export type ScratchConversionResult =
  | Readonly<{ ok: true; graph: ScratchConstructionGraph; diagnostics: readonly GeometryConversionDiagnostic[] }>
  | Readonly<{ ok: false; diagnostics: readonly GeometryConversionDiagnostic[] }>;

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;
const asPayload = (value: unknown): CanonicalJsonValue => clone(value) as CanonicalJsonValue;
const sourceObject = (object: GeometryObject): GeometrySourceObject => ({
  id: object.id,
  type: object.type,
  params: clone(object.params),
  transform: clone(object.transform),
});
const presentation = (object: GeometryObject) => ({
  name: object.name,
  visible: object.visible,
  material: clone(object.material),
  ...(object.group ? { group: object.group } : {}),
});

export const geometryObjectUpsertCommand = (object: GeometryObject): GeometryAdapterCommand => ({
  type: GEOMETRY_COMMAND_TYPES.upsertObject,
  payload: asPayload({ object: sourceObject(object), presentation: presentation(object) }),
});

export const geometryObjectRemoveCommand = (objectId: string): GeometryAdapterCommand => ({
  type: GEOMETRY_COMMAND_TYPES.removeObject,
  payload: { objectId },
});

export const geometrySelectionCommand = (entityIds: readonly string[]): GeometryAdapterCommand => ({
  type: GEOMETRY_COMMAND_TYPES.commitSelection,
  payload: { entityIds: [...entityIds] },
});

/** Shared entry point for completed GUI gestures; pointer previews never call it. */
export const dispatchGeometryGuiBatch = (
  adapter: GeometryDocumentAdapter,
  commands: readonly GeometryAdapterCommand[],
  sourceId = "geometry-gui"
) => adapter.dispatch(commands, { kind: "interactive", sourceId });

const currentObjects = (adapter: GeometryDocumentAdapter): GeometryObject[] =>
  (geometryDocumentToSceneDocument(adapter.document()).objects ?? []) as GeometryObject[];

/**
 * Keeps the released parser/coercion diagnostics, but lowers successful output to
 * one atomic kernel transaction instead of using the executor as live authority.
 */
export const applySceneScriptToGeometryAdapter = (
  adapter: GeometryDocumentAdapter,
  script: string,
  datasetObjectIds: Iterable<string> = []
): SceneScriptExecutionResult => {
  const before = currentObjects(adapter);
  const result = executeSceneScript({
    script,
    objects: before,
    datasetObjectIds,
    selectedObjectId: adapter.committedSelectionIds()[0] ?? null,
  });
  if (!result.ok) return result;

  const nextById = new Map(result.objects.map((object) => [object.id, object]));
  const commands: GeometryAdapterCommand[] = [];
  for (const object of before) if (!nextById.has(object.id)) commands.push(geometryObjectRemoveCommand(object.id));
  for (const object of result.objects) commands.push(geometryObjectUpsertCommand(object));
  commands.push(geometrySelectionCommand(result.selectedObjectId ? [result.selectedObjectId] : []));
  adapter.dispatch(commands, { kind: "script", sourceId: "geometry-scene-script" });
  return result;
};

export const serializeGeometryAdapterSnapshot = (adapter: GeometryDocumentAdapter): string =>
  serializeSceneToScript(currentObjects(adapter), { selectedObjectId: adapter.committedSelectionIds()[0] ?? null });

export const replaceGeometryScratchGraph = (
  adapter: GeometryDocumentAdapter,
  graph: ScratchConstructionGraph,
  origin: CommandOrigin = { kind: "interactive", sourceId: "geometry-scratch" }
) => adapter.dispatch([
  { type: GEOMETRY_COMMAND_TYPES.replaceScratchGraph, payload: asPayload({ graph }) },
  geometrySelectionCommand(graph.selectedNodeId ? [graph.selectedNodeId] : []),
], origin);

export const geometryDocumentScratchGraph = (adapter: GeometryDocumentAdapter): ScratchConversionResult => {
  const graph = adapter.document().source.extensions["math3d.geometry.scratch.v1"];
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    return { ok: false, diagnostics: [{ severity: "error", code: "scratch-graph-missing", message: "The Geometry document has no editable Scratch graph." }] };
  }
  const candidate = graph as Record<string, CanonicalJsonValue>;
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.checkDefs) || !Array.isArray(candidate.constraints)) {
    return { ok: false, diagnostics: [{ severity: "error", code: "scratch-graph-invalid", message: "The stored Scratch graph is incomplete; nodes, checks, and constraints are required." }] };
  }
  return { ok: true, graph: clone(candidate) as unknown as ScratchConstructionGraph, diagnostics: [] };
};

/** Advertised common subset: one published `constructed/scratch-scene` object. */
export const scratchGraphToSceneScript = (graph: ScratchConstructionGraph): Readonly<{ script: string; diagnostics: readonly GeometryConversionDiagnostic[] }> => {
  const object = createGeometryObject("constructed", "scratch_scene");
  object.name = "Scratch construction";
  object.params.constructionKind = "scratch-scene";
  object.params.constructionFamily = "reference";
  object.params.authoringSource = "scratch";
  object.params.sourceEntityIds = graph.nodes.map((entry) => String((entry as Record<string, unknown>).id ?? "")).filter(Boolean).join(",");
  object.params.sourcePayload = JSON.stringify(graph);
  return { script: serializeSceneToScript([object], { selectedObjectId: object.id }), diagnostics: [] };
};

export const sceneScriptToScratchGraph = (script: string): ScratchConversionResult => {
  const result = executeSceneScript({ script, objects: [] });
  if (!result.ok) return { ok: false, diagnostics: [{ severity: "error", code: `scene-script-${result.error.code}`, message: result.error.message }] };
  const candidates = result.objects.filter((object) => object.type === "constructed" && object.params.constructionKind === "scratch-scene");
  if (candidates.length !== 1 || result.objects.length !== 1) {
    return { ok: false, diagnostics: [{ severity: "error", code: "unsupported-scene-script-subset", message: "Editable Scratch conversion requires exactly one constructed object with constructionKind=scratch-scene; the source was not changed." }] };
  }
  try {
    const graph = JSON.parse(String(candidates[0]!.params.sourcePayload ?? "")) as ScratchConstructionGraph;
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.checkDefs) || !Array.isArray(graph.constraints)) throw new TypeError("missing graph arrays");
    return { ok: true, graph: clone(graph), diagnostics: [] };
  } catch (error) {
    return { ok: false, diagnostics: [{ severity: "error", code: "invalid-scratch-payload", message: `Scratch payload is not editable: ${String((error as Error).message ?? error)}`, entityId: candidates[0]!.id }] };
  }
};

export const coreGeometryObjectForBridge = (object: GeometryObject): CoreGeometryObject => clone(object) as CoreGeometryObject;
