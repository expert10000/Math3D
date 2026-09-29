# G2D39 — regression and uncertainty

Delivered 2026-09-29. Desktop/web Inspector and native Analyze expose explicit **linear** and **quadratic** ordinary least-squares fits for point-series. Nothing fits automatically, edits source data or creates a source curve. Results are transient; reopening requires fitting again.

## Mathematical contract

The shared core reads original checksum-verified rows, not rendered samples. Missing y values and rows outside the authored domain are excluded, never imputed. At least degree + 2 usable rows are required. Rank-deficient, ill-conditioned, non-finite and missing/corrupt sidecars fail closed. The existing 10,000-row data limit remains.

The bounded algorithm uses a centered/scaled x basis, two-pass reorthogonalized QR and compensated sums. Displayed coefficients belong to z=(x−center)/scale; they are not mislabelled as unscaled powers of x. Results retain n, excluded count, residual degrees of freedom, SSE, residual standard deviation, R² (undefined for constant responses), original row IDs, source generation and exact dataset checksum.

Pointwise 95% mean-response confidence limits and 95% individual prediction limits use the residual Student-t distribution and QR-derived leverage. The latter include residual variance and are generally wider. These assume fixed error-free x, the selected mean model and independent approximately normal, constant-variance errors. The software does not verify these assumptions or claim causal inference, simultaneous bands, weighted fits or uncertainty in x. See the [NIST mean-response interval](https://www.itl.nist.gov/div898/handbook/pmd/section5/pmd511.htm) and [prediction interval](https://www.itl.nist.gov/div898/handbook/pmd/section5/pmd512.htm) definitions.

The fitted curve and limits contain 129 samples within the used data extent; no extrapolation. Log display never changes the statistical model or coefficients. Non-positive display portions are omitted. Source/model/selection changes suppress stale overlays; refitting is explicit.

## Views and publication

- Desktop: fitted curve, shaded mean-response band, dashed mean limits, dotted prediction limits; named accessible controls, assumptions/provenance and paginated residuals.
- Native: the same numerical fit and separately styled limit lines, constrained by the existing render budget; paginated residuals. No shaded band is claimed on native.
- Offline HTML/CSV publication includes summary, all 129 interval samples and up to 2,048 residual rows with a truncation warning. Source rows and model remain unchanged. SVG/PNG retain the G2D36 authored-geometry contract; transient regression overlays are represented by report tables, not baked into plot images.
- Fits never become probe targets or alter authored range, Fit bounds or Gallery provenance.

## Verification

17 shared regression tests cover independent centered-sum formulas, residual orthogonality, exact quadratic recovery at x≈10¹², Student-t reference quantiles, missing/singular inputs, checksum rejection, source staleness and 10,000-row bounds. Three native-model tests cover original-table use, shared coefficients, portable exports and failure without sidecars.

Focused real-browser acceptance passes in en-US/UTC and pl-PL/Auckland: fit, row IDs, no source persistence mutation, stale model handling, quadratic refit, offline uncertainty report and clear result. Combined suites and remaining physical-device gates are recorded in [G2D40 acceptance](graph2d-g40-professional-acceptance.md).
