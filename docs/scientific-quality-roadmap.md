# Math3D scientific quality roadmap

Date: 2026-11-26

Input: *Przegląd projektu Math3D.pdf* (project review, 5 pages)

Scope: reproducibility, numerical correctness, documentation, and publication metadata for the current 2.0.0 codebase.

This is a plan based on the review, not an instruction to apply its sample diffs. Validate each change against the current repository before implementation. Keep this plan separate from the product roadmaps in `project-master-roadmap.md` and `math3d-ui-roadmap.md`.

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

## Delivery order

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

## Suggested first implementation slice

Begin with stages 1 and 2 for one vertical path: implicit sphere generation through the selected backend, followed by mesh validity checks and an analytic size/topology check. Record the pinned environment and tolerance, then add the resulting fast check to stage 3 CI. This gives a concrete scientific correctness gate before metadata and documentation polish.

## Decisions needed before publication metadata

- Confirm the author names and any ORCID IDs to publish.
- Confirm whether an archived Math3D 2.0.0 DOI exists; omit DOI if it does not.
- Confirm the release date associated with the version to cite.

These decisions affect only stage 4. Stages 1-3 can proceed without them.
