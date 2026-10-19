import { expect, test, type Page } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp } from "./helpers/surfaceAppHarness";

const cases = [
  { operation: "union", volume: 12, vertices: 24, triangles: 44, xBounds: [-1, 2] },
  { operation: "intersection", volume: 4, vertices: 16, triangles: 28, xBounds: [0, 1] },
  { operation: "difference", volume: 4, vertices: 12, triangles: 20, xBounds: [-1, 0] },
] as const;

async function openMeshTools(page: Page) {
  await page.getByTestId("workspace-nav-mesh").click();
  await page.getByRole("button", { name: "Mesh tools", exact: true }).first().click();
  return page.getByTestId("mesh-workspace-operation-registry").first();
}

async function runCanonicalWorkerCase(page: Page, operation: (typeof cases)[number]["operation"]) {
  return page.evaluate(async (selectedOperation) => {
    type BooleanResponse = {
      ok: boolean;
      positions: ArrayBuffer;
      indices: ArrayBuffer;
      vertexCount: number;
      triCount: number;
      boolean?: { kernel: string };
    };
    const bridge = (window as unknown as {
      cgalMesh: {
        booleanMesh: (request: {
          jobId: string;
          operation: string;
          positionsA: ArrayBuffer;
          indicesA: ArrayBuffer;
          positionsB: ArrayBuffer;
          indicesB: ArrayBuffer;
        }) => Promise<BooleanResponse>;
      };
    }).cgalMesh;
    const positionsA = new Float32Array([
      -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
      -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    ]);
    const indices = new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
      0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
    ]);
    const positionsB = new Float32Array(positionsA);
    for (let i = 0; i < positionsB.length; i += 3) positionsB[i] += 1;

    const result = await bridge.booleanMesh({
      jobId: `e2e-overlap-${selectedOperation}-${Date.now()}`,
      operation: selectedOperation,
      positionsA: positionsA.buffer,
      indicesA: indices.buffer,
      positionsB: positionsB.buffer,
      indicesB: indices.buffer,
    });
    if (!result.ok) return { ok: false, kernel: result.boolean?.kernel, volume: NaN, bounds: [], vertexCount: 0, triCount: 0 };

    const positions = new Float32Array(result.positions);
    const faces = new Uint32Array(result.indices);
    let signedVolumeSix = 0;
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i] * 3;
      const b = faces[i + 1] * 3;
      const c = faces[i + 2] * 3;
      signedVolumeSix +=
        positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) +
        positions[a + 1] * (positions[b + 2] * positions[c] - positions[b] * positions[c + 2]) +
        positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
    }
    const bounds = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      bounds[0] = Math.min(bounds[0], positions[i]);
      bounds[1] = Math.max(bounds[1], positions[i]);
      bounds[2] = Math.min(bounds[2], positions[i + 1]);
      bounds[3] = Math.max(bounds[3], positions[i + 1]);
      bounds[4] = Math.min(bounds[4], positions[i + 2]);
      bounds[5] = Math.max(bounds[5], positions[i + 2]);
    }
    return {
      ok: result.ok,
      kernel: result.boolean?.kernel,
      volume: Math.abs(signedVolumeSix / 6),
      bounds,
      vertexCount: result.vertexCount,
      triCount: result.triCount,
    };
  }, operation);
}

