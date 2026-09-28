# Mobile Graphs G05–G07

## MOB-G05 — saved probes

Eight annotated explicit-function observations at most. Stable IDs and ordered world coordinates live in optional `display.pinnedProbes`, not mathematical source. Adding this field declares `graph2d.probes.v1`: current desktop and mobile accept it, older readers explicitly reject the unavailable capability rather than silently discard annotations. Existing v1 files stay byte-stable when no probe field is present.

Pin, label/rename, delete, reorder, locate and first-two comparison use reversible scene commands. Source-hash mismatches disable location/comparison and suppress stale markers; deleted functions remove their probes atomically. Observation coordinates are historical snapshots, never silently recomputed.

Evidence: mobile typecheck and 10 tests across saved probes, project persistence and desktop portable corpus passed. Physical-device and screen-reader acceptance remains part of MOB-G13.

## MOB-G06 — explicit authoring

Add/edit/rename/domain endpoints/style/duplicate/reorder/show-hide/delete reuse `applyGraph2DAuthoring` and the shared kernel scene command, not mobile-only mathematical operations. Unsupported kinds stay preserved and view-only. Invalid numeric text and expressions stay in drafts; failure leaves history and document untouched. Successful Apply is one reversible step. Source edits stale saved observations; deletion prunes dependent observations atomically and undo restores them.

Drafts live above the sheet, surviving destination switches and keyboard/layout changes during the workspace session; Cancel explicitly discards them. They are deliberately not saved/exported. Android `adjustResize` plus a scrollable sheet and iOS keyboard avoidance keep fields reachable. Android's stale native portrait lock is removed to match the existing Expo `orientation: default`; configChanges preserves the activity across rotation. Dashed/dotted styles now produce actual clipped native patterns, bounded at 4096 line Views.

Evidence: mobile typecheck and 11 probe/project/authoring tests passed. Native keyboard/rotation and touch walkthrough follows after all three commits; physical device/iOS acceptance remains pending.

## MOB-G07 — requested shared analysis

The touch sheet invokes one bounded shared-core operation on Run: first/second derivatives, tangent/normal equations and tangent overlay, zeros/extrema/inflections, signed/absolute integral, one chosen intersection pair, or arc length. Native UI exposes publication status, algorithm/version, tolerance, estimated errors, source identity/revision/hash, warnings and diagnostics. Missing full-interval values remain unavailable and any partial answer is explicitly labeled.

Results stay transient and source-linked: input edits or source-generation changes mark them stale and disable result navigation/overlays. Panning, selection and pin/display changes do not invalidate a numerical result. Navigation re-evaluates candidate coordinates against the source before committing the shared selection. No analyses run during render or across all functions automatically. Mobile interval width is limited to 1,000,000 and configurable tolerance to 1e-10–0.1; per-operation fixed tolerances are published by the shared core.

## Verification — 2026-09-28

- 166 mobile tests / 38 files passed, including 11 new probe/authoring/analysis tests. Invalid drafts, atomic history, deterministic native/desktop persistence, numerical parity, singularities and stale-result rules covered.
- 97 desktop Graph unit tests / 28 files passed. Root Node/renderer/E2E typechecks and mobile typecheck passed. Production renderer build and Android Gradle debug build passed.
- Desktop Electron suite: initial run had a point-table timing failure (17/18); its focused retry passed, then a fresh complete run passed all 18 scenarios (1.4 minutes).
- Android API 35 `Medium_Phone_API_35`, app 1.5.1 (150007): observed Graph starter creation, Functions sheet, default-draft add/Apply, duplication, tap probe, shared derivative results (f=x: 1 and 0), pin/save/reopen with marker preserved, and stale-result labeling. New-function draft label/expression survived portrait → landscape → portrait; original free rotation mode restored. Emulator and Metro are left running; no uninstall/data reset performed.
- Keyboard typing was intercepted by Android's stylus onboarding during the walkthrough. Keyboard-aware layout and raw draft validation are implemented/tested, but a complete native text-entry/keyboard walkthrough, physical-device, screen-reader and iOS signoff is still pending. No release/store or legal-compliance gate is claimed.
