# Graphs and Field Explorer convergence roadmap

**Prepared:** 2026-11-03
**Status:** proposed implementation sequence, reconciled with the repository
**Scope:** Graphs, Scientific Field Explorer, shared Project and scientific runtime contracts

**Implementation checkpoint:** [GF-01 ScientificSelection contract and legacy Project inventory](graph-field-gf01-scientific-selection-contract.md), [GF-02 Project selection objects](graph-field-gf02-project-selections.md), [GF-03 derived field chain](graph-field-gf03-derived-field-contract.md), [GF-04 brokered profile execution](graph-field-gf04-derived-profile-execution.md), [GF-05 shared profile provenance](graph-field-gf05-profile-provenance.md), [GF-06 Field Explorer hierarchy](graph-field-gf06-explorer-hierarchy.md), [GF-07 saved profile Graph handoff](graph-field-gf07-profile-handoff.md), the [GF-08 Graph construction first gate](graph-field-gf08-constructions.md), the [GF-09 saved parameter study first gate](graph-field-gf09-parameter-study.md), the [GF-10 oriented line-integral first gate](graph-field-gf10-line-integral.md), the [GF-11–13 region, theorem and trajectory first gates](graph-field-gf11-gf13-integrals-trajectories.md), the [GF-14–16 scalar display, LIC and derived-family gates](graph-field-gf14-gf16-display-lic-derived.md), and the [GF-17–19 local topology, comparison and complex-plane first gates](graph-field-gf17-gf19-topology-comparison-complex.md) are implemented at their stated scopes. The saved vector magnitude → plane slice → line profile recipe computes bounded analytic-source samples through the existing broker, presents one guarded provenance readout in Graphs and Explorer, and opens as a saved Graph row with an exact return to its physical selection. Graphs saves bounded parameter studies; Field Explorer saves oriented polylines, region integrals, theorem checks, trajectory and local separatrix Curve promotions, derived scalar Mesh results, typed analytic derived operations, and two-source analytic field comparisons. Verified complex planes show density, domain coloring and guarded discrete winding. GF-23 adds verified bundled-source profile sampling; measured foundation signoff remains open.

This roadmap adapts the external *MATH3D Graph + Field Explorer — Development Roadmap* dated 2026-11-03. That proposal is design input, not an implementation record or a command to build all 36 proposed tickets. The existing [Graph2D roadmap](math3d-graph2d-desktop-mobile-roadmap.md) owns Graph release and platform gates; the [Scientific Field Explorer roadmap](scientific-field-explorer-roadmap.md) owns SCI milestones and their detailed numerical contracts. This document owns the **cross-module gaps and their order**. Existing IDs keep their meaning; `GF-` IDs below identify new integration slices rather than renumbering G2D, GRA, or SCI work.

The [GF-20–22 Graph diagnostics, Cartesian unit and discrete-time first gates](graph-field-gf20-gf22-diagnostics-frame-time.md) extend this checkpoint. Fourier reports checked PSD and autocorrelation; Field Explorer previews explicit Cartesian length/time conversion and saves discrete temporal source pins. GF-23–25 extend those contracts as described below.

The [GF-23–25 bundle, comparison and time-sampling gates](graph-field-gf23-gf25-bundle-comparison-time.md) implement the verified bundled-source profile path, guarded two-source scientific comparison Graph export, and bounded versioned temporal probes and slices. The 21×21×17 bundled Project fixture and 80³ numerical oracle exercise the foundation path. Source replacement with different bytes still needs an explicit derived-recipe rebase; neither temporal pathlines nor cross-grid resampling is implied.

## 1. Decision and current baseline

Graphs plots and analyzes expressions and checked datasets. Field Explorer inspects verified scalar, vector and complex sources in physical coordinates. Shared Project relations, source generations, results, and scientific jobs are the convergence points. A saved scientific object holds compact intent and references; large samples and render geometry remain derived artifacts. A changed or missing external source withholds numerical claims until it is verified again.

