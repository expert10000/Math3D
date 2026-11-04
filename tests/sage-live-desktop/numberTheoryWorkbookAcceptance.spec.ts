import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "../e2e/helpers/electronLauncher";

const serviceUrl = "http://127.0.0.1:8767";
type Evidence = { source: { module: string; id: string; expression: string };
  request: { operation: string; backend: string; params: Record<string, unknown> };
  engine: { version: string }; response: { success: boolean; error?: string; result: Record<string, unknown> };
  diagnostics: string[] };

function numberTheoryEvidence(bundle: any): Evidence[] {
  return bundle.payload.workbooks.flatMap((book: any) => book.stages.flatMap((stage: any) =>
    stage.blocks.map((block: any) => block.sageEvidence).filter((item: any) => item?.source?.module === "number_theory")));
}

async function exportWorkbook(page: Page, app: Awaited<ReturnType<typeof launchRepoElectron>>, path: string,
  button: "Export session bundle..." | "Export Markdown") {
  await app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
    (_event, item) => item.setSavePath(target)), path);
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect.poll(async () => { try { return (await readFile(path)).length; } catch { return 0; } }).toBeGreaterThan(100);
}

test("live Docker Number Theory Workbook retains exact successes and failed inverse after independent import", async () => {
  test.setTimeout(240_000);
  const healthResponse = await fetch(`${serviceUrl}/health`);
  expect(healthResponse.ok, "Start the real SageMath Docker service before this opt-in gate.").toBe(true);
  const health = await healthResponse.json() as { engineVersion: string; operations: string[] };
  expect(health.operations).toEqual(expect.arrayContaining(["sage.numberTheory.gcd", "sage.numberTheory.modInverse"]));
  const firstRoot = await mkdtemp(join(tmpdir(), "m3d-number-theory-workbook-"));
  const secondRoot = await mkdtemp(join(tmpdir(), "m3d-number-theory-workbook-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: firstRoot, MATH3D_SAGE_SERVICE_URL: serviceUrl } });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 900 });
    const cases = [
      { operation: "sage.numberTheory.gcd", label: "Greatest common divisor", expected: "6", params: { values: ["84", "30"] } },
      { operation: "sage.numberTheory.modInverse", label: "Modular inverse", expected: "4", params: { a: "3", modulus: "11" } },
      { operation: "sage.numberTheory.modInverse", label: "Modular inverse", expected: "does not exist", params: { a: "2", modulus: "4" } },
    ] as const;
    for (const [index, item] of cases.entries()) {
      await page.getByTestId("workspace-nav-number_theory").click();
      const workspace = page.getByTestId("number-theory-workspace");
      const services = workspace.getByTestId("scientific-services-number_theory");
      await services.getByLabel("Operation").selectOption(item.operation);
      await expect(services.getByLabel("SageMath backend")).toHaveValue("docker");
      await expect(services).toContainText("Backend available for this operation", { timeout: 60_000 });
      if (index === 2) {
        await services.getByLabel("Integer", { exact: true }).fill("2");
        await services.getByLabel("Modulus (greater than 1)").fill("4");
      }
      await services.getByRole("button", { name: "Run", exact: true }).click();
      const result = workspace.getByTestId("sage-analysis-result");
      await expect(result).toContainText(item.label, { timeout: 60_000 });
      await expect(result).toContainText(`Version: ${health.engineVersion}`);
      await expect(result).toContainText("Freeform input — no saved source link");
      await expect(result).toContainText(index === 2 ? "Failed · SageMath (Docker)" : "Exact · SageMath (Docker)");
      if (index === 2) {
        await expect(result.getByTestId("sage-result-kind-error")).toContainText("does not exist");
        await page.screenshot({ path: test.info().outputPath("number-theory-failed-inverse.png") });
      } else {
        await expect(result.getByTestId("sage-result-kind-expression")).toContainText(item.expected);
        if (index === 1) await page.screenshot({ path: test.info().outputPath("number-theory-valid-inverse.png") });
      }
      await result.getByRole("button", { name: "Save to Workbook" }).click();
      await expect(workspace).toHaveCount(0);
      await expect(page.getByTestId("workbook-sage-evidence").last()).toContainText("Freeform input saved with this result");
      if (index === 2) await expect(page.getByTestId("workbook-sage-evidence").last()).toContainText("Failed · inverse");
    }

    const bundlePath = test.info().outputPath("number-theory-workbook.math3d");
    await exportWorkbook(page, app, bundlePath, "Export session bundle...");
    const saved = numberTheoryEvidence(JSON.parse(await readFile(bundlePath, "utf8")));
    expect(saved).toHaveLength(3);
    for (const [index, item] of cases.entries()) {
      expect(saved[index]).toMatchObject({ source: { module: "number_theory", id: "sage-input:number-theory" },
        request: { operation: item.operation, backend: "docker", params: item.params },
        engine: { version: health.engineVersion }, response: { success: index !== 2 } });
      expect(saved[index].source.expression).toBe(["84, 30", "3 mod 11", "2 mod 4"][index]);
    }
    expect(saved[0].response.result).toMatchObject({ value: "6" });
    expect(saved[1].response.result).toMatchObject({ value: "4", modulus: "11" });
    expect(saved[2].response.error).toContain("does not exist");
    expect(saved[2].diagnostics.join(" ")).toContain("does not exist");

    const markdownPath = test.info().outputPath("number-theory-workbook.md");
    await exportWorkbook(page, app, markdownPath, "Export Markdown");
    const markdown = await readFile(markdownPath, "utf8");
    for (const entry of ["sage.numberTheory.gcd", "sage.numberTheory.modInverse", `SageMath ${health.engineVersion}`,
      "84, 30", "3 mod 11", "2 mod 4", 'Result: {"value":"6"}', 'Result: {"value":"4","modulus":"11"}',
      "Status: Failed", "Error:", "does not exist"])
      expect(markdown).toContain(entry);

    await app.close(); app = undefined;
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: secondRoot, MATH3D_SAGE_SERVICE_URL: serviceUrl } });
    const importedPage = await app.firstWindow();
    await importedPage.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await importedPage.locator('input[type="file"][accept=".math3d,.json,application/json"]').setInputFiles(bundlePath);
    await expect(importedPage.getByTestId("workbook-sage-evidence").last()).toContainText(`SageMath ${health.engineVersion}`);
    await expect(importedPage.getByTestId("workbook-sage-evidence").last()).toContainText("Failed · inverse");
    await importedPage.getByTestId("workbook-sage-evidence").last().scrollIntoViewIfNeeded();
    await importedPage.screenshot({ path: test.info().outputPath("number-theory-independent-import.png") });
    const roundtripPath = test.info().outputPath("number-theory-roundtrip.math3d");
    await exportWorkbook(importedPage, app, roundtripPath, "Export session bundle...");
    expect(numberTheoryEvidence(JSON.parse(await readFile(roundtripPath, "utf8")))).toEqual(saved);
    await writeFile(test.info().outputPath("number-theory-observation.json"), JSON.stringify({
      runtime: `SageMath ${health.engineVersion} Docker`, operations: cases.map(item => item.operation),
      results: saved.map(item => ({ source: item.source, request: item.request, response: item.response })),
      independentImport: true,
    }, null, 2));
  } finally {
    await app?.close();
    for (const root of [firstRoot, secondRoot]) {
      if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-number-theory-workbook-"))
        throw new Error("Unsafe Number Theory Workbook test cleanup path");
      await rm(root, { recursive: true, force: true });
    }
  }
});
