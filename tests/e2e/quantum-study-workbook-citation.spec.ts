import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

for (const kind of ["hydrogen", "ssh"] as const) {
  test(`${kind} selected evidence publishes to a Workbook and rechecks after restart`, async () => {
    test.setTimeout(300_000);
    const root = await mkdtemp(join(tmpdir(), `m3d-${kind}-citation-`));
    const fixture = kind === "hydrogen"
      ? resolve(__dirname, "..", "fixtures", "quantum-scene-orbitals", "orbital-2p.qscene")
      : resolve(__dirname, "..", "fixtures", "quantum-scene", "run-145ac3f06cb940c28d457937345b0243.qscene");
    const source = join(root, "source.qscene"), profile = join(root, "profile");
    await cp(fixture, source, { recursive: true });
    let app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
    try {
      const page = await app.firstWindow();
      if (kind === "hydrogen") {
        await page.getByTestId("hydrogen-save-project-study").click({ timeout: 60_000 });
        const projects = page.getByTestId("project-explorer-panel");
        await projects.getByTestId("project-open-hydrogen-study-new").click();
        await expect(projects.getByTestId("project-quantum-scene-message"))
          .toContainText("Verified hydrogen scene and complex field staged", { timeout: 60_000 });
        await projects.getByTestId("project-study-preview-toggle-pane-1").click();
        await projects.getByTestId("quantum-field-canvas").click({ position: { x: 150, y: 150 } });
        await expect(projects.getByTestId("project-study-value-density")).toContainText("a0^-3", { timeout: 60_000 });
        await expect(projects.getByTestId("project-study-value-phase")).toContainText("rad", { timeout: 60_000 });
      } else {
        const viewer = page.getByTestId("ssh-study-profile");
        await viewer.getByTestId("ssh-link-views").click();
        await viewer.getByTestId("ssh-save-project-study").click();
        const projects = page.getByTestId("project-explorer-panel");
        await projects.getByTestId("project-open-ssh-study-new").click();
        await expect(projects.getByTestId("project-quantum-scene-message"))
          .toContainText("Both exact SSH views staged", { timeout: 60_000 });
        await projects.getByTestId("project-study-chain-index").fill("1");
        await projects.getByTestId("project-study-pin-chain").click();
        await expect(projects.getByTestId("project-study-value-chain"))
          .toContainText('"sampleIndex":1', { timeout: 60_000 });
        await projects.getByTestId("project-study-bands-index").fill("2");
        await projects.getByTestId("project-study-pin-bands").click();
        await expect(projects.getByTestId("project-study-value-bands"))
          .toContainText('"sampleIndex":2', { timeout: 60_000 });
      }
      const projects = page.getByTestId("project-explorer-panel");
      await projects.getByTestId("project-save").click();
      await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
      await projects.getByTestId("project-study-publish-quantum-workbook").click();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
        .workbooks?.length ?? 0)).toBe(1);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
      expect(saved.workbooks).toHaveLength(1);
      const workbookId = saved.workbooks[0].id as string;
      const projectId = saved.identity.id as string;
      await app.close();
      app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
      const reopened = await app.firstWindow();
      await reopened.getByTestId("projects-toggle").click();
      const reopenedProjects = reopened.getByTestId("project-explorer-panel");
      await reopenedProjects.getByTestId(`project-open-saved-${projectId}`).click();
      await expect(reopenedProjects.getByTestId("project-message"))
        .toContainText("Opened supported project", { timeout: 60_000 });
      await reopenedProjects.getByTestId(`project-open-workbook-${workbookId}`).click();
      await reopened.getByRole("button", { name: "Surfaces", exact: true }).first().click();
      await reopened.getByRole("button", { name: "Workbook", exact: true }).first().click();
      await reopened.getByTestId("workbook-view-document").click();
      const citation = reopened.getByTestId("workbook-quantum-study-citation").first();
      await expect(citation.getByTestId("workbook-quantum-citation-status"))
        .toHaveAttribute("data-status", "current", { timeout: 60_000 });
      await expect(citation).toContainText("result SHA-256");
      await expect(citation).toContainText("saved source fingerprint");
      if (kind === "hydrogen") {
        await expect(citation.getByTestId("workbook-quantum-value-density")).toContainText("a0^-3");
        await expect(citation.getByTestId("workbook-quantum-value-phase")).toContainText("rad");
      } else {
        await expect(citation.getByTestId("workbook-quantum-value-chain")).toContainText('"sampleIndex": 1');
        await expect(citation.getByTestId("workbook-quantum-value-bands")).toContainText('"sampleIndex": 2');
        await expect(citation.getByTestId("workbook-quantum-omission"))
          .toContainText("edge/bulk classification is not inferred");
      }
      const binary = join(source, kind === "hydrogen" ? "psi-real.f64" : "density.f64");
      const bytes = await readFile(binary); bytes[0] ^= 1; await writeFile(binary, bytes);
      await citation.getByTestId("workbook-quantum-recheck").click();
      await expect(citation.getByTestId("workbook-quantum-citation-status"))
        .toHaveAttribute("data-status", "withheld", { timeout: 60_000 });
      await expect(citation.locator('[data-testid^="workbook-quantum-value-"]')).toHaveCount(0);
      await expect(citation.getByTestId("workbook-quantum-omission").first())
        .toContainText(/changed|verification|integrity|hash/i);
    } finally {
      await app.close();
      if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes(`m3d-${kind}-citation-`))
        throw new Error("Unsafe quantum citation cleanup path");
      await rm(root, { recursive: true, force: true });
    }
  });
}
