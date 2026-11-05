import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("two hosted web sessions share discovery but keep authorization and quotas separate", async ({ browser, request }) => {
  const anonymous = await request.get("http://127.0.0.1:8796/api/sage-private/health");
  expect(anonymous.status()).toBe(401);
  expect((await anonymous.json()).code).toBe("session_required");
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const ada = await first.newPage();
    const noether = await second.newPage();
    const browserHeaders: Record<string, string>[] = [];
    ada.on("request", (req) => {
      if (req.url().includes("/api/sage-private/run")) browserHeaders.push(req.headers());
    });
    await Promise.all([ada.goto("/"), noether.goto("/")]);
    const connect = async (page: typeof ada, key: string, user: string) => {
      await page.getByTestId("workspace-nav-number_theory").click();
      const workspace = page.getByTestId("number-theory-workspace");
      await workspace.getByRole("button", { name: "Runtimes", exact: true }).click();
      const session = workspace.getByTestId("sage-web-session");
      await expect(session).toContainText("Hosted Sage web session");
      await session.getByLabel("Access key").fill(key);
      await session.getByRole("button", { name: "Connect Sage session" }).click();
      await expect(session).toContainText(`Connected as ${user}`);
      await expect(session).toContainText("1 concurrent · 10 requests/min");
      await expect(workspace.getByTestId("sage-runtime-version-private")).toContainText("SageMath 10.10");
      await workspace.getByRole("button", { name: "Results", exact: true }).click();
      return { workspace, session };
    };
    const a = await connect(ada, "test-ada-access-key-000000000000000000", "ada");
    const b = await connect(noether, "test-noether-access-key-00000000000000", "noether");
    const cookies = await first.cookies();
    expect(cookies.find((item) => item.name === "math3d_sage_session")?.httpOnly).toBe(true);
    const runUi = async (workspace: typeof a.workspace, operation: string, expected: string) => {
      const services = workspace.getByTestId("scientific-services-number_theory");
      await services.getByLabel("SageMath backend").selectOption("private");
      await services.getByLabel("Operation").selectOption(operation);
      await services.getByRole("button", { name: "Run", exact: true }).click();
      await expect(workspace.getByTestId("sage-analysis-result").getByTestId("sage-result-kind-expression")).toContainText(expected);
    };
    await runUi(a.workspace, "sage.numberTheory.gcd", "6");
    const saveAndReopen = async (page: typeof ada, workspace: typeof a.workspace, operation: string, outcome: string,
      version = "10.10", errorCode?: string) => {
      await workspace.getByTestId("sage-analysis-result").getByRole("button", { name: "Save to Workbook" }).click();
      const evidence = page.getByTestId("workbook-sage-evidence").last();
      await expect(evidence).toContainText(`Operation: ${operation}`);
      await expect(evidence).toContainText(outcome);
      await expect(evidence).toContainText(`Private gateway · SageMath ${version}`);
      await page.reload();
      await expect(evidence).toContainText(`Operation: ${operation}`);
      await expect(evidence).toContainText(outcome);
      await evidence.getByText("Exact request, response, and diagnostics").click();
      await expect(evidence).toContainText('"backend": "private"');
      if (errorCode) await expect(evidence).toContainText(`"errorCode": "${errorCode}"`);
      await page.getByTestId("workspace-nav-number_theory").click();
    };
    await saveAndReopen(ada, a.workspace, "sage.numberTheory.gcd", "Outcome: Exact");
    await runUi(b.workspace, "sage.numberTheory.modInverse", "4");
    const noetherServices = b.workspace.getByTestId("scientific-services-number_theory");
    await noetherServices.getByLabel("Integer", { exact: true }).fill("2");
    await noetherServices.getByLabel("Modulus (greater than 1)").fill("4");
    await noetherServices.getByRole("button", { name: "Run", exact: true }).click();
    await expect(b.workspace.getByTestId("sage-result-kind-error")).toContainText("operation_failed");
    await b.workspace.getByRole("button", { name: "Open Compute → Runtimes" }).last().click();
    const failedCompute = noether.getByTestId("compute-center");
    await failedCompute.getByRole("button", { name: "Overview" }).click();
    await expect(failedCompute.getByRole("region", { name: "Broker jobs" })).toContainText("operation_failed");
    await failedCompute.getByRole("button", { name: "Close", exact: true }).click();
    await saveAndReopen(noether, b.workspace, "sage.numberTheory.modInverse", "Outcome: Failed", "10.10", "operation_failed");
    await noetherServices.getByLabel("SageMath backend").selectOption("private");
    await noetherServices.getByLabel("Operation").selectOption("sage.numberTheory.modInverse");
    await noetherServices.getByLabel("Integer", { exact: true }).fill("3");
    await noetherServices.getByLabel("Modulus (greater than 1)").fill("11");
    await noetherServices.getByRole("button", { name: "Run", exact: true }).click();
    await noetherServices.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(noetherServices).toContainText("cancelled", { timeout: 30_000 });
    await expect(b.workspace.getByTestId("sage-analysis-result")).toContainText("cancelled");
    await b.workspace.getByRole("button", { name: "Open Compute → Runtimes" }).last().click();
    const compute = noether.getByTestId("compute-center");
    await compute.getByRole("button", { name: "Overview" }).click();
    const jobs = compute.getByRole("region", { name: "Broker jobs" });
    await expect(jobs).toContainText("sage-private-gateway");
    await expect(jobs).toContainText("cancelled");
    await compute.getByRole("button", { name: "Close", exact: true }).click();
    await saveAndReopen(noether, b.workspace, "sage.numberTheory.modInverse", "Outcome: Failed", "unreported", "cancelled");
    const runApi = (index: number) => first.request.post("http://127.0.0.1:8796/api/sage-private/run", {
      data: { operation: "sage.numberTheory.gcd", params: { values: ["12", "18"] }, jobId: `quota-${index}-${randomUUID()}` },
      headers: { Origin: "http://127.0.0.1:5186" },
    });
    let limited: Awaited<ReturnType<typeof runApi>> | null = null;
    for (let index = 0; index < 11; index++) {
      const response = await runApi(index);
      if (response.status() === 429) { limited = response; break; }
      expect(response.status()).toBe(200);
    }
    expect(limited?.status()).toBe(429);
    expect((await limited!.json()).code).toBe("user_rate_limited");
    await runUi(b.workspace, "sage.numberTheory.gcd", "6");
    expect(browserHeaders.length).toBeGreaterThan(0);
    expect(browserHeaders.every((headers) => !Object.hasOwn(headers, "authorization"))).toBe(true);
    await a.workspace.getByRole("button", { name: "Runtimes", exact: true }).click();
    await a.session.getByRole("button", { name: "Disconnect Sage session" }).click();
    await expect(a.session).toContainText("Enter your assigned access key");
    const denied = await first.request.get("http://127.0.0.1:8796/api/sage-private/health");
    expect(denied.status()).toBe(401);
    await runUi(b.workspace, "sage.numberTheory.modInverse", "4");
  } finally {
    await first.close();
    await second.close();
  }
});
