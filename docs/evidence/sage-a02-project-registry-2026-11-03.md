# SAGE-A02 Project algebra registry acceptance — 2026-11-03

## Implemented contract

The optional `algebraObjects` Project field stores one entry per project-local object ID, with immutable A01 records in ascending revision order and a recoverable archive flag. Older `.math3d` Projects without this field retain their existing serialization and identity hash. Project content hashing includes the registry; every existing Project update retains it.

The registry validates record hashes, unique object IDs, contiguous revisions, stable kind per ID, exact parent revisions and an acyclic dependency graph. Creation/upsert is idempotent only for an identical saved revision. Renaming creates a new revision, forking creates a separate ID and history, and archiving keeps definitions available to dependents until recovery.

## Independent file gate

The gate creates `Q` and `R = QQ[x,y]` in a Project, exports them through the normal `.math3d` Project file path, copies the resulting bytes, then imports them through the independent Project preview path. It checks the exact Project identity, object IDs, definitions, `Q@1` parent reference, revision histories, hashes and byte-stable re-export. An algebra-only Project imports as a saved preview; direct workspace activation still requires a scene document and awaits the Structures UI gate.

Duplicate IDs, duplicate or conflicting revisions, and missing parent revisions are rejected before import. Legacy Projects without the registry still parse. The registry has no visible Structures panel yet; that is A06. Parent changes do not yet mark dependents stale; that is A03.

## Verification

- Project registry, A01 schema, Project transfer, resources, library, resume, Notes and the newly merged Mesh comparison starter tests — 70 passed across eight test files.
- `npm run typecheck:noemit` — repository TypeScript gate passed.
- `npm run build:core` — desktop core and renderer build passed.
