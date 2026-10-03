# Explicit saved-project refresh

Open **Projects → saved project → Manage saved project → Relations and
availability**. Refresh actions use current verified source documents and append
new targets/results. Use **Save changes** to retain them; project undo/redo can
reverse the additions. Original targets, relations and historical results remain.

## Construction adapters

**Create refreshed copy** supports Graph-to-Curve promotion and Graph revolution/
extrusion, plus Curve extrusion, revolution, ruled surface, loft, sweep and tube.
Curve constructions retain their saved parameter values and ordered source IDs.
New targets carry the current parent generations and are checked by the same
bounded numerical evaluator used when reopening the construction editor.

Missing parents, unsupported Curve evaluators, incomplete specifications, invalid
parameters and repeated copies of the same current generation reject without
mutation. Refreshing one target does not silently refresh its descendants.

## Analysis adapters

The panel offers operation-specific actions for these recorded local Graph
analyses:

| Action | Preserved input |
| --- | --- |
| Recompute derivative | Explicit object ID, x, order 1/2, tolerance |
| Recompute integral | Explicit object ID, interval, signed/absolute mode, tolerance |
| Recompute arc length | Explicit object ID, interval, tolerance |
| Recompute critical points | Explicit object ID and interval |
| Recompute intersections | Two ordered explicit object IDs and interval |

All use algorithm version 1 and the existing core algorithms. Recorded tolerance
is recovered from operation parameters or the numeric context; there is no
fallback to a new default. New publications retain the algorithm's actual
numerical/heuristic/unsupported authority and warnings. Historical authority is
not upgraded, and repeated current-generation publication rejects.

Other recorded operations and algorithm versions show a disabled action with a
reason. External engines, missing resource bytes, source deletion, and unsupported
geometry are not replaced with guessed results. Extending this registry is future
adapter work, separate from the delivered six Curve constructions and five Graph
analysis types.

## Mobile checkpoint previews

**Projects → New Project → Import file / Desktop project / Shared project** accepts
complete checkpointed named projects and mixed-workspace/handoff checkpoints.
Named-project JSON is retained byte-for-byte. Other checkpoint envelopes receive
a named container with every document, relation, result, artifact reference and
saved script intact. **Documents and relations** is available on saved cards;
preview cards open that view without activating editors.

The library uses schema 3; schemas 1/2 migrate through the atomic backup writer.
Preview export/share returns the full named project. Rename changes only project
metadata. Identity conflicts reject; duplicate requires a desktop identity fork.
Preview imports preserve current unsaved editor work before committing storage.
They never become startup editor fallbacks. A malformed import or failed save
keeps the existing library and editor.

Replay must first be exported as **checkpoint JSON** on desktop. Mesh/Volume,
point-table and analysis references can remain unavailable until their bytes are
transferred separately. Broader preview retention does not enable additional
mobile editors or prove physical iOS acceptance.
