# GRA-14: separate 3D vector-field contract

This is the reviewed contract for a future 3D vector-field document and renderer. It is **not** a new `Graph2DDocument` object kind. The present 3D point-cloud/plane field preview is read-only and does not save arrows or trajectories.

## Source and document boundary

The document format should be `math3d.vector-field3d-document` version 1 with stable identity, revision and source hash. A vector source is exactly three components `(P,Q,R)` on one ordered `(x,y,z)` domain. It may be three bounded typed expressions evaluated at the same coordinates, or one verified scientific bundle's vector dataset. Bundle-backed components must share axes, shape, resource checksum and dataset identity; a single-component relink is invalid. Persist the verified reference and coordinate/unit metadata, never a partial copy of raw field values. Every load or analysis must reverify the source; missing or changed sources remain visible but cannot publish current arrows or trajectories.

An axis has finite ordered bounds, a nonzero span, an explicit label and unit (or an explicit dimensionless unit). Component units must be compatible with coordinate units per time unit for trajectory integration. Unknown or incompatible units prevent a physical-trajectory claim and are shown in the Inspector. Source, seeds, display policy and solver policy are authored state; sampled arrows, streamlines, traces and statistics are revision-bound derived artifacts.

## Sampling and interaction

The renderer samples a bounded 3D lattice for arrows, with explicit density and glyph budgets, finite-value rejection counts, camera-independent world-space direction and magnitude, and a documented magnitude scale. A zero vector is shown as a stationary sample, not an arrow with arbitrary direction. Projection and clipping are camera work; changing the camera must not recompute the field. A color legend names whether color encodes speed, a component or a user-selected scalar. A 2D slice is an exact coordinate plane with its fixed-coordinate label, not a substitute for 3D coverage.

Seeds are authored world points. A trajectory artifact records its seed, direction, solver, absolute/relative tolerances, accepted/rejected steps, maximum arc/time and explicit stop reason (`boundary`, `stationary`, `undefined`, `step-limit`, `length-limit`, `cancelled` or `solver-failure`). Use a bounded adaptive 3D ODE solver with time parameter and no crossing through undefined cells. A rendered streamline is a numerical approximation; small local residuals do not certify topology, closed orbits or complete coverage. Animation changes presentation time only until a separate time-dependent source contract exists.

## Review and acceptance gates

1. Validate expression and bundle sources, common axes/shape/checksum, units, bounds and seed coordinates before document commit. Reject ambiguous axis order and mismatched component units.
2. Keep field evaluation, arrow sampling, trajectory integration and camera projection budgets independent. Cancellation and source-revision changes invalidate derived results without changing authored state.
3. Test constant, rotational, radial, zero and singular fields against independent references; test nonuniform axes, undefined samples, all stop reasons, camera rotation, saved reopen and changed/missing/relinked bundles.
4. Desktop must show provenance, units, finite-value/rejection counts, solver tolerance and status. Mobile may offer a documented slice/read-only fallback until a measured 3D renderer passes performance and accessibility checks. Physical-device and spoken-accessibility signoff are separate gates.

The first implementation slice should create the versioned document, validator and deterministic constant/rotational-field artifacts before a 3D editor is exposed. This contract does not mark 3D vector fields delivered.
