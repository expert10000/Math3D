# QI-19–21: large scenes, linked QWZ sweeps and native promotion

Implemented 2026-11-05 across Theory Lab and Math3D. These changes retain the existing verified run and scene contracts. The two applications continue to check source hashes independently.

## QI-19: progressive field loading

Theory Lab's stream bundle stores coarse and full field levels as content-addressed chunks. Its viewer loads the coarse level first and then requests full chunks through a bounded LRU cache. Chunk hashes are checked when read, including after opening a saved stream bundle. Loading yields to the event loop every 16 chunks, so progress and cancellation can update during a large field. The viewer displays tracked peak resident buffer bytes. The full scene limit remains 16 MiB and the cache limit is 4 MiB.

The schema and Math3D's independent scene/Study validators now allow one million field samples and 97 samples per axis. A deterministic 97³ fixture tests that its coarse preview is less than one sixteenth of the full byte count, that full bytes are recovered, that chunk progress occurs, and that tracked buffers remain bounded. Math3D's own viewer still consumes a fully verified scene bundle rather than Theory Lab's stream format.

## QI-20: linked phase diagrams

Theory Lab's `quantum-phase-diagram/v1` contract records mass and grid resolution axes. A cell references an already saved QWZ run, its exact result SHA-256, Chern and gap checks, and its bands and curvature scene IDs. Building a diagram selects the newest verified run for each available mass/grid pair and writes an immutable diagram. Missing pairs remain blank in the heatmap; this command does not launch new solver jobs.

Opening a cell rechecks the run hash, numerical values, and scene IDs before navigation. The heatmap can open the exact source run or either related scene. Diagram listing excludes entries whose pinned source has changed. The store is capped at 64 cells per diagram.

## QI-21: native Math3D documents

From a Project quantum scene, **Promote copy** reopens the exact scene reference and verifies it before deriving native documents. The commands produce Geometry from mapped primitives, Curve and Graph2D from a mapped polyline, Mesh from mapped triangles, and Surface with a paired mesh. A Graph2D point table and Mesh buffer sidecar are saved as Project resources. Field Explorer's existing field promotion remains the field path.

Each copy has a `derived-from` relation to the read-only quantum source, with the scene fingerprint and result hash in the relation parameters. The source scientific arrays are not modified. Mesh positions are explicitly float32 display copies; the quantum source keeps its original precision. Commands require supported mapped primitives and refuse scenes that lack them. Repeating an identical promotion in the same Project is refused to prevent duplicate stable identities.

## Verification

- Theory Lab: `npm run typecheck`; `npx tsx --test tests/qwz-phase-diagrams.test.ts tests/stream-scenes.test.ts`.
- Math3D: `npm run typecheck:noemit`; `npm run build:main`; `npx vitest run tests/unit/quantumNativePromotion.test.ts --maxWorkers=1`.
- Desktop promotion: `npx playwright test tests/e2e/quantum-qi21-native-promotion.spec.ts --reporter=list`.
