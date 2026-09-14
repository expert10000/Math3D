# Shared command envelopes and pure transactions

F03 introduces the minimum cross-domain command contract used by the later runtime
kernel.  It does not migrate a current UI/store mutation path and does not add event,
query, or history services; those remain F04 work.

## Versioned envelope

A schema-v1 command envelope is strict canonical JSON:

```json
{
  "schemaVersion": 1,
  "commandId": "topology-edge-17",
  "origin": {
    "kind": "interactive",
    "sourceId": "topology-editor",
    "actorId": "local-user"
  },
  "command": {
    "type": "topology.edge-identify",
    "payload": {
      "edgeId": "e17",
      "partnerId": "e23"
    }
  },
  "diagnostics": {
    "issuedAt": 1789410000000,
    "correlationId": "gesture-42"
  }
}
```

`commandId` is supplied by the caller; shared core does not consult a clock or random
source.  `origin.kind` is one of `interactive`, `script`, `import`, `replay`,
`migration`, `system`, or `legacy`.  The command type is a lowercase namespaced name.

Only `command.payload` reaches a registered validator and projector.  Origin and
diagnostic fields are inspectable context, not scientific execution inputs.  Unknown
fields, unsupported versions, functions, class instances, accessors, sparse arrays,
cycles, and non-finite numbers are rejected.

## Legacy compatibility

The pre-F03 scene log used `{ id, timestamp, actor, command }`, with command arguments
beside `command.type`.  `normalizeCommandEnvelope` converts this in memory:

- `id` becomes `commandId`;
- `actor` becomes `origin.actorId` under the `legacy` origin;
- `timestamp` becomes diagnostic `issuedAt`;
- fields beside `type` become the normalized command payload.

`deserializeSceneProject` applies this adapter when a command log is present.  Opening
a file does not write it; a normalized envelope is persisted only through the user's
normal save/export flow.

## Pure transaction projection

`projectCommandTransaction` accepts an input state, an ordered envelope batch, command
definitions, and an execution mode.  Its contract is:

1. Clone and freeze canonical JSON input.
2. Validate the registry, every envelope, every command ID, and every normalized
   payload before invoking any projector.
3. Run projectors in command order against immutable candidate state.
4. Canonicalize and freeze each projected state before the next command.
5. Return the final candidate only after every projector succeeds.

An invalid envelope or payload invokes no projector.  A projection failure returns no
candidate state, and the caller's input remains unchanged.  Duplicate command IDs in
one transaction are rejected.  `scene.replace` is rejected in `interactive` mode and
is available only to a registered controlled `import` or `replay` path.

This function is a deterministic projector, not the runtime commit boundary.  F04
will own committed state, completed-fact events, queries, bounded history, and
subscription lifecycle.
