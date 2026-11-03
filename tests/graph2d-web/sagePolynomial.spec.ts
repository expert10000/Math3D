import { expect, test } from "@playwright/test";
import { graphEditor, openGraphType, saveGraphEditor } from "../e2e/helpers/graphAuthoring";

test("web Number Theory uses shared Sage operations, cancellation, Inspector, and runtimes", async ({ page }) => {
  const requests: Array<{ operation: string; backend: string; params: Record<string, unknown> }> = [];
  await page.route("http://127.0.0.1:8767/**", async (route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith("/health")) return route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: true, status: "ok",
        operations: ["sage.numberTheory.gcd", "sage.numberTheory.modInverse"] }) });
    if (route.request().url().endsWith("/cancel")) return route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ ok: true }) });
    const request = route.request().postDataJSON() as typeof requests[number];
    requests.push(request);
    if (requests.length === 1) await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      await route.fulfill({ status: 200, contentType: "application/json", headers,
        body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", operation: request.operation,
          success: true, result: { value: request.operation === "sage.numberTheory.gcd" ? "6" : "4" },
          latex: request.operation === "sage.numberTheory.gcd" ? "6" : "4", warnings: [] }) });
    } catch { /* Cancellation may close the request before the delayed response. */ }
  });
  await page.goto("/");
  await page.getByTestId("workspace-nav-number_theory").click();
  const workspace = page.getByTestId("number-theory-workspace");
  const services = workspace.getByTestId("scientific-services-number_theory");
  await expect(services.getByLabel("Services preset")).toHaveValue("Number Theory");
  await expect(services.getByLabel("SageMath backend")).toHaveValue("docker");
  await expect(services).toContainText("Backend available for this operation");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  await services.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(services).toContainText("Sage number theory job cancelled.");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  const result = workspace.getByTestId("sage-analysis-result");
  await expect(result).toContainText("Greatest common divisor");
  await expect(result.getByTestId("sage-result-kind-expression")).toContainText("6");
  await expect(result).toContainText("Version: 10.6");
  await services.getByLabel("Operation").selectOption("sage.numberTheory.modInverse");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await expect(result).toContainText("Modular inverse");
  await expect(result.getByTestId("sage-result-kind-expression")).toContainText("4");
  expect(requests[1]).toMatchObject({ operation: "sage.numberTheory.gcd", backend: "docker",
    params: { values: ["84", "30"] } });
  expect(requests[2]).toMatchObject({ operation: "sage.numberTheory.modInverse", backend: "docker",
    params: { a: "3", modulus: "11" } });
  await workspace.getByRole("button", { name: "Runtimes", exact: true }).click();
  await expect(workspace.getByTestId("sage-runtime-version-docker")).toContainText("SageMath 10.6");
  await workspace.getByRole("button", { name: "Open Compute → Runtimes" }).last().click();
  const compute = page.getByTestId("compute-center");
  await expect(compute.getByRole("button", { name: "Runtimes", exact: true })).toHaveAttribute("aria-pressed", "true");
  await compute.getByRole("button", { name: "Overview" }).click();
  await expect(compute.getByRole("region", { name: "Broker jobs" })).toContainText("cancelled");
  await compute.getByRole("button", { name: "Close", exact: true }).click();
  await workspace.getByRole("button", { name: "Results", exact: true }).click();
  await result.getByRole("button", { name: "Save to Workbook" }).click();
  await expect(page.getByTestId("workbook-sage-evidence")).toContainText("number_theory");
});

