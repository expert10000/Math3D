# AC-01: accepted Project compatibility boundary

Decision: accept the implemented supported-format boundary for M3D20-01b. A generic named Project schema-v2 downgrade is outside this milestone. This is an explicit scope decision, not a passing downgrade test or a waiver of required integrity checks.

Math3D **application version 2.0** continues to serialize named `math3d.project` documents with **schemaVersion 1**. Scientific `math3d.project-package` **schemaVersion 2** adds verified scientific manifest/component sidecars; its nested named Project remains schema v1. These version axes must not be conflated.

## Required acceptance

1. Load a supported named Project v1 in Math3D 2.0 and save/reopen it as Project v1. Retain its Project ID, document identities, unchanged-content hashes, saved results, references and selections. Do not manufacture legacy provenance or infer byte availability from a reference.
2. Explicit legacy selection migration retains the Project ID and saved document/resource references; authored selection IDs are deterministic and migration is idempotent. An intentional semantic edit may advance revision and content hash: it must not retain a stale hash to appear backward compatible.
3. Ordinary package v1 and scientific package v2 import/export preserve the nested supported Project, selections and verified resource bytes. Required scientific sidecars must be present and correct; missing or corrupt bytes must block activation/import safely.
4. Reject an unsupported/future named Project schema v2. Do not relabel a package version, strip newer required capability fields, selections or resource references, or synthesize bytes to produce a supposed v1 downgrade.

## Explicit unsupported cases

There is no general named Project schema-v2 writer/downgrade API, and no certification that an older released v1 application can understand every newer capability. Keep an untouched original file or supported portable package for transfer. Legacy mixed-workspace adoption has no prior named Project identity to preserve; explicit independent import/copy creates its own owner according to the existing identity rules.

The old shorthand `v1 → v2 → v1` is replaced by the required cases above. It must not be presented as proof of a nonexistent schema transition. Existing evidence remains historical and tied to its original semantic version. Changing the AC-01 definition requires new applicable execution evidence; neither a documented exclusion nor an impact review alone is an executed PASS.

## Executable scope and provenance

`acceptance/m3d20-gaps/format.ts` checks five concrete cases: supported named-Project v1 identity/result/hash retention; ordinary package v1 roundtrip; deterministic legacy selection migration; scientific package v2 selection/resource roundtrip; future-schema and missing-required-resource rejection. Existing Project migration, transfer and resource regression suites retain their own scope.

The real-runtime and Windows-native workflows default to the triggering source commit and run again on the merge to `main`. A manual `source_sha` can explicitly select another source; reports retain the distinct harness/workflow commit. PR-head, historical-source and merge executions are never interchangeable. The format test accepting this supported boundary does not certify native runtime recovery, signed installation, full architecture acceptance or a release-readiness baseline.
