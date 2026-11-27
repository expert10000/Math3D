# Math3D scientific quality and feature roadmap

Updated: 2026-11-27

Inputs: *Przegląd projektu Math3D.pdf* (quality review, 5 pages) and *Math3D Feature Roadmap and Scientific Enhancements.pdf* (feature review, 7 pages).

Scope: reproducibility, numerical correctness, documentation, publication metadata, and scientific feature integration for the current 2.0.0 codebase.

The reviews are design inputs, not instructions to apply sample diffs or restart completed work. Validate each change against the current repository before implementation. This document prioritizes work across modules; the [Graph2D roadmap](math3d-graph2d-desktop-mobile-roadmap.md), [Graph/Field convergence roadmap](graph-field-explorer-convergence-roadmap-2026-11-03.md), and [Scientific Field Explorer roadmap](scientific-field-explorer-roadmap.md) own detailed feature status, contracts, and release gates. The Project and UI roadmaps remain separate.

## What the repository already has

| Review claim or proposal | Current evidence | Roadmap consequence |
| --- | --- | --- |
| Add CI | `.github/workflows/ci-build-and-worker-smoke.yml` runs on main/master pushes and PRs; it runs renderer tests, TypeScript checks, builds, Playwright checks, and worker smoke tests. Other workflows cover docs, native, and release paths. | Extend the existing CI for any missing scientific checks; do not add a duplicate generic workflow. |
| Add numerical unit tests | `renderer/src/mesh/meshDifferentialGeometry.test.ts` tests plane and sphere cases; many other mesh, geometry, and scientific tests exist. | Audit the *uncovered* numerical paths and strengthen their assertions, especially scaling, invalid inputs, and Python worker results. |
| Pin and document Python | `python/worker/requirements.freeze.txt` pins worker dependencies; `python/worker/build-requirements.freeze.txt` pins build dependencies. `readme.md` describes Python 3.11 worker setup and mode-specific installation; `docs/install-and-run-modes.md` gives the pinned install command. CI uses Python 3.11. | Clarify the top-level requirements summary and supported modes; do not introduce a misleading root `requirements.txt` or a blanket Python 3.10 worker claim. The separate scientific-scene publication path documents Python 3.10+. |
| Add TypeDoc | `typedoc.json`, `npm run docs:api`, and `.github/workflows/docs-pages.yml` already generate and publish API docs. | Review the useful public API surface and missing explanatory comments, then improve selected modules. |
| Add citation metadata | No tracked `CITATION.cff` was found. `package.json` says 2.0.0 and GPL-3.0-or-later, but its author field is generic. | Add verified citation data after confirming author names and whether a real DOI exists. Never copy the PDF's placeholder name, ORCID, or DOI. |
| Remove `tmp-view.xml` | It is a tracked Android UI hierarchy capture, apparently temporary; no code reference was found in the initial search. | Confirm there is no documented/test purpose, then remove in a small cleanup change. |

The review's example `npm run lint`, root `npm test`, root `requirements.txt`, and Python 3.10 worker command do not match this repository's present scripts or worker setup. Use the actual commands below.

## Reconciliation of the feature review

The feature review could not access the earlier review/ZIP and describes several implemented Graph2D features as missing. The status below is bounded by the cited repository roadmaps and code; it does not imply every platform or physical-device gate has passed.

| Feature review proposal | Existing Math3D baseline | Remaining work to plan |
| --- | --- | --- |
| Common safe expression graph and 2D viewport | `packages/core/src/graph2dDocument.ts`, `graph2dExpression.ts`, and `graph2dSceneSampling.ts` provide portable intent, bounded AST evaluation, and sampling. Graphs already has a desktop/web/mobile workspace and uses the existing kernel for commands/history. | Consolidate compatible AST and cross-module source relations where the Graph2D and Graph/Field roadmaps identify a specific gap; do not create a second universal graph or command runtime. |
| Explicit, parametric, polar, implicit, inequality, piecewise, and data plotting | All seven core Graph kinds, bounded sampling, diagnostics, authoring, and CSV/TSV data paths are documented as implemented. | Refine known numerical limits and platform acceptance. Use the existing samplers and fixtures rather than scheduling a new basic plotter. |
| Sliders, animation, algebra list, inspector, and graph tools | G2D38/G2D42 and current Graph UI already cover parameter controls, animation, object authoring/visibility, selection, tools, and analysis. | Extend *analysis refresh during parameter preview* and complete outstanding physical/accessibility gates; do not rebuild the panels. |
| Derivatives, integrals, curvature, and vector plots | Graph calculus, source-linked derivative curves/constructions, curvature constructions, 2D phase/vector views, and Scientific Field Explorer glyphs/slices have bounded implementations. | Extend only the documented gaps: additional linked derivative/integral views, 3D field rendering/validation, and clear method/uncertainty labels. Avoid claiming a complete CAS or exact geometry from numerical results. |
| Synchronized 2D/3D cross-sections and multiple views | `SurfaceViewer.tsx` and `ParamSurfaceViewer.tsx` already draw a slicing plane and a 2D section preview; the Surface viewer exports section CSV/SVG. Verified Field Explorer slices/profiles also hand off to Graphs, while Project comparison and Graph → Curve/Surface promotion exist. | Promote a Surface section into a **saved, source-linked Graph curve** with frame/units/provenance and verified refresh. Reuse the existing section sampler and preview; do not rebuild slicing or export. |
| Scientific diagnostics and canonical scenes | Graphs already labels approximate/refined/incomplete results and unresolved intervals; numerical tests and CI exist. | Expand independent analytic oracles and source-linked diagnostics across a small 2D/3D scene corpus, then run it in existing CI. |
| Publication-quality export and scriptable reproduction | Graphs has SVG/PNG/CSV/offline HTML publication snapshots; Projects and scientific scenes have versioned persistence and Python publication paths. | Qualify direct PDF only if needed; specify a bounded, declarative replay recipe for exact saved sources before offering general Python/Jupyter execution. Preserve editable Project data separately from frozen exports. |
| Licensing and metadata | License/distribution work is already documented; worker dependency versions are pinned. | Review each new dependency against the existing distribution policy, and use only verified authors, release dates, and DOI metadata. Do not repeat the review's broad licensing or CGAL exactness claims without checking the chosen runtime/kernel. |