test("web Graph Services uses shared Sage discovery, jobs, cancellation, and Inspector", async ({ page }) => {
  const requests: Array<{ operation: string; backend: string; params: { expression?: string } }> = [];
  await page.route("http://127.0.0.1:8767/**", async (route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith("/health")) return route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: true, status: "ok",
        operations: ["sage.symbolic.simplify"] }) });
    const request = route.request().postDataJSON() as typeof requests[number];
    requests.push(request);
    if (requests.length > 1) await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      await route.fulfill({ status: 200, contentType: "application/json", headers,
        body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", operation: request.operation,
          success: true, result: { text: "web-graph-exact" }, latex: "", warnings: [] }) });
    } catch { /* Cancellation may close the request before the delayed response. */ }
  });
  await page.goto("/");
  await page.getByTestId("workspace-nav-graphs").click();
  await openGraphType(page, "Function");
  await graphEditor(page).getByLabel("Start from preset").selectOption("parabola");
  await graphEditor(page).getByLabel("Function expression").fill("x^2 + 1");
  await saveGraphEditor(page);
  await page.getByLabel("Graph functions").getByRole("button", { name: "Select Parabola" }).click();
  await page.getByTestId("graph2d-services-tab").click();
  const services = page.getByTestId("scientific-services-graphs");
  await services.getByLabel("Services preset").selectOption("Basic");
  await services.getByLabel("SageMath backend").selectOption("docker");
  await expect(services).toContainText("Backend available for this operation");
  await services.getByRole("button", { name: "Use selected graph y(x)" }).click();
  await services.getByRole("button", { name: "Run", exact: true }).click();
  const result = page.getByLabel("Graph inspector").getByTestId("sage-analysis-result");
  await expect(result).toContainText("web-graph-exact");
  await expect(result).toContainText("Source current");
  expect(requests[0]).toMatchObject({ operation: "sage.symbolic.simplify", backend: "docker",
    params: { expression: "x^2 + 1" } });
  await services.getByRole("button", { name: "Open Compute → Runtimes" }).click();
  const compute = page.getByTestId("compute-center");
  await expect(compute.getByTestId("sage-runtime-version-docker")).toContainText("SageMath 10.6");
  await compute.getByRole("button", { name: "Close", exact: true }).click();
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await services.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(services).toContainText("cancelled", { timeout: 30_000 });
  await page.getByTestId("top-compute-center-button").click();
  await expect(page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" })).toContainText("cancelled");
  await page.getByTestId("compute-center").getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(services).toBeVisible();
  await page.getByRole("button", { name: "Close Graph Services" }).click();
  await page.getByTestId("graph2d-toolbar-services").click();
  await expect(services).toBeVisible();
  await page.getByRole("button", { name: "Close Graph Services" }).click();
  const compactInspector = page.locator('.graph2d-compact-panels > details:has(> summary:text-is("Inspector"))');
  await compactInspector.locator(":scope > summary").click();
  await expect(compactInspector.getByTestId("sage-analysis-result")).toContainText("Sage symbolic job cancelled.");
});

test("web CAS uses shared Sage discovery and Inspector while code remains gated", async ({ page }) => {
  const requests: Array<{ operation: string; backend: string; params: Record<string, unknown> }> = [];
  await page.route("http://127.0.0.1:8767/**", async (route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith("/health")) return route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: true, status: "ok",
        operations: ["sage.symbolic.simplify"] }) });
    const request = route.request().postDataJSON() as typeof requests[number];
    requests.push(request);
    await route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", operation: request.operation,
        success: true, result: { text: "web-cas-result" }, latex: "", warnings: [] }) });
  });
  await page.goto("/");
  await page.getByTestId("workspace-nav-cas").click();
  const cas = page.getByTestId("cas-algebra-workspace");
  await expect(cas).toBeVisible();
  const services = cas.getByTestId("scientific-services-cas");
  await services.getByLabel("Services preset").selectOption("Basic");
  await services.getByLabel("SageMath backend").selectOption("docker");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await expect(cas.getByTestId("sage-analysis-result")).toContainText("web-cas-result");
  await expect(cas.getByTestId("sage-analysis-result")).toContainText("Freeform input");
  expect(requests).toMatchObject([{ operation: "sage.symbolic.simplify", backend: "docker",
    params: { expression: "sin(x)^2 + cos(x)^2" } }]);
  await cas.getByRole("button", { name: "Runtimes", exact: true }).click();
  await expect(cas.getByTestId("sage-runtime-version-docker")).toContainText("SageMath 10.6");
  await cas.getByRole("button", { name: "Open trusted Sage Console" }).click();
  await expect(page.getByTestId("sage-console-trust")).toBeDisabled();
  await expect(page.getByTestId("sage-console-run")).toBeDisabled();
});

