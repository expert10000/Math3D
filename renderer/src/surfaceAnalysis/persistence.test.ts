import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { adaptSurfaceDefinition } from "./infrastructure";
import {
  createSurfaceAnalysisWorkspaceDocument,
  parseSurfaceAnalysisWorkspace,
  serializeSurfaceAnalysisWorkspace,
} from "./persistence";
import { compactDerivedSurfaceMesh, createDerivedSurfaceMeshPayload } from "./derivedSurfaceMesh";

const definition = adaptSurfaceDefinition({
  id: "surface-a",
  revision: 4,
  label: "Paraboloid",
  representation: "explicit",
  formula: "x^2+y^2",
  domain: { kind: "graph", x: { min: -2, max: 2 }, y: { min: -2, max: 2 } },
  sampling: { uSegments: 40, vSegments: 40 },
});

describe("Surface Analysis persistence", () => {
  it("round-trips versioned definitions and lightweight saved-result references", () => {
    const document = createSurfaceAnalysisWorkspaceDocument({
      definitions: [definition],
      savedResults: [{
        id: "saved-k",
        resultKey: `${definition.identity.key}:curvature-field:default`,
        kind: "curvature-field",
        variant: "default",
        identity: definition.identity,
        label: "Gaussian curvature",
        visible: true,
      }],
    });
    const serialized = serializeSurfaceAnalysisWorkspace(document);
    expect(parseSurfaceAnalysisWorkspace(serialized)).toEqual(document);
    expect(serialized).not.toContain("Float32Array");
    expect(serialized).not.toContain("entries");
  });

  it("rejects unsupported or malformed workspace documents", () => {
    expect(() => parseSurfaceAnalysisWorkspace('{"version":2,"definitions":[],"savedResults":[]}')).toThrow(/unsupported/i);
    expect(() => parseSurfaceAnalysisWorkspace('{"version":1,"definitions":[{}],"savedResults":[]}')).toThrow(/definition/i);
  });

  it("persists compact derived-mesh provenance without geometry arrays", () => {
    const payload = createDerivedSurfaceMeshPayload({ definition, label: "Paraboloid live", vertexCount: 4, faceCount: 2, method: "native-grid", settings: { resolution: 40 }, backend: { id: "threejs-native" }, createdAt: 10, correspondence: { parameterCoordinates: [0, 0, 1, 0, 0, 1, 1, 1], sourceSampleIndices: [0, 1, 2, 3] } });
    const document = createSurfaceAnalysisWorkspaceDocument({ definitions: [definition], derivedMeshes: [compactDerivedSurfaceMesh(payload, "Paraboloid live")] });
    const serialized = serializeSurfaceAnalysisWorkspace(document);
    expect(parseSurfaceAnalysisWorkspace(serialized).derivedMeshes[0]).toMatchObject({ vertexCount: 4, identity: { source: { surfaceRevision: 4 } }, correspondence: { kind: "parameter" } });
    expect(serialized).not.toContain("parameterCoordinates");
  });

  it("loads pre-derived-mesh version-1 documents with an empty metadata list", () => {
    expect(parseSurfaceAnalysisWorkspace('{"version":1,"definitions":[],"savedResults":[]}').derivedMeshes).toEqual([]);
  });

  it("keeps the shared analysis core independent of Surface and Mesh implementation modules", async () => {
    const analysisDirectory = fileURLToPath(new URL("../analysis/", import.meta.url));
    for (const file of ["contracts.ts", "registry.ts", "resultStore.ts", "statistics.ts"]) {
      const source = await readFile(`${analysisDirectory}${file}`, "utf8");
      expect(source, file).not.toMatch(/from\s+["'][^"']*(?:surface|mesh)[^"']*["']/i);
    }
  });
});
