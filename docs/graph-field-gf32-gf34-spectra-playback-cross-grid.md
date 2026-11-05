# GF-32–34 first reviewable gates

## GF-32 — saved spectral series

The GF-31 Project result continues to hold a compact pinned recipe and diagnostic summary. Graphs publishes the bounded PSD and autocorrelation arrays into two checked point tables, which are supported Project resources. Each Graph row pins the Project and result IDs, summary and row hashes, series type, units, sample count, window, detrending and interpolation. Scientific rows reopen withheld until the pinned frames are explicitly verified. **Verify and refresh spectral rows** recomputes the saved recipe and updates both rows as one Graph edit. A changed frame cannot reuse the old values: after the replacement temporal source is verified and the same recipe is recomputed in Field Explorer, Graph refresh rebinds both rows to the new result.

## GF-33 — exact-frame playback

Field Explorer plays the 2–4 GF-30 extracted frames in the existing 3D isosurface viewer. It checks each frame against its temporal source and reloads verified transfers before showing it. Playback is one pass at a 500 ms display cadence, cancellable, limited to 10 seconds and 64 MiB of resident positions, normals and indices. Physical frame times are shown as labels; the cadence does not claim real-time physical scaling. Failure, Project source change or application focus clears the preview and reports a withholding reason. It uses exact pinned frame times only. Surface interpolation, topology correspondence and continuous animation require a separate validation gate.

## GF-34 — scientific cross-grid comparison

GF-18's identical-grid policy remains readable. A second policy admits two differently sampled scientific vector bundles only when their Cartesian axes align by name and unit, component units match, and the user declares a physical overlap domain and bounded comparison grid. Both fields are sampled by their own verified trilinear samplers at identical physical positions. Complete coverage is required for a numerical result; gaps withhold publication. The saved result records overlap, resampling and interpolation policies, both source generations, verification keys and the physical comparison profile. The existing Graph handoff checks the result and both sources after reopen.

The first gate does not convert coordinate frames or units, extrapolate beyond either grid, or claim uncertainty bounds for interpolation error.

## Evidence

- `tests/unit/gf31TemporalSpectrum.test.ts` covers the pair of Graph origins, Project round trip and changed-frame withholding.
- `renderer/src/vectorfield3d/runTemporalMovingIsosurfaces.test.ts` covers exact playback, memory refusal, cancellation and a late source change.
- `tests/unit/gf24ScientificComparison.test.ts` compares verified 21×21×17 and 11×11×9 lattices on an explicit physical overlap, then checks the saved result and Graph guard.
- `tests/e2e/graph-field-gf32.spec.ts`, `tests/e2e/graph-field-gf30-gf31.spec.ts` and `tests/e2e/graph-field-gf34.spec.ts` cover desktop handoff, save/reopen, refresh, visible frame playback and guarded cross-grid Graph export.
