# Topology replayable persistence

T11 upgrades normal `.math3d-topology` saves to renderer format v3. The file embeds
the shared-core `TopologyDocument`, a bounded command replay record, compact
scientific result metadata, and artifact references. It does not embed sparse
matrices, meshes, sampled grids, or other cache payloads.

## V3 contents

The v3 payload contains:

- the authoritative source model with stable document ID, revision, and structural
  hash;
- a source-only command checkpoint plus the normalized forward and inverse command
  envelopes for each retained transaction;
- a replay cursor so saving after undo preserves the redo branch;
- checkpoint, per-transaction, and current-state structural hashes;
- the current T03 canonical-complex hash;
- compact F06 result envelopes for T07 local `Z/2Z`, T08 exact `Z` when present,
  and T10 surface classification;
- references to T06/T08 artifacts, explicitly marked unavailable because their
  payload bytes are not embedded; and
- the current Topology view and animation plan.

Result references in the shared `TopologyDocument` must correspond exactly to the
embedded compact envelopes. Each result and artifact reference must match the
document ID, revision, source hash, and generation.

## Replay and validation

Loading validates the complete file before changing the workspace. Replay starts at
the source-only checkpoint, projects every normalized command in replay mode,
verifies each recorded state hash and inverse source, then applies inverse commands
above the saved cursor. The resulting source, document identity, revision, and hash
must match the persisted `TopologyDocument`.

The restored command adapter reconstructs the kernel undo and redo stacks from this
same log. The renderer recomputes its derived display model from the replayed source;
serialized caches are never promoted to authority.

The loader rejects:

- unknown or unsupported schema fields/versions;
- divergent or malformed commands and invalid inverse records;
- checkpoint, transaction, or final hash mismatches;
- stale compact results;
- unmatched result references;
- embedded or fabricated artifact availability; and
- replay output that differs from the persisted authoritative source.

## Missing artifacts and compatibility

V3 saves handles and lineage only. After reopen, omitted artifact payloads are shown
as **unavailable** with a recompute opportunity. Compact exact result metadata remains
inspectable, but the user must rerun the analysis before artifact-backed inspection.
Resaving an unchanged session preserves current compact results.

Released v1 and v2 files remain readable through their existing migration paths.
V1 caches are ignored and recomputed. V2 fingerprints are verified, but pre-F06
results remain legacy-limited. Opening either format does not rewrite the source
file; it becomes v3 only through the user's next normal save action.
