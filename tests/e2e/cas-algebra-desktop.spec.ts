import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
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