## Quality delivery order

### 1. Establish a reproducible numerical baseline (P0)

**Work:** Inventory critical algorithms and their current tests: implicit surface meshing, mesh validity, differential geometry and curvature, CGAL/VTK worker operations, and saved scientific results. For each, record a known analytic or structural oracle, input scale, tolerances, and which backend produces the result. Capture the exact commands and dependency versions in a short test matrix under `docs/`.

**Start with:** plane and sphere curvature, a simple closed mesh, an implicit sphere at a fixed resolution, and one malformed or non-finite input. Reuse existing fixtures and tests where possible. Distinguish deterministic counts and topology from approximation-sensitive values.

**Acceptance:** The matrix points to existing or added tests, names the backend and tolerances, and can be run locally on the documented environment. Any failing baseline is recorded as a defect, not silently normalized into an expected value.

### 2. Close the highest-value numerical gaps (P0)

**Work:** Add focused regressions for scale changes, degenerate triangles, NaN/Infinity rejection, boundary behavior, and at least one worker-generated CGAL/VTK result. Check topology or geometry invariants and quantitative errors against analytic expectations; avoid brittle exact vertex counts for meshing that can vary by dependency or platform. Put TypeScript tests beside the algorithms and Python tests beside the worker code.

**Acceptance:** Each test has a stated oracle and tolerance, fails when the relevant result is corrupted, and passes in the pinned environment. The suite includes a documented behavior for unavailable optional `pygalmesh` rather than treating a skipped operation as a successful mesh calculation.

### 3. Wire the new checks into existing CI (P0)

**Work:** Extend `ci-build-and-worker-smoke.yml` with a bounded, fast numerical test target and direct Python worker tests where needed. Reuse `npm --prefix renderer run test`, `npm run typecheck:noemit`, and the existing worker smoke path. If a dedicated test runner or lint gate is useful, add its script before invoking it in CI. Keep heavyweight native/performance checks in their existing specialized workflows unless they fit the PR runtime budget.

**Acceptance:** The relevant PR workflow runs the new tests and fails on a deliberately broken numerical assertion. The check is visible in CI logs; optional native capability is reported explicitly. No duplicate general CI workflow is introduced.

### 4. Make setup and citation unambiguous (P1)

**Work:** Add a short mode-specific Python note near the top-level requirements in `readme.md`, linking to the existing pinned worker install instructions. State that packaged desktop use needs no host Python, local worker development uses Python 3.11 with pinned dependencies, and scientific-scene publication is a separate Python 3.10+ path. Add `CITATION.cff` only with verified author and release metadata. Include a DOI only when an actual archived release DOI exists; otherwise cite the repository URL and version. Check the license string against `package.json` and `LICENSE`.

**Acceptance:** A clean developer can identify the right install command for each mode. The CFF passes validation, GitHub recognizes it after publication, and no placeholder metadata remains. Release date and version match the cited release rather than the date this roadmap was written.

### 5. Improve API explanations and remove confirmed debris (P2)

**Work:** Review the generated TypeDoc output for the public numerical API. Add concise TSDoc for algorithms where units, coordinate systems, tolerances, error states, or approximation limits are otherwise unclear. Run `npm run docs:api` and the existing docs build. Inspect the history and usage of `tmp-view.xml`; delete it only after confirming it has no purpose in tests or documentation.

**Acceptance:** The chosen API pages explain inputs, outputs, numerical limits, and failure behavior; docs build in CI. The tracked temporary capture is removed only if the reference check stays clear. No broad comment quota or generated-doc commit is required.

### 6. Profile before changing performance architecture (P3)

**Work:** Use existing mesh benchmarks to profile one representative dense case, with runtime, memory, worker/backend, and machine noted. Identify the dominant phase before considering multiprocessing, streaming, resolution adaptation, or GPU work. Make any speed change a separate proposal with a correctness comparison against the P0 baselines.