test("web Sage Console keeps code execution unavailable", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("top-sage-console-button").click();
  const dock = page.getByTestId("sage-console-dock");
  await expect(dock).toContainText("Code execution requires the trusted local desktop runtime.");
  await expect(dock.getByTestId("sage-console-trust")).toBeDisabled();
  await dock.getByTestId("sage-console-code").fill("2^10");
  await expect(dock.getByTestId("sage-console-run")).toBeDisabled();
});

test("web Workbook Sage code cells retain text but cannot trust or execute hosted code", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
  await page.getByRole("button", { name: "2 Compute" }).click();
  await page.getByRole("button", { name: "Sage code", exact: true }).click();
  const cell = page.locator('[data-testid^="workbook-sage-code-"]').first();
  await cell.getByTestId("workbook-sage-code-input").fill("2^10");
  await expect(cell.getByTestId("workbook-sage-code-trust")).toBeDisabled();
  await expect(cell.getByTestId("workbook-sage-code-run")).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
  await page.getByRole("button", { name: "2 Compute" }).click();
  await expect(page.locator('[data-testid^="workbook-sage-code-"]').first().getByTestId("workbook-sage-code-input")).toHaveValue("2^10");
});

test("Surface and Geometry Services share the same Sage operation and Analysis destination", async ({ page }) => {
  const requests: Array<{ operation: string; params: { expression?: string } }> = [];
  await page.route("http://127.0.0.1:8767/**", async (route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith("/health")) return route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: true, status: "ok",
        operations: ["sage.symbolic.simplify"] }) });
    const request = route.request().postDataJSON() as { operation: string; params: { expression?: string } };
    requests.push(request);
    await route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", operation: request.operation, success: true,
        result: { text: "1" }, latex: "1", warnings: [] }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Open backend services panel");
  await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
  const surface = page.getByTestId("scientific-services-surface");
  await surface.getByLabel("Services preset").selectOption("Basic");
  await surface.getByLabel("SageMath backend").selectOption("docker");
  await surface.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("sage-analysis-result")).toContainText("Simplified expression");

  await page.getByRole("button", { name: "Geometry", exact: true }).first().click();
  await page.getByTestId("geometry-professional-panel-services").click({ force: true });
  const geometry = page.getByTestId("scientific-services-geometry");
  await expect(geometry).toBeVisible();
  await geometry.getByLabel("Services preset").selectOption("Basic");
  await geometry.getByLabel("SageMath backend").selectOption("docker");
  await geometry.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("sage-analysis-result")).toContainText("Simplified expression");
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({ operation: "sage.symbolic.simplify", params: { expression: "sin(x)^2 + cos(x)^2" } });
  expect(requests[1]).toMatchObject({ operation: requests[0].operation, backend: "docker", params: requests[0].params });
  expect((requests[1] as { jobId?: string }).jobId).not.toBe((requests[0] as { jobId?: string }).jobId);
  await page.getByTestId("top-compute-center-button").click();
  await expect(page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" })).toContainText("Symbolic simplification");
  await expect(page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" })).toContainText("complete");
});

