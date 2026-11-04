import type { Graph2DPointSeriesObject } from "./graph2dDocument";
import { normalizeMath3DProject, type Math3DProject } from "./math3dProject";
import { normalizeScientificSelection, type ScientificSelection,
  type ScientificSelectionFrame, type ScientificSelectionGeometry,
  type ScientificSelectionSource } from "./scientificSelection";
import { parseVectorField3DDocument, type VectorField3DDocument,
  type VectorField3DOverlayRegion } from "./vectorField3DDocument";
import type { StableDocumentId } from "./documentIdentity";
import type { KernelWorkspaceDocument } from "./mixedWorkspace";

type Axis = 0 | 1 | 2;
const remainingAxes = (normalAxis: Axis): readonly [Axis, Axis] =>
  [0, 1, 2].filter(axis => axis !== normalAxis) as [Axis, Axis];
const frameFromVector = (document: VectorField3DDocument): ScientificSelectionFrame => ({
  kind: "cartesian", axes: document.source.axes.map(axis => ({ name: axis.label, unit: axis.unit })) });
const sourceFromVector = (document: VectorField3DDocument, pinned: boolean): ScientificSelectionSource => ({
  kind: "document", documentId: document.identity.id,
  checkpoint: pinned ? { revision: document.identity.revision,
    structuralHash: document.identity.structuralHash } : null });
const lineGeometry = (varyingAxis: Axis, point: readonly number[],
  extent: readonly [number, number]): ScientificSelectionGeometry => ({
    kind: "axis-line", varyingAxis,
    fixedCoordinates: point.map((value, index) => index === varyingAxis ? null : value), extent });
const regionGeometry = (region: VectorField3DOverlayRegion,
  sampleAxis?: Axis): ScientificSelectionGeometry => ({
    kind: "plane-region", normalAxis: region.normalAxis, coordinate: region.fixedCoordinate,
    bounds: region.bounds, ...(sampleAxis === undefined ? {} : { sampleAxis }) });
const make = (ownerDocumentId: StableDocumentId, path: string,
  role: ScientificSelection["role"], source: ScientificSelectionSource | null,
  frame: ScientificSelectionFrame, geometry: ScientificSelectionGeometry,
  objectId?: string): ScientificSelection => {
  const checked = normalizeScientificSelection({
    format: "math3d.scientific-selection", schemaVersion: 1,
    identity: { kind: "legacy-slot", ownerDocumentId, path,
      ...(objectId === undefined ? {} : { objectId }) },
    role, source, frame, geometry,
  });
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};

const fromVectorWorkspace = (document: VectorField3DDocument): ScientificSelection[] => {
  const workspace = document.workspace;
  if (!workspace) return [];
  const owner = document.identity.id, frame = frameFromVector(document);
  const source = sourceFromVector(document, false), selections: ScientificSelection[] = [];
  if (workspace.probe) selections.push(make(owner, "workspace.probe", "probe", source,
    frame, { kind: "point", position: workspace.probe }));
  if (workspace.linkedProbe) selections.push(make(owner, "workspace.linkedProbe", "probe", null,
    { kind: "cartesian", axes: workspace.linkedProbe.units.map(unit => ({ name: null, unit })) },
    { kind: "point", position: workspace.linkedProbe.point }));
  for (const normalAxis of [0, 1, 2] as const) {
    const inPlane = remainingAxes(normalAxis);
    selections.push(make(owner, `workspace.sliceCoordinates[${normalAxis}]`, "view", source,
      frame, { kind: "orthogonal-plane", normalAxis,
        coordinate: workspace.sliceCoordinates[normalAxis],
        bounds: inPlane.map(axis => [document.source.axes[axis].min,
          document.source.axes[axis].max]) as [[number, number], [number, number]] }));
  }
  if (workspace.linkedLineProfile) {
    const line = workspace.linkedLineProfile, extent = document.source.axes[line.varyingAxis];
    selections.push(make(owner, "workspace.linkedLineProfile", "analysis", source,
      frame, lineGeometry(line.varyingAxis, line.point, [extent.min, extent.max])));
  }
  if (workspace.overlayRegion) selections.push(make(owner, "workspace.overlayRegion", "analysis",
    source, frame, regionGeometry(workspace.overlayRegion)));
  return selections;
};

