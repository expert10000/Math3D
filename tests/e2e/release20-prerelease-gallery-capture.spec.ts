import { expect, test, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { PNG } from "pngjs";
import { launchRepoElectron } from "./helpers/electronLauncher";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const commit = process.env.MATH3D_RELEASE20_SOURCE_COMMIT ?? "";
const harnessCommit = process.env.MATH3D_RELEASE20_HARNESS_COMMIT ?? "";
const installerSha256 = process.env.MATH3D_RELEASE20_INSTALLER_SHA256 ?? "";
const output = process.env.MATH3D_RELEASE20_GALLERY_OUT;
const installed = process.env.MATH3D_PACKAGED_APP_EXE;
const freshReceipt = process.env.MATH3D_RELEASE20_FRESH_RECEIPT;

test("capture exact installed prerelease Surface, Quantum, and Algebra scenes", async () => {
  test.skip(process.platform !== "win32" || !installed || !output || !freshReceipt,
    "Requires an exact installed Windows prerelease and passed Fresh receipt");
  test.setTimeout(240_000);
  expect(commit).toMatch(/^[0-9a-f]{40}$/);
  expect(harnessCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(installerSha256).toMatch(/^[0-9a-f]{64}$/);
  const freshBytes = await readFile(freshReceipt!);
  const freshReceiptSha256 = sha256(freshBytes);
  const fresh = JSON.parse(freshBytes.toString("utf8"));
  expect(fresh).toMatchObject({ schema: "math3d/release20-selfsigned-installed/v1",
    status: "passed", sourceCommit: commit, harnessCommit, installerSha256,
    installedJourneysQualified: true, trust: "self-signed-untrusted-by-default" });
  await mkdir(output!, { recursive: true });
  const captures: Array<{ scenario: string; file: string; sha256: string; sourceHash: string;
    evidenceFile: string; evidenceSha256: string }> = [];
  const fixtureMatrix = JSON.parse(await readFile(resolve("docs/evidence/quantum-qi40-scene-matrix.json"), "utf8"));

  async function capture(scenario: "surface" | "quantum" | "algebra",
    sourceHash: string, page: Page) {
    expect(sourceHash).toMatch(/^[0-9a-f]{64}$/);
    const file = `${scenario}-installed.png`;
    const image = await page.screenshot({ path: join(output!, file), animations: "disabled" });
    const png = PNG.sync.read(image);
    expect(png.width).toBeGreaterThanOrEqual(1400);
    expect(png.height).toBeGreaterThanOrEqual(900);
    const evidenceFile = `${scenario}-scene.json`;
    const evidence = { schema: "math3d/release20-scene-capture/v1", status: "passed",
      scenario, appVersion: "2.0.0", sourceCommit: commit, harnessCommit,
      installerSha256, freshReceiptSha256,
      sourceHash, captureKind: "installed-selfsigned-prerelease",
      checks: { sourceVerified: "passed", installedUiCapture: "passed" } };
    const evidenceBytes = Buffer.from(JSON.stringify(evidence, null, 2) + "\n");
    await writeFile(join(output!, evidenceFile), evidenceBytes);
    captures.push({ scenario, file, sha256: sha256(image), sourceHash,
      evidenceFile, evidenceSha256: sha256(evidenceBytes) });
  }

  async function withApp(run: (app: ElectronApplication) => Promise<void>) {
    const profile = await mkdtemp(join(tmpdir(), "m3d-prerelease-gallery-"));
    let app: ElectronApplication | undefined;
    try {
      app = await launchRepoElectron({ args: ["."], cwd: resolve("."),
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile, MATH3D_RELEASE20_EXPECTED_VERSION: "2.0.0",
          MATH3D_SAGE_SERVICE_URL: process.env.MATH3D_RELEASE20_SAGE_SERVICE_URL } });
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000));
      await run(app);
    } finally {
      await app?.close();
      if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("m3d-prerelease-gallery-"))
        throw new Error("Unsafe temporary profile cleanup path");
      await rm(profile, { recursive: true, force: true });
    }
  }

  await withApp(async app => {
    const page = await app.firstWindow();
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-explorer-panel").getByTestId("project-template-open-catenary-study").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1"))).not.toBeNull();
    const source = await page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
    expect(JSON.parse(source).metadata.title).toBe("Minimal Surface Study");
    await page.getByTestId("workspace-nav-surfaces").click();
    await capture("surface", sha256(source), page);
  });

  await withApp(async app => {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await page.getByTestId("quantum-scene-examples").getByTestId("quantum-example-qwz-curvature").click();
    await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
    const fingerprint = await page.evaluate(async () => {
      const opened = await window.quantumScenes?.reopenRecent();
      if (!opened?.ok) throw new Error("Verified quantum scene did not reopen");
      return opened.reference.sceneFingerprint;
    });
    const expected = fixtureMatrix.fixtures.find((entry: { id: string }) => entry.id === "qwz-curvature");
    expect(fingerprint).toBe(expected.fingerprint);
    await capture("quantum", expected.fingerprint, page);
  });

  await withApp(async app => {
    const page = await app.firstWindow();
    await page.getByTestId("workspace-nav-cas").click();
    const cas = page.getByTestId("cas-algebra-workspace");
    await expect(cas).toBeVisible();
    const services = cas.getByTestId("scientific-services-cas");
    await services.getByLabel("Services preset").selectOption("Basic");
    await services.getByLabel("SageMath backend").selectOption("docker");
    const expression = await services.getByLabel("Expression", { exact: true }).inputValue();
    expect(expression).toBe("sin(x)^2 + cos(x)^2");
    await services.getByRole("button", { name: "Run", exact: true }).click();
    const result = cas.getByTestId("sage-analysis-result");
    await expect(result).toContainText("SageMath (Docker)", { timeout: 60_000 });
    await expect(result).toContainText("Version: 10.10");
    await capture("algebra", sha256(expression), page);
  });

  await writeFile(join(output!, "manifest.json"), JSON.stringify({
    schema: "math3d/release20-prerelease-gallery/v1", status: "captured-needs-visual-review",
    version: "2.0.0", sourceCommit: commit, harnessCommit, installerSha256,
    freshReceiptSha256, captures,
  }, null, 2) + "\n");
});
