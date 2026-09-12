import { describe, expect, it } from "vitest";
import type { Curve3D } from "@math3d/core";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { adaptCurveDefinition } from "./infrastructure";
import {
  DEFAULT_CURVE_MESH_SETTINGS,
  createCurveMeshRecord,
  createDerivedCurveMesh,
  curveMeshToSurfaceMesh,
  detachCurveMeshRecord,
  extractMeshCurves,
  fitExtractedMeshCurve,
  freezeCurveMeshRecord,
  mapCurveSelectionToMesh,
  mapMeshSelectionToCurve,
  markCurveMeshStale,
  regenerateCurveMeshRecord,
  type CurveMeshOutputMode,
} from "./curveMesh";

const helix: Curve3D = {
  id: "helix", name: "Helix", kind: "parametric", family: "parametric", dimension: 3,
  domain: { tMin: 0, tMax: 2 * Math.PI, closed: false, periodic: false },
  eval: (t) => ({ x: Math.cos(t), y: Math.sin(t), z: t / Math.PI }),
  derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t), z: 1 / Math.PI }),
  secondDerivative: (t) => ({ x: -Math.cos(t), y: -Math.sin(t), z: 0 }),
};

const definition = adaptCurveDefinition({
  id: "helix", revision: 7, label: "Helix", representation: "parametric", dimension: 3,
  expressions: { x: "cos(t)", y: "sin(t)", z: "t/pi" },
  domain: { parameter: "t", min: 0, max: 2 * Math.PI, closed: false, periodic: false },
  units: { position: "mm", parameter: "rad" },
});

