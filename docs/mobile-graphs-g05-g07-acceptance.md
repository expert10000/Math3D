# Mobile Graphs G05–G07

## MOB-G05 — saved probes

Eight annotated explicit-function observations at most. Stable IDs and ordered world coordinates live in optional `display.pinnedProbes`, not mathematical source. Adding this field declares `graph2d.probes.v1`: current desktop and mobile accept it, older readers explicitly reject the unavailable capability rather than silently discard annotations. Existing v1 files stay byte-stable when no probe field is present.

Pin, label/rename, delete, reorder, locate and first-two comparison use reversible scene commands. Source-hash mismatches disable location/comparison and suppress stale markers; deleted functions remove their probes atomically. Observation coordinates are historical snapshots, never silently recomputed.

Evidence: mobile typecheck and 10 tests across saved probes, project persistence and desktop portable corpus passed. Physical-device and screen-reader acceptance remains part of MOB-G13.

## MOB-G06 — explicit authoring

Add/edit/rename/domain endpoints/style/duplicate/reorder/show-hide/delete reuse `applyGraph2DAuthoring` and the shared kernel scene command, not mobile-only mathematical operations. Unsupported kinds stay preserved and view-only. Invalid numeric text and expressions stay in drafts; failure leaves history and document untouched. Successful Apply is one reversible step. Source edits stale saved observations; deletion prunes dependent observations atomically and undo restores them.

Drafts live above the sheet, surviving destination switches and keyboard/layout changes during the workspace session; Cancel explicitly discards them. They are deliberately not saved/exported. Android `adjustResize` plus a scrollable sheet and iOS keyboard avoidance keep fields reachable. Android's stale native portrait lock is removed to match the existing Expo `orientation: default`; configChanges preserves the activity across rotation. Dashed/dotted styles now produce actual clipped native patterns, bounded at 4096 line Views.

Evidence: mobile typecheck and 11 probe/project/authoring tests passed. Native keyboard/rotation and touch walkthrough follows after all three commits; physical device/iOS acceptance remains pending.
