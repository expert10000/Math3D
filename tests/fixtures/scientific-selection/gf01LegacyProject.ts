import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  createMath3DProject, createMixedWorkspaceDocument, createVectorField3DDocument,
  Graph2DPointTableStore, reviseVectorField3DWorkspace, sampleVectorField3DAnalyticLine,
  serializeVectorField3DDocument, structuralHash, vectorField3DExpression,
  type Graph2DFieldReference, type VectorField3DSource } from "../../../packages/core/src/index";

const axes: VectorField3DSource["axes"] = (["x", "y", "z"] as const).map(role =>
  ({ role, label: role, unit: "m", min: -4, max: 4 })) as unknown as VectorField3DSource["axes"];
const source: VectorField3DSource = { axes, timeUnit: "s",
  field: { kind: "expressions", components: ["x", "y", "z"].map(expression =>
    vectorField3DExpression(expression, "m/s")) as unknown as Extract<
      VectorField3DSource["field"], { kind: "expressions" }>["components"] },
  seeds: [], display: { density: [5, 5, 5], maxGlyphs: 512,
    magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-7, relativeTolerance: 1e-7,
    maxSteps: 1000, maxTime: 1 } };
const scalarReference: Graph2DFieldReference = {
  id: `field_${"a".repeat(24)}`, locator: { kind: "preset", value: "Gf01Fixture" },
  sceneFingerprint: "b".repeat(64), sceneId: "Gf01Scene", datasetId: "Scalar",
  component: "scalar", semanticType: "scalar-field", shape: [5, 5, 5],
  axes: axes.map(axis => ({ name: axis.label, unit: axis.unit,
    origin: axis.min, spacing: 2, periodic: false })), resourceSha256: "c".repeat(64),
};

/** A normal v1 Project: its field selections predate ScientificSelection IDs. */
export const createGf01LegacyProject = (store = new Graph2DPointTableStore()) => {
  const initial = createVectorField3DDocument(source, { stableKey: "gf01-field" });
  const region = { normalAxis: 2 as const, fixedCoordinate: 3,
    bounds: [[-2, 2], [-1, 1]] as const, vectorChannel: "speed" as const, visible: true };
  const profile = { normalAxis: 2 as const, varyingAxis: 0 as const,
    point: [1, 2, 3] as const, vectorChannel: "speed" as const, visible: true };
  const vector = reviseVectorField3DWorkspace(initial, { ...initial.workspace!,
    probe: [1, 2, 3], linkedProbe: { point: [1, 2, 3], units: ["m", "m", "m"] },
    sliceCoordinates: [1, 2, 3], linkedLineProfile: profile, overlayRegion: region });
  const sampled = sampleVectorField3DAnalyticLine(vector, "p", 0, [1, 2, 3]);
  const rows = Array.from({ length: 17 }, (_, index) =>
    ({ id: `row_${index + 1}`, x: -2 + index / 4, y: index / 4 }));
  const style = { color: "#2563eb", lineWidth: 2,
    lineStyle: "solid" as const, visible: true };
  const vectorDocumentJson = serializeVectorField3DDocument(vector);
  const common = { pairId: structuralHash({ fixture: "gf01-line" }),
    vectorDocumentJson, profile, xName: "x", xUnit: "m", yUnit: "m/s",
    vectorSourceHash: vector.identity.structuralHash,
    vectorSamples: [], scalarSampleSha256: "d".repeat(64),
    rowsSha256: structuralHash(sampled.rows) };
  const drafts = [
    { label: sampled.label, table: store.publish(sampled.rows), mode: "line" as const,
      domain: sampled.domain, analyticOrigin: sampled.origin, style },
    { label: "Linked line", table: store.publish(sampled.rows), mode: "line" as const,
      domain: sampled.domain, linkedOrigin: { kind: "vector-scalar-linked-line/v1" as const,
        series: "vector" as const, scalarReference, ...common }, style },
    { label: "Linked region", table: store.publish(rows), mode: "line" as const,
      domain: { min: -2, max: 2, includeMin: true, includeMax: true },
      linkedOrigin: { kind: "vector-derived-linked-region/v1" as const,
        pairId: structuralHash({ fixture: "gf01-region" }), series: "vector" as const,
        vectorDocumentJson, region, xName: "x", xUnit: "m", yUnit: "m/s",
        vectorSourceHash: vector.identity.structuralHash, vectorSamples: [],
        derivedSamples: [], rowsSha256: structuralHash(rows) }, style },
  ];
  const graphScene = applyGraph2DAuthoring(createEmptyGraph2DDocument("gf01-graph"),
    { type: "create-point-series-group", drafts });
  const graph = createGraph2DDocument({ ...graphScene, stableKey: "gf01-graph" });
  const workspace = createMixedWorkspaceDocument({ entries: [
    { module: "vector3d", checkpoint: vector, expected: vector.identity, replay: null },
    { module: "graph2d", checkpoint: graph, expected: graph.identity, replay: null }],
    activeDocumentIds: [vector.identity.id, graph.identity.id],
    results: [], artifacts: [], relations: [], committedSelection: null,
    constructions: [] });
  return createMath3DProject(workspace, { stableKey: "gf01-legacy-project" });
};
