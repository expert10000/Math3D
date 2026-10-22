# GRA-14: separate 3D vector-field contract

This is the reviewed contract for a separate 3D vector-field document and future renderer. It is **not** a new `Graph2DDocument` object kind. The first core slice now provides the versioned document, strict expression/bundle metadata validation, source-bound revision handling and deterministic world-space arrow samples for expression fields. The present UI's 3D point-cloud/plane field preview remains read-only and does not save arrows or trajectories.

## Source and document boundary

The document format is `math3d.vector-field3d-document` version 1 with stable identity, revision and source hash. A vector source is exactly three components `(P,Q,R)` on one ordered `(x,y,z)` domain. It may be three bounded typed expressions evaluated at the same coordinates, or one scientific bundle's vector dataset. Bundle-backed components share locator, manifest fingerprint, dataset, axes and shape, while retaining each component's resource checksum; a single-component relink is invalid. Persist the reference and coordinate/unit metadata, never a partial copy of raw field values. Bundle metadata validation alone does not establish current file bytes: missing or changed sources cannot publish current arrows or trajectories.

An axis has finite ordered bounds, a nonzero span, an explicit label and unit (or an explicit dimensionless unit). Declared component units must match coordinate units per time unit. The core validator checks these declarations exactly; it does not prove the expressions dimensionally correct. Unknown or incompatible units prevent a physical-trajectory claim and are shown in the Inspector. Source, seeds, display policy and solver policy are authored state; sampled arrows, streamlines, traces and statistics are revision-bound derived artifacts.

## Sampling and interaction

The renderer samples a bounded 3D lattice for arrows, with explicit density and glyph budgets, finite-value rejection counts, camera-independent world-space direction and magnitude, and a documented magnitude scale. A zero vector is shown as a stationary sample, not an arrow with arbitrary direction. Projection and clipping are camera work; changing the camera must not recompute the field. A color legend names whether color encodes speed, a component or a user-selected scalar. A 2D slice is an exact coordinate plane with its fixed-coordinate label, not a substitute for 3D coverage.

Seeds are authored world points. A trajectory artifact records its seed, direction, solver, absolute/relative tolerances, accepted/rejected steps, maximum arc/time and explicit stop reason (`boundary`, `stationary`, `undefined`, `step-limit`, `length-limit`, `cancelled` or `solver-failure`). Use a bounded adaptive 3D ODE solver with time parameter and no crossing through undefined cells. A rendered streamline is a numerical approximation; small local residuals do not certify topology, closed orbits or complete coverage. Animation changes presentation time only until a separate time-dependent source contract exists.

## Review and acceptance gates

1. Validate expression and bundle sources, common axes/shape/checksum, units, bounds and seed coordinates before document commit. Reject ambiguous axis order and mismatched component units.
2. Keep field evaluation, arrow sampling, trajectory integration and camera projection budgets independent. Cancellation and source-revision changes invalidate derived results without changing authored state.
3. Test constant, rotational, radial, zero and singular fields against independent references; test nonuniform axes, undefined samples, all stop reasons, camera rotation, saved reopen and changed/missing/relinked bundles.
4. Desktop must show provenance, units, finite-value/rejection counts, solver tolerance and status. Mobile may offer a documented slice/read-only fallback until a measured 3D renderer passes performance and accessibility checks. Physical-device and spoken-accessibility signoff are separate gates.

The first implementation slice is delivered in `vectorField3DDocument.ts`. It records ordered axes, component/time units, seeds, display and solver policy; checks a three-component bundle reference as one source; and refuses to sample bundle-backed fields until live verification is implemented. Expression-field arrow artifacts carry source revision/hash, density, accepted/stationary/rejected counts, magnitude scale and color policy. Constant, rotational, zero and singular references have deterministic tests. The next slice is live bundle reverification and a 3D editor/renderer with separate sampling and projection budgets. The current core slice does not mark 3D vector fields delivered in the UI.
