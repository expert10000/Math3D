import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "../e2e/helpers/electronLauncher";

test("F08 exact matrix, polynomial and Groebner UI operations use real Sage routes", async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-f08-advanced-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  const observed: Record<string, unknown> = {};
  try {
    const healthResponse = await fetch("http://127.0.0.1:8767/health");
    expect(healthResponse.ok, "Start the real Docker Sage worker for F08.").toBe(true);
    const health = await healthResponse.json() as { engineVersion: string; operations: string[] };
    expect(health.operations).toEqual(expect.arrayContaining([
      "sage.matrix.eigen_exact", "sage.matrix.charpoly", "sage.polynomial.factor",
      "sage.polynomial.roots_exact", "sage.groebner.compute",
    ]));
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root,
        MATH3D_SAGE_SERVICE_URL: "http://127.0.0.1:8767" } });
    const page = await app.firstWindow();
    await page.getByTestId("workspace-nav-cas").click();
    const cas = page.getByTestId("cas-algebra-workspace");
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    const panel = cas.getByTestId("scientific-services-cas");
    await panel.getByLabel("Services preset").selectOption("All");
    await panel.getByRole("checkbox", { name: "JSON" }).check();

    const run = async (operation: string, backend: "local" | "docker") => {
      await panel.getByLabel("Operation").selectOption(operation);
      await panel.getByLabel("SageMath backend").selectOption(backend);
      await expect(panel).toContainText("Backend available for this operation", { timeout: 60_000 });
      await panel.getByRole("button", { name: "Run", exact: true }).click();
      const summary = panel.getByRole("status", { name: /Completed/ });
      await expect(summary).toBeVisible({ timeout: 90_000 });
      await summary.click();
      const response = JSON.parse(await panel.locator("pre").last().innerText());
      expect(response.success, `${operation} on ${backend}: ${response.error ?? ""}`).toBe(true);
      expect(response.operation).toBe(operation);
      expect(response.engineVersion).toMatch(/^\d+\.\d+/);
      observed[`${operation}:${backend}`] = { version: response.engineVersion, result: response.result };
      return response;
    };

    await test.step("F08-08 exact eigenvalues", async () => {
      await panel.getByLabel("Operation").selectOption("sage.matrix.eigen_exact");
      await panel.getByLabel("Square matrix (JSON, up to 8 × 8)").fill("[[1,0],[0,2]]");
      const response = await run("sage.matrix.eigen_exact", "docker");
      expect(response.result).toMatchObject({ inputShape: [2, 2], eigenvalues: ["1", "2"],
        charpoly: "lambda^2 - 3*lambda + 2" });
      expect(response.engineVersion).toBe(health.engineVersion);
    });
    await test.step("F08-09 characteristic polynomial", async () => {
      const response = await run("sage.matrix.charpoly", "docker");
      expect(response.result).toMatchObject({ inputShape: [2, 2], text: "lambda^2 - 3*lambda + 2" });
    });
    await test.step("F08-10 exact polynomial roots", async () => {
      await panel.getByLabel("Operation").selectOption("sage.polynomial.roots_exact");
      await panel.getByLabel("Integer coefficients (constant first)").fill("-2, 0, 1");
      const local = await run("sage.polynomial.roots_exact", "local");
      expect(local.result).toMatchObject({ verified: true, rootCount: 2 });
      expect(local.result.roots).toHaveLength(2);
      expect(local.result.roots[0].minimalPolynomialCoefficients).toEqual(["-2", "0", "1"]);
      await panel.getByLabel("Integer coefficients (constant first)").fill("-1, 0, 1");
      const docker = await run("sage.polynomial.roots_exact", "docker");
      expect(docker.result.roots).toEqual(expect.arrayContaining([
        { value: "1", multiplicity: 1 }, { value: "-1", multiplicity: 1 },
      ]));
    });
    await test.step("F08-11 exact polynomial factorization", async () => {
      const local = await run("sage.polynomial.factor", "local");
      expect(local.result).toMatchObject({ verified: true });
      const docker = await run("sage.polynomial.factor", "docker");
      expect(docker.result.text).toBe("(x - 1) * (x + 1)");
    });
    await test.step("F08-12 Groebner basis", async () => {
      await panel.getByLabel("Operation").selectOption("sage.groebner.compute");
      await panel.getByLabel("Polynomials (one per line)").fill("x-1\ny-2");
      await panel.getByLabel("Polynomial variables").fill("x,y");
      const response = await run("sage.groebner.compute", "docker");
      expect(response.result.basis).toEqual(["x - 1", "y - 2"]);
      await expect(cas.getByTestId("sage-analysis-result")).toContainText("SageMath (Docker)");
      await cas.getByTestId("sage-analysis-result").getByRole("button", { name: "Save to Workbook" }).click();
      await expect(page.getByTestId("workbook-sage-evidence").last()).toContainText(`SageMath ${health.engineVersion}`);
      await expect(page.getByTestId("workbook-sage-evidence").last()).toContainText("x - 1");
    });
    await writeFile(test.info().outputPath("f08-advanced-observation.json"), JSON.stringify(observed, null, 2));
  } finally {
    await app?.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-f08-advanced-"))
      throw new Error("Unsafe F08 advanced desktop cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
