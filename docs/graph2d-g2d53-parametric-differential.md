# G2D53 — parametric local differential

**Software status — 2026-10-14:** Implemented in shared core, the desktop Graphs Inspector, and mobile Analyze. The Android emulator is a software UI check; physical-device and spoken screen-reader acceptance remains pending under MOB-G13/G2D40.

For a selected parametric curve `x(t), y(t)` with a committed parameter probe, the Inspector shows Cartesian tangent and normal directions, speed, and signed curvature. Mobile **Parametric tangent & curvature** accepts `t` within the authored domain and publishes the same shared-core result. Curvature follows increasing `t`:

\[\kappa=\frac{x'y''-y'x''}{(x'^2+y'^2)^{3/2}}.\]

The result uses the source expressions, not plotted samples. It first attempts bounded symbolic rules and otherwise applies domain-aware finite differences with a convergence check; these approximations have no certified error bound. A zero-speed parameterization, undefined point, stale probe, or unresolved first derivative has no tangent or curvature. When first derivatives are valid but a second derivative is unresolved, tangent and normal remain available while curvature is withheld. All overlays are transient and tied to the source revision and exact probe parameter.

Acceptance covers `x=cos(t), y=sin(t)` with curvature `1`, reversed orientation with curvature `-1`, a vertical tangent, zero speed, a second-derivative jump, stale and out-of-domain probes, and desktop/mobile publication parity. Persistent curvature constructions remain outside this slice.
