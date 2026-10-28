import { expect, test } from "@playwright/test";

test("Surface Services runs exact calculus and Analysis exposes its result actions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
    .fill("Open backend services panel");
  await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
  const panel = page.getByText("Symbolic Mathematics", { exact: true }).locator("..");
  await panel.getByRole("button", { name: "Gradient", exact: true }).click();
  await expect(panel.getByLabel("Expression")).toHaveValue(/x.*y.*z/);
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  const analysis = page.getByTestId("sage-analysis-result");
  await expect(analysis).toContainText("Gradient", { timeout: 60_000 });
  await expect(analysis).toContainText("2*x ; 2*y ; 2*z");
  await analysis.getByRole("button", { name: "Visualize vector field" }).click();
  await expect(analysis).toContainText("normalized gradient directions");
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
  await panel.getByLabel("Operation").selectOption("sage.symbolic.simplify");
  await panel.getByRole("button", { name: "Use current surface F(x,y,z)" }).click();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis).toContainText("Simplified expression", { timeout: 60_000 });
  await analysis.getByRole("button", { name: "Create geometry" }).click();
  await expect(analysis).toContainText("Created an implicit surface from the exact scalar expression.");
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
  await panel.getByRole("button", { name: "Check local SageMath" }).click();
  await expect(panel).toContainText("Local WSL SageMath version", { timeout: 30_000 });
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
  await panel.getByRole("button", { name: "Check Docker SageMath" }).click();
  await expect(panel).toContainText("sagemath: ok");
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
  await panel.getByLabel("Operation").selectOption("sage.matrix.charpoly");
  await expect(panel.getByLabel("SageMath backend")).toHaveValue("docker");
  await expect(panel.getByLabel("SageMath backend").locator('option[value="local"]')).toBeDisabled();
});
