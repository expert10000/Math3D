import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

for (const kind of ["hydrogen", "ssh"] as const) {
  test(`${kind} selected evidence publishes to a Workbook and rechecks after restart`, async () => {
    test.setTimeout(480_000);
    const root = await mkdtemp(join(tmpdir(), `m3d-${kind}-citation-`));
    const fixture = kind === "hydrogen"
      ? resolve(__dirname, "..", "fixtures", "quantum-scene-orbitals", "orbital-2p.qscene")
      : resolve(__dirname, "..", "fixtures", "quantum-scene", "run-145ac3f06cb940c28d457937345b0243.qscene");
    const source = join(root, "source.qscene"), profile = join(root, "profile");
    const packagePath = join(root, "citation.math3d.project.json");
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
      await citation.getByTestId("workbook-quantum-open-selection").click();
      await expect(reopenedProjects.getByTestId("project-study-quantum-return"))
        .toContainText(kind === "hydrogen" ? "density index" : "chain index 1 · bands index 2", { timeout: 60_000 });
      await expect(reopenedProjects.getByTestId("project-study-view"))
        .toHaveAttribute("data-study-id", saved.workspace.studies[0].id);
      if (kind === "hydrogen") {
        await expect(reopenedProjects.getByTestId("project-study-value-density")).toContainText("a0^-3", { timeout: 60_000 });
        await expect(reopenedProjects.getByTestId("project-study-value-phase")).toContainText("rad", { timeout: 60_000 });
      } else {
        await expect(reopenedProjects.getByTestId("project-study-value-chain")).toContainText('"sampleIndex":1', { timeout: 60_000 });
        await expect(reopenedProjects.getByTestId("project-study-value-bands")).toContainText('"sampleIndex":2', { timeout: 60_000 });
      }
      await app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
        (_event, item) => item.setSavePath(target)), packagePath);
      const header = reopenedProjects.getByTestId("project-explorer-header");
      if (!await header.getByText("More", { exact: true }).isVisible()) {
        const details = header.getByTestId("project-detail-toggle");
        if (!await details.isVisible()) await header.getByTestId("project-gallery-layout-toggle").click();
        if (!await header.getByText("More", { exact: true }).isVisible()) await details.click();
      }
      await header.getByText("More", { exact: true }).click();
      await header.getByRole("button", { name: "Import / export" }).click();
      await reopenedProjects.getByTestId("project-export-resources").click();
      await expect.poll(async () => {
        try { return JSON.parse(await readFile(packagePath, "utf8")).format; }
        catch { return null; }
      }).toBe("math3d.project-package");
      const exported = JSON.parse(await readFile(packagePath, "utf8"));
      expect(exported.project.workbooks[0].id).toBe(workbookId);
      expect(exported.resources).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "workbook-payload", id: workbookId }),
      ]));
      await reopenedProjects.getByTestId("project-research-nav-studies")
        .evaluate(element => (element as HTMLButtonElement).click());
      await reopenedProjects.getByTestId("project-study-workbook-references")
        .getByRole("button", { name: "Open cited block" }).click();
      const middleCitation = reopened.getByTestId("project-middle-workbook")
        .getByTestId("workbook-quantum-study-citation");
      await expect(middleCitation.getByTestId("workbook-quantum-citation-status"))
        .toHaveAttribute("data-status", "current", { timeout: 60_000 });
      const binary = join(source, kind === "hydrogen" ? "psi-real.f64" : "density.f64");
      const original = await readFile(binary), changed = Buffer.from(original);
      changed[0] ^= 1; await writeFile(binary, changed);
      await middleCitation.getByTestId("workbook-quantum-recheck").click();
      await expect(middleCitation.getByTestId("workbook-quantum-citation-status"))
        .toHaveAttribute("data-status", "withheld", { timeout: 60_000 });
      await expect(middleCitation.locator('[data-testid^="workbook-quantum-value-"]')).toHaveCount(0);
      await expect(middleCitation.getByTestId("workbook-quantum-omission").first())
        .toContainText(/changed|verification|integrity|hash/i);
      await middleCitation.getByTestId("workbook-quantum-open-selection").click();
      await expect(reopenedProjects.getByTestId("project-study-quantum-return"))
        .toBeVisible({ timeout: 60_000 });
      await expect(reopenedProjects.getByTestId("project-study-quantum-withheld"))
        .toBeVisible({ timeout: 60_000 });
      await expect(reopenedProjects.locator('[data-testid^="project-study-value-"]')).toHaveCount(0);
      await writeFile(binary, original);
      await app.close();
      app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
        env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "clean-profile") } });
      const transferred = await app.firstWindow();
      await transferred.getByTestId("projects-toggle").click();
      const transferredProjects = transferred.getByTestId("project-explorer-panel");
      await transferredProjects.getByTestId("project-import-file").setInputFiles({
        name: "citation.math3d.project.json", mimeType: "application/json",
        buffer: await readFile(packagePath),
      });
      await expect(transferredProjects.getByTestId("project-import-open")).toBeEnabled({ timeout: 60_000 });
      await transferredProjects.getByTestId("project-import-open").click();
      await expect(transferredProjects.getByTestId("project-message"))
        .toContainText("Opened supported project", { timeout: 60_000 });
      await transferredProjects.getByTestId(`project-open-workbook-${workbookId}`).click();
      await transferred.getByRole("button", { name: "Surfaces", exact: true }).first().click();
      await transferred.getByRole("button", { name: "Workbook", exact: true }).first().click();
      await transferred.getByTestId("workbook-view-document").click();
      const transferredCitation = transferred.getByTestId("workbook-quantum-study-citation").first();
      await expect(transferredCitation.getByTestId("workbook-quantum-citation-status"))
        .toHaveAttribute("data-status", "current", { timeout: 60_000 });
      await transferredCitation.getByTestId("workbook-quantum-open-selection").click();
      await expect(transferredProjects.getByTestId("project-study-quantum-return"))
        .toBeVisible({ timeout: 60_000 });
      await expect(transferredProjects.locator('[data-testid^="project-study-value-"]'))
        .toHaveCount(2, { timeout: 60_000 });
    } finally {
      await app.close();
      if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes(`m3d-${kind}-citation-`))
        throw new Error("Unsafe quantum citation cleanup path");
      await rm(root, { recursive: true, force: true });
    }
  });
}