**Acceptance:** A reproducible benchmark identifies a measured bottleneck and a target. A proposed optimization has an explicit numerical and memory regression gate. No GPU or parallelism work is scheduled solely from the review's speculation.

## Feature follow-on sequence

These slices start after the relevant P0 baseline in stages 1-3. They reuse the canonical Graph2D, Field Explorer, Project, and kernel contracts; their identifiers here are priorities, not replacement G2D/GF/SCI milestones.

### F1. Cross-module scientific scene corpus (P0)

Extend the P0 numerical matrix with `sin(x)/x` zeros away from zero, the `1/x` discontinuity, an implicit circle, a paraboloid horizontal slice, and rotational field `F=(-y,x,0)`. Record analytic expectations, domain exclusions, approximation tolerances, source units, method/version, and the UI/result path. Reuse existing fixtures and tests; add only missing assertions.

**Acceptance:** Each scene has an independent oracle and at least one failing negative case. Where a scene crosses modules, its source generation and numerical qualifications survive the applicable Graph/Field/Project save and reopen path. Existing CI runs a bounded subset; slower native checks remain in scoped workflows.

### F2. Publish an existing Surface section into Graphs (P1)

Build on the Surface viewers' existing plane, section polyline, 2D inset, and CSV/SVG export, plus the verified Graph handoff and Project relation model. First publish a bounded analytic height-surface horizontal section as a Graph object or point-series with an explicit math-to-viewer coordinate transform. Retain the plane parameter, source generation, physical frame, units, sampling method/budget, and ambiguous/empty-section status. Link navigation in both directions; changing the existing plane-offset slider should update the preview and request a guarded Graph refresh.

**Acceptance:** For mathematical `z=5-x^2-y^2`, `c=1` produces a radius-2 circle in Graphs within declared tolerance; `c>5` yields an explicit empty section. The existing viewer may store height on its world `y` axis, so the saved transform must be verified. Slider motion updates the existing 3D/inset preview and Graph view without publishing stale samples. Save/reopen retains the linked intent; editing the Surface withholds the old curve until an explicit verified refresh. Arbitrary rotated-plane Graph publication is a later, separately qualified extension; the viewer already supports more than horizontal planes.

### F3. Connected analysis views, not duplicate solvers (P1)

Use existing Graph derivative/integral results and overlays, saved derivative curves, curvature constructions, 2D vector/phase displays, and Field Explorer vector layers. Prioritize the documented gap in refreshing intersections and other analyses during parameter previews, with method, units, domain gaps, completeness, and transient status visible. For a 3D vector workflow, route through Field Explorer's existing glyph/streamline view and define component/frame semantics before linking a planar Graph field to it.

**Acceptance:** `d/dx sin(x^2)` and the integral of `x` on a bounded interval agree with analytic values within stated tolerances, including after a supported parameter change. Unsupported symbolic rules or incomplete scans remain labelled and cannot silently become exact. A linked 3D field view reports vector scale/units and stop reasons; zoom or camera changes do not alter underlying field values.

### F4. Reproducible publication path (P2)

Extend the existing frozen Graph publication snapshot and Project/scientific-scene contracts. Evaluate direct vector PDF export against SVG plus print-to-PDF before adding a new renderer. Specify a declarative scene recipe containing document IDs, exact source hashes, parameters, view state, algorithm versions, tolerances, and required capabilities. A Python/JSON reader may recreate verified data, but saved documents must never execute untrusted code on open.

**Acceptance:** Export/reopen reproduces the same source-linked scene and marks changed or missing source bytes as unavailable. SVG/PNG/CSV/HTML outputs retain the same declared numerical qualifications; any added PDF output passes visual and text checks. The recipe round-trips a Graph + Surface + slice example and refuses an unsupported capability or tampered source.

### F5. Platform and licensing gates (P2)

For each new shared capability, use existing desktop/web/mobile acceptance paths and record actual native-device evidence where required by the canonical roadmaps. Check third-party license compatibility before adding dependencies; describe CGAL exactness only for operations that actually use an exact kernel.

**Acceptance:** The corresponding Graph/SCI release gate identifies supported platforms, performance budgets, accessibility evidence, and any withheld capability. Documentation does not turn a software test into a physical-device signoff or a numerical result into a proof.

## Suggested first implementation slice

Begin with stages 1 and 2 for one vertical path: implicit sphere generation through the selected backend, followed by mesh validity checks and an analytic size/topology check. Record the pinned environment and tolerance, then add the resulting fast check to stage 3 CI. In parallel, inventory which F1 scene oracles already pass so the later Surface/Graph slice is built on measured numerical behavior.

## Decisions needed before publication metadata

- Confirm the author names and any ORCID IDs to publish.
- Confirm whether an archived Math3D 2.0.0 DOI exists; omit DOI if it does not.
- Confirm the release date associated with the version to cite.

These decisions affect only stage 4. Stages 1-3 can proceed without them.
