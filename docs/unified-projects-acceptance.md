# Unified Projects automated acceptance

This is evidence for the supported named-project slice integrated into `main`
and its continuation on `codex/projects-native-restoration`, not signed-release
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

## Recorded evidence (2026-10-01)

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
and write-failure contracts. Project JSON transfers resource references, not external
bytes or thumbnails; point-table availability and optional missing analysis artifacts
are covered by contract tests.

## Remaining acceptance obligations

- Native opening supports independent literal parametric/explicit Curve expressions
  (2D/3D without external dependencies), nonperiodic parametric Surfaces, procedural
  Geometry objects/live-derived constructions and the existing Graph promotions.
  The PRJ13 fundamental-diagram Topology/Function Explorer subsets and PRJ14
  self-contained scalar Volume recipes also have native adapters. PRJ15 adds qualified
  resource-backed Mesh opening and history; other representations remain previews.
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
Remaining PRJ16–PRJ18 deliveries and the supported native subsets are explicit in the
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