for (const fixture of cases) {
  test(`Robust Boolean ${fixture.operation} uses native CGAL and records the result`, async () => {
    test.skip(process.env.MATH3D_NATIVE_BOOLEAN_E2E !== "1", "Requires an installed local native CGAL worker.");
    const ctx = await launchSurfaceApp();
    try {
      const { page } = ctx;
      let card = await openMeshTools(page);
      const row = `mesh-workspace-operation-registry-row-boolean-${fixture.operation}`;
      await card.getByTestId(row).click();
      await card.getByRole("button", { name: "Boolean demo pair" }).click();
      await expect(page.getByTestId("workspace-nav-geometry")).toHaveAttribute("aria-pressed", "true");

      card = await openMeshTools(page);
      await card.getByTestId(row).click();
      await card.getByRole("button", { name: "Send A to Mesh + use B" }).click();
      await expect(card).toContainText("A: Boolean demo A");
      await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-operand")).toContainText("Boolean demo B");

      await card.getByTestId("mesh-workspace-operation-registry-row-cgal-validate").click();
      await card.getByTestId("mesh-workspace-operation-registry-run-cgal-validate").click();
      const lastResult = card.getByTestId("mesh-workspace-operation-registry-last-result");
      await expect(lastResult).toContainText("Ready for robust operations", { timeout: 90_000 });

      await card.getByTestId(row).click();
      const robust = card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-robust");
      await robust.click();
      await expect(robust).toHaveAttribute("aria-pressed", "true");
      await card.getByTestId(`mesh-workspace-operation-registry-run-boolean-${fixture.operation}`).click();
      await expect(lastResult).toContainText(`Boolean ${fixture.operation}`, { timeout: 90_000 });
      await expect(lastResult).toContainText(/success/i);
      await expect(lastResult).toContainText("Native CGAL backend: CGAL corefine");
      await expect(lastResult).toContainText(`Vertices: 8 -> ${fixture.vertices}`);
      await expect(lastResult).toContainText(`Triangles: 12 -> ${fixture.triangles}`);
      await expect(page.getByTestId("mesh-operation-boolean-card")).toContainText("Boolean demo B");

      await page.getByTestId("shared-inspector-tab-history").click();
      await expect(page.getByText("Mesh History", { exact: true })).toBeVisible();
      await expect(page.getByText(`Boolean ${fixture.operation}`, { exact: true }).last()).toBeVisible();

      const contract = await runCanonicalWorkerCase(page, fixture.operation);
      expect(contract.ok).toBe(true);
      expect(contract.kernel).toBe("native-cgal");
      expect(contract.vertexCount).toBe(fixture.vertices);
      expect(contract.triCount).toBe(fixture.triangles);
      expect(contract.volume).toBeCloseTo(fixture.volume, 5);
      expect(contract.bounds[0]).toBeCloseTo(fixture.xBounds[0], 5);
      expect(contract.bounds[1]).toBeCloseTo(fixture.xBounds[1], 5);
      expect(contract.bounds.slice(2)).toEqual([-1, 1, -1, 1]);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
}

test("Auto union validates one mesh and its offset duplicate", async () => {
  test.skip(process.env.MATH3D_NATIVE_BOOLEAN_E2E !== "1", "Requires an installed local native CGAL worker.");
  const ctx = await launchSurfaceApp();
  try {
    const { page } = ctx;
    let card = await openMeshTools(page);
    await page.getByTestId("mesh-workspace-example-1").click();
    card = await openMeshTools(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-union").click();
    await card.getByTestId("mesh-workspace-operation-registry-duplicate-active-for-boolean").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-operand")).toContainText("copy B");
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-auto")).toHaveAttribute("aria-pressed", "true");

    await card.getByTestId("mesh-workspace-operation-registry-row-cgal-validate").click();
    await card.getByTestId("mesh-workspace-operation-registry-run-cgal-validate").click();
    const lastResult = card.getByTestId("mesh-workspace-operation-registry-last-result");
    await expect(lastResult).toContainText("Ready for robust operations", { timeout: 90_000 });

    await card.getByTestId("mesh-workspace-operation-registry-row-boolean-union").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-boolean-strategy-auto")).toHaveAttribute("aria-pressed", "true");
    await card.getByTestId("mesh-workspace-operation-registry-run-boolean-union").click();
    await expect(lastResult).toContainText("Boolean union", { timeout: 90_000 });
    await expect(lastResult).toContainText(/success/i);
    await expect(lastResult).toContainText("Native CGAL backend: CGAL corefine");
  } finally {
    await closeSurfaceApp(ctx);
  }
});
