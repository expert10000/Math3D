# Math3D 2.5 scientific and education roadmap

**Status:** planning baseline, 2026-11-27. This document defines proposed work and release evidence. It does not claim that a 2.5 candidate has been built, tested, or published.

## Source material and authority

The two PDFs below are preserved byte-for-byte as planning inputs. Their original version labels and feature claims are historical proposals, not the status of this repository or instructions to implement every item in 2.5.

| Input | SHA-256 | Use in this plan |
| --- | --- | --- |
| [Math3D 2.0 Scientific and Education Roadmap](Math3D_2.0_Scientific_and_Education_Roadmap.pdf) | `265f4d3a548c768b6dfabeef716954e28b8465c26028113f26a8798f4ef03383` | Scientific reference cases, provenance, Guided Study structure, and release gates. Its 2.0–2.2 schedule is rebaselined here. |
| [Math3D Feature Roadmap and Scientific Enhancements](Math3D%20Feature%20Roadmap%20and%20Scientific%20Enhancements.pdf) | `234ae7929cb3cac883e8ff8129ef99759c84e5f3dd9c49afc1645a979a05176d` | Candidate Graphs and cross-module study ideas. Its capability inventory and external claims require repository verification. |

Repository evidence takes precedence over the PDFs when assessing implementation. The [2.0 release closure](../2.0.0/RELEASE_CLOSURE_TODO.md), [Graph2D coverage](../../graph2d-gra-coverage-and-next-slices.md), [Geometry roadmap](../../geometry-professional-implementation-roadmap.md), [Surface roadmap](../../surface-analysis-professional-implementation-roadmap.md), [Mesh Analyze roadmap](../../mesh-analyze-implementation-roadmap.md), and [2.5 memory qualification](MEMORY_QUALIFICATION.md) are the starting inventory. Recheck each claim against current code and a clean candidate before release.

## Starting point

- The owner-published 2.0 Windows release has a scoped installed pass for Surface, QWZ, CAS, and Field journeys. Its self-signed package and remaining trusted GA gates are recorded in the 2.0 closure document; the stable tag alone is not broader GA evidence.
- Graphs already has a shared 2D document, editable expressions, multiple plot kinds, sliders, adaptive sampling, numerical analysis, Gallery, Project persistence, and bounded promotions. Geometry, Surface Analysis, and Mesh Analyze already have substantial analytic, sampled, and cross-module work. The PDFs' suggested parser, viewport, derivative, or mesh-analysis foundations must not be scheduled as net-new features without a gap audit.
- The local two-hour mixed-route memory gate failed its unchanged renderer-private growth budget; a different hosted source run passed. Neither result qualifies the installed 2.5 candidate. [Memory qualification](MEMORY_QUALIFICATION.md) owns the exact budget and procedure.
- Guided Studies and connected release journeys exist. Their coverage, saved evidence, negative paths, and installed behavior must be checked again on the 2.5 candidate before any expanded claim.

## 2.5 outcome and scope

Ship a **bounded, reproducible scientific study workflow** that connects existing mathematical tools, teaches the user what is being measured, and records enough evidence to reopen and inspect the result. Close the deferred memory gate on the exact release candidate if 2.5 is advertised as the qualifying release. Keep scientific validity, software acceptance, installed acceptance, and platform availability as separate claims.

