# Graphs analysis proposal: coverage and remaining work

**Audit — updated 2026-10-16.** The GRA-01–12 list is broader than the completed G2D44–58 construction slice. "Graphs implemented" describes that slice, not every proposed analysis domain or the pending physical release gate.

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
| GRA-10 Python/Theory Lab datasets into Graphs | Bounded desktop import implemented; GRA-10.3 next | A verified `.sscene` 1D scalar, complex scalar or two/three-component vector dataset with 2–256 finite samples per component can be copied into Graph point series. A 2D scalar grid up to 256×256 can be imported as an explicitly selected axis-aligned line with 2–256 samples. Two pinned bundled grid presets exercise this path. The document retains producer, source and full-resource hashes, coordinate/quantity units, scene identity and optional fixed-line provenance. The import does not create an editable expression or run Python. Other multi-dimensional datasets and larger grids remain outside this adapter. |
| GRA-11 differential equations and vector fields | **Open** | Needs separate source/document semantics, bounded solver, numerical corpus and UI. |
| GRA-12 regression and performance suite | Partly implemented | G2D39 has checked linear and quadratic point-series fits and uncertainty bands; G2D32/G2D40/G2D50 have software benchmarks and acceptance. Higher-order polynomial, nonlinear and spline fitting and physical calibration remain open. |

The original priority list also names **adaptive discontinuity detection** (G2D04 and G2D34), **integrals/shaded regions** (G2D13–19 and G2D45), **Fourier analysis**, and **complex mappings**. The first two have bounded Graphs implementations. Fourier analysis and Graphs-to-Complex-Analysis mappings remain separate unscoped features; the presence of a Complex Analysis module does not make those Graphs workflows complete.

## Next reviewable slices

