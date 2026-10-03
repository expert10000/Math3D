# Unified Projects automated acceptance

This is evidence for the supported named-project slice integrated into `main`
and its continuation on `codex/projects-native-restoration` / `codex/projects-prj16`, not signed-release
or native-device sign-off.

## Repeatable gates

- `npm run test:projects:contracts`: named-envelope, library, operations, replay,
  dependency, template and mobile transfer contracts; existing mobile Graph/storage/
  transfer regressions; portable fixture TypeScript.
- `npm run test:projects:desktop`: Projects, Graph Gallery and kernel Electron journeys.
- `npm run test:projects:web`: the shared project round-trip journey in Chromium with
  en-US/UTC and pl-PL/Pacific-Auckland settings, including 390-pixel containment.
- `npm run test:projects:acceptance`: these gates plus renderer/main/E2E/mobile
  TypeScript, desktop/web builds and dependency boundaries. Build the tested bundles
  first if running only a desktop or browser gate.
- `node scripts/post160-roadmap-audit.mjs --run`: existing roadmap evidence and the
  project contract suites; device and installed-engine evidence remain separate.

## Integrated PRJ15 software evidence (2026-10-02)

PRJ15 is merged into `main` at `f7f401f` through
[PR #17](https://github.com/expert10000/Math3D/pull/17), with implementation `e8adffe`
and final acceptance fix `805542c`. The PRJ16 continuation deliveries are recorded
separately below; the supported representations and remaining device/engine gates
retain their explicit bounds.

| Gate | Latest verified result |
| --- | --- |
| Project contracts | 67 tests / 13 files passed |
| Existing shared/mobile regressions | 123 tests / 24 files passed |
| Continuation audit | 436 tests / 69 files; all 53 mapped evidence rows passed |
| Electron | All 19 journeys passed together in final clean-checkout CI |
| Chromium | Six journeys passed across both locale/time-zone configurations |
| TypeScript | Main, renderer, mobile, E2E and portable fixture passed |
| Production builds | Main/renderer and web passed |
| Dependency boundaries | Passed (985 modules / 2227 dependencies) |
| Released Graph test pack | Passed |

Both [pull-request Projects CI](https://github.com/expert10000/Math3D/actions/runs/36937980364)
and [branch Projects CI](https://github.com/expert10000/Math3D/actions/runs/36937974514)
passed on the final source, including embedded Android bundle compilation. The
[Android APK/emulator gate](https://github.com/expert10000/Math3D/actions/runs/36937980342)
also passed; physical-device acceptance remains separate.

## PRJ12 baseline evidence (2026-10-01)

| Gate | Result |
| --- | --- |
| Project contracts | 45 tests / 10 files passed |
| Existing mobile model/storage/transfer regressions | 41 tests / 8 files passed |
| Expanded continuation audit | 414 tests / 66 files passed |
| Electron | 10 Projects + 4 Graph Gallery + 2 kernel journeys passed |
| Chromium project interchange | 2 locale/time-zone journeys passed |
| TypeScript | Renderer, mobile, E2E and portable mobile fixture passed |
| Production builds | Main/renderer and web passed; existing large-chunk warning remains |
| Dependency boundaries | Passed (972 modules / 1848 dependencies) |

The same Projects UI journey exports a saved scientific starter as checkpoint JSON,
passes it through the actual mobile Graph import/edit/undo/redo/save/export model,
and imports it into an independent destination library. It verifies project and
document identities, metadata, original companion checkpoints, historical analysis
and relations. An edited same-ID version cannot overwrite the source library.
Historical analysis retains numerical authority while its source becomes stale.
Destination restart/export preserves the imported content; saved-project duplicate,
undo/redo and another restart preserve the original Graph and analysis records.

The mobile test fixture is compiled with explicit checkout core/kernel aliases so
shared dependency junctions cannot silently test another checkout. Its mobile model
is also typechecked; it does not simulate native file pickers or a physical device.
Existing native-storage tests use their filesystem test adapter for restart, quota
and write-failure contracts. At this baseline, project JSON transferred resource
references; PRJ15's separate resource package now transfers verified source bytes.
Thumbnails and optional analysis caches remain separate. Point-table availability
and optional missing analysis artifacts are covered by contract tests.

## Remaining acceptance obligations

- Native opening supports independent literal parametric/explicit Curve expressions
  (2D/3D without external dependencies), nonperiodic parametric Surfaces, procedural
  Geometry objects/live-derived constructions and the existing Graph promotions.
  The PRJ13 fundamental-diagram Topology/Function Explorer subsets and PRJ14
  self-contained scalar Volume recipes also have native adapters. PRJ15 adds qualified
  resource-backed Mesh opening and history. The first PRJ16 slice adds verified
  dense scalar Volume sampling and spatial history for the bounded `dense-grid`
  recipe. Other representations remain previews, as listed in
  [the representation inventory](project-representation-inventory.md).
- Mobile named editing requires one Graph, checkpointed Curve/Surface companions,
  no saved scripts or archived documents, and available source point tables. An edited
  Graph's historical companions may force desktop opening to remain preview-only;
  regeneration is explicit, not performed by import.
- Native device/file-picker/share behavior, installed optional engines and signed builds require their own exact-build evidence. No such sign-off
  was performed by these automated desktop/browser/model gates.
- Release-baseline integration is complete: merge `b180ed7` includes the published
  1.6.0 tag and final maintainer main `a6a4f19`. This branch does not change release
  versions or signing configuration. Its mobile runtime has changed, so the earlier
  1.6.0 physical signoff remains historical release evidence.

## Editor continuation checks

The PRJ10 Electron journey opens independent Curve/Surface sources without a Graph,
checks unchanged generations before editing, edits both sources, uses undo/redo,
saves, reloads and explicitly reopens the named project and Curve history. The PRJ11
journey opens procedural Geometry and an object-centroid construction, verifies
opening did not change its source generation, edits a native parameter and checks
save/reopen with preserved construction records. Projects is available in the main
navigation; source editor controls show that Save project persists their changes.

## Integration check-up in C:\Math3D — October 1

The final release-maintainer baseline is merged into the original Projects branch.
`npm run test:projects:acceptance` completed successfully in this checkout after
that merge; no native device or installed optional engine is inferred from it.

| Gate | Result on the integrated source |
| --- | --- |
| Mapped continuation audit | 414 tests / 66 files passed; all 53 evidence rows resolved |
| Project contracts | 45 tests / 10 files passed |
| Contract command's mobile/shared regression selection | 123 tests / 24 files passed |
| Additional `test:graph2d:mobile:unit` command | 981 tests / 177 files passed (includes shared regression fixtures) |
| TypeScript | Main, renderer, E2E, mobile and portable mobile fixture passed |
| Production builds | Main/renderer and web passed; existing large-chunk warning remains |
| Electron | All 16 journeys passed: 10 Projects, four Graph Gallery and two kernel |
| Browser interchange | Both en-US/UTC and pl-PL/Auckland journeys passed |
| Dependency boundaries | Passed: 973 modules / 2176 dependencies |
| Released Graph test pack | Nine Graphs, seven kinds, two CSV sidecars, reference fit, invalid-import and integrity checks passed |
| Topology formal-gate components | All 156 unit tests / 28 files, eight Sage-contract tests / two files and both semantic-safety Electron journeys passed; main/renderer types and builds are included above |
| Responsive smoke | Surface/Geometry/Curves drawers, sheets and touch containment passed at phone portrait/landscape, tablet and desktop sizes |

Desktop and phone-width Projects library screenshots were visually inspected.
Two Topology 100-edit replay tests initially exceeded the default five-second
limit under concurrent audit load; the isolated suite passed. Explicit 30-second
limits preserve every assertion and the repeated complete audit passed.

The initial [Projects CI run](https://github.com/expert10000/Math3D/actions/runs/36888958804)
passed the audit and 15 of 16 Electron cases. The transfer case compared all
browser storage while background workbook autosave was initializing unrelated
keys. Fix `8510fcc` compares the complete named-project storage namespace,
including active payload, library, thumbnail sidecars and before-open backups,
and asserts that the saved library/payload exists before the conflict attempt.
It retains exact unchanged-byte rejection checks. The affected Electron journey
and both browser interchange journeys passed again locally.

The [clean-checkout retry](https://github.com/expert10000/Math3D/actions/runs/36890458229)
passed on `8510fcc`: all 414 audit tests, complete project acceptance including
16 Electron/two browser journeys, dependency boundaries, released test-pack checks
and Android embedded-bundle compilation. This uses the same integrated application
source and corrected conflict test; subsequent evidence edits are documentation only.
Local logs and the disposable JSON report are in
`output/projects-integration/` and `post160-test-results.json`. CI also compiles an
embedded Android bundle; that step is software coverage, not a new APK signoff.
Remaining PRJ17–PRJ18 deliveries and the supported native subsets are explicit in the
[roadmap](unified-projects-roadmap.md#remaining-delivery-and-integration-gates).

## PRJ13 native scientific restoration — October 1

Main merge `766776a` passed [CI 36892375601](https://github.com/expert10000/Math3D/actions/runs/36892375601).
The merged PRJ13 branch connects supported Topology documents to the diagram editor and
supported Complex documents to Function Explorer. Its seven additional contracts
cover unchanged opening, retained opaque source fields/provenance, continued edit
IDs, undo/redo replay revisions, bounded history, intent checkpointing, stale result
qualification and incompatible/invalid-source rejection without partial edits.

The PRJ13 Electron journey restores two distinct Topology and two distinct Complex
documents, saves untouched generations, switches documents, edits with undo/redo,
saves, restarts Electron with its existing isolated disk profile and explicitly
reopens the project and history. It also
edits branch policy and contours, rejects invalid contour data, and verifies saved
source through the core replay verifier and another renderer reload/reopen. These
checks do not attest OS upgrade or native mobile restart.

Local evidence is under `output/projects-integration/prj13-*.log`. The continuation
audit passed 421 tests / 67 files, the project contract selection passed 52 tests /
11 files, its shared/mobile regression selection passed 123 tests / 24 files, and
the complete Complex unit selection passed 122 tests / 16 files. The combined
Projects acceptance command passed: all types/builds, 17 Electron journeys,
two browser interchange journeys and dependency boundaries (976 modules /
2193 dependencies). A final source/replay selection passed 30 tests / four files.
After the final compact-control layout change, the PRJ13 journey passed again on
the rebuilt renderer, including a real Electron process restart, branch/contour
reopen, invalid-source rejection and phone-width containment. Desktop and
390-pixel editor screenshots were visually inspected. The final E2E types passed.

The released Graph test pack also passed, and a local Android/Hermes export produced
the embedded bundle in `output/projects-prj13-native-bundle/`. This is compilation
evidence, not an installed APK or a new physical-device signoff.

[Clean-checkout CI 36897077724](https://github.com/expert10000/Math3D/actions/runs/36897077724)
passed on runtime/test source `e8c4737`. PRJ13 then merged through
[PR #15](https://github.com/expert10000/Math3D/pull/15) at `9d9b013`; its
[main CI 36898400691](https://github.com/expert10000/Math3D/actions/runs/36898400691)
also passed. The separate PR run on `8ca7870` exposed an existing preview test
comparing all browser storage while unrelated UI/workbook autosave was running.
PRJ14 scopes preview/cancel/rejection checks to the complete named-project storage
namespace, including payloads, library, thumbnails and backups, while retaining
the source-generation and navigation assertions.

## PRJ14 native Volume restoration — October 1

Six contracts exercise exact formula/parameter sample oracles, point/cell spatial
metadata and units, source/cache retention, atomic edits, unsupported-resource
qualification, history/revision/command-ID behavior, immutable replay exports,
100-edit checkpoint folding and bounded migration of older unbounded logs.

The Electron journey opens two distinct Volume documents, compares displayed
sample ranges with independent numeric expectations, saves unchanged generations,
edits parameters/expression/grid, undoes/redoes, saves, closes Electron, reopens
its existing isolated profile and restores source/history. It continues editing,
retains stale historical numerical results with their original engine provenance,
rejects invalid grids and missing dense/unsupported resources without replacing
project bytes, and creates another Volume without reusing an imported legacy ID.
Both saved and new documents remain navigable. The source editor is also checked
for containment at 390 pixels.

Local evidence is in `output/projects-integration/prj14-*.log`. The contract
selection passed 58 tests / 12 files and the existing mobile/shared regression
selection passed 123 tests / 24 files. The mapped continuation audit passed
427 tests / 68 files, covering all 53 milestone evidence rows. The broader initial
Projects/Volume unit selection passed 117 tests / 27 files; the final focused
Volume source/adapter selection passed nine tests / two files.

Main/renderer/E2E/mobile/portable-fixture TypeScript and desktop/web production
builds passed. The first full desktop run exposed test-fixture issues and the
unrelated-workbook storage comparison; those were corrected and the desktop
suite was repeated. All 18 Electron journeys passed (12 Projects, four Gallery
and two kernel), both browser locale/time-zone journeys passed, and dependency
boundaries passed with 979 modules / 2206 dependencies. Final qualification
hardening rejects incomplete expressions and inherited object identifiers before
activation; its contracts and targeted Volume journey passed again on the
rebuilt renderer. The final renderer and E2E types passed after correcting the
tuple type of the frozen replay export. The desktop editor screenshot was
visually inspected and the 390-pixel containment assertions passed.
The released Graph test pack passed. Source and replay checks attest desktop
software behavior; they do not attest transferred external bytes, installed
scientific engines, a signed artifact or physical Samsung acceptance.


PRJ14 merged through [PR #16](https://github.com/expert10000/Math3D/pull/16)
at `486ff17`. Both its [pull-request workflow](https://github.com/expert10000/Math3D/actions/runs/36930225161)
and [merged-main workflow](https://github.com/expert10000/Math3D/actions/runs/36930839068)
passed, including the Android embedded bundle. This supersedes the earlier pending
CI status and preserves the published release baseline.

## PRJ15 verified resources and native Mesh — October 2

Resource contracts transfer original/current Mesh buffers, normals, UVs, source
provenance and committed selections to an independent resource store. They cover
missing historical inputs, tampered bytes/lengths/encoding/shape/owners, duplicate
or unowned descriptors, detached buffer snapshots, invalid inverse commands,
pruned redo branches, continued command IDs and 100-edit checkpoint selections.
Graph table contracts retain exact gaps, row counts and content hashes. Imported
Volume contracts verify dimensions/components/scalar bytes while leaving unsupported
native sampling preview-only. Existing Mesh analysis contracts establish that
source edits stale earlier artifacts instead of making them current again.

The Electron journey transfers two Mesh documents, checks unchanged generations,
applies translation/scale, undoes/redoes, preserves normals/UVs and saved origin
transforms, and retains historical analysis provenance as stale. It exports through
the actual UI, opens an independent fresh profile, closes/relaunches Electron with
that profile, reopens saved resources/history and continues editing. Corrupt bytes
are rejected before either store changes. An injected library quota failure after
partial JSON writes proves exact project-namespace and resource-archive rollback.
Reference-only JSON on the fresh host cannot open its missing Mesh buffers.

Chromium exercises Mesh resource/history reload and Graph point-table transfer in
both configured locale/time-zone pairs. The Graph test proves its imported table
bytes reside in the resource archive rather than relying on source-host Graph
localStorage. After reload/open, exported table descriptors and bytes are exact.
The saved Mesh bar is checked at 390 pixels.

Local evidence is in `output/projects-integration/prj15-*.log`. The final Projects
contracts passed 67 tests / 13 files, and existing shared/mobile regressions passed
123 tests / 24 files. The mapped continuation audit passed 436 tests / 69 files,
covering all 53 milestone evidence rows. Nine resource contracts passed separately.

The broad Electron run passed 17 of 19 journeys. It exposed an older starter test
that read storage before asynchronous import completed, and plain JSON import that
staged unrelated active-project resource descriptors. The test now awaits completion;
the product rebuilds incoming resource ownership, with a regression contract. The
final rebuilt renderer passed all three affected journeys (PRJ06, PRJ07 and PRJ15),
completing coverage of all 19 cases across the broad run and focused rerun. All six
browser journeys passed on final source in both locale/time-zone configurations.
The Mesh editor screenshot was visually inspected; 390-pixel containment passed.

Main/renderer/E2E/mobile/portable-fixture TypeScript, main/renderer/web production
builds, dependency boundaries (985 modules / 2227 dependencies) and the released
Graph test pack passed. These checks do not qualify installed optional engines,
native mobile Mesh editing, physical Samsung behavior or signed release artifacts.
Those remain PRJ17 work.

The first [PRJ15 pull-request run](https://github.com/expert10000/Math3D/actions/runs/36936484262)
passed the audit, contracts, types and builds, then passed 18 of 19 Electron cases.
PRJ08 exported before its asynchronous starter import completed and consequently
sent the live workspace to the mobile model. Its shared desktop/browser helper now
awaits the successful library import before exporting. The focused Electron
round-trip, E2E TypeScript and all six browser journeys passed locally after this
fix. The final [pull-request run](https://github.com/expert10000/Math3D/actions/runs/36937980364)
and [branch run](https://github.com/expert10000/Math3D/actions/runs/36937974514)
passed every Projects workflow step on `805542c`, including all 19 Electron journeys
in one run, all six browser journeys, the released Graph test pack and the embedded
Android bundle. PR #17 merged at `f7f401f`. This supersedes the initial CI failure
and establishes complete clean-checkout coverage for the supported software slice.

Cloudflare Pages `math3d` and `math3d-app` reported failed builds on `e8adffe` and
also on base main `486ff17`; `math3ds` passed. The check summaries expose dashboard
links but no failure diagnostics. These deployment checks remain separate from the
passing local web build and do not establish a cause for the existing failures.

## PRJ16 first slice: verified dense scalar Volume — October 2

Continues main `243bae5` on `codex/projects-prj16`. The
[representation inventory](project-representation-inventory.md) records current
native versus preview support and each missing contract. At this first slice,
PRJ16 remained open for other representations; this evidence qualifies the bounded
single-component `dense-scalar-grid` / `dense-grid` recipe.

| Local gate | Verified result |
| --- | --- |
| Project contracts | 71 tests / 14 files passed, including four new dense Volume contracts |
| Existing mobile Graph/storage/transfer regressions | 41 tests / 8 files passed |
| Continuation audit | 440 tests / 70 files; all 53 mapped evidence rows passed |
| Electron | All 20 Projects/Gallery/kernel journeys passed in one run |
| Chromium | All eight journeys passed across both locale/time-zone configurations |
| TypeScript | Main, renderer, E2E, mobile and portable fixture passed |
| Production builds | Main/renderer and web passed; existing large-chunk warning remains |
| Dependency boundaries | Passed (986 modules / 1895 dependencies in this checkout) |

Contracts independently exercise all eight little-endian scalar types, unaligned
input buffers, float64 source precision, NaN missing data, unchanged source identity,
required sidecars, spatial edits/replay and byte-exact independent export. They reject
unsupported representations, resized grids, invalid viewer-range values and missing
historical sources before enabling activation or undo.

The Electron journey opens two measured volumes with distinct samples, checks the
actual 1–8 and 11–18 ranges and unchanged opening/save generations, edits spatial
placement/units and uses undo/redo. Historical provenance remains saved and stale.
Export preserves original scalar descriptors and bytes. A fresh destination profile
imports those resources, then closes and relaunches Electron, opens the disk archive,
retains history and continues editing. Corrupt packages leave saved project bytes
unchanged; reference-only opening remains disabled without authoritative sidecars.
The browser journey covers checked sampling, grid editing, reload/open/history and
byte-exact resource export in both locale/time-zone configurations. The dense Volume
editor's 390-pixel screenshot was visually inspected.

The development app was refreshed from the tested renderer after saving a local
mixed-workspace backup, and remains running with Projects open. These are local
software results; this slice has not run clean-checkout CI, a physical device,
installed optional engines or signed-build acceptance. Those remain the PRJ17/PRJ18
gates and do not inherit the published 1.6.0 release's signoff.

## PRJ16 qualified source matrix completion — October 2

The continuation completes the desktop/web qualification matrix in
[the representation inventory](project-representation-inventory.md). Unsupported
formats retain verified previews. Completing PRJ16 does not establish universal
editing of every schema value, native mobile editing, signed-build acceptance,
or installed optional-engine compatibility.

| Local gate | Verified result |
| --- | --- |
| Project contracts | 104 tests / 15 files passed, including 33 additional-source matrix tests and the four dense Volume tests |
| Existing mobile Graph/storage/transfer regressions | 41 tests / 8 files passed |
| Continuation audit | 473 tests / 71 files; all 53 mapped evidence rows passed |
| Electron | All 21 distinct journeys passed: 20 in the complete run; repaired PRJ06 and final PRJ16 source-editor journey passed targeted reruns |
| Chromium | All 10 distinct journeys passed in the complete run; both final source-editor locale/time-zone configurations passed targeted reruns |
| TypeScript | Main, renderer, E2E, mobile and portable fixture passed |
| Production builds | Renderer and web passed; existing large-chunk warning remains |
| Dependency boundaries | Passed (990 modules / 1919 dependencies) |

The additional matrix contains 27 saved document fixtures. Every fixture preserves
its complete source on opening, then exercises source editing, undo/redo, independent
canonical export/import, reopened undo/redo, pruned redo and rejected edits. Independent
oracles check exact polyline vertices, polar radius/units, rational/nonrational spline
bounds, Curve-on-Surface coordinates, explicit and implicit Surface bounds, construction
depth, ruled interpolation, Weierstrass integration, spline patches, construction
midpoints and finite Topology incidence counts. A checked Mesh-backed Surface contract
verifies the original referenced coordinates and source/history retention.

Preflight rejects missing/stale chart or construction generations, incomplete control
data/knots/weights, absent Mesh buffers, invalid source shapes and unsupported historical
sources. Parent edits keep dependent definitions saved and explicitly stale rather than
silently recomputing them. Curve/Surface/Geometry use a 100-edit window with exact current
generation replay. Tests also fold older Curve logs, preserve redo after kernel rejection,
continue IDs after reopen and preserve the live generation after undone exports.

The real UI journey edits seven additional sources in Projects, checks source JSON and
measured views, saves and exports through the actual Electron download, imports that
file into an independent profile, closes/relaunches Electron and restores the disk
archive/history. Chromium repeats editing, reload/open/history and unchanged generations
in both locale/time-zone configurations. The source editor also passes 390-pixel containment. Desktop/phone screenshots were
visually inspected; the editor uses the corresponding module navigation and conceals
the unrelated underlying footer/drawers while keeping Projects accessible.

The existing development Electron app remains running on the tested renderer after a
saved seven-document/two-relation workspace backup. Its current project is retained.
Clean-checkout CI has not yet been claimed for this continuation. PRJ17 device/build/
signature and installed-engine signoff, and PRJ18 the combined cross-module freeze,
remain the next explicit gates.

## PRJ16 source starters and integration — October 2

Implementation `bd5d8b1` adds **Projects → Starter workflow → Spline and Surface
Lab / Curve Construction Study / Scene and Topology Study**. The three templates
create 11 ordinary documents with independent identities, complete saved definitions
and explicit construction/chart lineage. Their preview/cancel path does not replace
or write the current project. Opening and selecting a supported document exposes
**Edit source definition**, measured samples/incidence, apply and document undo/redo.

The updated local contracts passed 108 tests in 15 files, plus 41 existing mobile
model regressions in eight files and portable fixture TypeScript. The continuation
audit passed 477 tests in 71 files with all 53 mapped evidence rows executed.
All 22 Projects Electron journeys passed in one complete run. All 12 distinct
Chromium journeys passed across the complete run and final starter reruns in both
locale/time-zone configurations: the first run passed 11, then the repaired starter
helper passed both configurations. The helper now accommodates document navigation
closing Projects automatically. Three separate Playwright missing-worker/timeout/
malformed-error journeys passed. Main/renderer/E2E/mobile TypeScript, production
main/renderer/web builds and dependency boundaries (991 modules / 1929 dependencies)
passed; the existing large-chunk build warning remains. The 390-pixel source editor
screenshot was visually inspected.

Local installed-engine probes also passed using the existing Python environment
(Python 3.11.7, VTK 9.7.0, CGAL Python bindings 6.0.1.post202410241521, NumPy 2.4.6,
SciPy 1.17.1, SymPy 1.14.0):

- `scripts/vtk-mesh-analysis-verification.py`: unit-sphere Gaussian median
  1.0009318 and absolute mean median 1.0006357 over 5954 samples; equilateral
  triangle aspect 1 and minimum angle 60 degrees.
- `scripts/cgal-boolean-real-mesh-smoke.py`: rejected the open Bunny before Boolean
  execution; Armadillo intersection and Benchy difference passed the native CGAL
  mesh smoke checks (73315/146626 and 112910/225840 output vertices/faces).
- `scripts/cgal-geodesic-verification.py`: plane, cylinder, sphere, graph-versus-surface,
  disconnected endpoints and large-mesh checks passed. Automatic helper discovery
  initially failed in this checkout. The existing helper was then supplied explicitly
  through `MATH3D_CGAL_GEODESIC_EXE`; its SHA-256 is
  `df51bdc744586acf313ca36f9ef798c0fda690526a407858f28fa1221a80e7cb`.

These are local reference probes, not complete installed-engine project-integration
or signed-build evidence. Physical mobile picker/share/upgrade/restart, Sage and the
remaining PRJ17/PRJ18 acceptance gates are still open. The development app remains
running with the new starter selector visible and its seven-document/two-relation
project backup retained.

Clean-checkout [Projects CI](https://github.com/expert10000/Math3D/actions/runs/36995307251)
passed on `bd5d8b1`: all 477 audit tests, 108 project contracts, 41 mobile-model
regressions, **22 Electron journeys in one run**, **12 browser journeys in one run**,
typechecks/builds, dependency boundaries (991 modules / 2268 dependencies), the
released Graph test pack and embedded Android bundle. [PR #18](https://github.com/expert10000/Math3D/pull/18)
merged into main at `b76ec6d`.

The same implementation also passed
[general build/worker CI](https://github.com/expert10000/Math3D/actions/runs/36995307228)
(1612 renderer tests in 287 files, 46 fast Playwright journeys and 11 smoke journeys),
[Graph professional acceptance](https://github.com/expert10000/Math3D/actions/runs/36995307265)
(33 desktop and 62 browser journeys),
[Gallery Quality](https://github.com/expert10000/Math3D/actions/runs/36995307347), and
[Android APK/emulator acceptance](https://github.com/expert10000/Math3D/actions/runs/36995307314).
Emulator results do not establish physical-device or signed-release signoff.

Cloudflare `math3d` and `math3d-app` still reported failed builds on `bd5d8b1`, as
they do on base main `243bae5`; `math3ds` passed. Dashboard-only summaries provide
no build failure diagnostics. These existing deployment failures remain separate
from the passing application software gates.

## PRJ17 / PRJ18 acceptance continuation — October 2

[PR #19](https://github.com/expert10000/Math3D/pull/19) adds installed-service
acceptance and a combined preset freeze. The local Electron journey passed with
17 documents, eight modules, three dependencies, external bytes, seven adapter
edits, independent-profile transfer, cold process restart and restored history.
Chromium passed both en-US/UTC and pl-PL/Auckland combined journeys. The browser
harness closes the source renderer before opening its independent destination;
keeping both expensive scientific renderers active caused the initial local
timeout and is not the acceptance setup. The exported Mesh buffers and dense
Volume samples were independently decoded and checked against the fixture values.

The current contract run passed 108 Projects tests in 15 files and 123 existing
native/storage/Graph/transfer regressions in 24 files. Portable fixture and E2E
TypeScript passed; the production web build passed with the existing chunk warning.
The combined Electron test is included in the normal Projects acceptance command,
and the preset pack can be regenerated with `npm run test:projects:fixtures`.

[Installed Sage CI](https://github.com/expert10000/Math3D/actions/runs/37026284787)
passed on tested merge checkout `c89f26a` / source head `26a6d11`, with SageMath
10.10: five Complex operations, nine exact integer-homology cases, cancellation,
deadline/stale-source publication suppression and malformed-payload rejection.
Container identity was
`sha256:32453870b1c33f7aa69b31876e8dc12f77c33478a560c697f784b1a1ed9f0e6b`;
test-bundle SHA-256 was
`0b4acaf4e1b3d08ca8527ae15e7f83c6e52db6c07eb76acb1e0e4de1368ff975`.
The extended gate additionally checks an exact decimal derivative and persisted
project/result/boundary-matrix references. Its current result must be read from
PR #19 checks and downloaded evidence; the earlier run does not attest extensions.

A signed internal Android candidate was built and certificate verification passed.
It is preparation evidence only: ADB reported no connected handset during this
software work. No new physical-device case or signed production-release acceptance
is claimed. The [host matrix](projects-host-qualification.md) retains these native
conditions explicitly; full PRJ17/PRJ18 native readiness is not marked complete.

## PRJ17 Samsung physical acceptance — October 3

Samsung A56 (`SM-A566B`), Android 16/API 36, arm64-v8a, 1080×2340 passed the
supported checkpointed Graph/Curve/Surface workflow. The shared-key
[Android build and emulator run](https://github.com/expert10000/Math3D/actions/runs/37069623996)
passed on clean source `e1298a74480d1daaa9fa3680327af1954b2b2193`.
The installed APK was pulled back from the handset and matched SHA-256
`34629b628969f3b55b4bf5e75da0372236781a559f56f4b41e2254e01559421d`.
The certificate SHA-256 is
`39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82`,
matching the previous installed internal app. Application ID is
`com.math3d.mobile.internal`, version `1.6.0-internal`, build `150008`.

- All 20 existing projects were exported before the same-signer `adb install -r`
  update, then exported again. Identities, revisions, names, metadata and source
  contents matched exactly. No app uninstall or data clearing occurred.
- Native file-picker import and directory-picker export of the named catenary
  preset returned the exact original project, including all three documents,
  relations and the historical derivative. The actual file also opened, saved,
  exported and reloaded through a fresh Chromium context.
- Actual pan and two-pointer pinch changed the visible axis ranges. Applying
  `x*x+1`, undoing to the catenary expression and redoing to `x*x+1` passed.
  The saved Graph reached revision 4; both companions retained their exact
  revision-1 checkpoints, relations and recorded result. Rename to
  `PRJ17-Minimal-Study` preserved the scientific workspace. Force-stop/relaunch
  returned the exact edited and renamed export.
- The edited file imported, exported and reloaded identically in a fresh browser
  **saved preview**. Its unchanged Surface is preview-only; full-workspace opening
  correctly remains disabled. Dependency inspection marks all three relations
  and the saved derivative stale, preserving their original provenance.
- Android's share chooser displayed the named JSON. Import-picker, export-picker
  and share cancellation retained an applied but unsaved `x*x+2`. Malformed JSON
  and the unsupported eight-module resource package were rejected with the same
  unsaved source and 21-project library intact.
- Only the new acceptance project was deleted. Importing its actual exported
  backup through the native picker restored the complete named project exactly;
  another cold restart retained `x*x+1`. The original 20 user projects remained
  present. The final library has 20 original projects and one restored test project.

[Structured evidence and file hashes](evidence/projects-samsung-2026-10-03/acceptance.json),
[retained-library comparison](evidence/projects-samsung-2026-10-03/retained-library-comparison.json),
[actual initial export](evidence/projects-samsung-2026-10-03/native-initial.math3d.project.json),
[actual recovered export](evidence/projects-samsung-2026-10-03/native-recovered.math3d.project.json)
and handset/browser screenshots are committed. Existing user exports, private
UI dumps and the APK stay outside the repository. The handset app and desktop
development app are left running.

This is Samsung internal-build workflow evidence for source `e1298a7`. Physical
iOS, deliberate private-store corruption/recovery and delivery to an external
share recipient were not included in that earlier workflow pass. The continuation
below adds exact-build physical damaged-store recovery evidence for `9772384`.
Published 1.6.0 release approval and the broader six-device MOB-G13 matrix are
unchanged. Full PRJ17/PRJ18 native release readiness remains unverified for the
specific native conditions listed in the host matrix.

## Damaged private-store recovery implementation and Samsung acceptance — October 3

Source `9772384a9a90c08da73be150434a81fa51d0bae4` fixes read-error fallback,
recovery/save serialization, blank-file first-run misclassification, unsupported
schema downgrade and accidental writes over unrecoverable copies. Fault-injected
tests also verify storage-full handling, failed repair, rename rollback and
cleanup error preservation. All 339 mobile tests and mobile typecheck passed.

[Android CI 37075667848](https://github.com/expert10000/Math3D/actions/runs/37075667848)
passed with a clean shared-key internal APK, SHA-256
`b41a0022e009038bd196047e8bd80faafde2ffceeafe797cf823631aef8c8d8d`,
certificate SHA-256 `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82`.
All 11 recovery checks passed using real Expo private files and the production
reader/writer on Android 16/API 36. The runner verified the installed APK hash,
force-stopped the app, confirmed its process was absent, relaunched and checked
backup restoration followed by another reader selecting the repaired primary.

Damage is confined to a fixed diagnostic directory. The sample contains a named
Graph/Curve/Surface study with relations/results and a Scene project; whole
serialized records are compared after repair. The normal library's primary,
backup and staging-file fingerprints must stay unchanged. This diagnostic runner
never installs, uninstalls or clears app data; the preceding emulator smoke uses
its separate disposable emulator profile.

The identical signed APK was then installed on **Samsung A56 / Android 16** as a
same-certificate upgrade. All 21 saved projects remained available. All **11
physical recovery checks passed**, including repair after confirmed process
termination and relaunch into a different process (PID 8563 → 8907). The installed
APK hash matched the candidate. The diagnostic's normal-library primary, backup
and staging-file fingerprints matched exactly before/after. A fresh acceptance
project export before/after the upgrade matched byte-for-byte, SHA-256
`8938b0bfc2c2653b7ddc38f5991c42548cfed40449688e777d3f58c5ef35c2fc`.

The [detailed report returned by the native picker](evidence/projects-storage-recovery-2026-10-03/samsung-recovery-report.json)
records each case and the file fingerprints. [Runner and process evidence](evidence/projects-storage-recovery-2026-10-03/acceptance.json)
and the [actual retained export](evidence/projects-storage-recovery-2026-10-03/samsung-retained.math3d.project.json)
are committed. The screenshot, private UI dumps, APK and existing user exports
remain outside the repository. App data was neither cleared nor uninstalled;
the app is left running.

Android damaged-store acceptance is complete for the production reader/writer
with isolated fixtures on this handset. I/O fault injection remains a software
qualification. iOS acceptance and published 1.6.0 release approval remain separate;
local external-app share delivery is recorded below. [Repeatable instructions](mobile-storage-recovery-checks.md)
describe the same safe procedure for later builds.

## Actual local external share recipient — October 3

The same signed `9772384` Samsung APK delivered **PRJ17-Minimal-Study** to
`com.math3d.acceptance.sharereceiver` through the actual saved-project Share button
and native chooser. No synthetic ADB send intent was used. The recipient's UID
10287 is separate from Math3D's UID 10268. Installed sender and recipient APK
hashes were checked before collecting the receipt. The recipient used the real
read grant to open the sender's content URI through `ContentResolver` and saved
the stream in its own private files. Debug `run-as` read only this test recipient.

The [raw receipt](evidence/projects-local-share-2026-10-03/receipt.json) records
`ACTION_SEND`, `application/json`, the sender's provider authority, the fresh
observed filename, successful stream read, project identity and byte fingerprint.
The [actual received project](evidence/projects-local-share-2026-10-03/received.math3d.project.json)
contains 8,207 bytes and matches the original native export exactly, SHA-256
`8938b0bfc2c2653b7ddc38f5991c42548cfed40449688e777d3f58c5ef35c2fc`.

A fresh Chromium profile imported that received file into its saved library,
exported it, reloaded and exported again. Both exports matched the received bytes
exactly, preserving the whole named project, companion generations, relations
and historical results. Full opening stayed disabled for the historical Surface;
the qualified saved-preview behavior was retained. The Samsung library showed
21 projects on return from the recipient; the subsequent native export matched
the original bytes exactly. Only the test receiver was uninstalled after evidence
collection. Math3D data was retained and its process remained running.

[Exact-build delivery, browser and file evidence](evidence/projects-local-share-2026-10-03/acceptance.json)
and the [repeatable local recipient procedure](../tests/fixtures/android-share-receiver/README.md)
qualify this separate local Android recipient. The fixture APK and signing key
remain outside Git. Email, messenger, nearby transfer and another physical device
are separate untested transports. Physical iOS acceptance and published release
approval remain separate gates.

## PRJ19–PRJ21 first deliveries — October 3

The continuation branch `codex/projects-prj19-21` starts from main `8a1ee6f`.
PRJ19 (`494e5a6`) creates separate Graph command adapters during desktop/web
project restoration. Explorer switching retains each document's source and
history. Verified bounded Graph replay restores independent undo/redo cursors
after save, transfer, browser reload and real Electron process restart. Graph
point tables appearing only in undo/redo are included in the resource inventory;
missing historical bytes block activation. Existing Graph sidecar import/reload
also passed in both browser locales.

PRJ20 (`a35b2d8`) adds explicit saved-project actions under **Manage saved project
→ Relations and availability**. **Create refreshed copy** rebuilds supported
Graph-derived Curves/revolutions/extrusions with current source lineage and new
target identities. **Recompute derivative** runs the existing local first/second
derivative algorithm and publishes a new current record. Original documents,
relations and historical analysis remain unchanged. Project undo/redo reverses
the additions. Missing source objects and duplicate copies/publications reject
without mutation. Other construction and analysis adapters remain open.

PRJ21's first mobile UI slice adds **Documents and relations** to checkpointed
named-project cards. It groups all recorded documents by module, exposes titles,
revisions, archives, preview/editing limits, relation freshness and analysis
authority/provenance. Inspection never activates an editor or modifies saved
bytes. Non-Graph modules remain saved previews. Broader mixed-project preview
import/storage and per-document mobile editing remain open.

Validation passed:

- Projects contracts: **114 tests in 17 files**, plus **53 existing mobile/storage
  regression tests in eight files** and portable-fixture TypeScript.
- Targeted continuation/resource/mobile-explorer contracts: **19 tests in four
  files**, including four read-only mobile inspection cases.
- **Two Electron journeys** and **four new browser journeys**, plus **two existing
  Graph point-table browser regressions**, in en-US/UTC and pl-PL/Auckland.
- Main/renderer/E2E and mobile typechecks, production desktop/web builds, and
  dependency boundaries.
- Android Hermes export: 902 modules; bundle SHA-256
  `49604373cf208a72f25397f7d8cfff2a6516064795ddf333484a27a32635e7ef`,
  6,322,203 bytes. For this Windows checkout's existing dependency junctions,
  validation temporarily watched their resolved directories and mapped core/kernel
  to the current worktree sources. The production Metro configuration was restored;
  no dependency declaration or lockfile changed.

This is development software acceptance. No new signed APK was installed on the
Samsung during this continuation, and PRJ21 handset layout/interaction acceptance
remains pending. Earlier Samsung evidence retains its exact recorded source/build
scope. Physical signed iOS acceptance and published release approval are unchanged.

## PRJ20/PRJ21 completion — October 3

PRJ21 (`66a963d`) retains complete checkpointed named projects, raw mixed-workspaces
and v2 workspace handoffs in schema-3 mobile storage. Named JSON is preserved
byte-for-byte, including all eight modules, scripts, archive state, results,
relations and external references. Imports validate checkpoints and identity,
reject unsupported replay/collisions without mutation, and preserve current
personal editor work. Previews open the document explorer; mobile editors remain
limited to the supported single-Graph format. External source bytes require
separate transfer. Metro now resolves this checkout's shared dependencies and
core/kernel source consistently; no package or lockfile changed.

PRJ20 (`6201e2c`) adds explicit refresh for Curve extrusion, revolution, ruled
surface, loft, sweep and tube, and Graph integral, arc length, critical points and
intersections alongside derivative. Refresh uses ordered current parents and
recorded numerical parameters/tolerances, appends new targets/results and leaves
historical records intact. Native bounded evaluators validate construction output;
project undo/redo reverses additions. [Supported operations and UI paths](projects-refresh-support.md)
state the scope and unavailable cases.

Validation includes the Projects contract runner (125 project/core tests and 67
mobile/storage tests, plus portable-fixture TypeScript), the subsequent six-case
broader-preview suite, main/mobile typechecks, dependency boundaries, core and
desktop/web builds, one extended Electron journey and two extended Chromium
journeys in the configured locales. The journeys exercise explicit construction
refresh and integral recomputation, save/reload and project undo/redo.

The exact shared-key APK from clean source `6201e2c` was installed without clearing
Samsung data. On SM-A566B / API 36, the existing project explorer displayed its
historical companions and stale relations/analysis. The native file picker then
imported **PRJ21 Mixed Preview**: 17 documents in Graph, Geometry, Curve, Surface,
Mesh, Volume, Topology and Complex Analysis, three relations and two recorded
results. Labels, revisions, provenance and external-byte limits were visually
checked. The current catenary Graph remained active. After a full process restart,
native export retained all 23,234 bytes, SHA-256
`c25181e90626ce0eaa97c32c6d615ab1beedb9776a050dd1caf146e06c65fa3b`.
Import/export/reload of that returned file in a fresh browser context also matched
exactly. A complete library scan retained all 21 original IDs, adding only the new
preview; the original catenary export was also unchanged.

The APK's SHA-256 and shared signing certificate were verified. Emulator smoke
and the quality matrix passed in [the candidate workflow](https://github.com/expert10000/Math3D/actions/runs/37121718393);
that workflow failed at the recovery runner's installed-APK hash preflight.
`b1f1fdb` replaces host APK streaming with device-side SHA-256 and resets/searches
the retained Settings scroll position. The corrected runner passed 10/10 isolated
fixture checks and 11/11 restart checks on Samsung, including the broader preview
fixture; the real library remained unchanged. [A new shared-key CI run](https://github.com/expert10000/Math3D/actions/runs/37123268006)
was dispatched to validate the corrected runner in the emulator as well; its
result must be checked separately and is not claimed as passed here.

[Structured evidence, native/browser returned files and screenshots](evidence/projects-prj21-samsung-2026-10-03/acceptance.json)
record this continuation. APKs, signing material and the private library inventory
remain outside Git. The three requested follow-up items are complete for this
declared scope. Additional mobile editors, source sidecar transfer, external-engine
refresh adapters and signed physical iOS acceptance remain future work.
