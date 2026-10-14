# G2D51 — signed curvature at an explicit Graph probe

**Software status — 2026-10-14:** Implemented for explicit Cartesian Graphs in shared core, the desktop Inspector, and the mobile Analyze tangent operation. Physical-device and spoken screen-reader evidence remains pending under MOB-G13/G2D40.

For a committed probe on `y=f(x)`, the local differential now reports signed curvature

\[\kappa(x)=\frac{f''(x)}{(1+f'(x)^2)^{3/2}}.\]

Positive values bend toward increasing `y` as `x` increases; reflection across the `x` axis reverses the sign. The value is available only when the probe matches the current source and both derivatives are finite and resolved. It is withheld at undefined points, cusps, stale probes, and unstable derivative neighborhoods. The tangent and normal can remain available if only the second derivative fails.

The existing bounded symbolic-rule/finite-difference derivative service is the numerical source; plot samples are never differentiated. Its version-2 second-derivative fallback now compares one-sided stencils so symmetric cancellation cannot turn a curvature jump into a false zero. The local-differential publication is also version 2 and includes curvature, method, sign convention, source/probe generation, and an explicit warning when finite differences contribute. Historical version-1 derivative results remain readable and eligible for guarded notebook reruns; a rerun publishes a new version-2 result while retaining the old citation. Floating-point values have no certified error bound. Desktop Inspector displays the value and method; mobile **Tangent & curvature** displays the same result and publication. Neither host persists curvature as a construction or draws an osculating circle in this slice.

Acceptance: `y=x²` at `x=0` gives `κ=2`; at `x=2` it gives `2/17^(3/2)`. `y=−x²` at `x=0` gives `κ=−2`. `|x|` at its cusp, `x|x|` at its second-derivative jump, an undefined square-root probe, and a stale probe provide no curvature. The tangent remains available for `x|x|` at zero. Source and probe generation still invalidate old publications. Core/renderer, mobile-model, and Electron checks cover the readout.

The MOB-G13 `curvature-probe` case is pending on every physical device. Test `x²` and `−x²` at `x=0`, then `abs(x)` at `x=0`; record the displayed numerical values or unavailable reason, source-edit invalidation, large-text layout, and actual spoken screen-reader output. The committed evidence template remains pending.

A persistent curvature construction or parametric/polar curvature needs a separate reviewed contract for derivative singularities, numerical uncertainty, save/replay, and geometric display.