const quadMesh: SurfaceMeshData = {
  label: "Open quad",
  positions: new Float32Array([-1, -1, -1, 1, -1, 1, 1, 1, 1, -1, 1, -1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  source: { kind: "csg" },
};

describe("provenance-linked CurveMesh workflows", () => {
  it("generates every output variant with finite geometry and retained parameter correspondence", () => {
    const modes: CurveMeshOutputMode[] = ["points", "polyline", "tube", "ribbon", "swept-profile", "frame-glyphs"];
    for (const outputMode of modes) {
      const payload = createDerivedCurveMesh({ definition, curve: helix, settings: { outputMode, longitudinalResolution: 12, radialResolution: 6 } });
      expect(payload.identity).toMatchObject({ sourceCurveId: "helix", sourceCurveRevision: 7, sourceFidelity: "parametric", sourceUnits: { position: "mm", parameter: "rad" }, variant: outputMode, state: "live-current" });
      expect(payload.vertexCount).toBeGreaterThan(0);
      expect([...payload.geometry.positions].every(Number.isFinite)).toBe(true);
      expect(payload.correspondence.state).toBe("complete");
      expect(payload.correspondence.sourceParameters).toHaveLength(payload.vertexCount);
      expect(payload.navigation.openCurveSource).toEqual({ curveId: "helix", curveRevision: 7 });
    }
  });

  it("honors tube, ribbon, profile, cap, seam, twist, and frame settings", () => {
    const tube = createDerivedCurveMesh({ definition, curve: helix, settings: { outputMode: "tube", longitudinalResolution: 8, radialResolution: 5, tubeRadius: 0.3, caps: false, boundaryPolicy: "open", framePolicy: "frenet", twist: Math.PI } });
    expect(tube.vertexCount).toBe(45);
    expect(tube.faceCount).toBe(80);
    expect(tube.identity.settings).toMatchObject({ radialResolution: 5, tubeRadius: 0.3, caps: false, framePolicy: "frenet", twist: Math.PI });
    const capped = createDerivedCurveMesh({ definition, curve: helix, settings: { outputMode: "tube", longitudinalResolution: 8, radialResolution: 5, caps: true } });
    expect(capped.vertexCount).toBe(47);
    expect(capped.faceCount).toBe(90);
    const ribbon = createDerivedCurveMesh({ definition, curve: helix, settings: { outputMode: "ribbon", longitudinalResolution: 8, ribbonWidth: 0.4, ribbonOrientation: "binormal", boundaryPolicy: "open" } });
    expect(ribbon.vertexCount).toBe(18);
    expect(ribbon.faceCount).toBe(16);
    const profile = createDerivedCurveMesh({ definition, curve: helix, settings: { outputMode: "swept-profile", profile: [[-1, -1], [1, -1], [0, 1]], longitudinalResolution: 8, caps: false, boundaryPolicy: "open" } });
    expect(profile.faceCount).toBe(48);
  });

  it("maps selections in both directions and carries provenance into Mesh Analysis", () => {
    const record = createCurveMeshRecord(createDerivedCurveMesh({ definition, curve: helix, settings: { outputMode: "tube", longitudinalResolution: 10, radialResolution: 4 } }), "Helix tube");
    const exactParameter = record.payload.correspondence.sourceParameters[12];
    const toMesh = mapCurveSelectionToMesh(record.payload.correspondence, [exactParameter]);
    expect(toMesh.state).toBe("complete");
    expect(mapMeshSelectionToCurve(record.payload.correspondence, toMesh.meshVertexIndices)).toMatchObject({ state: "complete" });
    const handoff = curveMeshToSurfaceMesh(record, "live");
    expect(handoff.source).toMatchObject({ kind: "derivedCurve", role: "live", sourceCurveId: "helix", sourceCurveRevision: 7, sourceFidelity: "parametric", variant: "tube", framePolicy: "bishop" });
    expect(handoff.indices?.length).toBe(record.payload.geometry.indices?.length);
  });

  it("tracks stale, regenerate, freeze, and detach transitions without losing history", () => {
    const settings = { ...DEFAULT_CURVE_MESH_SETTINGS, longitudinalResolution: 10 };
    const initial = createCurveMeshRecord(createDerivedCurveMesh({ definition, curve: helix, settings, now: 10 }), "Helix tube");
    const nextDefinition = { ...definition, identity: { ...definition.identity, curveRevision: 8 } };
    const stale = markCurveMeshStale(initial, nextDefinition, settings, 20);
    expect(stale.identity).toMatchObject({ state: "stale", staleReason: "Source changed from Curve revision 7 to 8." });
    const regenerated = regenerateCurveMeshRecord(stale, nextDefinition, helix, settings, 30);
    expect(regenerated.identity).toMatchObject({ state: "live-current", meshRevision: 2, sourceCurveRevision: 8 });
    expect(regenerated.history.map((entry) => entry.action)).toEqual(["created", "marked-stale", "regenerated"]);
    expect(freezeCurveMeshRecord(regenerated, 40).identity.state).toBe("frozen-snapshot");
    const detached = detachCurveMeshRecord(regenerated, 50);
    expect(detached.identity).toMatchObject({ state: "detached", meshRevision: 1 });
    expect(markCurveMeshStale(detached, definition, settings, 60)).toBe(detached);
  });

  it("extracts Mesh boundaries, selected/feature chains, cross-sections, and supplied polylines", () => {
    const boundary = extractMeshCurves({ mesh: quadMesh, kind: "boundary-loops" });
    expect(boundary).toHaveLength(1);
    expect(boundary[0].points).toHaveLength(5);
    expect(boundary[0].sourceVertexIndices).toHaveLength(5);
    expect(extractMeshCurves({ mesh: quadMesh, kind: "selected-edge-chain", selectedEdges: [[0, 1], [1, 2]] })[0].points).toHaveLength(3);
    expect(extractMeshCurves({ mesh: quadMesh, kind: "feature-edge-chains", featureEdges: [[2, 3]] })[0].kind).toBe("feature-edge-chains");
    expect(extractMeshCurves({ mesh: quadMesh, kind: "feature-edge-chains" })).toHaveLength(1);
    const sections = extractMeshCurves({ mesh: quadMesh, kind: "cross-section", crossSection: { normal: { x: 0, y: 0, z: 1 } } });
    expect(sections).toHaveLength(1);
    expect(sections[0].points.length).toBeGreaterThanOrEqual(2);
    expect(sections[0].sourceFaceIndices.length).toBeGreaterThan(0);
    const polyline = extractMeshCurves({ mesh: quadMesh, kind: "polylines", polylines: [[{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]] });
    expect(polyline[0]).toMatchObject({ fidelity: "polyline-approximation", sourceVertexIndices: new Uint32Array() });
    const derivedPolyline = curveMeshToSurfaceMesh(createCurveMeshRecord(createDerivedCurveMesh({ definition, curve: helix, settings: { outputMode: "polyline", longitudinalResolution: 6 } }), "Derived polyline"), "live");
    expect(extractMeshCurves({ mesh: derivedPolyline, kind: "polylines" })[0].points).toHaveLength(7);
  });

  it("fits only on explicit request and reports tolerance and residuals", () => {
    const extracted = extractMeshCurves({ mesh: quadMesh, kind: "boundary-loops" })[0];
    const fit = fitExtractedMeshCurve(extracted, { tolerance: 1e-5, degree: 1 });
    expect(fit.definition.kind).toBe("b-spline");
    expect(fit.residuals).toHaveLength(extracted.points.length);
    expect(fit).toMatchObject({ tolerance: 1e-5, accepted: true, source: extracted });
    expect(fit.maximumResidual).toBeLessThanOrEqual(1e-5);
  });
});
