# Source-grid stencils for derived scientific profiles

V3 derived XY/XZ/YZ slices retain at most 32×32 displayed cells. Each cell's divergence, signed curl, speed gradient or speed Laplacian now uses its immediate source-grid neighbors along x, y and z. Interior points use centered three-point differences; boundaries use one-sided three-point differences (or two points on a two-cell axis). The host reads and verifies only v3 tiles containing those points. V2 keeps its bounded-grid stencil transfer; v1 keeps full-resource verification. Saved Graphs origins mark `stencilGrid: "source"`, so older bounded-grid lines continue to reverify with their original recipe.

The 80³ analytic vortex test checks exported profile values at interior and boundary points. For its speed Laplacian profile, this Windows run of `npm run benchmark:scientific:derived` measured:

| Stencil | First profile | Transfer values | Verified tiles per component | Mean absolute error | Maximum absolute error |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bounded 32³ | 397.6 ms | 73,728 B | 25/125 | 0.1303 | 1.8877 |
| Source grid | 412.1 ms | 147,456 B | 25/125 | 0.0230 | 0.3320 |

For the measured 47×85×55 Burgers scene, the same run took 356.9 ms with bounded stencils and 375.3 ms with source-grid stencils. It transferred 73,728 B and 125,952 B respectively, verifying 18 tiles per component in both cases. The maximum difference between the two measured profiles was 104.59 in the speed Laplacian's physical unit; this is a method difference, not an accuracy claim for measured data. The desktop test confirms Project reopen, saved sample hashes, and rejection of a corrupted tile needed by the source-grid stencil.

These timings are one sequential run per method and include source transfer, numerical calculation and line creation. OS file cache and process load affect them; rerun the command for local measurements. The analytic errors are specific to the fixture and line. Finite differences remain approximations, especially near small speed or source boundaries.

## Point calculus Inspector

V3 point calculus now reads the center and each source-grid neighbor needed for divergence, signed curl, the full Jacobian, speed gradient, and speed Laplacian. At an interior probe this is seven samples per component; at a boundary it includes the second inward neighbor for a one-sided three-point difference. The host verifies only tiles containing the selected stencil. The Inspector displays the source-grid method, source revision and hash, per-component sample SHA-256, and verified tile counts. V1 and v2 keep their prior bounded-volume path.

The 80³ golden test checks every Jacobian entry and each other calculus output against independent analytic formulas at interior and boundary points. It checks the exact transfer coverage and rejects a changed sample hash. The measured Burgers desktop test checks Inspector provenance and rejects a changed tile needed by the selected probe.

### SCI-14 Jacobian and eigenvalue detail

The point Inspector keeps value, magnitude, divergence and curl in its compact view. An expandable Jacobian panel shows the 3×3 derivative matrix, each entry's physical unit, the selected finite-difference method, and three eigenvalues in inverse-time units when component and coordinate units are compatible. Complex conjugate pairs are shown with signed imaginary parts. The eigenvalues use the already verified probe Jacobian, so opening the panel requests no additional source tiles. A singular or poorly conditioned Jacobian, nearly repeated roots, or a boundary/two-point stencil receives an **uncertain** label. These values describe the local linearization; they are not a stability classification unless the point is an equilibrium.

The 80³ oracle checks complex and real eigenvalues against the analytic Jacobian, including the one-sided boundary case. The measured Burgers desktop test checks the panel's verified tile hashes, rejection of a changed needed tile, and the same source and sample provenance after Project reopen and fresh analysis. The panel is collapsed after reopening; numerical results are recomputed from the saved source.

### SCI-14 saved point results and Project lineage

Each successful point Inspector calculation publishes a compact Project analysis result and an `analysis-of` relation to the exact Vector Field document generation. The result records its physical probe coordinates and coordinate units, source reference and hash, derivative method and stencil coordinates, verified sample SHA-256 values, Jacobian and entry units, divergence, curl, eigenvalues and units, condition estimate, and the eigenvalue confidence label. Repeating the same verified calculation reuses its deterministic result ID. Numerical values remain in the compact result summary; no resource payload is copied into the Project.

