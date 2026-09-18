import { describe, expect, it } from "vitest";
import { runLegacyVtkCleanNormals } from "./legacyVtkNormalsExecution";

describe("legacy VTK normals execution adapter", () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint32Array([0, 1, 2]);

  it("uses the canonical facade while retaining the legacy typed-array bridge", async () => {
    const result = await runLegacyVtkCleanNormals(positions, indices, { computeNormals: true }, {
      available: () => true,
      run: async (inputPositions, inputIndices, options) => ({
        ok: true,
        positions: inputPositions,
        indices: inputIndices,
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        vertexCount: 3,
        triCount: 1,
      }),
    });

    expect(result).toMatchObject({ ok: true, vertexCount: 3, triCount: 1 });
    if (result.ok) expect(result.normals).toHaveLength(9);
  });

  it("reports an unavailable Electron or proxy bridge as an explicit capability failure", async () => {
    await expect(runLegacyVtkCleanNormals(positions, indices, undefined, { available: () => false }))
      .resolves.toMatchObject({ ok: false, error: "No available backend satisfies 'mesh.normals.compute' and its declared limits." });
  });
});
