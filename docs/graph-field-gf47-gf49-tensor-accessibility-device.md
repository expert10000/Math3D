# GF-47–49 reviewable gates

## GF-47 — saved principal tensor directions

Field Explorer can display a saved `scalar-hessian` or `jacobian-symmetric`
derived tensor on a physical slice. The sampler uses 2–8 interior positions per
axis, capped at 64 glyphs and 8,192 source evaluations. It requires a current
source generation; scientific bundles additionally need freshly verified
transfer bytes. Cartesian `x/y/z` axes, matching coordinate units, complete
sample coverage, matrix symmetry, a separated largest-magnitude eigenvalue and
an eigenvector residual below tolerance are publication gates. One failed
sample withholds the entire view. The Project result saves the display recipe,
derived generation, source generation, units, coverage and glyph hash, while
the glyph vectors themselves are recomputed after reopen. Source or recipe
changes withhold the result.

The first display is a physical-plane SVG of principal **directions**. Its
short lines are not magnitude-scaled ellipsoids; vector sign is arbitrary.
General tensor imports, eigendirection tracking across cells and degenerate
eigenspaces need separate gates.

## GF-48 — scientific mobile accessibility

The mobile Project explorer exposes saved scientific selections, derived
recipes, guarded Poincaré Graph rows and analysis results as focusable controls.
Their accessibility labels include units when saved, source IDs and generation
pins when available, and explicit withholding reasons. The UI never creates a
missing legacy source pin. Tab and Enter can reach and expand the saved tensor
result, an unverified bundled selection and a withheld return-map Graph row.

The focused Samsung TalkBack service reached the tensor result label, and the
user heard speech, but reported that it was too quiet to judge clearly. Both
accessibility and media streams were already at their maximum (15/15).
**Spoken clarity remains inconclusive.** The service and rotation settings
were restored after the checks.

## GF-49 — physical-device evidence

The [Samsung device record](evidence/graph-field-gf49-samsung-2026-11-06.md)
pins the isolated APK, fixture checksums, import/reopen observations, rotation,
on-device frame timing and sampled process memory. It covers one Android 16
phone. The internal signing credentials were unavailable, so the test used a
temporary-key `.gf49` package that left installed Math3D packages intact.
The measured interaction includes janky frames; it is evidence, not a wider
performance or release signoff. iOS, other screen sizes, physical keyboard,
human-confirmed TalkBack clarity and full device-matrix acceptance remain open.

## Automated evidence

- `tests/unit/gf47Gf48TensorAccessibility.test.ts`: diagonal and rotated
  tensors, ambiguity and budget rejection, verified-bundle admission, Project
  save/reopen and source-change withholding, mobile selection/result/Graph
  spoken-status models.
- `tests/e2e/graph-field-gf47.spec.ts`: Field Explorer glyph preview and saved
  Project reopen on desktop.
- `tests/fixtures/graph-field/gf49-tensor-glyph.math3d.project.json` and
  `gf49-return-graph.math3d.project.json`: portable device fixtures alongside
  the earlier bundled-source fixture.
