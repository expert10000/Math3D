import { describe, expect, it } from "vitest";
import {
  createProjectHandoff, createSceneProjectDocument, deserializeProjectHandoff,
  sceneProjectRevision, serializeProjectHandoff, serializeSceneProject,
} from "@math3d/core";

const project = createSceneProjectDocument({
  id: "round-trip", title: "Round trip", createdAt: 1, updatedAt: 2,
  surfaces: [{ id: "surface", kind: "explicit", expression: "x+y" }],
});

describe("project handoff manifest", () => {
  it("round trips a versioned, content-verified handoff deterministically", () => {
    const manifest = createProjectHandoff(project, {
      producer: { platform: "desktop", name: "Math3D", version: "1.5.0" },
      requiredCapabilities: ["surface.explicit", "surface.explicit"],
    });
    const serialized = serializeProjectHandoff(manifest);
    expect(deserializeProjectHandoff(serialized)).toMatchObject({ ok: true, value: manifest });
    expect(serializeProjectHandoff(manifest)).toBe(serialized);
    expect(manifest.requiredCapabilities).toEqual(["surface.explicit"]);
  });

  it("migrates a legacy scene-project without claiming a base revision", () => {
    const result = deserializeProjectHandoff(serializeSceneProject(project));
    expect(result).toMatchObject({ ok: true, value: {
      producer: { platform: "legacy" }, baseRevision: null, projectRevision: sceneProjectRevision(project),
    } });
    if (result.ok) expect(deserializeProjectHandoff(serializeProjectHandoff(result.value)).ok).toBe(true);
  });

  it("rejects tampered scene content, revisions and future versions", () => {
    const serialized = serializeProjectHandoff(createProjectHandoff(project, {
      producer: { platform: "desktop", name: "Math3D", version: "1.5.0" },
    }));
    expect(deserializeProjectHandoff(serialized.replace("x+y", "x-y")).ok).toBe(false);
    expect(deserializeProjectHandoff(serialized.replace('"version":1', '"version":2')).ok).toBe(false);
  });

  it("keeps result descriptors as verified references, without implying embedded result bytes", () => {
    const resultHash = sceneProjectRevision(project);
    const manifest = createProjectHandoff(project, {
      producer: { platform: "desktop", name: "Math3D", version: "1.5.0" },
      results: [{ id: "curvature", kind: "analysis.curvature", contentHash: resultHash }],
    });
    expect(deserializeProjectHandoff(serializeProjectHandoff(manifest))).toMatchObject({ ok: true, value: { results: manifest.results } });
    const corrupt = JSON.stringify({ ...manifest, results: [{ ...manifest.results[0], contentHash: "bad" }] });
    expect(deserializeProjectHandoff(corrupt)).toMatchObject({ ok: false });
  });
});
