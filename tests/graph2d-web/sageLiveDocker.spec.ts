import { expect, test } from "@playwright/test";

test("web Number Theory runs GCD and modular inverse through live Docker", async ({ page, request }) => {
  const healthResponse = await request.get("http://127.0.0.1:8767/health");
  expect(healthResponse.ok(), "Start the SageMath Docker service before this opt-in test.").toBe(true);
  const health = await healthResponse.json() as { engineVersion: string; operations: string[] };
  expect(health.operations).toEqual(expect.arrayContaining([
    "sage.numberTheory.gcd", "sage.numberTheory.modInverse",
  ]));

  await page.goto("/");
  await page.getByTestId("workspace-nav-number_theory").click();
  const workspace = page.getByTestId("number-theory-workspace");
  const services = workspace.getByTestId("scientific-services-number_theory");
  await expect(services.getByLabel("SageMath backend")).toHaveValue("docker");
  await expect(services).toContainText("Backend available for this operation");
  const result = workspace.getByTestId("sage-analysis-result");
  for (const item of [
    { operation: "sage.numberTheory.gcd", label: "Greatest common divisor", value: "6" },
    { operation: "sage.numberTheory.modInverse", label: "Modular inverse", value: "4" },
  ]) {
    await services.getByLabel("Operation").selectOption(item.operation);
    await services.getByRole("button", { name: "Run", exact: true }).click();
    await expect(result).toContainText(item.label);
    await expect(result.getByTestId("sage-result-kind-expression")).toContainText(item.value);
    await expect(result).toContainText("SageMath (Docker)");
    await expect(result).toContainText(`Version: ${health.engineVersion}`);
  }
  await workspace.getByRole("button", { name: "Runtimes", exact: true }).click();
  await expect(workspace.getByTestId("sage-runtime-version-docker"))
    .toContainText(`SageMath ${health.engineVersion}`);
  await workspace.getByRole("button", { name: "Open Compute → Runtimes" }).last().click();
  const compute = page.getByTestId("compute-center");
  await compute.getByRole("button", { name: "Overview" }).click();
  const jobs = compute.getByRole("region", { name: "Broker jobs" });
  for (const label of ["Greatest common divisor", "Modular inverse"]) {
    await expect(jobs.getByText(label, { exact: true }).last().locator("../.."))
      .toContainText("complete");
  }
});

test("browser Sage Docker cancel reaches the live service", async ({ page }) => {
  await page.goto("/");
  const outcome = await page.evaluate(async () => {
    const bridge = (window as unknown as Window & { sageService: {
      run: (request: unknown) => Promise<unknown>;
      cancel: (jobId: string) => Promise<{ ok: boolean }>;
    } }).sageService;
    const jobId = crypto.randomUUID();
    const running = bridge.run({ jobId, backend: "docker", operation: "sage.symbolic.expand",
      params: { expression: "(x+y+z)^50", variables: ["x", "y", "z"] } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const cancelled = await bridge.cancel(jobId);
    let error = "";
    try { await running; } catch (caught) { error = String(caught); }
    return { cancelled, error };
  });
  expect(outcome.cancelled.ok).toBe(true);
  expect(outcome.error).toContain("cancelled");
});

test("live Docker Sage operations report results and failures in Compute jobs", async ({ page, request }) => {
  const health = await request.get("http://127.0.0.1:8767/health");
  expect(health.ok(), "Start the SageMath Docker service before this opt-in test.").toBe(true);
  expect((await health.json()).available).toBe(true);

  await page.goto("/");
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
    .fill("Open backend services panel");
  await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
  const panel = page.getByTestId("scientific-services-surface");
  await panel.getByLabel("Services preset").selectOption("All");
  await panel.getByLabel("SageMath backend").selectOption("docker");

  const cases = [
    { operation: "sage.symbolic.simplify", expected: "1", job: "Symbolic simplification" },
    { operation: "sage.matrix.charpoly", expected: "lambda^2 - 5*lambda - 2", job: "Characteristic polynomial" },
    { operation: "sage.matrix.eigen_exact", expected: "sqrt(33)", job: "Exact matrix eigenvalues" },
    { operation: "sage.groebner.compute", expected: "y^2 - 1/2", job: "Gröbner basis" },
    { operation: "sage.numberTheory.gcd", expected: "6", job: "Greatest common divisor" },
    { operation: "sage.numberTheory.modInverse", expected: "4", job: "Modular inverse" },
  ] as const;
  for (const item of cases) {
    await panel.getByLabel("Operation").selectOption(item.operation);
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    await expect(panel.getByRole("status", { name: /Completed/ })).toBeVisible();
    await expect(panel).toContainText(item.expected);
  }

  await panel.getByLabel("Operation").selectOption("sage.numberTheory.modInverse");
  await panel.getByLabel("Integer", { exact: true }).fill("2");
  await panel.getByLabel("Modulus (greater than 1)").fill("4");
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel).toContainText("does not exist");

  await page.getByRole("button", { name: "Geometry", exact: true }).first().click();
  await page.getByTestId("geometry-professional-panel-services").click({ force: true });
  const geometry = page.getByTestId("scientific-services-geometry");
  await geometry.getByLabel("Services preset").selectOption("All");
  await geometry.getByLabel("Operation").selectOption("sage.groebner.compute");
  await geometry.getByRole("button", { name: "Run", exact: true }).click();
  await expect(geometry).toContainText("y^2 - 1/2");

  await page.getByTestId("top-compute-center-button").click();
  const jobs = page.getByTestId("compute-center").getByRole("region", { name: "Broker jobs" });
  for (const item of cases) {
    const recorded = jobs.getByText(item.job, { exact: true }).last().locator("../..");
    await expect(recorded).toContainText("complete");
    await expect(recorded).toContainText("sage-docker");
  }
  const inverseJobs = jobs.getByText("Modular inverse", { exact: true });
  await expect(inverseJobs).toHaveCount(2);
  await expect(inverseJobs.first().locator("../..")).toContainText("failed");
  await expect(inverseJobs.first().locator("../..")).toContainText("does not exist");
});
