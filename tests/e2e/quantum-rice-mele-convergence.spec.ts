import { expect, test } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
        await expect(page.getByTestId("quantum-scene-preview").getByText("Study:", { exact: true })).toBeVisible();
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

test("selected convergence points launch their exact Lab runs, never the study ID", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-rice-convergence-"));
  const target = join(root, "fake-theory-lab"), capture = join(root, "launches.jsonl");
  const study = JSON.parse(await readFile(studyFile, "utf8"));
  const anchor = study.sources.find((source: { runId: string }) => source.runId === study.plan.anchorRunId);
  const wide = study.sources.find((source: { chainCells: number }) => source.chainCells === 8);
  const sourceDist = resolve(repo, "node_modules", "electron", "dist");
  try {
    await mkdir(join(target, "dist"), { recursive: true });
    await mkdir(join(target, "node_modules", "electron"), { recursive: true });
    await writeFile(join(target, "package.json"), JSON.stringify({ name: "theory-lab", main: "dist/main.cjs" }));
    await writeFile(join(target, "dist", "main.cjs"),
      "require('node:fs').appendFileSync(process.env.MATH3D_LAB_CAPTURE, JSON.stringify({argv:process.argv}) + '\\n'); process.exit(0);\n");
    await writeFile(join(target, "dist", "preload.cjs"), "\n");
    await writeFile(join(target, "dist", "index.html"), "<!doctype html>\n");
    await symlink(sourceDist, join(target, "node_modules", "electron", "dist"), process.platform === "win32" ? "junction" : "dir")
      .catch(async () => { await cp(sourceDist, join(target, "node_modules", "electron", "dist"), { recursive: true }); });
    const launchWithTarget = () => launchRepoElectron({ args: [".", "--quantum-scene", fixture], cwd: repo,
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile"),
        MATH3D_THEORY_LAB_HOME: target, MATH3D_LAB_CAPTURE: capture } });
    const launches = async () => (await readFile(capture, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const launchCount = async () => { try { return (await launches()).length; } catch { return 0; } };
    for (let opening = 0; opening < 2; opening++) {
      const app = await launchWithTarget();
      try {
        const page = await app.firstWindow(), profile = page.getByTestId("rice-convergence-profile");
        await expect(profile).toBeVisible();
        await expect(page.getByTestId("quantum-open-source-run")).toHaveCount(0);
        await expect(page.getByTestId("rice-convergence-open-selected-run")).toHaveCount(0);
        const fingerprint = "8e8aeb3077923dd3f884c2f0771be05eb2965a32d0df1e806111f2d71d2b7b9d";
        const generic = await page.evaluate(value => (window as any).quantumScenes.openSourceRun(value), fingerprint);
        expect(generic).toMatchObject({ ok: false, error: expect.stringContaining("Select a convergence point") });
        const unselected = await page.evaluate(({ fingerprint, runId, resultSha256 }) =>
          (window as any).quantumScenes.openStudySourceRun({ fingerprint, series: "periodic", sampleIndex: 1,
            runId, resultSha256 }), { fingerprint, runId: anchor.runId, resultSha256: anchor.resultSha256 });
        expect(unselected).toMatchObject({ ok: false, error: expect.stringContaining("Select and verify") });
        const wrong = await page.evaluate(({ id, hash, fingerprint }) => (window as any).quantumScenes.openStudySourceRun({
          fingerprint,
          series: "periodic", sampleIndex: 1, runId: id, resultSha256: hash,
        }), { id: wide.runId, hash: wide.resultSha256, fingerprint });
        expect(wrong).toMatchObject({ ok: false });
        expect(await launchCount()).toBe(opening * 2);
        await profile.getByRole("button", { name: "Inspect periodic point 2, duration 30" }).click();
        await page.getByTestId("rice-convergence-open-selected-run").click();
        await expect(page.getByTestId("rice-convergence-run-status")).toContainText(anchor.runId);
        await expect.poll(launchCount).toBe(opening * 2 + 1);
        const first = (await launches())[opening * 2];
        let flag = first.argv.indexOf("--quantum-source-run");
        expect(first.argv.slice(flag + 1, flag + 3)).toEqual([anchor.runId, anchor.resultSha256]);
        await profile.getByRole("button", { name: "Inspect chain point 3, width 8" }).click();
        await page.getByTestId("rice-convergence-open-selected-run").click();
        await expect(page.getByTestId("rice-convergence-run-status")).toContainText(wide.runId);
        await expect.poll(async () => (await launches()).length).toBe((opening + 1) * 2);
        const second = (await launches()).at(-1);
        flag = second.argv.indexOf("--quantum-source-run");
        expect(second.argv.slice(flag + 1, flag + 3)).toEqual([wide.runId, wide.resultSha256]);
        expect(second.argv).not.toContain(study.studyId);
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
        await page.getByRole("button", { name: "Inspect periodic point 1, duration 20" }).click();
        await expect(page.getByTestId("rice-convergence-selection")).toBeVisible();
        const file = join(altered, kind === "changed" ? "periodic-recorded-charge.f64" : "chain-recorded-charge.f64");
        if (kind === "missing") await rm(file);
        else { const bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes); }
        await page.getByTestId("rice-convergence-open-selected-run").click();
        await expect(page.getByTestId("rice-convergence-run-status")).toContainText(/unavailable:.*(integrity|hash|missing|invalid|ENOENT)/i);
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
