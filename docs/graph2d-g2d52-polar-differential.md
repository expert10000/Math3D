# G2D52 — polar local differential

**Software status — 2026-10-14:** Implemented in shared core, the desktop Graphs Inspector, and mobile Analyze. Physical-device and spoken screen-reader evidence remains pending under MOB-G13/G2D40.

For a selected polar curve `r(θ)` with a committed angle probe, the Inspector shows its Cartesian tangent and normal directions, signed radius, and signed curvature. The mobile **Polar tangent & curvature** operation accepts an angle in radians and publishes the same core result. Curvature follows increasing `θ`:

\[\kappa=\frac{r^2+2(r')^2-rr''}{(r^2+(r')^2)^{3/2}}.\]

This convention keeps the sign of the Cartesian path orientation even when `r` is negative. It evaluates derivatives from the authored expression, using bounded domain-aware finite differences only when symbolic rules are unavailable. A pole crossing can have a regular tangent when `r=0` and `r'≠0`; at zero parameter speed, the tangent and curvature are withheld. Undefined, stale, and discontinuous probes also withhold unsupported values. Finite-difference results are marked approximate without a certified error bound.

The readout and overlays are transient and tied to the source revision and exact probe angle. They are included in Graphs analysis export. No polar curvature construction is persisted in this slice. Acceptance covers `r=2cosθ` (curvature `1`, including a pole crossing), `r=-2` (curvature `1/2`), zero speed, a radius cusp, stale and out-of-domain probes, and mobile/core result parity.
