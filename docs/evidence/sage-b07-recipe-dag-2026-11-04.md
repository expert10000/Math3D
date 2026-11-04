# SAGE-B07 reusable recipe graphs — 2026-11-04

## Delivered

CAS → Algebra → Recipes saves one bounded starter graph for the selected current structure. Starters use the typed B01 operations: construction followed by exact integer GCD and Smith/Hermite forms for `ZZ`, matrix analysis for `QQ`, modular inverse for `Z/nZ`, polynomial dossier and roots for direct `QQ[x]`, or factorization and Gröbner basis for direct `QQ[x,y]`. Unsupported domains retain a construction-only graph. A saved recipe can be reopened and run again.

The versioned graph is embedded in the `.math3d` Project and pins every stage to an object ID, revision, definition hash and typed request hash. Each dependency names its source stage and required output schema. The Project parser revalidates arguments against the pinned historical definitions and rejects duplicate stage IDs, missing or schema-mismatched edges, cycles, missing objects, altered hashes and oversized graphs. Running a stage uses the existing bounded request builder, so a historical or stale object cannot start a new run. Request hashes reconnect retained evidence to the correct stage after reopening.

The runner executes stages in dependency order through the shared Sage broker. It saves each successful stage result immediately as B05 Project evidence. A failure skips dependent stages while independent branches continue. Cancel stops the active job and leaves earlier completed evidence in the Project. A concurrent Project edit prevents the runner from overwriting newer bytes. The Recipes panel reports each stage's state and reason during the run; the graph and completed evidence persist after reopening.

In schema v1, typed edges require a predecessor's successful output schema before a stage starts. Stage arguments are fixed, validated recipe inputs; binding values from one result into another stage's arguments is a later extension.

## Acceptance

- Core tests roundtrip a four-stage DAG, reject duplicate/cyclic/missing/incompatible dependencies and altered arguments, preserve the graph across an object revision, reuse a graph for two complete runs, link stages across `ZZ` and `Z/12Z`, exercise failure with an independent branch continuing, and cancel after one completed stage while retaining its saved evidence.
- Starter tests check the supported object families and exclude polynomial operations over an unsupported finite-field parent.
- Desktop acceptance uses a controlled Sage HTTP worker: construction succeeds, GCD fails, and the independent integer-forms branch succeeds. It exports and independently parses the Project, then reopens the saved recipe and two retained evidence records after a desktop restart.
- Focused Vitest, desktop Playwright, typecheck, build and dependency checks are recorded in the implementation run. Docker Sage is unavailable on this PC; the controlled worker exercises the broker and Project persistence path.

## Next

**SAGE-B08** adds exact polynomial and matrix golden fixtures and failure cases across supported Sage runtimes.
