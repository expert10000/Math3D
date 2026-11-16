import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("SSH study links source-matched finite chain and bands without inferring a phase", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-ssh-"));
  const app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await page.getByTestId("quantum-example-ssh-chain").click();
    const profile = page.getByTestId("ssh-study-profile");
    await expect(profile).toContainText("finite chain");
    await expect(profile).toContainText("does not infer edge/bulk classification");
    await profile.getByTestId("ssh-link-views").click();
    await expect(profile.getByTestId("ssh-study-source")).toContainText("run-145ac3f06cb940c28d457937345b0243");
    await expect(profile).toContainText("Intracell A–B / t₁ = 0.6");
    await expect(profile).toContainText("Midgap-pair density (color)");
    await expect(profile).toContainText("SSH winding: 1");
    await expect(profile).toContainText("worker bulk gap 0.8");
    await profile.getByTestId("ssh-view-bands").click();
    await expect(profile.getByTestId("ssh-view-bands")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("quantum-band-legend")).toContainText("Lower band");
    await page.getByRole("button", { name: "Inspect first band sample band-0" }).click();
    await expect(page.getByTestId("quantum-band-selection")).toContainText("Stored datasets");
    await profile.getByTestId("ssh-view-chain").click();
    await expect(profile.getByTestId("ssh-view-chain")).toHaveAttribute("aria-pressed", "true");
    await expect(profile).toContainText("producer status: verified");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-ssh-")) throw new Error("Unsafe SSH cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SSH study refuses modified chain source instead of pairing it with pinned bands", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-q08-ssh-"));
  const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-145ac3f06cb940c28d457937345b0243.qscene");
  const source = join(root, "source.qscene");
  await cp(fixture, source, { recursive: true });
  const app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: join(root, "profile") } });
  try {
    const page = await app.firstWindow();
    const profile = page.getByTestId("ssh-study-profile");
    await expect(profile).toBeVisible();
    const binary = join(source, "density.f64"), bytes = await readFile(binary);
    bytes[0] ^= 1; await writeFile(binary, bytes);
    await profile.getByTestId("ssh-link-views").click();
    await expect(profile.getByRole("alert")).toContainText("Current SSH source failed exact read-back verification");
    await expect(profile.getByTestId("ssh-view-bands")).toHaveCount(0);
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-q08-ssh-")) throw new Error("Unsafe SSH cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("SSH pair saves as a source-linked Project Study, reopens, and refuses a changed bundle", async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-ssh-project-"));
  const fixture = resolve(__dirname, "..", "fixtures", "quantum-scene", "run-145ac3f06cb940c28d457937345b0243.qscene");
  const source = join(root, "chain.qscene"), profile = join(root, "profile");
  await cp(fixture, source, { recursive: true });
  let app = await launchRepoElectron({ args: [".", "--quantum-scene", source], cwd: resolve(__dirname, "..", ".."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
  try {
    const page = await app.firstWindow();
    const viewer = page.getByTestId("ssh-study-profile");
    await expect(viewer).toBeVisible({ timeout: 60_000 });
    await viewer.getByTestId("ssh-link-views").click();
    await expect(viewer.getByTestId("ssh-study-source")).toContainText("run-145ac3f06cb940c28d457937345b0243");
    await viewer.getByTestId("ssh-save-project-study").click();
    const projects = page.getByTestId("project-explorer-panel");
    await expect(projects.getByTestId("project-ssh-study-request")).toBeVisible();
    await projects.getByTestId("project-open-ssh-study-new").click();
    await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Both exact SSH views staged", { timeout: 60_000 });
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.quantumStudies[0]).toMatchObject({ templateId: "ssh",
      source: { runId: "run-145ac3f06cb940c28d457937345b0243" } });
    expect(saved.workspace.quantumStudies[0].panels.map((item: { role: string }) => item.role)).toEqual(["chain", "bands"]);
    expect(saved.workspace.studies[0].members).toHaveLength(2);
    expect(saved.notes.filter((item: { title: string }) => item.title.startsWith("SSH "))).toHaveLength(2);
    const id = saved.identity.id as string;
    await app.close();
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
    const reopened = await app.firstWindow();
    await reopened.getByTestId("projects-toggle").click();
    const reopenedProjects = reopened.getByTestId("project-explorer-panel");
    await reopenedProjects.getByTestId(`project-open-saved-${id}`).click();
    await expect(reopenedProjects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    await expect(reopenedProjects.getByTestId("project-ssh-source-evidence")).toContainText("Exact source evidence");
    const reopenedSource = await reopened.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workspace.quantumStudies[0].source);
    expect(reopenedSource).toEqual(saved.workspace.quantumStudies[0].source);
    await app.close();
    const binary = join(source, "density.f64"), bytes = await readFile(binary);
    bytes[0] ^= 1; await writeFile(binary, bytes);
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "..", ".."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile } });
    const changed = await app.firstWindow();
    await changed.getByTestId("projects-toggle").click();
    const changedProjects = changed.getByTestId("project-explorer-panel");
    await changedProjects.getByTestId(`project-open-saved-${id}`).click();
    await expect(changedProjects.getByTestId("project-message"))
      .toContainText(/Project import failed:.*(integrity|hash|changed|verify)/i, { timeout: 60_000 });
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-ssh-project-")) throw new Error("Unsafe SSH Project cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
