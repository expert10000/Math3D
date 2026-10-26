# Source-grid stencils for derived scientific profiles

V3 derived XY/XZ/YZ slices retain at most 32×32 displayed cells. Each cell's divergence, signed curl, speed gradient or speed Laplacian now uses its immediate source-grid neighbors along x, y and z. Interior points use centered three-point differences; boundaries use one-sided three-point differences (or two points on a two-cell axis). The host reads and verifies only v3 tiles containing those points. V2 keeps its bounded-grid stencil transfer; v1 keeps full-resource verification. Saved Graphs origins mark `stencilGrid: "source"`, so older bounded-grid lines continue to reverify with their original recipe.

The 80³ analytic vortex test checks exported profile values at interior and boundary points. For its speed Laplacian profile, this Windows run of `npm run benchmark:scientific:derived` measured:

| Stencil | First profile | Transfer values | Verified tiles per component | Mean absolute error | Maximum absolute error |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bounded 32³ | 397.6 ms | 73,728 B | 25/125 | 0.1303 | 1.8877 |
| Source grid | 412.1 ms | 147,456 B | 25/125 | 0.0230 | 0.3320 |

For the measured 47×85×55 Burgers scene, the same run took 356.9 ms with bounded stencils and 375.3 ms with source-grid stencils. It transferred 73,728 B and 125,952 B respectively, verifying 18 tiles per component in both cases. The maximum difference between the two measured profiles was 104.59 in the speed Laplacian's physical unit; this is a method difference, not an accuracy claim for measured data. The desktop test confirms Project reopen, saved sample hashes, and rejection of a corrupted tile needed by the source-grid stencil.

These timings are one sequential run per method and include source transfer, numerical calculation and line creation. OS file cache and process load affect them; rerun the command for local measurements. The analytic errors are specific to the fixture and line. Finite differences remain approximations, especially near small speed or source boundaries.
