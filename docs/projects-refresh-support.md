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

## Mobile mixed projects and Graph editing

**Projects → New Project → IMPORT → Math3D project** accepts
complete checkpointed named projects, mixed-workspace/handoff checkpoints and
desktop `math3d.project-package` files with verified source bytes.
Named-project JSON is retained byte-for-byte. Other checkpoint envelopes receive
a named container with every document, relation, result, artifact reference and
saved script intact. **Documents and relations** is available on saved cards;
mixed cards open that view. **Edit Graph** opens an unarchived Graph whose current
and historical table resources are available; other documents remain previews.

The library uses schema 4; schemas 1–3 migrate through the atomic backup writer.
Named JSON and checked Graph tables, Mesh buffers and Volume payloads are retained
in one atomic record. Packages are bounded to 25 MiB. **Import project resources**
is available on mixed-project cards and attaches bytes only to the same saved
workspace version. Import resource packages as mixed projects to edit their
Graphs; legacy single-Graph cards retain their existing save path. Corrupt or conflicting
resources reject without replacing existing work. Sources shows missing bytes.
Export/share returns the full named project and retained source resources.
Rename changes only project
metadata. Identity conflicts reject; duplicate requires a desktop identity fork.
Preview imports preserve current unsaved editor work before committing storage.
Preview imports never become startup editor fallbacks. An explicitly selected
Graph is retained for restart; each Graph has independent bounded undo/redo.
Switching and saving retain the complete enclosing project. A malformed import or failed save
keeps the existing library and editor.

Non-Graph replay must first be exported as **checkpoint JSON** on desktop.
Verified Graph replay can reopen directly. Missing source bytes block only the
affected Graph; Mesh/Volume resources are retained without enabling their mobile
editors. Analysis caches remain separate from source resources. Physical iOS
acceptance is a separate gate.