| Proposal theme | Repository baseline | Real gap |
| --- | --- | --- |
| Persistent Graph constructions | Saved points, tangent/normal lines, curvature, osculating circles, roots, extrema and intersections exist; source-linked resolution and unavailable states are documented in [construction roadmap](graph2d-analysis-constructions-roadmap.md). | Inflection, integral and derivative-curve construction semantics, plus consistent symbolic versus numerical presentation. |
| Graph parameters | Controls and deterministic animation are delivered in [G2D38](graph2d-g38-parameters-animation.md); expression-driven dependencies are in [GRA-N09](graph2d-gra-n09-expression-parameters.md). | Reusable sweep results, snapshots and measured output series. Do not build a second parameter store. |
| Scientific selections | Explorer persists a physical point, slice positions and a rectangle; linked line/region Graph profiles and saved region summaries exist. | Versioned reusable line, plane, curve, surface and sphere selection intent across operations; migration from existing saved point/rectangle fields. |
| Derived fields | Verified divergence, curl, speed-gradient/Laplacian views and scalar gradient/Laplacian recipes exist. | Composable, typed operations where a derived output can itself be a source, including unit/domain checks and cycle rejection. |
| Compute jobs and provenance | [F05 scientific jobs](kernel-scientific-jobs.md), [execution broker](kernel-scientific-execution-broker.md), result envelopes, source guards, bounded workers and verification metadata exist. | Adapters for remaining Graph/Field workloads, consistent progress/cancel UI and a provenance vocabulary across results. Do not introduce a parallel `ScientificComputeJob` runtime. |
| Trajectories and equilibria | RK4/RK45, physical-time versus normalized field lines, ring/plane seeds, worker progress, saved equilibrium candidates and local eigen-analysis exist. | More seed geometries, persistent trajectory/Curve handoff, eigendirection display and separatrix validation. |
| Isosurfaces | Bounded speed isosurface extraction, connected-component metrics, glTF and source-linked Project Mesh promotion exist. | General scalar sources, multiple levels, transfer controls, clipping semantics and measured performance. |
| Cross-module handoff | Verified Field profiles open in Graphs; selected Graph intervals can locate back into Explorer; Mesh promotion and Workbook reports exist. | Shared dependency handling for more result families, Curve/Volume adapters and consistent refresh/withhold behavior. |

These are software-status statements, not physical-device or screen-reader signoff. The detailed SCI checkpoint remains the source for supported limits, verification behavior and open platform gates.

## 2. Rules for every new slice

1. **Reuse existing ownership.** Put portable intent, validators and operation types in `@math3d/core`; use kernel commands, relations, scientific jobs and result publication; keep desktop/mobile UI as adapters. New contracts must not fork the Graph document, project container, command bus or job lifecycle.
2. **Separate intent from artifacts.** Persist source IDs, operation parameters, selection geometry, display intent, capability IDs and provenance. Cache samples, meshes and worker output by exact source generation, verified resource identity and canonical operation parameters. A cache hit never replaces required source verification.
3. **Make dimensions explicit.** Physical coordinate frames, units, axis order, interpolation, boundary policy and time meaning are validated before numerical work. Incompatible sources produce a visible unavailable state; no implicit resampling or unit conversion.
4. **Publish against exact generations.** Jobs verify source identity before admission and publication; late, cancelled and stale results never replace current results. A saved result distinguishes current, changed, missing, incomplete and failed evidence.
5. **Label epistemic status.** Exact symbolic, numerical estimate, sampled preview and local linear classification are distinct. Error/residual, method, resolution, coverage and stop reason accompany numerical claims where applicable. A finite theorem comparison is a numerical consistency check, not a proof.
6. **Preserve portable behavior.** Each new saved contract declares capabilities and migrations. Desktop proves the end-to-end path, while shared core and mobile read/round-trip behavior are defined before release. Physical-device and spoken accessibility gates remain separate.

## 3. First delivery: GF-FOUNDATION

