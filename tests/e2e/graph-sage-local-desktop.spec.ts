import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";
import { graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("desktop Graph Services retains real local Sage evidence through edits and independent Workbook import", async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-sage-local-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root } });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Function");
    const editor = graphEditor(page);
    await editor.getByLabel("Start from preset").selectOption("parabola");
    await editor.getByLabel("Function expression").fill("x^2 - 1");
    await saveGraphEditor(page);
    await page.getByLabel("Graph functions").getByRole("button", { name: "Select Parabola" }).click();
    await page.getByTestId("graph2d-services-tab").click();
    const services = page.getByTestId("scientific-services-graphs");
    await services.getByLabel("Services preset").selectOption("Basic");
    await expect(services.getByLabel("SageMath backend")).toHaveValue("local");
    await services.getByRole("button", { name: "Factor", exact: true }).click();
    await services.getByRole("button", { name: "Use selected graph y(x)" }).click();
    await expect(services.getByLabel("Expression")).toHaveValue("x^2 - 1");
    await expect(services).toContainText("Backend available for this operation", { timeout: 90_000 });

    const started = Date.now();
    await services.getByRole("button", { name: "Run", exact: true }).click();
    const result = page.getByLabel("Graph inspector").getByTestId("sage-analysis-result");
    await expect(result).toContainText("Exact · SageMath (Local WSL)", { timeout: 100_000 });
    await expect(result).toContainText("Version: 9.5");
    await expect(result).toContainText("Source current");
    await expect(result.getByTestId("sage-result-kind-expression")).toContainText("x - 1");
    await expect(result.getByTestId("sage-result-kind-expression")).toContainText("x + 1");
    const firstRunMs = Date.now() - started;
    await page.screenshot({ path: test.info().outputPath("graph-sage-local-current.png") });
    await result.getByRole("button", { name: "Save to Workbook" }).click();
    const evidence = page.getByTestId("workbook-sage-evidence");
    await expect(evidence).toContainText("Source current");
    await expect(evidence).toContainText("SageMath 9.5");

    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph2d-objects-tab").click();
    await page.getByLabel("Graph inspector").getByRole("button", { name: "Edit graph" }).click();
    const edit = graphEditor(page);
    await edit.getByLabel("Function expression").fill("x^2 + 1");
    await saveGraphEditor(page);
    await page.getByTestId("workspace-nav-surfaces").click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await expect(evidence).toContainText("Source changed — rerun required");
    await evidence.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("graph-sage-workbook-stale.png") });

    const bundlePath = test.info().outputPath("graph-sage-workbook.math3d");
    await app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), bundlePath);
    await page.getByRole("button", { name: "Export session bundle..." }).click();
    await expect.poll(async () => { try { return (await readFile(bundlePath, "utf8")).length; } catch { return 0; } }).toBeGreaterThan(100);
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    const saved = bundle.payload.workbooks.flatMap((book: any) => book.stages.flatMap((stage: any) =>
      stage.blocks.map((block: any) => block.sageEvidence).filter(Boolean))).find((item: any) => item.source.module === "graphs");
    expect(saved).toMatchObject({ kind: "sage-result/v1",
      source: { module: "graphs", expression: "x^2 - 1" },
      request: { operation: "sage.symbolic.factor", backend: "local",
        params: { expression: "x^2 - 1", variables: ["x"] } },
      engine: { version: "9.5" }, response: { success: true, result: { text: expect.stringContaining("x - 1") } } });

    const markdownPath = test.info().outputPath("graph-sage-workbook.md");
    await app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), markdownPath);
    await page.getByRole("button", { name: "Export Markdown", exact: true }).click();
    await expect.poll(async () => { try { return (await readFile(markdownPath, "utf8")).length; } catch { return 0; } }).toBeGreaterThan(100);
    const markdown = await readFile(markdownPath, "utf8");
    expect(markdown).toContain("sage.symbolic.factor");
    expect(markdown).toContain("SageMath 9.5");
    expect(markdown).toContain("x - 1");
    expect(markdown).toContain("x + 1");

    await page.reload();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("Source unavailable — verify before reuse");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1");
    });
    await page.reload();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.locator('input[type="file"][accept=".math3d,.json,application/json"]').setInputFiles(bundlePath);
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("SageMath 9.5");
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("Source unavailable — verify before reuse");
    await page.getByTestId("workbook-sage-evidence").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("graph-sage-independent-import.png") });
    await writeFile(test.info().outputPath("graph-sage-observation.json"), JSON.stringify({
      runtime: "SageMath 9.5 Local WSL", firstRunMs, operation: saved.request.operation,
      source: saved.source, result: saved.response.result.text,
    }, null, 2));
  } finally {
    await app?.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-graph-sage-local-"))
      throw new Error("Unsafe Graph Sage local test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
