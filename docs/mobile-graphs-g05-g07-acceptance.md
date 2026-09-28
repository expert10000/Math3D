# Mobile Graphs G05–G07

## MOB-G05 — saved probes

Eight annotated explicit-function observations at most. Stable IDs and ordered world coordinates live in optional `display.pinnedProbes`, not mathematical source. Adding this field declares `graph2d.probes.v1`: current desktop and mobile accept it, older readers explicitly reject the unavailable capability rather than silently discard annotations. Existing v1 files stay byte-stable when no probe field is present.

Pin, label/rename, delete, reorder, locate and first-two comparison use reversible scene commands. Source-hash mismatches disable location/comparison and suppress stale markers; deleted functions remove their probes atomically. Observation coordinates are historical snapshots, never silently recomputed.

Evidence: mobile typecheck and 10 tests across saved probes, project persistence and desktop portable corpus passed. Physical-device and screen-reader acceptance remains part of MOB-G13.
