# Unified Projects automated acceptance

This is evidence for the supported named-project slice on
`codex/post-1.6.0-audit`, not signed-release or native-device sign-off.

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
- Rebase/integration must use the confirmed 1.6.0 release commit; this branch does not
  change release versions or signing configuration.

## Editor continuation checks

The PRJ10 Electron journey opens independent Curve/Surface sources without a Graph,
checks unchanged generations before editing, edits both sources, uses undo/redo,
saves, reloads and explicitly reopens the named project and Curve history. The PRJ11
journey opens procedural Geometry and an object-centroid construction, verifies
opening did not change its source generation, edits a native parameter and checks
save/reopen with preserved construction records. Projects is available in the main
navigation; source editor controls show that Save project persists their changes.