After Project reopen, the result graph exposes source identity and lineage but withholds saved point values. The Inspector's **Open Project result graph** link selects its saved record directly. Field Explorer lists saved point results and reads the required source stencil again when **Reverify saved Inspector result** is selected. It compares the fresh result with the saved identity, parameters, numerical summary, and sample hashes before displaying the Inspector values. A changed tile or source generation leaves those values hidden and reports an error. V3 keeps its tile-local verifier; v1/v2 retain their bounded transfer path. The 80³ analytic test checks saved values and lineage, while the measured Burgers desktop test checks Project persistence and changed-tile rejection on reopen.

One Windows run of `npm run benchmark:scientific:probe` measured first calculus result from the start of verified transfer through calculation:

| Scene | Method | First result | Transfer values | Verified tiles per component |
| --- | --- | ---: | ---: | ---: |
| 80³ analytic vortex | Bounded volume | 132.3 ms | 786,432 B | 125/125 |
| 80³ analytic vortex | Source probe | 9.2 ms | 168 B | 1/125 |
| 47×85×55 measured Burgers | Bounded volume | 81.9 ms | 786,432 B | 72/72 |
| 47×85×55 measured Burgers | Source probe | 6.1 ms | 168 B | 1/72 |

These are sequential local measurements with the bounded path first; cache and JIT state affect timing. The measured Burgers scene has no analytic reference for derivative accuracy. Rerun the benchmark to compare on another machine.

## Tile-backed trajectories and equilibrium search

V3 trajectories and the bounded equilibrium search share a 64 MiB, manifest-pinned worker tile cache. Trajectories request the physical tiles they visit. Equilibrium search keeps completed seeds and, within the active seed, its Newton iteration, point, value and ordered stencil samples when a tile is missing. A resumed solve replays only the partially sampled iteration from saved values; completed Newton iterations and their evaluations remain intact. It batches up to eight missing interpolation corners in one host call. The host coalesces duplicate physical tiles per resource. Each tile is checked against the v3 tile SHA-256 again when admitted to the cache. The worker reports source hash, resource hashes, tile indices and hashes, tile-set digest, and resident tile bytes. Cancellation terminates the worker without publishing partial results. V1 and v2 retain bounded-volume interpolation.

The 80³ oracle checks physical-time and normalized-line endpoints against circular motion. Generated linear v3 fields check stationary source and saddle equilibria. The measured Burgers desktop test checks tile provenance, both solvers' tamper rejection, cancellation, and time and resident cache bytes to the first trajectory.

One local run of `npm run benchmark:scientific:tile-solvers` measured:

| Scene | Operation | Bounded | Tile restart | Resume + batch | Tiles per component | Resident tile bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 80³ vortex | Trajectory | 124.7 ms | — | 19.8 ms | 3/125 | 294,912 B |
| Measured Burgers | Trajectory | 76.6 ms | — | 5.8 ms | 1/72 | 98,304 B |
| 80³ vortex | Equilibrium search | 90.9 ms | 1,186.4 ms | 584.5 ms | 125/125 | 12,288,000 B |
| Measured Burgers | Equilibrium search | 63.8 ms | 665.3 ms | 434.7 ms | 72/72 | 5,273,400 B |

Equilibrium search seeds are spread across the whole domain, so these fixtures eventually require every tile. The resumed search matches the restarting search's candidates and evaluation counts. A scene requiring more than 64 MiB of tiles for one run stops with an explicit cache-budget error. Resident tile bytes measure the cache, not peak process memory.

The next benchmark run compared the preceding seed-level checkpoint with the Newton-iteration checkpoint, using the same batched tile requests:

| Scene | Bounded | Seed-level resume | Newton-iteration resume | Requests | Tiles per component | Resident tile bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 80³ vortex | 94.0 ms | 637.6 ms | 610.8 ms | 122 | 125/125 | 12,288,000 B |
| Measured Burgers | 78.0 ms | 308.9 ms | 285.2 ms | 63 | 72/72 | 5,273,400 B |

