# Graphs analysis proposal: coverage and remaining work

**Audit — 2026-10-15.** The GRA-01–12 list is broader than the completed G2D44–58 construction slice. "Graphs implemented" describes that slice, not every proposed analysis domain or the pending physical release gate.

| Proposal | Current status | Existing delivery or remaining boundary |
| --- | --- | --- |
| GRA-01 kind-aware Inspector and status | Implemented | G2D44. |
| GRA-02 grouped toolbar | Implemented | G2D46. |
| GRA-03 probes and persistent markers | Implemented | G2D43, MOB-G05, G2D48. |
| GRA-04 roots, extrema, intersections | Implemented | G2D13–19 numerical analysis; G2D49 saved candidates. |
| GRA-05 polar area and arc length | Implemented | G2D45. |
| GRA-06 dependent constructions | Implemented for the reviewed kinds | G2D47–49 and G2D55–58: saved points, tangent/normal, candidates, curvature, osculating circles and clear. General geometry constraints remain outside this contract. |
| GRA-07 tangent, normal, curvature | Implemented for explicit, polar and parametric local probes | G2D51–57; singular/undefined cases are labelled unavailable. |
| GRA-08 sliders and animation | Implemented | G2D38. |
| GRA-09 Graph to Curve/Surface | Implemented | G2D26–29. Direct sampled-data-to-Mesh promotion is not included. |
| GRA-10 Python/Theory Lab datasets into Graphs | Bounded desktop import implemented | A verified `.sscene` 1D scalar, complex scalar or two/three-component vector dataset with 2–256 finite samples per component can be previewed and explicitly copied into Graph point series, one component at a time. The document retains producer, source and selected component resource hashes, coordinate/quantity units and scene identity. The import does not create an editable expression or run Python. Multi-dimensional and larger datasets remain outside this adapter. |
| GRA-11 differential equations and vector fields | **Open** | Needs separate source/document semantics, bounded solver, numerical corpus and UI. |
| GRA-12 regression and performance suite | Partly implemented | G2D39 has checked linear and quadratic point-series fits and uncertainty bands; G2D32/G2D40/G2D50 have software benchmarks and acceptance. Higher-order polynomial, nonlinear and spline fitting and physical calibration remain open. |

The original priority list also names **adaptive discontinuity detection** (G2D04 and G2D34), **integrals/shaded regions** (G2D13–19 and G2D45), **Fourier analysis**, and **complex mappings**. The first two have bounded Graphs implementations. Fourier analysis and Graphs-to-Complex-Analysis mappings remain separate unscoped features; the presence of a Complex Analysis module does not make those Graphs workflows complete.

## Next reviewable slices

1. Implement the 2D scalar slice contract below as the next bounded GRA-10 desktop importer slice. The current complex import copies real or imaginary values; the vector import copies a named component. Resource and manifest hashes establish byte integrity against the bundle declarations; they do not certify the producer's scientific result. The exact unit-circle differential and saved-construction regression checks speed, curvature, center, radius, orthogonality, moved-point dependency updates, undo and save/reopen at `t = 2.202629`.
2. Continue Android physical and spoken accessibility evidence with the connected Samsung. The coincident osculating circle and its center/radius indicator are visible on device; the complete MOB-G13/G2D40 device matrix is still open. iOS device/signing checks are deferred by the user and remain a release gate, not a blocker for the next Graphs implementation slice. Emulator and unsigned iOS simulator evidence stay labelled as partial.
3. Extend fitting only against concrete dataset/error models. Preserve the existing linear/quadratic results; specify numerical conditioning, uncertainty semantics and bounded cancellation for each new model.
4. Give differential equations, Fourier analysis and complex mappings separate problem statements and acceptance corpora. They are not inferred from existing Graphs or Complex Analysis controls.

The [canonical roadmap](math3d-graph2d-desktop-mobile-roadmap.md) remains the release authority. The [analysis/constructions roadmap](graph2d-analysis-constructions-roadmap.md) records the delivered G2D44–58 sequence.

## GRA-10 next slice: explicit line from a 2D scalar grid

**Status — proposed implementation contract, not yet implemented.** Accept a verified `scientific-scene/v1` `scalar-field` with exactly two coordinate axes and shape `[n0, n1]`, where each size is 1–256. A Graph series is one line through that grid. The user chooses the **varying axis** (0 or 1) and an integer index on the other, **fixed axis**. The varying axis must contain 2–256 samples. There is no default row/column, averaging, interpolation, integration, or surface-to-curve inference. A 2D complex field, vector field, and 3D volume remain outside this first slice.

For last-axis-fastest storage, the value at grid index `(i, j)` is `values[i * n1 + j]`. Varying axis 0 at fixed `j` copies `(i, j)` for `i = 0…n0−1`; varying axis 1 at fixed `i` copies `(i, j)` for `j = 0…n1−1`. Each Graph row gets `x = origin[varyingAxis] + spacing[varyingAxis] * varyingIndex` and `y` from that exact grid cell. The fixed coordinate is `origin[fixedAxis] + spacing[fixedAxis] * fixedIndex`. Axis names and units come from the manifest; quantity name and unit label `y`. For example, a `[3, 4]` grid with values `0…11` yields `[1, 5, 9]` when axis 0 varies at fixed axis-1 index 1, and `[4, 5, 6, 7]` when axis 1 varies at fixed axis-0 index 1.

The desktop picker shows the dataset, shape, both named axes, their units and coordinate ranges, the selected varying axis, the fixed index and its coordinate, sample count, producer/source identity, and the exact manifest and resource hashes. It previews the resulting line before an explicit **Import as point series** action. The new point series remains copied data, never an editable expression or a live link to Python. Extend the saved scientific origin with optional `slice: { varyingAxis, fixedIndex, fixedCoordinate, fixedName, fixedUnit }`; the fixed axis is `1 - varyingAxis`, while existing `xName`/`xUnit` describe the varying axis. Retain the dataset ID, selected whole-resource hash and scene/source identity so two lines from the same grid remain distinguishable after save/reopen. The existing 1D origin format stays valid.

The main process verifies the **entire** bundle and resource before extracting a line. A slice request is bound to the directory and manifest fingerprint chosen in that window; it cannot provide an arbitrary path. Re-read and re-hash on preview so a changed directory or resource is refused. Send the selected line and its own checksum to the renderer, while preserving the whole-resource hash as provenance. The renderer checks the line checksum, shape, selection bounds, finite values, and manifest fingerprint before commit. No full 2D array needs to enter React state. Each import adds at most 256 rows under the existing point-table limits; unsupported rank, type, size or selection gives a specific error without changing the Graph document.

Acceptance requires a non-square grid tested in both directions, nonzero origins and unequal spacings, exact units/coordinates, first and last fixed indices, a singleton varying axis, malformed shape, changed manifest/resource bytes, a stale picker session, cancel, undo/redo, save/reopen and a desktop Graphs journey. A focused 256×256 fixture must stay within the bundle's 16 MiB verified-resource budget and publish only the selected 256-row line.
