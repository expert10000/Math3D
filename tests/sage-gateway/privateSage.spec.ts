import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "../e2e/helpers/electronLauncher";

async function exerciseNumberTheory(page: import("@playwright/test").Page) {
  await page.getByTestId("workspace-nav-number_theory").click();
  const workspace = page.getByTestId("number-theory-workspace");
  const services = workspace.getByTestId("scientific-services-number_theory");
  const result = workspace.getByTestId("sage-analysis-result");
  await services.getByLabel("SageMath backend").selectOption("private");
  await expect(services).toContainText("Backend available for this operation");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await expect(result.getByTestId("sage-result-kind-expression")).toContainText("6");
  await expect(result).toContainText("SageMath (Private gateway)");
  await expect(result).toContainText("Version: 10.10");

  await services.getByLabel("Operation").selectOption("sage.numberTheory.modInverse");
  await expect(services.getByLabel("SageMath backend")).toHaveValue("private");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await expect(result.getByTestId("sage-result-kind-expression")).toContainText("4");
  await services.getByLabel("Integer", { exact: true }).fill("2");
  await services.getByLabel("Modulus (greater than 1)").fill("4");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await expect(result.getByTestId("sage-result-kind-error")).toContainText("operation_failed");
  await expect(result).toContainText("does not exist");

  await workspace.getByRole("button", { name: "Runtimes", exact: true }).click();
  await expect(workspace.getByTestId("sage-runtime-version-private")).toContainText("SageMath 10.10");
  await expect(workspace.getByTestId("sage-runtime-quota-private")).toContainText("2 concurrent");
  await expect(workspace.getByTestId("sage-runtime-version-docker")).toContainText("SageMath 10.10");
  await workspace.getByRole("button", { name: "Results", exact: true }).click();

  await services.getByLabel("Operation").selectOption("sage.numberTheory.gcd");
  await services.getByLabel("SageMath backend").selectOption("docker");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await expect(result.getByTestId("sage-result-kind-expression")).toContainText("6");
  await expect(result).toContainText("SageMath (Docker)");
  await services.getByLabel("Operation").selectOption("sage.numberTheory.modInverse");
  await services.getByLabel("Integer", { exact: true }).fill("3");
  await services.getByLabel("Modulus (greater than 1)").fill("11");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await expect(result.getByTestId("sage-result-kind-expression")).toContainText("4");
  await expect(result).toContainText("SageMath (Docker)");
  return { workspace, services, result };
}

test("web Number Theory uses authenticated private gateway and retains local Docker", async ({ page, request }) => {
  const denied = await request.get("http://127.0.0.1:8770/health");
  expect(denied.status()).toBe(401);
  const browserHeaders: Record<string, string>[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/sage-private/run")) browserHeaders.push(request.headers());
  });
  await page.goto("/");
  const { workspace, services } = await exerciseNumberTheory(page);
  await services.getByLabel("SageMath backend").selectOption("private");
  await services.getByRole("button", { name: "Run", exact: true }).click();
  await services.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(services).toContainText("cancelled", { timeout: 30_000 });
  await workspace.getByRole("button", { name: "Open Compute → Runtimes" }).last().click();
  const compute = page.getByTestId("compute-center");
  await compute.getByRole("button", { name: "Overview" }).click();
  const jobs = compute.getByRole("region", { name: "Broker jobs" });
  await expect(jobs).toContainText("sage-private-gateway");
  await expect(jobs).toContainText("cancelled");
  await expect(jobs).toContainText("operation_failed");
  expect(browserHeaders.length).toBeGreaterThan(0);
  expect(browserHeaders.every((headers) => !Object.hasOwn(headers, "authorization"))).toBe(true);
});

test("desktop Number Theory uses authenticated private gateway and retains local Docker", async () => {
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-private-gateway-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root,
        MATH3D_SAGE_GATEWAY_URL: "http://127.0.0.1:8770",
        MATH3D_SAGE_SERVICE_URL: "http://127.0.0.1:8767" } });
    const page = await app.firstWindow();
    const { workspace, services } = await exerciseNumberTheory(page);
    await services.getByLabel("SageMath backend").selectOption("private");
    await services.getByRole("button", { name: "Run", exact: true }).click();
    await services.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(services).toContainText("cancelled", { timeout: 30_000 });
    await workspace.getByRole("button", { name: "Open Compute → Runtimes" }).last().click();
    const compute = page.getByTestId("compute-center");
    await compute.getByRole("button", { name: "Overview" }).click();
    const jobs = compute.getByRole("region", { name: "Broker jobs" });
    await expect(jobs).toContainText("sage-private-gateway");
    await expect(jobs).toContainText("cancelled");
    await expect(jobs).toContainText("operation_failed");
  } finally {
    await app?.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-private-gateway-"))
      throw new Error("Unsafe private gateway test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
