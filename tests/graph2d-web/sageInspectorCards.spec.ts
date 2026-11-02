import { expect, test } from "@playwright/test";

test("Surface and Geometry Inspectors render typed Sage results and failures", async ({ page }) => {
  const operations = ["sage.symbolic.simplify", "sage.symbolic.gradient", "sage.symbolic.hessian",
    "sage.symbolic.solve", "sage.symbolic.factor"];
  await page.route("http://127.0.0.1:8767/**", async (route) => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type" };
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.url().endsWith("/health")) return route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: true, status: "ok", operations }) });
    const body = request.postDataJSON() as { operation: string };
    const results: Record<string, Record<string, unknown>> = {
      "sage.symbolic.simplify": { text: "x^2+1" },
      "sage.symbolic.gradient": { components: ["2*x", "2*y", "2*z"], text: "[2*x, 2*y, 2*z]" },
      "sage.symbolic.hessian": { matrix: [["2", "0", "0"], ["0", "2", "0"], ["0", "0", "2"]] },
      "sage.symbolic.solve": { solutions: ["x=1", "x=-1"] },
    };
    const failure = body.operation === "sage.symbolic.factor";
    await route.fulfill({ status: 200, contentType: "application/json", headers,
      body: JSON.stringify({ engine: "sagemath", engineVersion: "10.6", operation: body.operation,
        success: !failure, result: results[body.operation] ?? {}, latex: "", warnings: ["Exact domain assumed"],
        ...(failure ? { error: "Factorization unavailable" } : {}) }) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Open backend services panel");
  await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
  const surface = page.getByTestId("scientific-services-surface");
  await surface.getByLabel("SageMath backend").selectOption("docker");
  const analysis = page.getByTestId("sage-analysis-result");

  await surface.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis.getByTestId("sage-result-kind-expression")).toContainText("x^2+1");
  await expect(analysis).toContainText("Version: 10.6");
  await expect(analysis).toContainText("Warnings: Exact domain assumed");
  await expect(analysis).toContainText("Freeform input — no saved source link");
  await expect(analysis.getByRole("button", { name: "Create geometry" })).toBeEnabled();

  await surface.getByRole("button", { name: "Gradient", exact: true }).click();
  await surface.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis.getByTestId("sage-result-kind-vector")).toContainText("2*x ; 2*y ; 2*z");
  await expect(analysis).toContainText("Source current");
  await expect(analysis.getByRole("button", { name: "Visualize vector field" })).toBeEnabled();

  await surface.getByRole("button", { name: "Hessian", exact: true }).click();
  await surface.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis.getByTestId("sage-result-kind-matrix").locator("td")).toHaveCount(9);
  await expect(analysis.getByRole("button", { name: "Visualize vector field" })).toHaveCount(0);

  await surface.getByLabel("Operation").selectOption("sage.symbolic.solve");
  await surface.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis.getByTestId("sage-result-kind-solution").locator("li")).toHaveCount(2);

  await surface.getByLabel("Operation").selectOption("sage.symbolic.factor");
  await surface.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis.getByTestId("sage-result-kind-error")).toContainText("Factorization unavailable");
  await expect(analysis).toContainText("Warnings: Exact domain assumed");
  await expect(analysis.getByRole("button", { name: "Create geometry" })).toHaveCount(0);
  await expect(analysis.getByRole("button", { name: "Save to Workbook" })).toBeVisible();

  await page.getByRole("button", { name: "Geometry", exact: true }).first().click();
  await page.getByTestId("geometry-professional-panel-services").click({ force: true });
  const geometry = page.getByTestId("scientific-services-geometry");
  await geometry.getByLabel("SageMath backend").selectOption("docker");
  await geometry.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis.getByTestId("sage-result-kind-expression")).toContainText("x^2+1");
  await expect(analysis).toContainText("Freeform input — no saved source link");
  await geometry.getByLabel("Operation").selectOption("sage.symbolic.factor");
  await geometry.getByRole("button", { name: "Run", exact: true }).click();
  await expect(analysis.getByTestId("sage-result-kind-error")).toContainText("Factorization unavailable");
});
