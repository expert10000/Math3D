import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { adaptCurveDefinition } from "./infrastructure";
import {
  createCurveAnalysisWorkspaceDocument,
  parseCurveAnalysisWorkspace,
  serializeCurveAnalysisWorkspace,
} from "./persistence";

const definition = adaptCurveDefinition({
  id: "curve-a",
  revision: 4,
  label: "Lissajous",
  representation: "parametric",
  dimension: 2,
  expressions: { x: "sin(3t)", y: "sin(4t)" },
  domain: { parameter: "t", min: 0, max: Math.PI * 2, closed: true, periodic: true },
  sampling: { strategy: "adaptive", tolerance: 1e-3, maximumSamples: 4096 },
});
describe("Curve Analysis persistence", () => {
  it("round-trips versioned definitions and lightweight saved-result references", () => {
    const document = createCurveAnalysisWorkspaceDocument({
      definitions: [definition],
      savedResults: [{
        id: "saved-curvature",
        resultKey: `${definition.identity.key}:differential-geometry:default`,
        kind: "differential-geometry",
        variant: "default",
        identity: definition.identity,
        label: "Curvature field",
        visible: true,
      }],
    });
    const serialized = serializeCurveAnalysisWorkspace(document);
    expect(parseCurveAnalysisWorkspace(serialized)).toEqual(document);
    expect(serialized).not.toContain("Float64Array");
    expect(serialized).not.toContain('"entries"');
    expect(serialized).not.toContain("evaluate");
  });

  it("round-trips lightweight pinned probes and persistent annotations", () => {
    const probe = {
      id: "probe-1", identity: definition.identity, t: 1, normalizedParameter: 0.2, arcLength: 2,
      normalizedArcLength: 0.25, segmentIndex: 3, span: [0.8, 1.2] as const, worldPoint: [1, 2, 0] as const,
      source: "plot" as const, sourceMapping: "plot -> curve parameter -> arc-length table", speed: 1,
      curvature: 0.5, signedCurvature: 0.5, torsion: 0, radiusOfCurvature: 2,
      tangent: [1, 0, 0] as const, normal: [0, 1, 0] as const, binormal: [0, 0, 1] as const,
      frameKind: "frenet" as const, createdAt: 42,
    };
    const document = createCurveAnalysisWorkspaceDocument({ definitions: [definition], savedProbes: [probe], annotations: [{ id: "a1", pickId: probe.id, identity: definition.identity, kind: "curvature", label: "Curvature", value: "0.5", visible: true }] });
    expect(parseCurveAnalysisWorkspace(serializeCurveAnalysisWorkspace(document))).toEqual(document);
  });

  it("rejects unsupported and malformed workspace documents", () => {
    expect(() => parseCurveAnalysisWorkspace('{"version":2,"definitions":[],"savedResults":[]}')).toThrow(/unsupported/i);
    expect(() => parseCurveAnalysisWorkspace('{"version":1,"definitions":[{}],"savedResults":[]}')).toThrow(/definition/i);
    expect(() => parseCurveAnalysisWorkspace(JSON.stringify({ ...createCurveAnalysisWorkspaceDocument({ definitions: [definition] }), definitions: [{ ...definition, domain: { ...definition.domain, max: definition.domain.min } }] }))).toThrow(/domain/i);
  });

  it("keeps Curve Core independent of renderer and neighboring module implementations", async () => {
    const coreDirectory = fileURLToPath(new URL("../../../packages/core/src/geometry/curve-core/", import.meta.url));
    const files = [
      "model/Curve.ts",
      "model/Curve2D.ts",
      "model/Curve3D.ts",
      "eval/evaluateCurve.ts",
      "sampling/sampleAdaptive.ts",
    ];
    for (const file of files) {
      const source = await readFile(`${coreDirectory}${file}`, "utf8");
      expect(source, file).not.toMatch(/from\s+["'][^"']*(?:renderer|surface|mesh|vtk|cgal)[^"']*["']/i);
    }
  });

  it("keeps the shared analysis core independent of Curve implementation modules", async () => {
    const analysisDirectory = fileURLToPath(new URL("../analysis/", import.meta.url));
    for (const file of ["contracts.ts", "registry.ts", "resultStore.ts", "statistics.ts"]) {
      const source = await readFile(`${analysisDirectory}${file}`, "utf8");
      expect(source, file).not.toMatch(/from\s+["'][^"']*curve[^"']*["']/i);
    }
  });
});
