# GF-02 — Project selection objects

**Status:** implemented, 2026-11-04. This slice gives the existing point, axis-line, orthogonal-plane and planar-region intents stable Project identities. It does not change the saved coordinates or source claims established in [GF-01](graph-field-gf01-scientific-selection-contract.md).

## Contract and migration

`math3d.mixed-workspace/v1` accepts an optional `scientificSelections` collection. Each Project object is a validated `math3d.scientific-selection/v1` with an authored `math3d:scientific-selection:*` ID. Migrated objects additionally retain the exact GF-01 `legacy-slot` address in `identity.migratedFrom` (owner document, saved path, optional Graph object ID). The Project validator rejects duplicate IDs, duplicate migration origins, non-authored entries and migrated owners outside the workspace. Older Projects omit the collection and still parse without a rewrite.

`migrateProjectScientificSelections` replays current Graph/vector documents when needed, projects the saved GF-01 slots, and derives each ID from the Project ID and legacy slot. Repeating migration or changing the active document/layout keeps the same ID. A changed coordinate in the same saved slot updates that Project object's geometry under its ID. Existing authored objects without a legacy origin remain in the collection. The migration copies each source and frame as saved: `null` checkpoints and unknown axis units remain `null`; no source generation or verification result is inferred.

`listProjectScientificSelections` reads the persisted collection, or returns deterministic authored previews for an older Project without mutating it. `projectScientificSelectionsForDocument` addresses the same collection by owner or document source for Explorer and Graphs. `upsertProjectScientificSelection` saves an authored object and rejects an attempt to change an existing object's ID origin. Deleting a Project document removes migrated selections owned by that document.

Project save merges retained selections with live workspace state before migration, including when only some editors are loaded. The Graph workspace handoff preserves relevant selections and advertises `project.scientific-selections.v1`; Project import inspection also lists that capability. The existing per-document point/line/slice/region state continues to drive current controls, while Project objects provide stable shared references. Changes to those controls and broader geometry operations are subsequent slices.

## Review gate

`tests/unit/projectScientificSelections.test.ts` migrates the committed GF-01 Project fixture, saves and reopens it, compares all ten geometries, frames, roles and source references with the legacy projection, checks idempotence, ID stability across active-document layout and point-coordinate changes, and confirms Explorer/Graphs selectors share the Project objects. It rejects duplicate IDs/origins, checks document-delete cleanup and round-trips a Graph handoff. `renderer/src/projects/projectTransfer.test.ts` verifies that partial live editor capture retains selections and their owner documents.
