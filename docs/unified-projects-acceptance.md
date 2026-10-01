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
  Mesh, Volume, Topology, Complex and other Curve/Surface/Geometry representations
  remain verified previews until equivalent native editor adapters exist.
- Mobile named editing requires one Graph, checkpointed Curve/Surface companions,
  no saved scripts or archived documents, and available source point tables. An edited
  Graph's historical companions may force desktop opening to remain preview-only;
  regeneration is explicit, not performed by import.
- Native device/file-picker/share behavior, installed optional engines, external byte
  transfer and signed builds require their own exact-build evidence. No such sign-off
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
Remaining PRJ14–PRJ18 deliveries and the supported PRJ13 subset are explicit in the
[roadmap](unified-projects-roadmap.md#remaining-delivery-and-integration-gates).

## PRJ13 native scientific restoration — October 1

Main merge `766776a` passed [CI 36892375601](https://github.com/expert10000/Math3D/actions/runs/36892375601).
The next branch connects supported Topology documents to the diagram editor and
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

Clean-checkout CI runs on this continuation branch; its exact result is recorded
separately from these completed local gates.
