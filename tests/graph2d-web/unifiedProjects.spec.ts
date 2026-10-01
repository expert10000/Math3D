import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { runNamedProjectRoundTrip } from "../e2e/helpers/namedProjectRoundTrip";

test("PRJ08 named project checkpoints survive browser/mobile transfer, restart and managed history", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
  await runNamedProjectRoundTrip(page, async (checkpoint) => {
    const download = page.waitForEvent("download");
    await page.getByTestId(checkpoint ? "project-export-checkpoint" : "project-export").click();
    return readFileSync((await (await download).path())!, "utf8");
  });
  await page.getByTestId("project-explorer-panel").screenshot({ path: test.info().outputPath("project-roundtrip-phone.png") });
});
