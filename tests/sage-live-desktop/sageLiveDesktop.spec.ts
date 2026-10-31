import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { launchRepoElectron } from "../e2e/helpers/electronLauncher";

test("live desktop Sage parity, rejection, cancellation, and runtime controls", async () => {
  test.setTimeout(360_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-sage-live-desktop-"));
  let app: Awaited<ReturnType<typeof launchRepoElectron>> | undefined;
  try {
    app = await launchRepoElectron({ args: ["."], cwd: resolve(__dirname, "../.."),
      env: { ...process.env, MATH3D_E2E_PROFILE_ROOT: root } });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Open backend services panel");
    await page.getByRole("button", { name: "Open backend services panel", exact: true }).click();
    const panel = page.getByTestId("scientific-services-surface");
    await panel.getByLabel("Services preset").selectOption("All");
    const backend = panel.getByLabel("SageMath backend");
    const run = panel.getByRole("button", { name: "Run", exact: true });
    const json = panel.getByRole("checkbox", { name: "JSON" });
    await json.check();
    const cases = [
      { operation: "sage.symbolic.simplify", expression: "sin(x)^2+cos(x)^2", variables: "x" },
      { operation: "sage.symbolic.expand", expression: "(x+1)^2", variables: "x" },
      { operation: "sage.symbolic.factor", expression: "x^2-1", variables: "x" },
      { operation: "sage.symbolic.solve", expression: "x-1", variables: "x" },
      { operation: "sage.symbolic.gradient", expression: "x^2+y^2+z^2", variables: "x,y,z" },
      { operation: "sage.symbolic.hessian", expression: "x^2+y^2+z^2", variables: "x,y,z" },
      { operation: "sage.symbolic.singularities", expression: "x^2+y^2+z^2-1", variables: "x,y,z" },
    ] as const;
    for (const item of cases) {
      await panel.getByLabel("Operation").selectOption(item.operation);
      await panel.getByLabel("Expression").fill(item.expression);
      await panel.getByLabel("Variables").fill(item.variables);
      const responses = [];
      for (const choice of ["local", "docker"] as const) {
        await backend.selectOption(choice);
        await run.click();
        await expect(panel.getByRole("status", { name: /Completed/ })).toBeVisible({ timeout: 60_000 });
        await panel.getByRole("status", { name: /Completed/ }).click();
        const response = JSON.parse(await panel.locator("pre").last().innerText());
        expect(response.success, `${item.operation} on ${choice}: ${response.error ?? ""}`).toBe(true);
        responses.push(response);
      }
      const [local, docker] = responses;
      if (item.operation === "sage.symbolic.solve") {
        expect(local.result.text).toBe(`[${docker.result.solutions.join(", ")}]`);
      } else if (item.operation === "sage.symbolic.singularities") {
        expect(docker.result.points).toEqual([]);
        expect(local.result.text).toBe(docker.result.text);
      } else {
        expect(docker.result.text, `${item.operation} exact result differs between backends`)
          .toBe(local.result.text);
      }
    }
    await panel.getByLabel("Operation").selectOption("sage.symbolic.simplify");
    await panel.getByLabel("Expression").fill("x.__class__");
    for (const choice of ["local", "docker"] as const) {
      await backend.selectOption(choice);
      await run.click();
      await expect(panel.getByRole("status", { name: /Operation failed/ })).toBeVisible({ timeout: 60_000 });
      await expect(panel).toContainText(choice === "local" ? "unsupported syntax" : "Malformed expression");
    }
    await panel.getByLabel("Expression").fill("(x+y+z)^35");
    await backend.selectOption("docker");
    await run.click();
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toContainText("cancelled", { timeout: 30_000 });
    await backend.selectOption("local");
    await run.click();
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel).toContainText("cancelled", { timeout: 30_000 });

    await page.getByTestId("top-compute-center-button").click();
    const compute = page.getByTestId("compute-center");
    const jobs = compute.getByRole("region", { name: "Broker jobs" });
    const simplificationRows = await jobs.getByText("Symbolic simplification", { exact: true })
      .locator("../..").allTextContents();
    for (const backendId of ["sage-local-wsl", "sage-docker"]) {
      expect(simplificationRows.some((row) => row.includes(backendId) && row.includes("complete")),
        `${backendId} completed job missing`).toBe(true);
      expect(simplificationRows.some((row) => row.includes(backendId) && row.includes("failed")),
        `${backendId} rejected job missing`).toBe(true);
      expect(simplificationRows.some((row) => row.includes(backendId) && row.includes("cancelled")),
        `${backendId} cancelled job missing: ${JSON.stringify(simplificationRows)}`).toBe(true);
    }

    // Verify that the live service stops its subprocess, beyond the desktop job state.
    const jobId = randomUUID();
    const running = fetch("http://127.0.0.1:8767/run", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, operation: "sage.symbolic.expand",
        params: { expression: "(x+y+z)^50", variables: ["x", "y", "z"] } }),
    });
    let stopped = false;
    for (let attempt = 0; attempt < 20 && !stopped; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const response = await fetch("http://127.0.0.1:8767/cancel", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
      stopped = (await response.json()).ok === true;
    }
    expect(stopped, "Docker service never registered the cancellable Sage job").toBe(true);
    const cancelled = await (await running).json();
    expect(cancelled.success).toBe(false);
    expect(cancelled.error).toContain("cancelled");
    const earlyJobId = randomUUID();
    const earlyCancel = await fetch("http://127.0.0.1:8767/cancel", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: earlyJobId }) });
    expect((await earlyCancel.json()).ok).toBe(true);
    const earlyRun = await fetch("http://127.0.0.1:8767/run", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: earlyJobId, operation: "sage.symbolic.simplify",
        params: { expression: "x+1", variables: ["x"] } }),
    });
    expect((await earlyRun.json()).error).toContain("cancelled");

    await compute.getByRole("button", { name: "Runtimes", exact: true }).click();
    const engines = compute.getByText("SageMath Docker", { exact: true }).locator("../..");
    await engines.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(engines.getByRole("button", { name: "Start", exact: true })).toBeEnabled({ timeout: 30_000 });
    await engines.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(async () => {
      await compute.getByTestId("compute-engine-manager").getByRole("button", { name: "Refresh", exact: true }).click();
      return await engines.innerText();
    }, { timeout: 30_000 }).toContain("available");
  } finally {
    await app?.close();
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-sage-live-desktop-"))
      throw new Error("Unsafe Sage live desktop cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
