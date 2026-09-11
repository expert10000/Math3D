import { describe, expect, it } from "vitest";
import { createSceneEntityIdentity } from "../scene/sceneIdentity";
import { unifiedSelectionFromGeometryObject, unifiedSelectionFromMeshTopology } from "../selection/unifiedSelection";
import {
  DEFAULT_GEOMETRY_SEMANTIC_FILTER,
  attachGeometrySemanticSelection,
  buildGeometrySemanticCandidate,
  buildGeometrySemanticSelection,
  evaluateGeometrySemanticFilter,
  geometrySemanticEntityId,
  mapGeometrySemanticSelectionToMesh,
  resolveGeometrySemanticNavigation,
  selectGeometrySemanticCandidates,
} from "./semanticSelection";

const identity = createSceneEntityIdentity({
  localId: "cylinder-1",
  moduleKind: "geometry",
  sourceKind: "procedural",
  revision: 6,
  metadata: { objectType: "cylinder" },
});

const objectSelection = unifiedSelectionFromGeometryObject({
  objectId: "cylinder-1",
  objectLabel: "Cylinder",
  objectType: "cylinder",
  topologyVersion: 6,
})!;

describe("Geometry semantic selection", () => {
  it("creates stable semantic IDs independently from the object revision", () => {
    expect(geometrySemanticEntityId(identity.id, "shell", "shell-0")).toBe(
      "geometry-semantic-v1:geometry%3Acylinder-1:shell:shell-0"
    );
  });

  it("adds body, shell, feature and parameter identities to live selections", () => {
    const semantic = buildGeometrySemanticSelection({ selection: objectSelection, sceneIdentity: identity });
    expect(semantic).toMatchObject({
      sceneEntityId: "geometry:cylinder-1",
      sourceRevision: 6,
      kind: "body",
      category: "solid",
    });
    expect(semantic?.aliases.body).toBeTruthy();
    expect(semantic?.aliases.shell).toBeTruthy();
    expect(semantic?.aliases.feature).toBeTruthy();
    expect(semantic?.aliases["parameter-location"]).toBeFalsy();
  });

  it("adds a stable construction-role identity when the object carries that role", () => {
    const semantic = buildGeometrySemanticSelection({
      selection: objectSelection,
      sceneIdentity: identity,
      constructionRole: "reference-axis",
    });
    expect(semantic).toMatchObject({ kind: "construction-role", category: "construction" });
    expect(semantic?.aliases["construction-role"]).toContain("reference-axis");
  });

  it("classifies constructed curve, surface, and solid definitions by semantic entity", () => {
    const kindFor = (objectType: string) => buildGeometrySemanticSelection({
      selection: unifiedSelectionFromGeometryObject({ objectId: objectType, objectLabel: objectType, objectType }),
      sceneIdentity: createSceneEntityIdentity({ localId: objectType, moduleKind: "geometry", sourceKind: "procedural" }),
      objectType,
    })?.kind;

    expect(kindFor("curve-nurbs")).toBe("curve");
    expect(kindFor("surface-bezier")).toBe("surface");
    expect(kindFor("solid-loft")).toBe("body");
  });

  it("represents boundary edges as trim loops with curve and parameter aliases", () => {
    const edge = unifiedSelectionFromMeshTopology({
      mode: "edge",
      objectId: "cylinder-1",
      objectLabel: "Cylinder",
      objectType: "cylinder",
      edgeVertices: [2, 4],
      worldPosition: [1, 0, 0],
      valid: true,
    })!;
    const geometryEdge = { ...edge, workspace: "geometry" as const };
    const boundaryEdge = {
      ...geometryEdge,
      topologyFlags: { ...geometryEdge.topologyFlags, boundary: true, hasTopology: true },
    };
    const semantic = buildGeometrySemanticSelection({ selection: boundaryEdge, sceneIdentity: identity });
    expect(semantic?.kind).toBe("trim-loop");
    expect(semantic?.aliases.curve).toBeTruthy();
    expect(semantic?.aliases["trim-loop"]).toBeTruthy();
    expect(semantic?.aliases["parameter-location"]).toBeTruthy();
  });

  it("filters categories, hidden, derived and trim-boundary semantics", () => {
    const derivedIdentity = createSceneEntityIdentity({
      localId: "derived",
      moduleKind: "geometry",
      sourceKind: "derived",
      derivedFromIds: [identity.id],
    });
    const selection = unifiedSelectionFromGeometryObject({ objectId: "derived", objectLabel: "Derived", objectType: "mesh" })!;
    const semantic = buildGeometrySemanticSelection({ selection, sceneIdentity: derivedIdentity, visible: false })!;
    expect(evaluateGeometrySemanticFilter(semantic, DEFAULT_GEOMETRY_SEMANTIC_FILTER)).toMatchObject({ accepted: false });
    expect(
      evaluateGeometrySemanticFilter(semantic, { ...DEFAULT_GEOMETRY_SEMANTIC_FILTER, hidden: true, derived: false }).reasons
    ).toContain("Derived entities are filtered out");
  });

  it("selects same-radius, coaxial and same-surface candidates", () => {
    const semantic = buildGeometrySemanticSelection({ selection: objectSelection, sceneIdentity: identity })!;
    const seed = buildGeometrySemanticCandidate({
      selection: semantic,
      identity,
      objectType: "cylinder",
      params: { radius: 2 },
      position: { x: 0, y: 0, z: 0 },
    });
    const secondIdentity = createSceneEntityIdentity({ localId: "cylinder-2", moduleKind: "geometry", sourceKind: "procedural" });
    const secondSelection = buildGeometrySemanticSelection({
      selection: unifiedSelectionFromGeometryObject({ objectId: "cylinder-2", objectLabel: "Cylinder 2", objectType: "cylinder" }),
      sceneIdentity: secondIdentity,
    })!;
    const second = buildGeometrySemanticCandidate({
      selection: secondSelection,
      identity: secondIdentity,
      objectType: "cylinder",
      params: { radius: 2 },
      position: { x: 0, y: 0, z: 3 },
    });
    const candidates = [seed, second];
    expect(selectGeometrySemanticCandidates({ seed, candidates, selector: "same-radius" })).toHaveLength(2);
    expect(selectGeometrySemanticCandidates({ seed, candidates, selector: "coaxial" })).toHaveLength(2);
    expect(selectGeometrySemanticCandidates({ seed, candidates, selector: "same-surface-type" })).toHaveLength(2);
  });

  it("selects coplanar and G0-connected candidates from geometry and lineage", () => {
    const planeIdentity = createSceneEntityIdentity({ localId: "plane-1", moduleKind: "geometry", sourceKind: "procedural" });
    const planeSelection = buildGeometrySemanticSelection({
      selection: unifiedSelectionFromGeometryObject({ objectId: "plane-1", objectLabel: "Plane 1", objectType: "plane" }),
      sceneIdentity: planeIdentity,
    })!;
    const plane = buildGeometrySemanticCandidate({ selection: planeSelection, identity: planeIdentity, objectType: "plane" });
    const derivedIdentity = createSceneEntityIdentity({
      localId: "plane-2",
      moduleKind: "geometry",
      sourceKind: "derived",
      parentId: planeIdentity.id,
      derivedFromIds: [planeIdentity.id],
    });
    const derivedSelection = buildGeometrySemanticSelection({
      selection: unifiedSelectionFromGeometryObject({
        objectId: "plane-2",
        objectLabel: "Plane 2",
        objectType: "plane",
      }),
      sceneIdentity: derivedIdentity,
    })!;
    const derived = buildGeometrySemanticCandidate({
      selection: derivedSelection,
      identity: derivedIdentity,
      objectType: "plane",
      position: { x: 2, y: -3, z: 0 },
    });
    expect(
      selectGeometrySemanticCandidates({ seed: plane, candidates: [plane, derived], selector: "coplanar" })
    ).toHaveLength(2);
    expect(selectGeometrySemanticCandidates({ seed: plane, candidates: [plane, derived], selector: "g0-connected" })).toHaveLength(2);
  });

  it("navigates parent, source and derivative relationships", () => {
    const parent = buildGeometrySemanticCandidate({
      selection: buildGeometrySemanticSelection({ selection: objectSelection, sceneIdentity: identity })!,
      identity,
      objectType: "cylinder",
    });
    const childIdentity = createSceneEntityIdentity({
      localId: "child",
      moduleKind: "geometry",
      sourceKind: "derived",
      parentId: identity.id,
      derivedFromIds: [identity.id],
    });
    const childSelection = buildGeometrySemanticSelection({
      selection: unifiedSelectionFromGeometryObject({ objectId: "child", objectLabel: "Child", objectType: "mesh" }),
      sceneIdentity: childIdentity,
    })!;
    const child = buildGeometrySemanticCandidate({ selection: childSelection, identity: childIdentity, objectType: "mesh" });
    expect(resolveGeometrySemanticNavigation({ seed: child, candidates: [parent, child], command: "parent" })).toEqual([parent]);
    expect(resolveGeometrySemanticNavigation({ seed: child, candidates: [parent, child], command: "source" })).toEqual([parent]);
    expect(resolveGeometrySemanticNavigation({ seed: parent, candidates: [parent, child], command: "derivative" })).toEqual([child]);
  });

  it("attaches semantic identity without replacing topology selection data", () => {
    const semantic = buildGeometrySemanticSelection({ selection: objectSelection, sceneIdentity: identity })!;
    const attached = attachGeometrySemanticSelection(objectSelection, semantic);
    expect(attached).toMatchObject({
      entityId: "object:cylinder-1",
      sceneEntityId: identity.id,
      sourceRevision: 6,
      semanticEntityId: semantic.id,
      semanticKind: "body",
    });
  });

  it("retains Geometry semantic identity across a Mesh transition", () => {
    const semantic = buildGeometrySemanticSelection({ selection: objectSelection, sceneIdentity: identity })!;
    const attached = attachGeometrySemanticSelection(objectSelection, semantic);
    const mapped = mapGeometrySemanticSelectionToMesh({
      selection: attached,
      meshObjectId: "mesh-snapshot-1",
      meshLabel: "Cylinder mesh",
      meshSceneEntityId: "mesh:mesh-snapshot-1",
    });
    expect(mapped).toMatchObject({
      workspace: "mesh",
      objectId: "mesh-snapshot-1",
      sceneEntityId: "mesh:mesh-snapshot-1",
      sourceSceneEntityId: "geometry:cylinder-1",
      semanticEntityId: semantic.id,
      semanticKind: "body",
      sourceRevision: 6,
    });
  });
});
