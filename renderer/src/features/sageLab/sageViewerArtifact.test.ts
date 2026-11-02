import { describe, expect, it } from "vitest";
import type { SymbolicResultRecord } from "./SageSymbolicPanel";
import { formatSurfaceMeshSource } from "../../mesh/surfaceMesh";
import { previewSageGradientLines, previewSageScalarMesh } from "./sageViewerArtifact";

const record = (operation: SymbolicResultRecord["response"]["operation"], result: Record<string, unknown>): SymbolicResultRecord => ({
  backend: "docker", expression: "x*x+y*y+z*z-1", variables: ["x", "y", "z"],
  request: { operation: operation as SymbolicResultRecord["request"]["operation"], jobId: "sage-job-1", params: { expression: "x*x+y*y+z*z-1" } },
  response: { engine: "sagemath", engineVersion: "10.6", operation, success: true, latex: "", result, warnings: ["bounded"] },
  source: { module: "surface", id: "surface:test", revision: 4, expression: "x*x+y*y+z*z-1", fingerprint: "source-hash" },
});

describe("Sage Viewer artifacts", () => {
  it("previews an implicit mesh and keeps exact Sage source provenance", () => {
    const mesh = previewSageScalarMesh(record("sage.symbolic.simplify", { text: "x*x+y*y+z*z-1" }));
    expect(mesh.indices?.length).toBeGreaterThan(0);
    expect(mesh.source).toMatchObject({ kind: "sageResult", backend: "docker", engineVersion: "10.6",
      sourceId: "surface:test", sourceRevision: 4, jobId: "sage-job-1", resultExpression: "x*x+y*y+z*z-1" });
    expect(formatSurfaceMeshSource(mesh.source)).toContain("surface:test r4");
  });

  it("rejects expressions with no zero set in the preview bounds", () => {
    expect(() => previewSageScalarMesh(record("sage.symbolic.simplify", { text: "x*x+1" }))).toThrow(/no visible zero set/);
  });

  it("creates finite gradient line samples", () => {
    const lines = previewSageGradientLines(record("sage.symbolic.gradient", { components: ["2*x", "2*y", "2*z"] }),
      [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
    expect(lines).toHaveLength(1);
    expect(lines[0][1].x).toBeCloseTo(1.25);
  });
});
