import { expect, test } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

const base = "https://127.0.0.1:8443";
const origin = { Origin: base };

test("HTTPS edge keeps two Sage sessions and per-user quotas across proxy restart", async ({ browser, request }) => {
  const ready = await request.get(`${base}/__test/ready`);
  expect(await ready.json()).toMatchObject({ ready: true, edge: "https", proxy: "loopback" });
  const first = await browser.newContext({ ignoreHTTPSErrors: true });
  const second = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const ada = await first.newPage();
    const noether = await second.newPage();
    await Promise.all([ada.goto(base), noether.goto(base)]);
    const connect = async (page: typeof ada, key: string, user: string) => {
      await page.getByTestId("workspace-nav-number_theory").click();
      const workspace = page.getByTestId("number-theory-workspace");
      await workspace.getByRole("button", { name: "Runtimes", exact: true }).click();
      const control = workspace.getByTestId("sage-web-session");
      await control.getByLabel("Access key").fill(key);
      await control.getByRole("button", { name: "Connect Sage session" }).click();
      await expect(control).toContainText(`Connected as ${user}`);
      await expect(workspace.getByTestId("sage-runtime-version-private")).toContainText("SageMath 10.10");
      await workspace.getByRole("button", { name: "Results", exact: true }).click();
      return workspace;
    };
    const a = await connect(ada, "test-edge-ada-access-key-00000000000000", "ada");
    const b = await connect(noether, "test-edge-noether-access-key-000000000", "noether");
    const cookie = (await first.cookies()).find((item) => item.name === "math3d_sage_session");
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict" });
    const runUi = async (workspace: typeof a, operation: string, expected: string) => {
      const services = workspace.getByTestId("scientific-services-number_theory");
      await services.getByLabel("SageMath backend").selectOption("private");
      await services.getByLabel("Operation").selectOption(operation);
      await services.getByRole("button", { name: "Run", exact: true }).click();
      await expect(workspace.getByTestId("sage-result-kind-expression")).toContainText(expected);
      return services;
    };
    await runUi(a, "sage.numberTheory.gcd", "6");
    const services = await runUi(b, "sage.numberTheory.modInverse", "4");
    await services.getByLabel("Integer", { exact: true }).fill("2");
    await services.getByLabel("Modulus (greater than 1)").fill("4");
    await services.getByRole("button", { name: "Run", exact: true }).click();
    await expect(b.getByTestId("sage-result-kind-error")).toContainText("operation_failed");
    await services.getByLabel("Integer", { exact: true }).fill("3");
    await services.getByLabel("Modulus (greater than 1)").fill("11");
    await services.getByRole("button", { name: "Run", exact: true }).click();
    await services.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(services).toContainText("cancelled", { timeout: 30_000 });
    await b.getByRole("button", { name: "Open Compute → Runtimes" }).last().click();
    const compute = noether.getByTestId("compute-center");
    await compute.getByRole("button", { name: "Overview" }).click();
    const jobs = compute.getByRole("region", { name: "Broker jobs" });
    await expect(jobs).toContainText("operation_failed");
    await expect(jobs).toContainText("cancelled");
    await compute.getByRole("button", { name: "Close", exact: true }).click();

    const runApi = (index: number) => first.request.post(`${base}/api/sage-private/run`, {
      data: { operation: "sage.numberTheory.gcd", params: { values: ["12", "18"] },
        jobId: `edge-quota-${index}-${randomUUID()}` }, headers: origin,
    });
    for (let index = 0; index < 9; index++) expect((await runApi(index)).status()).toBe(200);
    expect((await runApi(10)).status()).toBe(429);
    const restart = await request.post(`${base}/__test/restart-proxy`);
    expect(restart.status()).toBe(200);
    const limitedAfterRestart = await runApi(11);
    expect(limitedAfterRestart.status()).toBe(429);
    expect((await limitedAfterRestart.json()).code).toBe("user_rate_limited");
    await runUi(b, "sage.numberTheory.gcd", "6");

    const expired = { userId: "ada", expiresAt: Date.now() - 1, nonce: randomUUID() };
    const payload = Buffer.from(JSON.stringify(expired)).toString("base64url");
    const signature = createHmac("sha256", "test-edge-session-secret-000000000000000000")
      .update(payload).digest("base64url");
    const expiredResponse = await request.get(`${base}/api/sage-private/health`, {
      headers: { Cookie: `math3d_sage_session=${payload}.${signature}` },
    });
    expect(expiredResponse.status()).toBe(401);
    expect((await expiredResponse.json()).code).toBe("session_required");

    await a.getByRole("button", { name: "Runtimes", exact: true }).click();
    await a.getByTestId("sage-web-session").getByRole("button", { name: "Disconnect Sage session" }).click();
    const revoked = await request.get(`${base}/api/sage-private/health`, {
      headers: { Cookie: `math3d_sage_session=${cookie!.value}` },
    });
    expect(revoked.status()).toBe(401);
    expect((await request.post(`${base}/__test/restart-proxy`)).status()).toBe(200);
    const revokedAfterRestart = await request.get(`${base}/api/sage-private/health`, {
      headers: { Cookie: `math3d_sage_session=${cookie!.value}` },
    });
    expect(revokedAfterRestart.status()).toBe(401);
  } finally {
    await first.close();
    await second.close();
  }
});
