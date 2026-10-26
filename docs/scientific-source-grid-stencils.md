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