const fromGraphProfile = (owner: StableDocumentId, object: Graph2DPointSeriesObject): ScientificSelection | null => {
  if (object.mode !== "line") return null;
  const path = `source.objects[id=${object.id}]`, extent = [object.domain.min, object.domain.max] as const;
  if (object.linkedOrigin) {
    const origin = object.linkedOrigin, vector = parseVectorField3DDocument(origin.vectorDocumentJson);
    if ("profile" in origin) return make(owner, `${path}.linkedOrigin.profile`, "analysis",
      sourceFromVector(vector, true), frameFromVector(vector),
      lineGeometry(origin.profile.varyingAxis, origin.profile.point, extent), object.id);
    const inPlane = remainingAxes(origin.region.normalAxis);
    const sampleAxis = inPlane["profileAxis" in origin ? origin.profileAxis ?? 0 : 0];
    return make(owner, `${path}.linkedOrigin.region`, "analysis", sourceFromVector(vector, true),
      frameFromVector(vector), regionGeometry(origin.region, sampleAxis), object.id);
  }
  if (object.analyticOrigin) {
    const origin = object.analyticOrigin;
    const axes = [0, 1, 2].map(axis => ({ name: axis === origin.varyingAxis ? origin.xName : null,
      unit: axis === origin.varyingAxis ? origin.xUnit : null }));
    return make(owner, `${path}.analyticOrigin`, "analysis",
      { kind: "document", documentId: origin.documentId as StableDocumentId,
        checkpoint: { revision: origin.revision, structuralHash: origin.structuralHash as `sha256:${string}` } },
      { kind: "cartesian", axes },
      { kind: "axis-line", varyingAxis: origin.varyingAxis,
        fixedCoordinates: origin.fixedCoordinates, extent }, object.id);
  }
  if (object.derivedOrigin) {
    const origin = object.derivedOrigin, vector = parseVectorField3DDocument(origin.sourceDocumentJson);
    const fixedCoordinates: (number | null)[] = [null, null, null];
    fixedCoordinates[origin.normalAxis] = origin.fixedCoordinate;
    fixedCoordinates[remainingAxes(origin.normalAxis).find(axis => axis !== origin.varyingAxis)!] =
      origin.profileFixedCoordinate;
    return make(owner, `${path}.derivedOrigin`, "analysis", sourceFromVector(vector, true),
      frameFromVector(vector), { kind: "axis-line", varyingAxis: origin.varyingAxis,
        fixedCoordinates, extent }, object.id);
  }
  const origin = object.origin;
  if (origin?.slice) {
    const slice = origin.slice, hasPlane = "plane" in slice;
    const dimensions = hasPlane ? 3 : 2;
    const axes = Array.from({ length: dimensions }, () => ({ name: null as string | null,
      unit: null as string | null }));
    axes[slice.varyingAxis] = { name: origin.xName, unit: origin.xUnit };
    if (hasPlane) axes[slice.plane.normalAxis] =
      { name: slice.plane.fixedName, unit: slice.plane.fixedUnit };
    const fixedAxis = hasPlane ? slice.fixedAxis : 1 - slice.varyingAxis;
    axes[fixedAxis] = { name: slice.fixedName, unit: slice.fixedUnit };
    const fixedCoordinates: (number | null)[] = Array(dimensions).fill(null);
    fixedCoordinates[fixedAxis] = slice.fixedCoordinate;
    if (hasPlane) fixedCoordinates[slice.plane.normalAxis] = slice.plane.fixedCoordinate;
    const source: ScientificSelectionSource = origin.fieldDocument ?
      { kind: "document", documentId: origin.fieldDocument.id as StableDocumentId,
        checkpoint: { revision: origin.fieldDocument.revision,
          structuralHash: origin.fieldDocument.structuralHash as `sha256:${string}` } } :
      { kind: "dataset", sceneId: origin.sceneId, datasetId: origin.datasetId,
        sceneFingerprint: origin.sceneFingerprint, resourceSha256: origin.resourceSha256 };
    return make(owner, `${path}.origin.slice`, "analysis", source, { kind: "cartesian", axes },
      { kind: "axis-line", varyingAxis: slice.varyingAxis, fixedCoordinates, extent }, object.id);
  }
  return null;
};

/** Read-only projection. It never changes a Project, grants a legacy selection an authored ID,
 * or infers a source checkpoint from the enclosing document's current identity. */
export const readScientificSelectionsFromProject = (project: Math3DProject,
  resolved?: ReadonlyMap<string, KernelWorkspaceDocument>): readonly ScientificSelection[] => {
  const checked = normalizeMath3DProject(project);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const selections: ScientificSelection[] = [];
  for (const entry of checked.value.workspace.entries) {
    const checkpoint = entry.replay === null ? entry.checkpoint : resolved?.get(entry.expected.id);
    if ((entry.module === "vector3d" || entry.module === "graph2d") && !checkpoint)
      throw new TypeError(`Replay ${entry.module} workspace entries before reading scientific selections.`);
    if (checkpoint && (checkpoint.identity.id !== entry.expected.id ||
        checkpoint.identity.revision !== entry.expected.revision ||
        checkpoint.identity.structuralHash !== entry.expected.structuralHash))
      throw new TypeError("Replayed scientific selection owner differs from the expected Project generation.");
    if (entry.module === "vector3d") {
      if (checkpoint?.format !== "math3d.vector-field3d-document")
        throw new TypeError("Vector workspace entry has the wrong checkpoint format.");
      selections.push(...fromVectorWorkspace(checkpoint));
    }
    if (entry.module === "graph2d") {
      if (checkpoint?.format !== "math3d.graph2d-document")
        throw new TypeError("Graph workspace entry has the wrong checkpoint format.");
      for (const object of checkpoint.source.objects) {
        if (object.kind !== "point-series") continue;
        const selection = fromGraphProfile(checkpoint.identity.id, object);
        if (selection) selections.push(selection);
      }
    }
  }
  return selections;
};
