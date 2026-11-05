# GF-29–31 first gates and scientific Curve viewing

## Scientific Curve viewing

Project Curve sessions now retain scientific pathline and streakline documents after reopen. The sampled preview begins withheld. **Verify scientific source and show Curve** reopens every pinned bundle through the desktop verifier, checks its transfer bytes and Project generation, then displays the saved points. The verification is kept only in memory and is cleared on Project reopen or application focus. Missing, changed or unverified frames continue to withhold points. The saved Curve source and coordinates are not rewritten by viewing.

## GF-29 — streaklines

Field Explorer saves a release-seed recipe with physical seed coordinates, release interval, observation time, release count, fixed RK4 step count, frame lineage and units. The numerical gate permits 2–16 releases, 2–64 steps per particle and no more than 512 steps total. Particle endpoints are ordered by release time. A cancelled run, a particle leaving the domain, a missing sample or a late source change cannot publish a complete Curve. Scientific sources require a fresh transfer check before publication. Project reopen reports the Curve unverified until every frame is checked again.

The analytic reference uses velocity `1 + 2t` in the x direction: at observation time 1, the release at 0 reaches x = 2 and the release at 0.5 reaches x = 1.25. The Project round trip preserves this ordering and the `m`/`s` units. The bundled fixture checks a complete save/reopen and stale-source rejection.

## GF-30 — moving isosurfaces at pinned times

The first gate extracts speed isosurfaces at 2–4 **exact saved frame times** through the existing verified isosurface worker. It caps each frame at 20,000 triangles and the whole sequence at 60 seconds, supports cancellation, and rejects empty or partial frames. Field Explorer lists time, triangle count and connected components. Saving a chosen frame as Mesh records the temporal source ID, generation, full frame lineage, physical time and time unit alongside the verified frame and extraction recipe. Reopening rechecks temporal lineage and bundle bytes before marking the Mesh current.

Continuous interpolation of surfaces between frames, topology correspondence and animated rendering remain outside this first gate. Frame lists are transient; the selected Mesh and its temporal lineage survive Project save/reopen.

## GF-31 — temporal spectra

The first gate takes 16, 32 or 64 uniformly spaced physical-time samples at an editable Cartesian point. It records the chosen vector component, interpolation policy, rectangular or Hann window and mean detrending. A bounded periodogram reports one-sided PSD with window-energy normalization and a mean-centered biased autocorrelation. The analytic 1 Hz sine fixture checks the 1 Hz PSD peak of 0.5 in its stated units. Gaps, out-of-range times, cancellation and changed source generations withhold publication.

The Project stores the pinned recipe and compact diagnostic summary in an analysis result. Full sample and spectrum arrays remain transient because the analysis-result envelope forbids embedded scientific payloads. After reopen, **Verify and show PSD** checks the pinned frames and recomputes the values; the UI withholds them until then. The saved result does not yet create a Graph point-series row or external artifact for the full spectral arrays.

## Evidence

- `tests/unit/gf29TemporalStreakline.test.ts`: analytic values, units, save/reopen, work cap, cancellation, stale bundle.
- `renderer/src/projects/temporalPathlinePresentation.test.ts`: withheld Curve, verified preview, unchanged points, changed frame.
- `renderer/src/vectorfield3d/runTemporalMovingIsosurfaces.test.ts`: exact frame ordering and late source rejection.
- `tests/unit/gf31TemporalSpectrum.test.ts`: independent sine PSD, save/reopen, cancellation and bundled-source withholding.
- `tests/e2e/graph-field-gf26-gf28.spec.ts` and `tests/e2e/graph-field-gf30-gf31.spec.ts`: desktop Project and viewer flows.