Target a vertical path: **verified source → saved physical selection → chained derived scalar → profile → Graph → Project save/reopen → source edit/reverify**. This exercises the proposed architecture with one real user workflow before adding broad operation menus.

| ID | Deliverable | Dependency and acceptance |
| --- | --- | --- |
| GF-01 | Inventory current point/rectangle/slice/profile/result persistence; define a migration and capability map for `ScientificSelection`. | Record source references, identity, coordinate frame, units, geometry limits and how legacy Projects reopen without invented provenance. |
| GF-02 | Make existing point, axis-line, orthogonal-plane and planar-region selections first-class Project objects with stable IDs. | GF-01 fixture round-trips through Project save/reopen with exact geometry and provenance; IDs survive layout changes; Explorer and Graphs address the same collection. Broader polyline/box intent, domain and unit admission, and UI adaptation remain follow-up work. |
| GF-03 | Save one typed operation per `DerivedFieldDocument`, chained from a pinned vector source or another derived output. | The vector magnitude → plane slice → line profile fixture round-trips with exact source generations, units, physical bounds and parameters. Project validation rejects cycles and incompatible inputs; changed/unverified sources withhold cached results. Existing scalar recipes remain readable. Curl and numerical execution follow in later slices. |
| GF-04 | Execute the GF-03 magnitude → plane → profile chain from a verified analytic vector source through the existing scientific-job service and execution broker. | Real bounded samples, progress, cancellation, deadline, memory/work limits and deterministic recipe key are tested. Source edits, recipe edits and late/cancelled jobs cannot publish; Project reopen withholds cached rows until source verification succeeds. |
| GF-05 | Present the GF-04 profile from one shared provenance record in Explorer and Graphs. | Show pinned source ID/revision/hash, saved operations and physical coordinates, units, sample count, actual method, and current/withheld reason after reopen or source change. Show transfer coverage only when matching verified scientific-source evidence is supplied. Broader selection/result provenance remains follow-up work. |
| GF-06 | Reorganize Field Explorer around saved Project objects and contextual inspector sections. | Sources / Derived / Selections / Results index the existing Project collection. Layer / Probe / Analyze / Provenance filters the inspector, with Overview retaining direct access to all controls. The GF-03 vector-only import fixture locates its source, stable selections and profile in a narrow window; source controls and provenance are keyboard reachable, and failed verification explains withheld values. |
| GF-07 | Complete bidirectional profile handoff for the GF-03 chain. | A Graph row retains exact selection/recipe/source references; Graphs locates the physical selection in Explorer; changed or missing source withholds values; an explicit refresh is one undoable edit after re-verification. |

**Foundation exit gate:** create the chain from a bundled verified scene, save/reopen it, change one source resource, see stale values withheld in both modules, relink/reverify, refresh explicitly, and confirm that cancelled/late work cannot publish. Include regular-grid, nonuniform-axis rejection, domain-edge, incompatible-unit, source-missing and bounded-memory cases. Use the [80³ numerical golden fixture](scientific-field-numerical-golden.md) for calculus parity. Measure first preview, interaction and peak memory against the current Explorer baseline before relaxing budgets.

## 4. Second delivery: GF-ANALYSIS

