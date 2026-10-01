# Post-1.6.0 Topology fix and upgrade regressions

Continuation of the [audit](post-1.6.0-continuation-audit.md), on
`codex/post-1.6.0-audit`. The confirmed release tag and final maintainer changes
are now integrated in merge `b180ed7`; see [the integration record](unified-projects-roadmap.md#release-baseline-integration-evidence).
No release version, signing key, or release workflow is changed.

## Topology delivery slice

The regression reproduced a save failure after 105 source edits:
`persistence.replay.transactions exceeds the 100-entry history limit.` The
kernel retained 100 reversible operations, but the editor accumulated an unbounded
replay log. The document format correctly rejected that oversized log.

The adapter now advances its source checkpoint as the oldest edit leaves the
100-operation window. Remaining command IDs and source IDs are preserved. Saving
and reopening retains the current source and identity, and Undo reaches the same
oldest retained source. A new edit after Undo drops the redo branch as usual.

Undo/Redo advances the live source revision. Repeated Undo/Redo or replacing a redo
branch previously left replay revisions and recorded hashes inconsistent with the
live document. Export now advances the checkpoint revision by the missing revision
offset and rebuilds the retained transaction hashes through the pure command
projection. It preserves the live identity rather than rolling its revision back.
Derived results still require that exact live generation.

Reopening also restores the numeric sequence from transaction IDs. The former
code searched the end of command IDs, which end in `/forward` or `/inverse`, and
reset the sequence to zero. Continued editing could consequently reuse an
existing transaction ID; the upgrade regression reproduces and prevents that.

Legacy v2 snapshot histories are migrated into the same bounded window. Nearest
redo snapshots are retained first, and the remaining slots retain the newest undo
snapshots. Distant history outside the existing 100-operation budget is excluded;
the current source is preserved. This adds no format version or bulk payload.
V1 source files remain readable and can continue through commands into v3.

Five Topology regressions cover long sessions, v2 histories spanning both sides of
the cursor, stale analysis rejection, repeated Undo/Redo and branching, and v1
source -> edit -> v3 save/reopen -> Undo/Redo. IDs, current revision, replay and
source contents are checked through production adapters.

## Upgrade coverage

The frozen [Graph Gallery storage fixture](../tests/fixtures/post-1.6.0/graph-gallery-upgrade-storage.json)
captures the Graph code at baseline `354d06d`: an archived analyzed parabola, a
data-bearing preset with external point-table rows, a last-opened line preset,
gallery favorites and personal-project favorites. It is not regenerated during
tests and must not be replaced merely to make a changed reader pass.

Five Graph regressions exercise a fresh storage instance without in-memory state:

- Discover saved projects and the durable last gallery copy without writes.
- Reopen archived sources/results with their exact identities and resolve retained
  point-table sidecars; keep personal favorites.
- Edit the reopened source, save/reopen it again, and classify the old analysis as
  stale while retaining its original provenance.
- Inject a storage-write failure and verify every durable key returns to its
  exact previous bytes.
- Migrate the existing frozen text-only v0 Graph fixture once, preserving its ID,
  advancing its revision, and leaving the original bytes untouched.

These are portable reader/storage regressions. An actual signed APK upgrade,
Android filesystem recovery, physical-device relaunch, and TalkBack signoff remain
part of the release computer's exact-build matrix. No physical signoff is inferred
from these tests.

## Repeatable gates

`node scripts/post160-roadmap-audit.mjs --run` includes both new upgrade suites
alongside every mapped milestone test. It passed 369 tests in 56 files.

The separate Topology suite passed 156 tests across 28 files; its Sage contract
and publication suite passed eight tests. These Sage checks exercise the contract
and local oracle; they do not establish execution on an installed Sage engine.
Renderer TypeScript, desktop and E2E TypeScript, the dependency boundary check,
and the main/renderer production build passed.

Six existing Electron journeys passed: four Graph Gallery browse/preservation/
favorites/import journeys and two Topology semantic-safety journeys. Responsive
smoke passed phone portrait, phone landscape, tablet, and desktop layouts.

Before merging after release, re-run the mapped gate and the Topology formal gate
on the rebased commit. Keep Graph fixture-only coverage separate from the tested
Topology runtime fix for review, and retain the existing legacy entry points.
