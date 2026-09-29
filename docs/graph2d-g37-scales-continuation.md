# G2D37 — scale policies and visual-only continuation

Implemented 2026-09-29. Shared desktop/web/native transforms, authoring validation and saved display intent; physical new-native-feature acceptance remains pending.

## Usage and semantics

- Desktop/web: **Scales** → choose linear/log10 axes, Free/Equal world units and explicit bounds → **Apply scales and bounds**. Mobile: **Display** → **Axis scales and bounds**. One reversible viewport command; expressions, domains and source generation are unchanged.
- Log bounds must be positive, finite, between 1e-100 and 1e100 and separated by at least 1e-8 decades. Non-positive geometry is omitted, never joined across the omitted interval. Equal world-unit aspect and polar grids require two linear axes. The user must choose Free/Cartesian explicitly; validation never silently changes a domain.
- Pan, cursor/pinch zoom, screen/world picking, Fit and shared major/minor ticks operate in axis coordinates. Tick labels and saved bounds remain world values. Powers of ten and multiplicative minor ticks distinguish log axes. Limits fail safely without accepting an invalid viewport. Fit uses finite positive authored geometry and retains policies.
- **Show continuation** is off by default. After zooming out, explicit functions continue across the visible x extent, outside their authored domain, in a lighter dotted layer of the same color. It is a bounded numerical preview, not a claim of global validity. Parametric/polar/implicit/inequality/data/piecewise domains are never invented or extrapolated. Normal geometry is sampled first; continuation only uses remaining evaluations and at most 512 per side. Mobile also caps bytes, segments and rendered lines.
- Continuation is excluded from probes, Fit, calculus, regression and publication. Source ranges, assumptions, endpoint inclusion and analyses remain unchanged. Ordinary committed viewport/history persistence retains the toggle. The plot labels the distinction even after sampling settles.
- Numerical analysis and statistics use authored world coordinates, not logarithms or the continuation layer. Tangent/normal straight-line, baseline area and interval-strip overlays are hidden on log plots to avoid misleading screen geometry. Their numerical tables remain available. Export uses the same scale transforms and ticks, world-valued CSV, explicit scale metadata and omission warnings.

## Compatibility and verification

Optional viewport `xScale`, `yScale` and `continuation` fields require `graph2d.scales.v1`. Legacy defaults remain absent/linear and preserve canonical v1 catalog bytes/digests. Current compatibility inspection and handoff check this capability; old strict readers fail closed. No dependency or license change.

G2D37 checks: 228 desktop/shared unit tests (21 scale/continuation cases), 303 mobile model tests, root/native typechecks and production web build. Two browser locale/timezone workflows cover continuation, invalid bounds, saved scales, undo/redo and reopen; final combined professional acceptance is recorded in the G2D40 report. Local screenshots are in `test-results/graph2d-web/professional-*`. No APK installation or physical/iOS signoff is implied.

Follow-on [G2D39 regression](graph2d-g39-regression-uncertainty.md) and [G2D40 automated professional freeze](graph2d-g40-professional-acceptance.md) are now implemented. Physical release/accessibility gates remain open; next product milestone is GGL11 personal collections.
