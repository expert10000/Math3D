# Renderer memory profiling

Math3D exposes renderer memory diagnostics in the browser or Electron DevTools console:

```js
window.__math3dMemoryDiagnostics.snapshot()
```

The snapshot includes Chromium JS heap values when available, WebGL context and
resource counters, retained geometry-history buffers, workbook serialization and
autosave sizes, and binary worker traffic.

## Repeatable navigation probe

1. Open the workspace and wait for the initial viewer to settle.
2. Record a named baseline:

   ```js
   window.__math3dMemoryDiagnostics.mark("navigation")
   ```

3. Repeat the suspected workflow at least 20 times. For viewer lifecycle testing,
   switch between implicit and parametric surfaces, then between Surface, Volume,
   Geometry, Curves, and Topology.
4. Return to the initial workspace, wait five seconds, and inspect:

   ```js
   window.__math3dMemoryDiagnostics.delta("navigation")
   window.__math3dMemoryDiagnostics.snapshot()
   ```

Expected invariants after returning to the baseline screen:

- `webgl.contextsActive` returns to its baseline.
- Created and disposed context deltas converge.
- `history.meshBytesRetained` stops growing after its history limit is reached.
- Autosave and journal gauges remain bounded.
- Repeating an identical worker operation increases traffic counters but does not
  retain its request and response buffers.

Heap measurements are noisy because garbage collection is nondeterministic. Compare
the settled value after several cycles, and use the DevTools Memory panel's
comparison snapshots to identify retained constructors when the trend persists.

## Automated lifecycle guard

Run:

```bash
npm --prefix renderer run test:memory
```

This verifies that every source file constructing a Three.js WebGL renderer routes
creation and teardown through the shared lifecycle utilities and cancels persistent
animation frames.

## Automated Electron stress gate

```bash
npm run build:core
npm run test:app:e2e:memory
```

The Playwright CI gate runs four cycles by default, repeatedly switching
implicit/parametric surfaces and navigating
through Volume, Geometry, Curves, and Topology. It attaches
`memory-diagnostics.json` to the Playwright result.

Default thresholds:

- no active WebGL context growth;
- no WebGL create/dispose imbalance;
- at most 512 MiB settled heap growth;
- at most 64 MiB retained history-mesh growth.

Override workload and noisy-environment limits with:

- `MATH3D_MEMORY_STRESS_CYCLES`;
- `MATH3D_MEMORY_NAVIGATION_DWELL_MS`;
- `MATH3D_MEMORY_MAX_HEAP_GROWTH_BYTES`;
- `MATH3D_MEMORY_MAX_HISTORY_GROWTH_BYTES`.

Use a larger `MATH3D_MEMORY_STRESS_CYCLES` value for a local soak test. Software
WebGL environments may need a larger navigation dwell value for long runs.
