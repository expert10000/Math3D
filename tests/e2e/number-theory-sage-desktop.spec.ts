import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("desktop Number Theory shares Sage discovery, cancellation, Inspector, and Workbook", async () => {
  test.setTimeout(180_000);
  const requests: Array<{ operation: string; params: Record<string, unknown> }> = [];
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: true,
        status: "ok", operations: ["sage.numberTheory.gcd", "sage.numberTheory.modInverse"] }));
      return;
    }
    if (req.url === "/cancel") { res.end(JSON.stringify({ ok: true })); return; }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body) as typeof requests[number];
      requests.push(request);
      const send = () => { if (!res.destroyed) res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.6",
        operation: request.operation, success: true,
        result: { value: request.operation === "sage.numberTheory.gcd" ? "6" : "4" },
        latex: request.operation === "sage.numberTheory.gcd" ? "6" : "4", warnings: [] })); };
      if (requests.length === 1) setTimeout(send, 5000); else send();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage test server did not bind.");
  const root = await mkdtemp(join(tmpdir(), "m3d-number-theory-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root,
        MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` } });
    const page = await app.firstWindow();
    await page.getByTestId("workspace-nav-number_theory").click();
    const workspace = page.getByTestId("number-theory-workspace");
    await expect(workspace).toBeVisible();
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
    await expect(result).toContainText("SageMath (Docker)");
    await expect(result).toContainText("Version: 10.6");
    await expect(result).toContainText("Freeform input");
    await services.getByLabel("Operation").selectOption("sage.numberTheory.modInverse");
    await services.getByRole("button", { name: "Run", exact: true }).click();
    await expect(result).toContainText("Modular inverse");
    await expect(result.getByTestId("sage-result-kind-expression")).toContainText("4");
    expect(requests[1]).toMatchObject({ operation: "sage.numberTheory.gcd", params: { values: ["84", "30"] } });
    expect(requests[2]).toMatchObject({ operation: "sage.numberTheory.modInverse", params: { a: "3", modulus: "11" } });

    await workspace.getByRole("button", { name: "Runtimes", exact: true }).click();
    await expect(workspace.getByTestId("sage-runtime-version-docker")).toContainText("SageMath 10.6");
    await expect(workspace.getByTestId("sage-runtime-limits-docker")).toContainText("input 64 KiB");
    await workspace.getByRole("button", { name: "Open Compute → Runtimes" }).last().click();
    const compute = page.getByTestId("compute-center");
    await expect(compute.getByRole("button", { name: "Runtimes", exact: true })).toHaveAttribute("aria-pressed", "true");
    await compute.getByRole("button", { name: "Overview" }).click();
    await expect(compute.getByRole("region", { name: "Broker jobs" })).toContainText("cancelled");
    await expect(compute.getByRole("region", { name: "Broker jobs" })).toContainText("Modular inverse");
    await compute.getByRole("button", { name: "Close", exact: true }).click();
    await workspace.getByRole("button", { name: "Results", exact: true }).click();
    await result.getByRole("button", { name: "Save to Workbook" }).click();
    await expect(workspace).toHaveCount(0);
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("Freeform input saved with this result");
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("number_theory");
  } finally {
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-number-theory-"))
      throw new Error("Unsafe Number Theory test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
