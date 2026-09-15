# Topology kernel command migration

## T05 production boundary

The fundamental-diagram editor is the first Topology workflow routed through the
shared application kernel.  Existing editor helpers remain pure candidate builders;
completed source changes cross `TopologyDiagramCommandAdapter` as versioned
`topology.source.replace` commands.

| Interaction | Kernel behavior |
| --- | --- |
| Add/remove/rename a cell, edit an attachment, or edit JSON | One reversible source transaction |
| Import a topology source | One controlled irreversible import transaction |
| Undo/redo | Kernel inverse/forward replay, reflected into the current React view |
| Vertex pointer move | Transient preview only |
| Vertex pointer release | One reversible source transaction for the final position |
| Hover, pending edge start, panel/view state | Transient UI state; no command |

The shared command registry also defines pairing edits, committed canonical-cell
selection, canonicalization requests, and analysis requests.  Requests are bound to
the exact topology source revision/hash.  Source and pairing changes advance the
document identity once, clear committed selection, and invalidate canonical,
analysis-result, and display-realization references.

## Compatibility and next migrations

Released topology files, renderer-side quotient construction, legacy imported
history, and all 3D realization code remain compatibility adapters.  A workflow may
leave that boundary only after fixture parity proves identical authoritative source
and canonical output.  The next migrations should replace legacy imported-history
fallback, then connect the shared canonicalize/selection/analysis intents to their
respective services.  No hover or per-pointer-move event is eligible for persistence.
