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
