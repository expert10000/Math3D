import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";
import { graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("desktop Graph Services shares Sage jobs, Inspector provenance, cancellation, and runtimes", async () => {
  test.setTimeout(180_000);
  const requests: Array<{ operation: string; params: { expression?: string } }> = [];
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
      const send = () => { if (!res.destroyed) res.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.6",
        operation: request.operation, success: true, result: { text: "graph-exact-result" }, latex: "", warnings: [] })); };
      if (requests.length === 1) send(); else setTimeout(send, 5000);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage test server did not bind.");
  const root = await mkdtemp(join(tmpdir(), "m3d-graph-sage-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root,
        MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` } });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Function");
    const editor = graphEditor(page);
    await editor.getByLabel("Start from preset").selectOption("parabola");
    await editor.getByLabel("Function expression").fill("x^2 + 1");
    await saveGraphEditor(page);
    await page.getByLabel("Graph functions").getByRole("button", { name: "Select Parabola" }).click();
    await page.getByTestId("graph2d-services-tab").click();
    const services = page.getByTestId("scientific-services-graphs");
    await services.getByLabel("Services preset").selectOption("Basic");
    await services.getByLabel("SageMath backend").selectOption("docker");
    await services.getByRole("button", { name: "Use selected graph y(x)" }).click();
    await expect(services.getByLabel("Expression")).toHaveValue("x^2 + 1");
    await services.getByRole("button", { name: "Run", exact: true }).click();
    const result = page.getByLabel("Graph inspector").getByTestId("sage-analysis-result");
    await expect(result).toContainText("graph-exact-result");
    await expect(result).toContainText("Source current");
    await expect(result).toContainText("SageMath (Docker)");
    expect(requests[0]).toMatchObject({ operation: "sage.symbolic.simplify", params: { expression: "x^2 + 1" } });

    await services.getByRole("button", { name: "Open Compute → Runtimes" }).click();
    const compute = page.getByTestId("compute-center");
    await expect(compute.getByTestId("sage-runtime-version-docker")).toContainText("SageMath 10.6");
    await compute.getByRole("button", { name: "Overview" }).click();
    await expect(compute.getByRole("region", { name: "Broker jobs" })).toContainText("Symbolic simplification");
    await compute.getByRole("button", { name: "Close", exact: true }).click();

    await services.getByRole("button", { name: "Run", exact: true }).click();
    await expect(services.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await services.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(services).toContainText("cancelled", { timeout: 30_000 });

    await page.getByTestId("graph2d-objects-tab").click();
    await page.getByLabel("Graph inspector").getByRole("button", { name: "Edit graph" }).click();
    const edit = graphEditor(page);
    await edit.getByLabel("Function expression").fill("x^2 + 2");
    await saveGraphEditor(page);
    await expect(result).toContainText("Source changed — rerun required");
    await result.getByRole("button", { name: "Save to Workbook" }).click();
    await expect(page.getByTestId("workbook-sage-evidence")).toContainText("Source changed — rerun required");
  } finally {
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-graph-sage-"))
      throw new Error("Unsafe Graph Sage test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
