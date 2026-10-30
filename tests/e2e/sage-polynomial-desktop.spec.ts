import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("desktop Surface Services sends exact Sage results to Analysis and Workbook", async () => {
  test.setTimeout(240_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-desktop-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({
      args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root },
    });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Open backend services panel");
    await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
    const services = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
    const analysis = page.getByTestId("sage-analysis-result");

    await services.getByRole("button", { name: "Gradient", exact: true }).click();
    await expect(services.getByLabel("Expression")).toHaveValue(/x.*y.*z/);
    await services.getByRole("button", { name: "Run", exact: true }).click();
    await expect(analysis).toContainText("Symbolic result · Gradient", { timeout: 60_000 });
    await expect(analysis).toContainText("Exact · SageMath (Local WSL)");
    await expect(analysis).toContainText("2*x ; 2*y ; 2*z");
    await analysis.getByRole("button", { name: "Visualize vector field" }).click();
    await expect(analysis).toContainText("normalized gradient directions");

    await services.getByRole("button", { name: "Hessian", exact: true }).click();
    await services.getByRole("button", { name: "Run", exact: true }).click();
    await expect(analysis).toContainText("Symbolic result · Hessian", { timeout: 60_000 });
    await expect(services).toContainText("[[2, 0, 0], [0, 2, 0], [0, 0, 2]]");
    await page.getByTestId("top-compute-center-button").click();
    const calculusJobs = page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" });
    await expect(calculusJobs.getByText("Symbolic gradient").locator("../..")).toContainText("complete");
    await expect(calculusJobs.getByText("Symbolic Hessian").locator("../..")).toContainText("complete");
    await page.getByTestId("compute-center").getByRole("button", { name: "Close", exact: true }).click();

    await services.getByRole("button", { name: "Singularities", exact: true }).click();
    await services.getByRole("button", { name: "Run", exact: true }).click();
    await expect(analysis).toContainText("0 singular points", { timeout: 60_000 });
    await analysis.getByRole("button", { name: "Save to Workbook" }).click();
    await expect(page.getByRole("button", { name: "Workbook", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Block title" }).last()).toHaveValue("SageMath singularities");

    await page.getByRole("button", { name: "Inspector", exact: true }).click();
    await services.getByLabel("Operation").selectOption("sage.symbolic.simplify");
    await services.getByRole("button", { name: "Use current surface F(x,y,z)" }).click();
    await services.getByRole("button", { name: "Run", exact: true }).click();
    await expect(analysis).toContainText("Simplified expression", { timeout: 60_000 });
    await analysis.getByRole("button", { name: "Create geometry" }).click();
    await expect(analysis).toContainText("Created an implicit surface from the exact scalar expression.");
  } finally {
    await app?.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-desktop-"))
      throw new Error("Unsafe Sage desktop test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop Sage backend selector sends shared operations to the Docker service", async () => {
  test.setTimeout(120_000);
  const requests: unknown[] = [];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", available: true, status: "ok", operations: ["sage.symbolic.simplify"] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      requests.push(JSON.parse(body));
      res.end(JSON.stringify({ engine: "sagemath", operation: "sage.symbolic.simplify", success: true,
        result: { text: "desktop-docker-result" }, latex: "1", warnings: [] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Docker test server did not bind.");
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-desktop-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({
      args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root,
        MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` },
    });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Open backend services panel");
    await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
    const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
    await panel.getByLabel("SageMath backend").selectOption("docker");
    await page.getByTestId("top-compute-center-button").click();
    const runtimes = page.getByTestId("compute-center");
    await runtimes.getByRole("button", { name: "Runtimes", exact: true }).click();
    await runtimes.getByTestId("sage-runtime-docker").getByRole("button", { name: "Check Docker" }).click();
    await expect(runtimes.getByTestId("sage-runtime-docker")).toContainText("Reported status: ok");
    await runtimes.getByRole("button", { name: "Close", exact: true }).click();
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("desktop-docker-result");
    expect(requests).toMatchObject([{ operation: "sage.symbolic.simplify" }]);
    const localOnlyError = await page.evaluate(async () => {
      try {
        const sageService = (window as Window & { sageService?: { run: (request: unknown) => Promise<unknown> } }).sageService;
        await sageService?.run({ operation: "sage.matrix.charpoly", params: {}, backend: "local" });
        return "accepted";
      } catch (error) {
        return String(error);
      }
    });
    expect(localOnlyError).toContain("not available on the local WSL backend");
  } finally {
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-desktop-"))
      throw new Error("Unsafe Sage desktop test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop Symbolic Simplify uses local WSL SageMath without Docker", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-desktop-"));
  const app = await launchRepoElectron({
    args: ["."],
    cwd: resolve(__dirname, "../.."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Open backend services panel");
    await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
    const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
    await expect(panel.getByLabel("Operation")).toHaveValue("sage.symbolic.simplify");
    await page.getByTestId("top-compute-center-button").click();
    const runtimes = page.getByTestId("compute-center");
    await runtimes.getByRole("button", { name: "Runtimes", exact: true }).click();
    await runtimes.getByTestId("sage-runtime-local").getByRole("button", { name: "Check Local WSL" }).click();
    await expect(runtimes.getByTestId("sage-runtime-local")).toContainText("Local WSL SageMath version", { timeout: 30_000 });
    await runtimes.getByRole("button", { name: "Close", exact: true }).click();
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("Success: yes", { timeout: 60_000 });
    await expect(panel).toContainText("LaTeX: 1");
    await panel.getByLabel("Expression").fill("x.__class__");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("unsupported syntax", { timeout: 60_000 });
    await panel.getByLabel("Expression").fill("(x+1)^4");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toContainText("Sage symbolic job cancelled.", { timeout: 30_000 });
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-desktop-"))
      throw new Error("Unsafe Sage desktop test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop Sage polynomial factor handles valid input, rejection, and cancellation", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-desktop-"));
  const app = await launchRepoElectron({
    args: ["."],
    cwd: resolve(__dirname, "../.."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Open backend services panel");
    await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();

    const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
    await expect(panel).toBeVisible();
    await panel.getByLabel("Operation").selectOption("sage.polynomial.factor");
    const coefficients = panel.getByLabel("Integer coefficients (constant first)");

    await coefficients.fill("1, invalid, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("Enter 2–13 integer coefficients");
    await expect(panel.getByRole("button", { name: "Cancel" })).toHaveCount(0);

    await coefficients.fill("-1, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
    await expect(panel).toContainText("(x - 1) * (x + 1)");

    await coefficients.fill("-2, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toContainText("Sage factorization cancelled.", { timeout: 30_000 });
    await expect(panel.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
    await expect(panel).not.toContainText("Exact reconstruction: verified");
    await page.getByTestId("top-compute-center-button").click();
    await expect(page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" })
      .getByText("Exact polynomial factorization").first().locator("../..")).toContainText("cancelled");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-desktop-"))
      throw new Error("Unsafe Sage desktop test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop Sage algebraic roots handles valid input, rejection, and cancellation", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-desktop-"));
  const app = await launchRepoElectron({
    args: ["."],
    cwd: resolve(__dirname, "../.."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Open backend services panel");
    await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();

    const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
    await expect(panel).toBeVisible();
    await panel.getByLabel("Operation").selectOption("sage.polynomial.roots_exact");
    const coefficients = panel.getByLabel("Integer coefficients (constant first)");

    await coefficients.fill("1, invalid, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("Enter 2–13 integer coefficients");
    await expect(panel.getByRole("button", { name: "Cancel" })).toHaveCount(0);

    const nativeRejection = await page.evaluate(async () => {
      try {
        const sageService = (window as Window & { sageService?: { run: (request: unknown) => Promise<unknown> } }).sageService;
        await sageService?.run({ operation: "sage.polynomial.roots_exact", params: { coefficients: ["1", "0"] } });
        return "accepted";
      } catch (error) {
        return String(error);
      }
    });
    expect(nativeRejection).toContain("Enter 2–13 integer coefficients");

    await coefficients.fill("-2, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
    await expect(panel).toContainText("Algebraic roots (2 counting multiplicity)");
    await expect(panel).toContainText("Minimal polynomial (constant first): -2, 0, 1");
    await expect(panel).toContainText("Isolating interval:");

    await coefficients.fill("1, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Running..." })).toBeVisible();
    await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
    await expect(panel).toContainText("Minimal polynomial (constant first): 1, 0, 1");
    await expect(panel).toContainText("-1*I");
    await expect(panel).toContainText("1*I");

    await coefficients.fill("1, -2, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Running..." })).toBeVisible();
    await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
    await expect(panel).toContainText("multiplicity 2");

    await coefficients.fill("3, 0, 1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toContainText("Sage root calculation cancelled.", { timeout: 30_000 });
    await expect(panel.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
    await expect(panel).not.toContainText("Exact reconstruction: verified");
    await page.getByTestId("top-compute-center-button").click();
    await expect(page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" })
      .getByText("Exact polynomial roots").first().locator("../..")).toContainText("cancelled");
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-desktop-"))
      throw new Error("Unsafe Sage desktop test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop Local WSL routes remaining symbolic operations into Compute jobs", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-desktop-"));
  const app = await launchRepoElectron({
    args: ["."], cwd: resolve(__dirname, "../.."),
    env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Open backend services panel");
    await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
    const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
    const cases = [
      { operation: "sage.symbolic.expand", expression: "(x+1)^2", variables: "x", label: "Expanded expression", job: "Symbolic expansion" },
      { operation: "sage.symbolic.factor", expression: "x^2-1", variables: "x", label: "Factored expression", job: "Symbolic factorization" },
      { operation: "sage.symbolic.solve", expression: "x^2-1", variables: "x", label: "Solutions", job: "Symbolic solve" },
      { operation: "sage.symbolic.singularities", expression: "x^2+y^2+z^2-1", variables: "x,y,z", label: "Singularities", job: "Symbolic singularities" },
    ] as const;
    for (const item of cases) {
      await panel.getByLabel("Operation").selectOption(item.operation);
      await panel.getByLabel("Expression").fill(item.expression);
      await panel.getByLabel("Variables").fill(item.variables);
      await panel.getByRole("button", { name: "Run", exact: true }).click();
      await expect(panel).toContainText("Success: yes", { timeout: 60_000 });
      await expect(page.getByTestId("sage-analysis-result")).toContainText(item.label);
    }
    await expect(page.getByTestId("sage-analysis-result")).toContainText("0 singular points");
    await page.getByTestId("top-compute-center-button").click();
    const jobs = page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" });
    for (const item of cases) {
      await expect(jobs.getByText(item.job).first().locator("../..")).toContainText("complete");
      await expect(jobs.getByText(item.job).first().locator("../..")).toContainText("sage-local-wsl");
    }
  } finally {
    await app.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-desktop-"))
      throw new Error("Unsafe Sage desktop test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
