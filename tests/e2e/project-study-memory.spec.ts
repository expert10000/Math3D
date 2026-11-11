import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("source Project and Study navigation releases previews over 80 cycles", async () => {
  const cycles = Number(process.env.MATH3D_STUDY_MEMORY_CYCLES ?? 80);
  expect(Number.isInteger(cycles) && cycles >= 4 && cycles <= 80).toBe(true);
  test.setTimeout(20 * 60_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByRole("button", { name: "Starter projects", exact: true }).click();
    await projects.getByTestId("project-gallery-guided").click();
    await projects.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const study = project.workspace.studies[0];
    const surface = study.members.find((member: { documentId: string }) =>
      project.workspace.entries.some((entry: { expected: { id: string }; module: string }) =>
        entry.expected.id === member.documentId && entry.module === "surface"));
    expect(surface).toBeTruthy();
    const pane = study.layout.panes.find((item: { memberId: string }) => item.memberId === surface.memberId);
    expect(pane).toBeTruthy();
    const cdp = await page.context().newCDPSession(page);
    const diagnose = process.env.MATH3D_STUDY_MEMORY_DIAG === "1";
    if (diagnose) await cdp.send("HeapProfiler.enable");
    const samples: { cycle: number; closedHeapBytes: number | null; canvasCount: number;
      surfaceKeys?: string[] }[] = [];
    const receiptPath = test.info().outputPath("project-study-memory.json");
    const heapComposition: Record<number, Record<string, { count: number; bytes: number }>> = {};
    const click = (locator: import("@playwright/test").Locator) =>
      locator.evaluate(element => (element as HTMLButtonElement).click());
    for (let cycle = 1; cycle <= cycles; cycle++) {
      if (!await projects.getByTestId("project-studies-panel").count())
        await click(projects.getByTestId("project-gallery-layout-toggle").first());
      const studies = projects.getByTestId("project-studies-panel");
      if (!await studies.getByTestId("project-study-panes").count())
        await click(studies.getByTestId(`project-study-open-${study.id}`));
      await click(studies.getByTestId(`project-study-preview-toggle-${pane.paneId}`));
      const preview = studies.getByTestId("project-study-pane-preview");
      await expect(preview).toHaveAttribute("data-kind", "geometry");
      await expect.poll(() => preview.locator("canvas").count()).toBeGreaterThan(0);
      await click(studies.getByTestId(`project-study-open-source-${pane.paneId}`));
      await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", surface.documentId);
      await expect(page.getByTestId("project-study-pane-preview")).toHaveCount(0);
      // The source route leaves a compact Project dock. Reopen its Study on the next cycle.
      // E2E hooks retain App render closures; production does not install them.
      await page.evaluate(() => {
        delete window.__MATH3D_E2E_GEOMETRY_PICK__;
        delete window.__MATH3D_E2E_MESH_ANALYSIS__;
        delete window.__MATH3D_E2E_MESH_BENCHMARK__;
        delete window.__MATH3D_E2E_MESH_OPERATION__;
      });
      const measureHeap = cycle === cycles || cycle === 20 || cycle % 10 === 0;
      if (measureHeap) await cdp.send("HeapProfiler.collectGarbage");
      const heap = measureHeap ? await cdp.send("Runtime.getHeapUsage") : null;
      if (diagnose && (cycle === 10 || cycle === cycles)) {
        const chunks: string[] = [];
        const onChunk = ({ chunk }: { chunk: string }) => { chunks.push(chunk); };
        cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
        try { await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false }); }
        finally { cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk); }
        const raw = chunks.join("");
        writeFileSync(test.info().outputPath(`heap-cycle-${cycle}.heapsnapshot`), raw);
        const snapshot = JSON.parse(raw);
        const fields: string[] = snapshot.snapshot.meta.node_fields;
        const types: string[] = snapshot.snapshot.meta.node_types[fields.indexOf("type")];
        const stride = fields.length, nameIndex = fields.indexOf("name"),
          sizeIndex = fields.indexOf("self_size"), typeIndex = fields.indexOf("type");
        const composition: Record<string, { count: number; bytes: number }> = {};
        for (let index = 0; index < snapshot.nodes.length; index += stride) {
          const type = types[snapshot.nodes[index + typeIndex]];
          if (!["object", "native", "array"].includes(type)) continue;
          const key = `${type}:${snapshot.strings[snapshot.nodes[index + nameIndex]]}`;
          const row = composition[key] ??= { count: 0, bytes: 0 };
          row.count++; row.bytes += snapshot.nodes[index + sizeIndex];
        }
        heapComposition[cycle] = composition;
      }
      const surfaceKeys = diagnose ? await page.evaluate(() => {
        const raw = localStorage.getItem("math3d.surfaceAnalysis.workspace.v1");
        return raw ? (JSON.parse(raw).definitions ?? []).map((item: { identity: { key: string } }) =>
          item.identity.key) : [];
      }) : undefined;
      samples.push({ cycle, closedHeapBytes: heap?.usedSize ?? null,
        canvasCount: await page.locator("canvas").count(), ...(surfaceKeys ? { surfaceKeys } : {}) });
      if (cycle % 10 === 0 || cycle === cycles) {
        writeFileSync(receiptPath, JSON.stringify({ schema: "math3d.project-study-source-memory/v1",
          sourceCommit: process.env.GITHUB_SHA ?? "uncommitted-source-build",
          scope: "source Electron build; installed-candidate memory remains a separate release gate",
          e2eHookAblation: true,
          cyclesCompleted: cycle, cyclesRequested: cycles, samples, ...(diagnose ? { heapComposition } : {}) }, null, 2) + "\n");
        console.log(`Project/Study source navigation: ${cycle}/${cycles} cycles`);
      }
    }
    const warmup = samples[Math.min(19, cycles - 1)];
    const final = samples[cycles - 1];
    expect(warmup.closedHeapBytes).not.toBeNull();
    expect(final.closedHeapBytes).not.toBeNull();
    // A single post-GC sample can still land on a different V8 compaction cycle.
    // Compare three closed-preview checkpoints on each side of the late window.
    const warmupCycles = cycles === 80 ? [20, 30, 40] : [warmup.cycle];
    const lateCycles = cycles === 80 ? [60, 70, 80] : [final.cycle];
    const meanHeap = (selected: number[]) => selected.reduce((sum, cycle) => {
      const bytes = samples[cycle - 1]?.closedHeapBytes;
      expect(typeof bytes).toBe("number");
      return sum + bytes!;
    }, 0) / selected.length;
    const warmupMeanBytes = meanHeap(warmupCycles);
    const lateMeanBytes = meanHeap(lateCycles);
    const lateGrowthBytes = lateMeanBytes - warmupMeanBytes;
    const receipt = { schema: "math3d.project-study-source-memory/v1", sourceCommit: process.env.GITHUB_SHA ?? null,
      scope: "source Electron build; installed-candidate memory remains a separate release gate",
      e2eHookAblation: true,
      method: "Mean forced-GC closed-preview heap at cycles 60/70/80 minus cycles 20/30/40",
      cycles, warmupCycles, lateCycles, warmupMeanBytes, lateMeanBytes,
      pointGrowthBytes: final.closedHeapBytes! - warmup.closedHeapBytes!,
      lateGrowthBytes, limitBytes: 3 * 1024 * 1024,
      samples, ...(diagnose ? { heapComposition } : {}) };
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    expect(samples.slice(19).every(item => item.canvasCount === final.canvasCount)).toBe(true);
    if (cycles === 80) expect(lateGrowthBytes).toBeLessThanOrEqual(receipt.limitBytes);
  } finally { await closeSurfaceApp(ctx); }
});
