import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

const repo = resolve(__dirname, "..", "..");
const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "fixture-rice-mele-five-run-convergence.qscene");
const studyFile = resolve(__dirname, "..", "fixtures", "quantum-scene", "rice-mele-convergence-producer-study.json");
const launch = (bundle: string, profile: string) => launchRepoElectron({ args: [".", "--quantum-scene", bundle], cwd: repo,
  env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
async function cleanup(root: string) {
  if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-rice-convergence-")) throw new Error("Unsafe test cleanup");
  await rm(root, { recursive: true, force: true });
}

test("five-run Rice–Mele scene keeps the two axes and exact samples after restart", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-rice-convergence-"));
  const study = JSON.parse(await readFile(studyFile, "utf8"));
  try {
    for (let opening = 0; opening < 2; opening++) {
      const app = await launch(fixture, join(root, "profile"));
      try {
        const page = await app.firstWindow(), profile = page.getByTestId("rice-convergence-profile");
        await expect(profile).toBeVisible();
        await expect(profile).toContainText(study.studyId);
        await expect(page.getByTestId("rice-convergence-selection")).toHaveCount(0);
        await expect(page.getByTestId("rice-convergence-periodic")).toContainText("Cycle duration (inverse hopping energy)");
        await expect(page.getByTestId("rice-convergence-periodic")).toContainText("electron charge / cell");
        await expect(page.getByTestId("rice-convergence-chain")).toContainText("Open-chain width (cells)");
        await expect(page.getByTestId("rice-convergence-chain")).toContainText("electron charge");
        await profile.getByRole("button", { name: "Inspect periodic point 2, duration 30" }).click();
        const selected = page.getByTestId("rice-convergence-selection");
        const anchor = study.sources.find((source: { runId: string }) => source.runId === study.plan.anchorRunId);
        await expect(selected).toContainText(anchor.periodicCharge.toPrecision(12));
        await expect(selected).toContainText(anchor.runId);
        await expect(selected).toContainText(anchor.resultSha256);
        await profile.getByRole("button", { name: "Inspect chain point 3, width 8" }).click();
        const wide = study.sources.find((source: { chainCells: number }) => source.chainCells === 8);
        await expect(selected).toContainText(wide.chainCentralBondCharge.toPrecision(12));
        await expect(selected).toContainText(wide.runId);
        await expect(profile).toContainText("do not fit, extrapolate, or claim a shared limit");
      } finally { await app.close(); }
    }
  } finally { await cleanup(root); }
});

for (const kind of ["changed", "missing"] as const) {
  test(`Rice–Mele convergence refuses ${kind} source bytes on selection and restart`, async () => {
    test.setTimeout(150_000);
    const root = await mkdtemp(join(tmpdir(), "m3d-rice-convergence-"));
    const altered = join(root, "altered.qscene");
    try {
      await cp(fixture, altered, { recursive: true });
      const app = await launch(altered, join(root, "profile"));
      try {
        const page = await app.firstWindow();
        await expect(page.getByTestId("rice-convergence-profile")).toBeVisible();
        const file = join(altered, kind === "changed" ? "periodic-recorded-charge.f64" : "chain-recorded-charge.f64");
        if (kind === "missing") await rm(file);
        else { const bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes); }
        await page.getByRole("button", { name: "Inspect periodic point 1, duration 20" }).click();
        await expect(page.getByRole("alert")).toContainText(/refused|integrity|hash|missing|invalid/i);
        await expect(page.getByTestId("rice-convergence-selection")).toHaveCount(0);
      } finally { await app.close(); }
      const restarted = await launch(altered, join(root, "profile"));
      try {
        const page = await restarted.firstWindow();
        await expect(page.getByTestId("rice-convergence-profile")).toHaveCount(0);
        await expect(page.getByText(/integrity|hash|missing|invalid scene/i).first()).toBeVisible();
      } finally { await restarted.close(); }
    } finally { await cleanup(root); }
  });
}
