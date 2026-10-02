import { createCurveDocument, type CurveDocumentSource } from "./curveDocument";
import { createSurfaceDocument, type SurfaceDocumentSource } from "./surfaceDocument";
import { createGeometryDocument } from "./geometryDocument";
import { createTopologyDocument, type TopologyDocumentSource } from "./topologyDocument";
import { createDocumentIdentity, createStableDocumentId } from "./documentIdentity";
import { createMixedWorkspaceDocument, type MixedWorkspaceEntry } from "./mixedWorkspace";
import { createDocumentRelation } from "./documentRelations";
import { viewerSourceFromDocument } from "./viewerProvenance";

/** Ordinary, self-contained sources for the PRJ16 editors; no engines or cached results. */
export const createRepresentationTemplateWorkspace = (id: string, instanceKey: string) => {
  const empty = { relations: [], results: [], artifacts: [], constructions: [], committedSelection: null };
  const key = (name: string) => ["project-template", id, 1, instanceKey, name];
  const curve = (name: string, representation: CurveDocumentSource["representation"], definition: CurveDocumentSource["definition"]) =>
    createCurveDocument({ stableKey: key(name), metadata: { title: name }, source: {
      representation, dimension: 3, domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false },
      units: { position: "unitless", parameter: "unitless", angle: "rad" }, orientation: { direction: "forward" },
      derivatives: null, dependencies: [], definition,
    } });
  const surface = (name: string, representation: SurfaceDocumentSource["representation"], definition: SurfaceDocumentSource["definition"], patch: Partial<SurfaceDocumentSource> = {}) =>
    createSurfaceDocument({ stableKey: key(name), metadata: { title: name }, source: {
      representation, domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } },
      units: { length: "unitless" }, orientation: { sign: 1 }, definition, parameters: {}, branchPolicy: null, ...patch,
    } });
  const entry = (module: MixedWorkspaceEntry["module"], document: MixedWorkspaceEntry["checkpoint"]): MixedWorkspaceEntry =>
    ({ module, checkpoint: document, expected: document.identity, replay: null });
  if (id === "spline-surface-lab") {
    const arc = curve("Weighted spline curve", "nurbs", { familyId: "nurbs", controlPoints: [[0,0,0],[1,2,0],[2,0,0]],
      controlPointCount: 3, knots: [0,0,0,1,1,1], weights: [1,2,1], settings: { degree: 2 } });
    const patch = surface("Rational surface patch", "spline", { familyId: "nurbsSurface", settings: { splineSettings: JSON.stringify({
      nurbsControlGridText: JSON.stringify([[[0,0,0],[0,1,0]],[[1,0,0],[1,1,1]]]), nurbsDegreeU: 1, nurbsDegreeV: 1,
      nurbsKnotUText: "0,0,1,1", nurbsKnotVText: "0,0,1,1", nurbsWeightsText: "1,1\n1,1",
    }) } });
    const sphere = surface("Implicit unit sphere", "implicit", { familyId: "sphere", expressions: { formula: "x*x+y*y+z*z-1" }, settings: { isoValue: 0 } },
      { domain: { kind: "spatial-bounds", min: [-1.5,-1.5,-1.5], max: [1.5,1.5,1.5] } });
    return createMixedWorkspaceDocument({ ...empty, entries: [entry("curve", arc), entry("surface", patch), entry("surface", sphere)], activeDocumentIds: [arc.identity.id] });
  }
  if (id === "curve-construction-study") {
    const profile = curve("Measured profile", "polyline", { familyId: "measured", points: [[1,0,0],[1.5,0,0.5],[1,0,1]], pointCount: 3 });
    const generation = viewerSourceFromDocument(profile);
    const construction = (name: string, kind: string) => surface(name, "constructed", { familyId: kind, sourceIds: [profile.identity.id] }, {
      domain: { kind: "curve-construction", u: [0,1], v: [0,1] },
      parameters: { sourceGenerations: [generation], angle: Math.PI * 2, axis: "z", depth: 2, uSegments: 32, vSegments: 16 },
    });
    const revolution = construction("Profile revolution", "revolution"), extrusion = construction("Profile extrusion", "extrusion");
    const chart = surface("Parameter chart", "parametric", { familyId: "literal", expressions: { x: "u", y: "v", z: "u+v" } });
    const trace = curve("Curve on chart", "curve-on-surface", { familyId: "chart", expressions: { u: "t", v: "t*t" },
      surfaceLink: { surfaceId: chart.identity.id, surfaceRevision: chart.identity.revision } });
    const relation = (parent: typeof profile | typeof chart, child: typeof revolution | typeof trace, operation: string) => createDocumentRelation({
      kind: "derived-from", sources: [viewerSourceFromDocument(parent)], sourceOrder: "ordered",
      target: { type: "document", generation: viewerSourceFromDocument(child) }, operation, parameters: {},
    });
    return createMixedWorkspaceDocument({ ...empty, entries: [entry("curve", profile), entry("surface", revolution), entry("surface", extrusion), entry("surface", chart), entry("curve", trace)],
      activeDocumentIds: [revolution.identity.id], relations: [relation(profile, revolution, "curve.revolution"), relation(profile, extrusion, "curve.extrusion"), relation(chart, trace, "surface.chart-curve")] });
  }
  if (id === "scene-topology-study") {
    const scene = createGeometryDocument({ stableKey: key("Scene constructions"), metadata: { title: "Scene constructions" }, source: {
      objects: [], surfaces: [], relationships: [], parameters: {}, extensions: {},
      geometry: { points: [{ id: "a", x: 0, y: 0, z: 0 }, { id: "b", x: 4, y: 0, z: 0 }] },
      constructions: [{ id: "mid", type: "midpoint", sourceObjectIds: ["a","b"] }, { id: "circle", type: "circle", sourceObjectIds: ["a"], radius: 1, circleNormal: { x: 0, y: 0, z: 1 } }],
    } });
    const topology = (name: string, kind: TopologyDocumentSource["kind"], model: TopologyDocumentSource["model"]) => {
      const documentId = createStableDocumentId("topology", key(name)), source = { sourceId: `${documentId}/source`, kind, model };
      return createTopologyDocument({ identity: createDocumentIdentity(documentId, source), source, canonicalComplex: null, results: [], displayRealizations: [],
        provenance: { origin: "native", sourceFormat: "project-template", sourceVersion: 1, diagnostics: [] } });
    };
    const interval = topology("CW interval", "cw-complex", { id: "interval", name: "CW interval", vertices: [{ id: "a" }, { id: "b" }], edges: [{ id: "ab", endpoints: ["a","b"] }], faces: [] });
    const triangle = topology("Simplicial triangle", "simplicial-complex", { id: "triangle", name: "Simplicial triangle", vertexIds: ["a","b","c"],
      edges: [{ id: "ab", vertices: ["a","b"] }, { id: "bc", vertices: ["b","c"] }, { id: "ca", vertices: ["c","a"] }], triangles: [{ id: "abc", vertices: ["a","b","c"] }] });
    return createMixedWorkspaceDocument({ ...empty, entries: [entry("geometry", scene), entry("topology", interval), entry("topology", triangle)], activeDocumentIds: [scene.identity.id] });
  }
  throw new TypeError("Unknown representation template.");
};
