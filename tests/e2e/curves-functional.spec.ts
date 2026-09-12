import { expect, test } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

test.describe("Curves canonical workspace", () => {
  test("publishes revisioned Curve provenance and persists lightweight definitions", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);

      const curvesTab = ctx.page.getByRole("button", { name: "Curves", exact: true }).first();
      await curvesTab.click();
      await expect(curvesTab).toHaveAttribute("aria-pressed", "true");

      const contract = ctx.page.getByTestId("curve-canonical-contract");
      await contract.scrollIntoViewIfNeeded();
      await expect(contract).toBeVisible();
      await expect(contract).toContainText("Canonical Curve contract");
      await expect(contract).toContainText("ID: circle2d · revision 1");
      await expect(contract).toContainText("parametric · 2D · source curves");
      await expect(contract).toContainText("Result: ready");

      const custom = ctx.page.getByRole("button", { name: /Custom x\(t\), y\(t\)/ }).first();
      await custom.click();
      await expect(contract).toContainText("ID: custom2d · revision 1");
      await ctx.page.getByRole("textbox", { name: "x(t)", exact: true }).fill("2*cos(t)");
      await expect(contract).toContainText("ID: custom2d · revision 2");

      await expect.poll(async () => ctx?.page.evaluate(() => {
        const serialized = localStorage.getItem("math3d.curveAnalysis.workspace.v1");
        if (!serialized) return null;
        const document = JSON.parse(serialized) as { version?: number; definitions?: Array<{ identity?: { curveId?: string; curveRevision?: number }; fingerprint?: string }> };
        const latest = document.definitions?.filter((entry) => entry.identity?.curveId === "custom2d").at(-1);
        return {
          version: document.version,
          curveId: latest?.identity?.curveId,
          revision: latest?.identity?.curveRevision,
          hasFingerprint: Boolean(latest?.fingerprint),
          containsTypedArrays: serialized.includes("Float64Array"),
        };
      })).toEqual({ version: 1, curveId: "custom2d", revision: 2, hasFingerprint: true, containsTypedArrays: false });
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
