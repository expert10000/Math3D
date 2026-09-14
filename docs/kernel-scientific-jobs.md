# Revision-safe scientific jobs

F05 introduces a structured scientific-job contract in `@math3d/core` and an
in-process reference lifecycle in `@math3d/kernel`.  Existing browser, Electron,
Python, Sage, CGAL, and other workers remain behind their current adapters until a
later migration; none becomes a required runtime capability in F05.

## Source generation guard

Every request carries one immutable source guard:

- stable document ID;
- positive source revision;
- SHA-256 structural hash;
- positive artifact generation.

The job service resolves the current guard before admission, at cooperative progress
checkpoints, and immediately before successful publication.  All four fields must
match.  Missing or changed source state returns `source-unavailable` or
`stale-source`; no successful result or completed event is published.

## Request and limits

A schema-v1 request contains a caller-owned deterministic job ID, source guard,
namespaced allowlisted operation plus canonical-JSON payload, and these limits:

- absolute `deadlineAt`;
- `maxInputBytes` and `maxOutputBytes` over canonical UTF-8 JSON;
- cooperative `maxMemoryBytes` reservation;
- cooperative `maxWorkUnits` consumption.

The adapter registry maps operation semantics to an implementation.  Requests never
carry executable functions, worker commands, shell source, or unrestricted evaluator
text.  An adapter receives only the normalized payload, source guard, limits, and a
narrow execution context.

## Lifecycle and cancellation

`submit` returns a promise for one structured success or failure.  The service races
adapter completion against cancellation and a scheduled hard deadline, so it does
not wait for an uncooperative adapter to return.  Late output is observed safely but
ignored.  Cooperative adapters use `checkpoint`, `reportProgress`, `consumeWork`,
`reserveMemory`, and `releaseMemory` to stop earlier and enforce declared budgets.

Lifecycle listeners receive immutable, monotonically sequenced submitted, progress,
completed, failed, cancelled, timed-out, or stale-rejected facts.  Listener failures
are isolated and cannot change job state or prevent later listeners from observing an
event.  A job emits at most one terminal fact.

## Result and failure boundary

A successful result repeats the job ID, operation type, exact source guard, canonical
output, and measured output bytes.  Failures use stable codes for invalid requests,
unsupported operations, unavailable/stale sources, cancellation, deadline, input,
output, work, memory, and adapter errors.

F06 will wrap publishable scientific results in the common provenance, epistemic
status, engine/version, parameter, precision/tolerance, diagnostics, and artifact
envelopes.  F05 results deliberately remain the minimal revision-safe execution
contract.
