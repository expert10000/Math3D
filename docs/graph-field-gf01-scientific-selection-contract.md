# GF-01 — ScientificSelection contract and legacy Project inventory

**Status:** implemented read-only contract and migration projection, 2026-11-03. GF-02 owns authoring and persistence of new selections.

## Saved-state inventory

| Existing owner | Persisted path | Meaning | Identity and source evidence already saved |
| --- | --- | --- | --- |
| 3D vector document | `workspace.probe` | One physical point inside the vector domain. | No selection ID or selection-specific source generation. The enclosing document has its own identity. |
| 3D vector document | `workspace.linkedProbe` | Cross-layer physical point with its own coordinate-unit tuple. | No single source document or source generation. Units are saved. |
| 3D vector document | `workspace.sliceCoordinates[0..2]` | X/Y/Z-normal display planes, independent of current layout. | No selection IDs or source pins; plane extents follow the source axes. |
| 3D vector document | `workspace.linkedLineProfile` | Axis-aligned line through a saved point with a chosen varying/normal axis and vector channel. | No selection ID or source pin; line extent follows the source domain. |
| 3D vector document | `workspace.overlayRegion` | Rectangle on a physical orthogonal plane, with vector channel and visibility. | No selection ID or source pin. This is a **planar** region, not a 3D box. |
| Graph point series | `source.objects[id=…].linkedOrigin.profile` | Saved vector/scalar or vector/complex line profile. | Graph object ID, pair ID, embedded vector document checkpoint, field references and sample/row hashes. The selection adapter carries the vector checkpoint; it does not claim those hashes were reverified. |
| Graph point series | `source.objects[id=…].linkedOrigin.region` | Saved vector/overlay region mean profile, including optional row axis. | Graph object ID, pair ID, embedded vector document checkpoint and row hashes. The region stays planar. |
| Graph point series | `source.objects[id=…].analyticOrigin` | Authored vector-field line. | Source document ID, revision and structural hash, varying/fixed coordinates, x unit. Other axis names/units are absent from this origin. |
| Graph point series | `source.objects[id=…].derivedOrigin` | Derived vector-field line. | Embedded vector document and saved plane/line coordinates, source/sample hashes. |
| Graph point series | `source.objects[id=…].origin.slice` | Imported 2D or 3D scientific-grid line. | Dataset scene/resource identity, or an explicit saved scientific-field document checkpoint when present. |
| Graph selection | `selection.linkedRegion` and `selection.linkedRegionIntersection` | Focus within existing saved profile series. | These refer to Graph pair IDs and selected x/interval bounds. They remain Graph focus state in GF-01; they are not promoted to an independent Field selection. |

The outer Project is `math3d.project/v1` and contains a `math3d.mixed-workspace/v1`. Vector and Graph documents are workspace entries. The Project and each document have independent identities; a Project save revision does not imply a field selection has a source-generation pin. Checked point-table values live in sidecars and are not part of the GF-01 selection contract.

## Contract

`packages/core/src/scientificSelection.ts` defines `math3d.scientific-selection/v1`. A selection has:

- `identity`: a new authored ID **or** a `legacy-slot` address consisting of owning document ID, saved path and optional Graph object ID;
- `role`: probe, view or analysis;
- `source`: document with an explicit nullable checkpoint, dataset reference, or `null` for a cross-layer point without one source;
- Cartesian frame with two or three axes; each name/unit may be `null` when the saved origin did not include it;
- point, axis-line, orthogonal-plane or plane-region geometry.

The validator rejects unsupported keys, invalid geometry, malformed source identities/checkpoints, non-finite coordinates and oversized records. Standalone canonical serialization is available for contract review. GF-01 does **not** add a Project field, capability ID, command or migration rewrite: authored selection persistence waits for GF-02.

## Legacy read rules

`readScientificSelectionsFromProject` validates the Project, then projects supported saved slots without modifying bytes or document identities. `legacy-slot` is a deterministic address, **not** a historical ID. A missing slot produces no selection. The three default slice coordinates are projected as view planes because the existing vector normalizer supplies them on older documents.

For Explorer workspace selections, `source.checkpoint` stays `null`; the enclosing vector document's current revision is not copied into the selection. For `linkedProbe`, `source` stays `null` and the saved units are preserved. Graph profiles carry a checkpoint only when their origin recorded one. An imported grid line without a saved field document keeps its dataset reference. Unknown analytic fixed-axis units remain `null`. The adapter never loads point-table rows or treats stored hashes as fresh resource verification.

The reader requires checkpointed Graph/vector workspace entries. A replay log must be resolved by the normal workspace replay owner before projecting selections; GF-01 must not read an older checkpoint as the current Project state. A later field source edit changes the live document identity but leaves Graph origins' saved checkpoints intact; consumers use existing verification/status paths to decide whether values are current. This projection alone never asserts numerical freshness.

## Review fixture and checks

`tests/fixtures/scientific-selection/gf01-legacy-project.math3d` is an ordinary v1 Project with both a vector document and a Graph document. It includes a point, linked point, three slices, linked line, planar rectangle, authored Graph line, linked Graph line and linked Graph region profile. Regenerate or check it with `npx tsx scripts/write-gf01-scientific-selection-fixture.ts [--check]`.

`tests/unit/scientificSelection.test.ts` reopens that Project, compares the read projection before and after save/reopen, checks exact geometry, stable legacy addresses, nullable provenance and canonical contract round trips, then changes the live field source and confirms Graph checkpoints are not silently rebased. It also rejects malformed geometry and source checkpoints. GF-02 can use this fixture as the migration baseline while adding persistent authored selection IDs and commands.