Both methods returned the same candidates, evaluation counts (2,829 for the vortex, 3,411 for Burgers), attempted seeds and rejected seeds. The iteration checkpoint saved 26.8 ms and 23.7 ms in this run. A second sequential run measured 591.2→574.1 ms for the vortex and 280.9→286.6 ms for Burgers. This is a small change relative to run-to-run variation. Domain-wide search still reads every tile and remains slower than the bounded-volume path. Disk cache, JIT and process load affect these timings.

## Adaptive equilibrium tile prefetch

For v3 fields whose three components share a tile shape, the search estimates how much of the tile grid its regular seeds cover. If coverage is at least 70%, all tiles fit within the 64 MiB cache, and the evaluation budget is large enough for a broad search, the worker fetches the manifest-pinned tiles in batches of at most 32 before starting Newton iterations. Other fields keep the on-demand tile path. Host reads verify each tile hash, and the worker verifies the transferred values again when adding them to the cache. Cancellation discards the worker and any in-flight response.

One sequential local benchmark measured:

| Scene | Bounded volume | Newton resume on demand | Adaptive prefetch | Tile requests | Verified tiles per component |
| --- | ---: | ---: | ---: | ---: | ---: |
| 80³ vortex | 90.9 ms | 576.2 ms | 366.4 ms | 122 → 4 | 125/125 |
| Measured Burgers | 69.4 ms | 269.1 ms | 161.6 ms | 63 → 3 | 72/72 |

All tile-search modes returned identical candidates, evaluations, attempted seeds and rejected seeds. Prefetch improves these broad searches but still reads every tile and remains slower than the bounded-volume path. The bounded path samples a 32³ transfer, while the tile path interpolates the source grid; timings include transfer and calculation and vary with cache and process load.

## Equilibrium sampler profile

The v3 tile sampler now computes each interpolation corner's tile index and offset once, reusing it for the missing-tile check and weighted value lookup. It retains the same corner and component accumulation order, supports independently tiled components, and keeps the manifest-pinned tile checks and 64 MiB limit. An independent cubic-field test covers mixed tile shapes, partial edge tiles, tile seams and domain boundaries. The benchmark pins candidate geometry SHA-256 values and evaluation counts from before the eigenvalue classification change for both fixtures.

| Scene | Sampler | Host transfer | Verified cache admission | Search calculation | First result |
| --- | --- | ---: | ---: | ---: | ---: |
| 80³ vortex | Previous | 79.1 ms | 274.5 ms | 13.6 ms | 368.1 ms |
| 80³ vortex | Optimized | 86.3 ms | 274.4 ms | 3.3 ms | 364.9 ms |
| Measured Burgers | Previous | 35.1 ms | 117.9 ms | 18.3 ms | 171.8 ms |
| Measured Burgers | Optimized | 37.1 ms | 122.8 ms | 3.7 ms | 164.1 ms |

These are separate sequential local runs of the direct host and core path, timed after cache construction and without Electron IPC or worker serialization. They show where the same core calculation spends time; they are not precise UI latency measurements. Disk cache, JIT and process load affect each run. Search calculation became much cheaper, while first-result time changed little because reading and rechecking tiles dominate. Both optimized searches returned the same candidates and evaluation counts as the previous sampler.

## Electron equilibrium tile transfer and admission

The desktop search now profiles renderer-to-main tile requests, renderer-to-worker forwarding, worker tile admission, worker calculation, and click-to-first-result time. V3 tile replies carry the verified little-endian f64 bytes directly. The renderer transfers their buffers to the worker; the worker owns a copy, checks finite values and the manifest-pinned SHA-256 again, then samples through f64 views. Its asynchronous admission uses native WebCrypto SHA-256 when available and retains the same checksum check through the synchronous fallback. V1 and v2 continue through their existing bounded-volume path. The 64 MiB tile budget and source/tile provenance are unchanged.

One Windows Electron run before this change and one after it measured:

