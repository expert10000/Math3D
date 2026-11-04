# GF-11–13 first gates: oriented regions, theorem checks, trajectory Curves

**Scope:** Authored analytic 3D vector fields and Project save/reopen. Scientific-bundle sampling remains withheld until verified source transfer and coverage are available. This does not close the foundation exit gate.

## GF-11 — Surface and volume integrals

`ScientificSelection` now saves an oriented bounded plane or closed box. Plane normal sign and its right-hand boundary are explicit; a box saves outward or inward boundary orientation. Existing plane-region selections keep their legacy meaning and are not silently assigned a normal. The Explorer can save and reopen these regions.

`analyzeVectorField3DRegion` uses midpoint cells with capped source evaluations. It computes vector flux across a plane or all six box faces, and volume integrals of divergence or vector magnitude in a box. Each sample either contributes completely or is omitted. Results carry the measure, orientation, method, resolution, cap, evaluation count, unit, sample coverage, and a complete, partial or unavailable state. A source outside its domain, incompatible component/axis units, or unavailable scientific bundle does not yield a complete value. Project insertion re-evaluates the saved recipe and verifies the source generation, geometry hash, and summary. Reopen and source changes withhold prior values.

## GF-12 — Divergence and Stokes checks

The closed-box check compares six-face flux with the integral of divergence over the box. The plane check compares curl flux with circulation around the exact right-hand oriented perimeter. Both sides, absolute and relative residuals, coarse-resolution residual, orientation, method, resolution and units are saved. A check is explicitly **inconclusive** if coverage, units, or resolution convergence is insufficient. It is **mismatch** if complete numerical sides disagree beyond the stated tolerance. The first gate includes analytic divergence and rotational Stokes oracles and reversal of the plane normal.

## GF-13 — Seed recipes and Curve promotion

`ScientificSelection` saves point-set, line, ring and plane seed recipes. Generating a recipe revises the vector source with deterministic seed IDs; the selection pins that exact source revision and hash. Promotion integrates one selected seed with the existing bounded adaptive solver and saves a normal 3D polyline `CurveDocument` plus a `promoted-from` relation. The Curve records physical-time or normalized-line mode, parameter unit, solver method and tolerances, source and selection hashes, direction, stop reason, accepted and rejected steps, evaluations, and original versus retained point counts. Promotion rejects cancelled or stationary single-point paths. A Project status check marks a Curve stale when its source or seed recipe changes or disappears. The Explorer lists saved recipes and promoted Curves with current or stale status.

## Verification and limits

The unit gates reopen Project bytes and check saved selections, numeric results, Curve documents, source-change withholding, orientation, coverage and analytic oracles. The integration functions accept authored expression fields only. Geometry is limited to axis-aligned planes and boxes; sphere and imported-mesh boundaries remain outside this gate. Verified bundled-source profile sampling is still an open foundation prerequisite.
