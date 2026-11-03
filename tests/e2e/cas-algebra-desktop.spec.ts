import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("desktop CAS reuses Sage Services, Inspector, runtime discovery, and trusted Console", async () => {
  test.setTimeout(180_000);
  const requests: Array<{ operation: string; params: Record<string, unknown> }> = [];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: true,
        status: "ok", operations: ["sage.symbolic.simplify"] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body) as typeof requests[number];
      requests.push(request);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.6", operation: request.operation,
        success: true, result: { text: "cas-exact-result" }, latex: "", warnings: ["test warning"] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage test server did not bind.");
  const root = await mkdtemp(join(tmpdir(), "m3d-cas-desktop-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root,
        MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` } });
    const page = await app.firstWindow();
    await page.getByTestId("workspace-nav-cas").click();
    const cas = page.getByTestId("cas-algebra-workspace");
    await expect(cas).toBeVisible();
    const services = cas.getByTestId("scientific-services-cas");
    await services.getByLabel("Services preset").selectOption("Basic");
    await services.getByLabel("SageMath backend").selectOption("docker");
    await services.getByRole("button", { name: "Run", exact: true }).click();
    const result = cas.getByTestId("sage-analysis-result");
    await expect(result).toContainText("cas-exact-result");
    await expect(result).toContainText("SageMath (Docker)");
    await expect(result).toContainText("Version: 10.6");
    await expect(result).toContainText("test warning");
    await expect(result).toContainText("Freeform input");
    expect(requests).toMatchObject([{ operation: "sage.symbolic.simplify",
      params: { expression: "sin(x)^2 + cos(x)^2" } }]);

    await cas.getByRole("button", { name: "Runtimes", exact: true }).click();
    await expect(cas.getByTestId("sage-runtime-version-docker")).toContainText("SageMath 10.6");
    await expect(cas.getByTestId("sage-runtime-algebra-docker")).toContainText("does not advertise sage.algebra.reconstruct");
    await expect(cas.getByTestId("sage-runtime-algebra-local")).toContainText("Local WSL SageMath");
    await expect(cas.getByTestId("sage-runtime-limits-docker")).toContainText("input 64 KiB");
    await cas.getByRole("button", { name: "Open Compute → Runtimes" }).last().click();
    await expect(page.getByTestId("compute-center").getByRole("button", { name: "Runtimes", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("compute-center").getByRole("button", { name: "Close", exact: true }).click();

    await cas.getByRole("button", { name: "Open trusted Sage Console" }).click();
    await expect(page.getByTestId("sage-console-run")).toBeDisabled();
    await page.getByTestId("sage-console-dock").getByRole("button", { name: "Close Sage Console" }).click();
    await cas.getByRole("button", { name: "Results", exact: true }).click();
    await result.getByRole("button", { name: "Save to Workbook" }).click();
    await expect(cas).toHaveCount(0);
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("Freeform input saved with this result");
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("SageMath 10.6");
  } finally {
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-cas-desktop-"))
      throw new Error("Unsafe CAS desktop test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop CAS runs local Sage and retains an independently saved Workbook result", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-cas-local-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root } });
    const page = await app.firstWindow();
    await page.getByTestId("workspace-nav-cas").click();
    const cas = page.getByTestId("cas-algebra-workspace");
    const services = cas.getByTestId("scientific-services-cas");
    await expect(services).toContainText("Backend available for this operation", { timeout: 30_000 });
    await services.getByRole("button", { name: "Run", exact: true }).click();
    const result = cas.getByTestId("sage-analysis-result");
    await expect(result).toContainText("Exact · SageMath (Local WSL)", { timeout: 60_000 });
    await expect(result).toContainText("Version: 9.5");
    await expect(result.getByTestId("sage-result-kind-expression")).toContainText("1");
    await expect(result).toContainText("Freeform input — no saved source link");
    await page.screenshot({ path: test.info().outputPath("cas-local-result.png") });

    await cas.getByRole("button", { name: "Runtimes", exact: true }).click();
    await expect(cas.getByTestId("sage-runtime-version-local")).toContainText("SageMath 9.5");
    await expect(cas.getByTestId("sage-runtime-docker").getByRole("alert")).toContainText("Next:");
    await cas.getByTestId("sage-runtime-docker").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("cas-docker-unavailable.png") });
    await cas.getByRole("button", { name: "Results", exact: true }).click();
    await result.getByRole("button", { name: "Save to Workbook" }).click();
    const evidence = page.getByTestId("workbook-sage-evidence");
    await expect(evidence).toContainText("Freeform input saved with this result");
    await expect(evidence).toContainText("SageMath 9.5");
    await expect(evidence).toContainText("sage.symbolic.simplify");
    await evidence.locator("summary").click();
    await expect(evidence).toContainText("sin(x)^2 + cos(x)^2");

    const bundlePath = test.info().outputPath("cas-workbook.math3d");
    await app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), bundlePath);
    await page.getByRole("button", { name: "Export session bundle..." }).click();
    await expect.poll(async () => { try { return (await readFile(bundlePath, "utf8")).length; } catch { return 0; } }).toBeGreaterThan(100);
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    const savedEvidence = bundle.payload.workbooks.flatMap((book: any) => book.stages.flatMap((stage: any) =>
      stage.blocks.map((block: any) => block.sageEvidence).filter(Boolean))).find((item: any) => item.source.module === "cas");
    expect(savedEvidence).toMatchObject({ kind: "sage-result/v1",
      source: { module: "cas", id: "sage-input:cas", expression: "sin(x)^2 + cos(x)^2" },
      request: { operation: "sage.symbolic.simplify", backend: "local",
        params: { expression: "sin(x)^2 + cos(x)^2", variables: ["x"] } },
      engine: { version: "9.5" }, response: { success: true, result: { text: "1" } } });

    const markdownPath = test.info().outputPath("cas-workbook.md");
    await app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), markdownPath);
    await page.getByRole("button", { name: "Export Markdown", exact: true }).click();
    await expect.poll(async () => { try { return (await readFile(markdownPath, "utf8")).length; } catch { return 0; } }).toBeGreaterThan(100);
    const markdown = await readFile(markdownPath, "utf8");
    expect(markdown).toContain("SageMath 9.5");
    expect(markdown).toContain("sage.symbolic.simplify");
    expect(markdown).toContain("Result: 1");

    await page.reload();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("Freeform input saved with this result");
    await page.getByTestId("workbook-sage-evidence").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("cas-workbook-reopened.png") });

    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1");
    });
    await page.reload();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.locator('input[type="file"][accept=".math3d,.json,application/json"]').setInputFiles(bundlePath);
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("Freeform input saved with this result");
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("SageMath 9.5");
    await page.getByTestId("workbook-sage-evidence").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("cas-workbook-independent-import.png") });
  } finally {
    await app?.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-cas-local-"))
      throw new Error("Unsafe CAS local test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