1. Deliver [GRA-10.3](#gra-103-handoff-compare-lines-from-one-grid) as the next bounded software slice: compare distinct lines from one verified 2D scalar grid without reopening the bundle. Keep the existing rank/type boundary. Resource and manifest hashes establish byte integrity against the bundle declarations; they do not certify the producer's scientific result.
2. Continue Android physical and spoken accessibility evidence with the connected Samsung. The coincident osculating circle and its center/radius indicator are visible on device; the complete MOB-G13/G2D40 device matrix is still open. iOS device/signing checks are deferred by the user and remain a release gate, not a blocker for the next Graphs implementation slice. Emulator and unsigned iOS simulator evidence stay labelled as partial.
3. Extend fitting only against concrete dataset/error models. Preserve the existing linear/quadratic results; specify numerical conditioning, uncertainty semantics and bounded cancellation for each new model.
4. Give differential equations, Fourier analysis and complex mappings separate problem statements and acceptance corpora. They are not inferred from existing Graphs or Complex Analysis controls.

The [canonical roadmap](math3d-graph2d-desktop-mobile-roadmap.md) remains the release authority. The [analysis/constructions roadmap](graph2d-analysis-constructions-roadmap.md) records the delivered G2D44–58 sequence.

## GRA-10 next slice: explicit line from a 2D scalar grid

**Status — implemented.** Accept a verified `scientific-scene/v1` `scalar-field` with exactly two coordinate axes and shape `[n0, n1]`, where each size is 1–256. A Graph series is one line through that grid. The user chooses the **varying axis** (0 or 1) and an integer index on the other, **fixed axis**. The varying axis must contain 2–256 samples. There is no default row/column, averaging, interpolation, integration, or surface-to-curve inference. A 2D complex field, vector field, and 3D volume remain outside this slice.

Two verified bundled presets exercise the same importer: a 17×17 sine–cosine grid and a non-square 5×7 thermal gradient with distinct axis and quantity units. They open from Graphs → More → Author without a folder picker and still require an explicit line selection and import.

For last-axis-fastest storage, the value at grid index `(i, j)` is `values[i * n1 + j]`. Varying axis 0 at fixed `j` copies `(i, j)` for `i = 0…n0−1`; varying axis 1 at fixed `i` copies `(i, j)` for `j = 0…n1−1`. Each Graph row gets `x = origin[varyingAxis] + spacing[varyingAxis] * varyingIndex` and `y` from that exact grid cell. The fixed coordinate is `origin[fixedAxis] + spacing[fixedAxis] * fixedIndex`. Axis names and units come from the manifest; quantity name and unit label `y`. For example, a `[3, 4]` grid with values `0…11` yields `[1, 5, 9]` when axis 0 varies at fixed axis-1 index 1, and `[4, 5, 6, 7]` when axis 1 varies at fixed axis-0 index 1.

The desktop picker shows the dataset, shape, both named axes, their units and coordinate ranges, the selected varying axis, the fixed index and its coordinate, sample count, producer/source identity, and the exact manifest and resource hashes. It previews the resulting line before an explicit **Import as point series** action. The new point series remains copied data, never an editable expression or a live link to Python. Extend the saved scientific origin with optional `slice: { varyingAxis, fixedIndex, fixedCoordinate, fixedName, fixedUnit }`; the fixed axis is `1 - varyingAxis`, while existing `xName`/`xUnit` describe the varying axis. Retain the dataset ID, selected whole-resource hash and scene/source identity so two lines from the same grid remain distinguishable after save/reopen. The existing 1D origin format stays valid.

The main process verifies the **entire** bundle and resource before extracting a line. A slice request is bound to the directory and manifest fingerprint chosen in that window; it cannot provide an arbitrary path. Re-read and re-hash on preview so a changed directory or resource is refused. Send the selected line and its own checksum to the renderer, while preserving the whole-resource hash as provenance. The renderer checks the line checksum, shape, selection bounds, finite values, and manifest fingerprint before commit. No full 2D array needs to enter React state. Each import adds at most 256 rows under the existing point-table limits; unsupported rank, type, size or selection gives a specific error without changing the Graph document.

Acceptance requires a non-square grid tested in both directions, nonzero origins and unequal spacings, exact units/coordinates, first and last fixed indices, a singleton varying axis, malformed shape, changed manifest/resource bytes, a stale picker session, cancel, undo/redo, save/reopen and a desktop Graphs journey. A focused 256×256 fixture must stay within the bundle's 16 MiB verified-resource budget and publish only the selected 256-row line.

## GRA-10.3 handoff: compare lines from one grid

**Ready for another Codex task; not implemented.** The present 2D importer closes after importing one line, so comparing two rows or columns requires reopening the same `.sscene` or bundled preset. Keep a verified 2D scalar source active after each successful import and let the user explicitly choose, preview and import another line. Do not preselect an axis/index or import a batch. A finished Graph must label each series with its fixed axis name, coordinate and unit (for example `Temperature · distance = 4 m`), so two lines from one dataset are distinguishable in the plot, Inspector and saved project. Preserve the existing `origin.slice` and full-resource provenance; no document schema change should be needed.

Each preview must re-read and verify the entire bundle through the existing session-bound main-process path. Clear the prior selection and preview after an import; reject a repeat of an already imported axis/index pair in that session with a clear message, and reject a changed resource or manifest without altering already imported series. Close/cancel must release the session. Keep the current one-component-at-a-time behavior for 1D scalar, complex and vector data, and keep 2D complex/vector, 3D data, interpolation and Python execution outside this slice.

Acceptance: use the 5×7 thermal preset and a non-square test grid to import one line along each axis and two lines along the same axis; verify distinct labels, coordinates, units and `origin.slice` after undo/redo and save/reopen. Cover a duplicate selection, canceled session, changed bytes between the first and second previews, and a 256×256 grid that still sends only one bounded line per preview. Focused starting points are `renderer/src/graph2d/GraphsWorkspace.tsx` (`commitScientificDataset`), `src/main/scientificScene/graphDataset.ts`, `src/main/ipc/scientificSceneIpc.ts`, `packages/core/src/graph2dScientificDataset.ts`, and `tests/e2e/graph2d-scientific-dataset.spec.ts`. Do not modify the unrelated pending MOB-G13/G2D40 release evidence as part of this coding slice.