| ID | Work | Exit condition |
| --- | --- | --- |
| GF-08 | Extend Graph constructions to saved inflection and editable definite-integral results; evaluate derivative-curve persistence separately. | Bounded source-linked recomputation, ambiguity/unavailable states, correct parameter dependency, undo and Project round-trip; exact CAS output shown only when actually obtained. |
| GF-09 | Add `ParameterStudy` intent and measured-series result using existing Graph parameters. | Sweep bounds/sample cap, measurement definitions, source guard and cancellation; each measured series opens in Graphs, survives Project reopen and becomes stale after source or measurement changes. Snapshots/overlays can follow this contract. |
| GF-10 | Add line integral and circulation results over a saved oriented curve/polyline. | Report orientation, quadrature, sample coverage, units and error estimate where computable; test conservative and rotational analytic fields, reversal sign and incomplete paths. |
| GF-11 | Add surface-flux and volume-integral results over bounded plane/box geometry. | Verify normals and boundary orientation; enforce memory/evaluation caps, units and source coverage; publish reusable results. Sphere and imported mesh boundaries need separate geometry validation. |
| GF-12 | Add divergence and Stokes numerical checks on supported closed geometries. | Publish both sides, absolute/relative residual, method, resolution and orientation. Include analytic oracles, convergence checks and an explicit inconclusive state. |
| GF-13 | Expand trajectory seeds and Curve promotion. | Point set/line/ring/plane first; persist seed recipe and solver provenance, preserve physical-time versus normalized-line distinction, validate stop reasons and stale Curve targets. |
| GF-14 | Expand scalar display controls and isosurfaces. | Histogram and percentile/symmetric range operate on verified values; multi-level extraction uses a declared triangle/time budget; general scalar-derived sources promote to Mesh with source lineage. |
| GF-15 | Prototype LIC on orthogonal vector slices. | CPU reference fixture, boundary/missing-data behavior and measured interaction budget precede arbitrary-plane or GPU path. |

This stage extends the current Explorer and Graph analysis rather than reintroducing already delivered roots, extrema, tangents, animation, RK45, equilibrium eigenvalues, speed isosurfaces or Mesh promotion.

## 5. Third delivery: GF-SCIENTIFIC-FIELDS

| ID | Work | Prerequisite / numerical gate |
| --- | --- | --- |
| GF-16 | Derived operation families: Hessian, directional derivative, Jacobian decomposition, dot/cross/difference, fluid vorticity, helicity and enstrophy. | GF-03 typed DAG, rank/unit/frame checks and analytic fixtures. Q-criterion, lambda-2 and swirling strength follow independent tensor/eigenvalue validation. |
| GF-17 | Local topology display and separatrices. | Reuse saved equilibrium eigen-analysis; render eigendirections only for well-conditioned cases, seed stable/unstable branches with documented offsets, preserve curves and label classification local. |
| GF-18 | Field comparison. | Explicit grid/frame/unit alignment policy, interpolation and coverage; scalar/vector difference, angular error and region statistics; side-by-side verified provenance and Graph profile export. No silent alignment. |
| GF-19 | Complex-field analysis. | Reuse existing real/imaginary, magnitude/phase and Graph-to-Complex mappings. Add `|ψ|²`, domain coloring and phase winding only with undefined-point handling and discrete-contour convergence checks; do not imply holomorphic behavior for sampled fields. |
| GF-20 | Graph data and spectral diagnostics. | Extend current checked regression/FFT work with residual views, uncertainty reports, PSD/autocorrelation and later cross-correlation/spectrogram using explicit sampling assumptions and fixture comparisons. |
| GF-21 | Coordinate and unit model. | Introduce additional frames or unit conversion only after source schema, calculus operators and export behavior are specified; preserve regular-grid Cartesian behavior and reject unsupported mixed dimensions. |
| GF-22 | Versioned time-axis/source contract. | Pin discrete source generations to physical times before time-aware sampling. Define interpolation, calculus and export rules explicitly; do not infer pathlines or streaklines from steady fields. |
| GF-23 | Verified bundled-source foundation path. | Run the saved magnitude → slice → profile chain from pinned verified bundle samples through the broker; guard Project/Graph reopen, resource change and explicit refresh, with numerical and bounded-work fixtures. |
| GF-24 | Scientific-source comparison and Graph profile. | Admit two verified aligned bundles under explicit grid/frame/unit/interpolation/coverage policy, preserve both lineages and withhold a saved comparison Graph row on source changes. |
| GF-25 | Time-aware probe and slice sampling. | Version linear interpolation for pinned analytic frames, cap spatial work and withhold unavailable frames; reserve pathlines and streaklines for later solver gates. |

## 6. Later: GF-TIME and advanced topology