test("Surface and Geometry route polynomial factor and exact roots through Compute jobs", async ({ page }) => {
  const requests: Array<{ operation: string; backend: string; jobId: string; params: Record<string, unknown> }> = [];
  await page.route("http://127.0.0.1:8767/**", async (route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const request = route.request().postDataJSON() as typeof requests[number];
    requests.push(request);
    await route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", operation: request.operation, success: true,
        result: { text: "polynomial-result" }, latex: "1", warnings: [] }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Open backend services panel");
  await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
  for (const context of ["surface", "geometry"] as const) {
    if (context === "geometry") {
      await page.getByRole("button", { name: "Geometry", exact: true }).first().click();
      await page.getByTestId("geometry-professional-panel-services").click({ force: true });
    }
    const panel = page.getByTestId(`scientific-services-${context}`);
    await panel.getByLabel("Services preset").selectOption("All");
    await panel.getByLabel("SageMath backend").selectOption("docker");
    for (const operation of ["sage.polynomial.factor", "sage.polynomial.roots_exact"] as const) {
      await panel.getByLabel("Operation").selectOption(operation);
      await panel.getByLabel("Integer coefficients (constant first)").fill("-2, 0, 1");
      await panel.getByRole("button", { name: "Run", exact: true }).click();
      await expect(panel).toContainText("polynomial-result");
    }
  }
  expect(requests).toHaveLength(4);
  for (const operation of ["sage.polynomial.factor", "sage.polynomial.roots_exact"] as const) {
    const matches = requests.filter((request) => request.operation === operation);
    expect(matches).toHaveLength(2);
    for (const request of matches) expect(request).toMatchObject({ backend: "docker", params: {
      polynomial: "(-2)*x^0 + (0)*x^1 + (1)*x^2", variables: ["x"],
    } });
    expect(matches[0].jobId).not.toBe(matches[1].jobId);
  }
  await page.getByTestId("top-compute-center-button").click();
  const jobs = page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" });
  await expect(jobs).toContainText("Exact polynomial factorization");
  await expect(jobs).toContainText("Exact polynomial roots");
  await expect(jobs.getByText("complete", { exact: true })).toHaveCount(4);
});

test("Surface Services runs exact calculus and Analysis exposes its result actions", async ({ page }) => {
  await page.route("http://127.0.0.1:8767/**", async (route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith("/health")) return route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: true, status: "ok",
        operations: ["sage.symbolic.gradient", "sage.symbolic.hessian", "sage.symbolic.singularities", "sage.symbolic.simplify"] }) });
    const request = route.request().postDataJSON() as { operation: string };
    const result: Record<string, unknown> = request.operation === "sage.symbolic.gradient"
      ? { components: ["2*x", "2*y", "2*z"] } : request.operation === "sage.symbolic.hessian"
      ? { matrix: [["2", "0", "0"], ["0", "2", "0"], ["0", "0", "2"]] } : request.operation === "sage.symbolic.singularities"
      ? { points: [] } : { text: "x*x+y*y+z*z-1" };
    await route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", operation: request.operation,
        success: true, result, latex: "", warnings: [] }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
    .fill("Open backend services panel");
  await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
  const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
  await panel.getByLabel("SageMath backend").selectOption("docker");
  await panel.getByRole("button", { name: "Gradient", exact: true }).click();
  await expect(panel.getByLabel("Expression")).toHaveValue(/x.*y.*z/);
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  const analysis = page.getByTestId("sage-analysis-result");
  await expect(analysis).toContainText("Gradient", { timeout: 60_000 });
  await expect(analysis).toContainText("2*x ; 2*y ; 2*z");
  await analysis.getByRole("button", { name: "Preview vector field" }).click();
  await expect(analysis).toContainText("normalized gradient directions");
  await analysis.getByRole("button", { name: "Commit vector overlay" }).click();
  await panel.getByRole("button", { name: "Hessian", exact: true }).click();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis).toContainText("Hessian", { timeout: 60_000 });
  await panel.getByRole("button", { name: "Singularities", exact: true }).click();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis).toContainText("0 singular points", { timeout: 60_000 });
  await analysis.getByRole("button", { name: "Save to Workbook" }).click();
  await expect(page.getByRole("button", { name: "Workbook", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("textbox", { name: "Block title" }).last()).toHaveValue("SageMath singularities");
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByRole("button", { name: "services", exact: true }).click();
  await panel.getByLabel("Operation").selectOption("sage.symbolic.simplify");
  await panel.getByRole("button", { name: "Use current surface F(x,y,z)" }).click();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis).toContainText("Simplified expression", { timeout: 60_000 });
  await analysis.getByRole("button", { name: "Preview geometry" }).click();
  await analysis.getByRole("button", { name: "Commit geometry" }).click();
  await expect(analysis).toContainText("Committed an implicit surface from the Sage scalar expression");
});