| ID | Planned deliverable | Acceptance evidence |
| --- | --- | --- |
| M25-01 — inventory and contract | Audit the current Graphs, Geometry, Surface, Mesh, CAS, Field, Project, and Guided Studies implementations against the two PDFs. Record the specific missing integration and numerical contracts before changing code. Preserve existing Project documents and module entry points. | A gap table links each selected requirement to code/tests or a new issue; no already delivered foundation is recast as new work. Existing Projects open after migration. |
| M25-02 — scientific reference corpus | Put the existing analytic and discrete checks under one reviewed 2.5 evidence set. Include plane, sphere, cylinder, and catenoid curvature where applicable; sphere/torus topology; and selected Geometry-to-Mesh comparisons. Define sign convention, domain and boundary exclusions, method, units, absolute/relative tolerances, and expected failure behavior per case. | Deterministic tests compare actual values with references and report tolerance failures. Invalid/degenerate inputs, cancellation, stale revisions, and nonfinite output are visible results, never successful measurements. |
| M25-03 — convergence and provenance | For at least one smooth source and its derived meshes, compare a discrete quantity against its analytic reference across at least three declared resolutions. Save estimator, norm, sample count, domain/boundary mask, source and result revisions, software/worker identity, elapsed time, and memory. | A rerun on the same frozen source produces traceable results. Measured error is labelled measured error, not a proven bound; no convergence order is claimed without observed data and a fit policy. Save/reopen retains the evidence and correctly marks changed sources stale. |
| M25-04 — guided Graphs study | Extend an existing Guided Study/Gallery route into one complete dynamic parabola study: question, prediction, editable `a`, `b`, `c`, graph/tangent/vertex experiment, explanation, verification, and saved evidence. Reuse the Graphs parameter and derivative engines. Handle `a = 0` as the linear/constant case instead of applying the parabola vertex formula. | A user can open the study from the Gallery, change values, inspect the updated mathematical result, save it in a Project, cold reopen it, and see an explicit explanation for undefined or changed results. Keyboard and narrow-layout checks cover the flow. |
| M25-05 — connected Surface/Mesh study | Qualify the existing Catenoid evidence tabs (Study, Curvature, Comparison, Workbook) and Surface ridge-to-Mesh comparison on the 2.5 candidate. Add a prediction/verification prompt and an analytic-versus-discrete explanation where the method supports it. Preserve the current Surface → Curve → Mesh and Project handoffs; exercise failed compute and stale-source paths. | One reviewed end-to-end source run and the exact installed candidate complete the journey with matching Project evidence, source lineage, negative paths, and cold reopen. Gallery entry and tab state are discoverable and accessible. |
| M25-06 — memory qualification | Investigate the local renderer-private retention, make a measured fix, then run the unchanged mixed Surface/Mesh/Volume/Project plateau and two-hour soak on a clean reference build. Repeat on the exact installed candidate with package hash. | The [memory qualification](MEMORY_QUALIFICATION.md) budgets and review scripts pass on the declared reference host and installed package. A hosted-only source pass is reported separately. |
| M25-07 — release and host claims | Freeze source and candidate identity; rerun scoped scientific, Project, Gallery, accessibility, failure, install/upgrade/rollback, and packaging checks on each host being advertised. | Receipts identify commit, package hash, host, commands, results, and limitations. Release notes distinguish supported Windows scope from Linux, Android, hosted, and unqualified hosts. Trusted-signing/GA language requires its own passed gate. |

### Scope boundary

The PDFs also propose general-purpose geometric constraints, full CAS integration, Fourier analysis, unrestricted PDE/research workflows, all Graphs object kinds, and broad mobile parity. These remain candidate later slices unless the M25-01 audit finds a small, reviewed addition necessary for the two studies. No 2.5 claim follows from a feature appearing in a PDF, a UI screenshot, a source test, or a previous release receipt alone.

## Delivery order

1. **Inventory and freeze acceptance:** complete M25-01; select exact source fixtures and mathematical reference values; record current Project schemas, existing Guided Study entry points, and explicit host scope.
2. **Scientific vertical slice:** implement M25-02 and M25-03 as a single traceable source-to-result-to-Project path. Review numerical assumptions and failure semantics before polishing its UI.
3. **Education and connected flow:** complete M25-04 and M25-05 on the shared mathematics; use the tabbed journey pattern and Gallery entry already present in the application. Verify saved and reopened evidence, including source changes.
4. **Qualification and candidate:** finish M25-06; freeze the build; execute M25-07 on the package that would be distributed. Rebuild and repeat affected gates after any candidate change.
5. **Release decision:** publish only the host and feature claims backed by the frozen candidate's receipts. If the memory gate is still open, explicitly defer that claim and revise the 2.5 scope and notes before publication.

## Release exit checklist

- [ ] Selected scientific reference cases pass with declared tolerances, conventions, domain masks, and negative cases.
- [ ] Convergence evidence records source, mesh resolutions, estimator, norm, provenance, timing, and measured memory.
- [ ] Both guided studies complete on source and exact installed candidate; Gallery discovery, tabs, failure paths, save, and cold reopen are reviewed.
- [ ] Existing 2.0 journeys and Project compatibility have no regression in the declared 2.5 host scope.
- [ ] Mixed-route memory passes the unchanged reference and installed gates if claimed for 2.5.
- [ ] Package identity, upgrade/rollback, signing claim, host matrix, release notes, and source/asset hashes agree with the evidence.

This is a planning document. Mark individual rows complete only with linked implementation, test, and candidate receipts; update this checklist as those receipts are produced.