GF-22 supplies the initial discrete time-axis/source contract; GF-25 adds bounded analytic probes and slices with versioned linear interpolation. Verified scientific-bundle time sampling and physical pathlines or streaklines need later independent gates. Moving isosurfaces and temporal spectra follow verified time sampling and interpolation. Basin maps, Poincare sections, Lyapunov estimates, tensor-field glyphs and manifold surfaces remain research/advanced work until fixtures, bounded algorithms and interpretation rules exist. Do not schedule them as prerequisites for GF-FOUNDATION.

## 7. Cross-module result matrix

| Source result | Target | State to preserve |
| --- | --- | --- |
| Field line/temporal profile or spectral series | Graphs | Physical/sample axis, units, gaps, selection/recipe identity, pinned source generation, refresh rule. |
| Trajectory, streamline or separatrix | Curves | Seed and solver recipe, physical-time versus normalized parameter, stop reasons, source relation. |
| Isosurface | Mesh | Scalar derivation, level, clipping, triangle topology, source/tile hashes and rebuild recipe. |
| Slice or scalar volume | Graphs / Volume | Coordinate frame, transfer/display recipe, source identity and materialization policy. |
| Equilibrium / critical point | Geometry / Project result | Coordinates, residual, local classification, conditioning and source relation. |
| Region statistics, integral or theorem check | Workbook / Notes | Values with units, numerical method, coverage, provenance and withheld-state behavior. |

Every handoff must define current/changed/missing behavior, target-local edits, refresh versus fork, capability declaration and portable Project round-trip before adding a button. Existing [Project handoff contract](project-handoff-contract.md) and source-linked Mesh/Graph adapters are the reference implementations.

## 8. Reconciled proposal ticket map

The external proposal's `GRAPH-FIELD-01`–`36` labels are **not** ready-to-run commits. Use this map when triaging them:

| Proposal IDs | Reconciled disposition |
| --- | --- |
| 01–02 | GF-06: extend the existing Explorer UI after object contracts are defined. |
| 03–05 | GF-01/02: adapt existing point, rectangle and slice persistence; add reusable line/plane intent. |
| 06–07 | GF-04/05: reuse kernel provenance, result and scientific-job contracts. |
| 08–10 | GF-03: generalize delivered scalar recipes into chained, typed derived sources. |
| 11–15 | Existing Graph construction/parameter/animation foundation; only inflection/integral, studies and snapshots remain in GF-08/09. |
| 16–20 | Existing RK4/RK45 and equilibrium analysis plus GF-10–13 for remaining seeds and integral checks. |
| 21–25 | GF-14/15 and GF-13; speed isosurface and Mesh promotion already exist. |
| 26–30 | GF-16/17 after numerical and tensor gates. |
| 31–33 | GF-20, building on current regression and Fourier work. |
| 34–36 | Existing complex views plus GF-18/19 for winding and comparison. |

## 9. Release and evidence gates

- **Contract:** schema/capability validation, migration, deterministic serialization, undo/replay, source generation and mixed-workspace handoff.
- **Numerics:** analytic fixtures and independent reference values, orientation/unit/boundary cases, missing data, convergence/error reporting and incomplete-coverage semantics.
- **Runtime:** cancellation and stale-result race tests, worker limits, cache invalidation after resource changes, measured time/memory on representative field and large Graph data.
- **Workflow:** desktop create → inspect → save → reopen → tamper/relink → explicit refresh → cross-module locate-back. Then shared-core/mobile read and round-trip checks for any new saved capability.
- **Accessibility:** keyboard and spoken status for selection, progress, failure, stale result, units, orientation and provenance; physical-device signoff follows the platform roadmaps.

The verified bundled-source GF-FOUNDATION path has a dedicated GF-23 fixture and desktop gate. Full second-delivery signoff still depends on measured desktop first-paint, interaction and peak-memory comparison against the Explorer baseline and required platform checks; GF-23 records only core-path measurements. Each later slice should ship with its own numerical and Project evidence, and the canonical Graph/SCI roadmaps should be updated when delivery status changes.