test("local Chrome Sage panel factors and finds roots with rejection and cancellation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
    .fill("Open backend services panel");
  await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();

  const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
  await expect(panel).toBeVisible();
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
  await page.getByTestId("top-compute-center-button").click();
  await expect(page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" })).toContainText("cancelled");
  await page.getByTestId("compute-center").getByRole("button", { name: "Close", exact: true }).click();
  await panel.getByLabel("Operation").selectOption("sage.polynomial.factor");
  const coefficients = panel.getByLabel("Integer coefficients (constant first)");
  await coefficients.fill("1, wrong, 1");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("Enter 2–13 integer coefficients");

  await coefficients.fill("-1, 0, 1");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("Exact reconstruction: verified", { timeout: 60_000 });
  await expect(panel).toContainText("(x - 1) * (x + 1)");

  await panel.getByLabel("Operation").selectOption("sage.polynomial.roots_exact");
  await coefficients.fill("-2, 0, 1");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("Algebraic roots (2 counting multiplicity)", { timeout: 60_000 });
  await expect(panel).toContainText("Minimal polynomial (constant first): -2, 0, 1");

});

test("Chrome Sage panel explicitly routes shared operations to Docker when selected", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("http://127.0.0.1:8767/**", async (route) => {
    const request = route.request();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (request.url().endsWith("/health")) {
      await route.fulfill({ status: 200, contentType: "application/json", headers,
        body: JSON.stringify({ engine: "sagemath", available: true, status: "ok", operations: ["sage.symbolic.simplify"] }) });
      return;
    }
    const payload = request.postDataJSON();
    requests.push(payload);
    await route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", operation: payload.operation, success: true,
        result: payload.operation === "sage.symbolic.gradient"
          ? { components: ["2*x", "2*y", "2*z"], text: "[2*x, 2*y, 2*z]" }
          : { text: "docker-result" }, latex: "1", warnings: [] }) });
  });
  await page.goto("/");
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
  await expect(panel).toContainText("docker-result");
  expect(requests).toMatchObject([{ operation: "sage.symbolic.simplify" }]);
  await panel.getByLabel("Operation").selectOption("sage.polynomial.factor");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("docker-result");
  expect(requests).toMatchObject([
    { operation: "sage.symbolic.simplify" },
    { operation: "sage.polynomial.factor", params: { polynomial: "(-1)*x^0 + (0)*x^1 + (1)*x^2", variables: ["x"] } },
  ]);
  await panel.getByRole("button", { name: "Gradient", exact: true }).click();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("sage-analysis-result")).toContainText("2*x ; 2*y ; 2*z");
  expect(requests.at(-1)).toMatchObject({ operation: "sage.symbolic.gradient", params: { variables: ["x", "y", "z"] } });
  const symbolicCases = [
    { operation: "sage.symbolic.expand", label: "Expanded expression", job: "Symbolic expansion" },
    { operation: "sage.symbolic.factor", label: "Factored expression", job: "Symbolic factorization" },
    { operation: "sage.symbolic.solve", label: "Solutions", job: "Symbolic solve" },
    { operation: "sage.symbolic.singularities", label: "Singularities", job: "Symbolic singularities" },
  ] as const;
  for (const item of symbolicCases) {
    await panel.getByLabel("Operation").selectOption(item.operation);
    await panel.getByLabel("Expression").fill("x^2+y^2+z^2-1");
    await panel.getByLabel("Variables").fill("x,y,z");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByTestId("sage-analysis-result")).toContainText(item.label);
    expect(requests.at(-1)).toMatchObject({ operation: item.operation, backend: "docker",
      params: { expression: "x^2+y^2+z^2-1", variables: ["x", "y", "z"] } });
  }
  await page.getByTestId("top-compute-center-button").click();
  const jobs = page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" });
  for (const item of symbolicCases) {
    await expect(jobs.getByText(item.job).first().locator("../..")).toContainText("complete");
    await expect(jobs.getByText(item.job).first().locator("../..")).toContainText("sage-docker");
  }
  await page.getByTestId("compute-center").getByRole("button", { name: "Close", exact: true }).click();
  await panel.getByLabel("Operation").selectOption("sage.matrix.charpoly");
  await expect(panel.getByLabel("SageMath backend")).toHaveValue("docker");
  await expect(panel.getByLabel("SageMath backend").locator('option[value="local"]')).toBeDisabled();
});