| Scene | Transfer | Click to result | Worker admission | Worker calculation | Tile round trip | Renderer forwarding | Renderer working-set delta | Resident tile bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 80³ vortex | Number arrays | 7,908 ms | 7,047 ms | — | — | — | +115 MB | 12,288,000 |
| 80³ vortex | f64 bytes + native hash | 453 ms | 111 ms | 24 ms | 85 ms | 0.9 ms | +27 MB | 12,288,000 |
| Measured Burgers | Number arrays | 3,067 ms | 2,721 ms | — | — | — | +65 MB | 5,273,400 |
| Measured Burgers | f64 bytes + native hash | 334 ms | 49 ms | 30 ms | 50 ms | 0.8 ms | +15 MB | 5,273,400 |

In another number-array run, tile round trip and renderer forwarding took 217/43 ms for the vortex and 105/18 ms for Burgers. Working-set delta is the renderer process's OS memory immediately before and after the search, not a peak or a complete Electron process-tree measurement. It can vary with garbage collection and other renderer activity. Timings are single desktop runs with warm file cache; rerun `npx playwright test tests/e2e/vector-field-3d.spec.ts -g "profiles Electron v3 equilibrium"` for local profiles. The direct benchmark now reports host transfer, native-hash admission, and core calculation separately; in its adaptive-prefetch mode it measured 59.5 ms for the vortex and 33.0 ms for Burgers, without Electron IPC. Both fixtures retained their pinned candidate hashes and evaluation counts. Unit and desktop tests cover corrupt tile rejection, cancellation, v2 rendering, provenance, and the cache cap.

## SCI-08 equilibrium eigenstructure

Equilibrium search now passes each candidate's existing numerical Jacobian to the point Inspector's full eigenvalue routine. Its expanded candidate detail shows the three real or complex eigenvalues and their physical unit. Signs of the real parts distinguish sources, sinks and saddles; a resolved complex pair adds the spiral label. Eigenvalues near the imaginary axis, tiny unresolved imaginary parts, poor Jacobian conditioning, incompatible units and disputed local smoothness keep the candidate uncertain. Nearly repeated roots are diagnosed separately because their individual values can be sensitive even when the signs remain clear. Search coverage remains incomplete by design.

The calculation adds no source reads or field evaluations. Analytic linear fields exercise source, sink, saddle, spiral source, spiral sink and spiral saddle labels, plus near-zero and ill-conditioned cases. The tile benchmark pins candidate positions, residuals, Jacobians, condition estimates, attempted/rejected seeds and evaluation counts for the 80³ vortex and measured Burgers scenes. The measured Burgers desktop path checks verified tile provenance and changed-tile rejection after classification.

## Bounded seed batches

Field Explorer has deterministic five-point line and nine-point XY plane seed patterns, alongside the existing eight-point ring. Each added pattern receives a stable group ID and is admitted as a complete batch under the 32-seed document limit. Group checkboxes control trajectory visibility; hidden groups still participate in integration. Visibility lives in the Project workspace, so toggling it does not change the field's structural hash. Older documents without groups open with their seeds in the manual group.

The v3 trajectory worker keeps one 64 MiB manifest-pinned tile cache for the batch and resumes at the next seed after a completed trajectory. Missing tiles can replay the active seed but no longer replay prior seeds. Each seed reports a terminal reason and its own trajectory; undefined field values, solver failure, and exhausted step budgets are labeled as errors. A corrupted tile or changed source still rejects the entire run, and cancellation terminates the worker without publishing partial results. V1/v2 and authored fields retain their existing interpolation paths.

The committed 80³ vortex fixture checks all five line seeds against the analytic circular flow, including the stationary center, with a 0.03 m endpoint tolerance. A separate analytic pole fixture confirms that an undefined seed does not suppress the next seed's valid result. The measured Burgers desktop test runs a 14-seed line-plus-plane batch, verifies source and tile provenance and the 64 MiB cap, hides the plane trajectories, saves and reopens the Project, reruns from the saved source, and checks cancellation. The existing Burgers test still checks changed-tile rejection.

