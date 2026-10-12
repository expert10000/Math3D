# SSR-04 lifecycle and footprint evidence

Measured on 2026-10-12 in a Windows Electron development build, three scalar open/close cycles followed by the pinned hydrogenic 2p density-surface view. Reproduce with `npm run build:core`, `npm run measure:ssr:footprint`, `npm run measure:ssr:runtime`, and `npm run measure:ssr:lifecycle`. The lifecycle script uses an isolated profile, forces renderer GC before heap snapshots, and asserts view-canvas removal and WebGL context loss on close. These are local engineering measurements, not platform guarantees or a long-duration leak test.

| Metric | Pre-contract baseline | SSR-04 build |
| --- | ---: | ---: |
| Renderer entry gzip | 864,267 B | 864,329 B (+62 B) |
| All JavaScript gzip | 2,379,502 B | 2,382,891 B (+3,389 B) |
| App-shell ready, median of 3 | 1,410 ms | 1,147 ms |
| Idle Electron working set, median of 3 | 570,572 KiB | 571,064 KiB |
| Reported idle renderer heap, median of 3 | ~42.1 MB | ~42.1 MB |

The launch difference is within an uncontrolled local run; it does not prove a speedup. The measured JavaScript increase remains far below the 100 KiB gzip initial target. The process count remained four in the idle and lifecycle runs; no Python runtime is launched by these scenes.

| Lifecycle observation | Result |
| --- | --- |
| Scalar scene open latency, three cycles | 383, 331, 339 ms |
| Scalar view canvases | 1 idle → 3 open → 1 after each close |
| Scalar WebGL context | `webglcontextlost` observed on all three closes |
| GC-measured renderer heap after scalar close | 28.47, 28.52, 28.55 MB; 29.04 MB before first open |
| Quantum 2p preview / density-surface latency | 86 / 341 ms |
| Quantum surface canvases and WebGL context | 3 open → 1 after close; context loss observed |
| Final GC-measured renderer heap | 28.32 MB |

The total Electron working set remained around 610 MiB after both scenes versus 525 MiB before the first open in this profile. It fell from roughly 656–660 MiB during scalar display and 653 MiB during quantum display, but did **not** return to the initial process working set. Chromium, graphics-driver and allocator caches can retain committed pages. We therefore claim deterministic component/context cleanup and no progressive renderer-heap growth across these short cycles, **not** full operating-system memory return or a proven absence of long-term leaks. The next performance gate should include longer repeated runs and GPU-process attribution before setting a strict working-set threshold.

The non-quantum fixture contains 289 f64 source samples (2,312 bytes). Its verified resource Buffer remains in Electron only while opening or inspecting. The renderer receives one bounded `number[]` display copy of 289 values, then builds a `Float32Array` of 867 position components and a `Uint32Array` of 1,536 triangle indices through the existing viewer. The main adapter now refuses more than 4,096 samples **before** cloning values to the renderer. Exact selection rereads and re-hashes the source, then reads one `f64` directly from its verified Buffer; it no longer materializes another complete numeric array per pick. Closing clears the renderer view and the main-process active-source capability. The pinned 2p generic compatibility manifest adds metadata only; the existing quantum field viewer owns its bounded display derivation and cleanup. Only registered `identity` scalar height display and the existing versioned quantum complex-density display are accepted; no bundle-supplied code executes.

`scientific-scene/v1` source identity is `(sceneId, datasetId, sampleIndex)`, exposed as a stable sample ID. It is not a triangle, LOD or inferred physics identifier. The source hash is rechecked for each scalar inspection; changed bytes or metadata, mismatched fingerprint and inspection after close are refused by tests.