## Slice click-to-seed

Each verified XY, XZ and YZ slice has an explicit seed placement mode. A click in the plot maps from SVG space through the current zoom/pan transform to the slice's physical coordinates. The displayed cell centers match their sampled coordinates; clicks between centers interpolate continuously between those coordinates. The third coordinate is the displayed plane's fixed physical coordinate. A marker and the full coordinate tuple appear as a proposal before the user chooses the manual group, an existing group, or a new slice group and adds the seed. Ordinary clicks continue to place probes outside placement mode.

The proposal is rejected outside the plot or field bounds, when the slice/source revision changes, or when adding it would exceed 32 document seeds. Source edits and plane changes clear pending proposals. Only the confirmed seed enters the document; saved source references and group membership then follow the normal Project path. The 80³ fixture checks axis order, upward vertical orientation, fixed coordinates, between-sample interpolation, marker position, and plot-boundary rejection for all three planes. The desktop test exercises those interactions, including zoomed placement and the 32-seed limit; the measured Burgers scene verifies slice provenance, trajectory source hash, group membership, and Project reopen.

## 3D click-to-seed

The 3D arrow view offers an explicit XY, XZ, or YZ seed plane at a chosen physical coordinate. A short primary-button click casts a ray from the current perspective or orthographic camera onto that plane; dragging still orbits. The intersection uses the same centered domain transform as arrows and trajectories. The selected plane is drawn translucent cyan, and a proposed seed appears as an orange 3D marker with its complete physical coordinate tuple. The seed is committed only after choosing the manual group, an existing group, or a new 3D group.

Parallel rays, intersections behind the camera, points outside the source domain, stale previews, changed planes, and the 32-seed limit reject placement. A source edit clears the proposal, while changing the plane or its coordinate requires a fresh click. The 80³ tests check physical orientation for all three camera presets and the perspective camera, plus rejected rays; desktop checks cover proposal, marker, group admission, and the cap. A measured Burgers Project round trip checks source fingerprint, trajectory source hash, group membership, and saved physical coordinates.

## Seed group management

Every seed retains its stable group ID in the source. The group's display name, six-digit color, and visibility live in the Project workspace; older documents receive default colors and an empty style list. Renaming, recoloring, and hiding a group leave the document's source revision and structural hash unchanged. The 3D trajectory overlay draws each path in its group's color, and its legend shows the same names and colors. Deleting a group removes its seeds and advances the source revision.

The editor keeps a bounded 64-step undo/redo history for seed additions, individual or group deletion, group rename, color, and visibility. Undo restores exact seed coordinates, IDs, group membership, style, and visibility; redo reapplies the edit. Source-changing undo clears stale numerical results, while display-only undo retains verified trajectories. History is an editing-session convenience; saved Projects retain the resulting seeds and group styles. The 80³ desktop test checks live trajectory colors and unchanged verified source after display edits. The measured Burgers test checks group deletion, undo/redo, source fingerprint, and the Project round trip.

## Spatial seed patterns

Field Explorer can add a spherical shell, a filled sphere, or a seeded random sample inside a physical ball. The controls accept an x/y/z center, positive radius, count from 1 to 32, and a 32-bit random seed. A spherical Fibonacci sequence places shell directions; the filled sphere uses those directions with low-discrepancy volume radii; the random pattern uses a fixed integer generator and volume-uniform radii. Identical source bounds and inputs produce identical coordinates. These patterns require matching axis units because one radius is applied to all three physical axes.

The complete ball must fit within the source domain, and the entire batch must fit under the document's 32-seed limit. Validation occurs before any group or seed is added. Each successful batch gets a stable `sphere-*`, `shell-*`, or `random-*` group and enters the existing undo/redo flow. A Project stores exact physical seed coordinates, group membership, and its pinned scientific source. The 80³ golden and desktop tests check shell radius, volume bounds, repeatability, and atomic rejection; the measured Burgers test checks undo/redo, trajectory provenance, and Project reopen.
