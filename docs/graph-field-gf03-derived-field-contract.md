# GF-03 — DerivedFieldDocument and Project chain

**Status:** shared contract and Project fixture implemented, 2026-11-04.

## Saved model

`math3d.derived-field-document/v1` records exactly one operation: `vector-magnitude`, `plane-slice`, or `line-profile`. A Project's optional `derivedFields` collection holds a bounded chain. Each document has a stable ID and a structural hash of its pinned input, operation and output. Its input records the exact source or parent document ID, revision and structural hash, plus a physical shape: scalar/vector rank, axis indices, names, units and bounds, and vector component units when applicable. Slice and profile operations save fixed physical coordinates; profiles also save extent, sample count and interpolation policy. Derived outputs are recomputed by the validator, so a saved unit or domain cannot disagree with its operation.

The first chain is vector field → magnitude scalar volume → orthogonal plane scalar field → scalar line profile. Magnitude requires matching component units. Slice/profile require scalar inputs and coordinates inside the physical domain. Project validation requires each dependency in the Project, rejects duplicate IDs, cycles, more than eight operations, or a shape mismatch against a current pinned parent/source. A source revision may advance while a saved recipe retains its old pin; that Project remains readable and the chain becomes stale. Existing `ScientificFieldDocument` scalar dataset recipes are unchanged.

## Admission and withholding

`appendProjectDerivedField` admits an operation only when its vector source and all ancestors match their saved generations and the host's source verifier returns true. The host must use its existing resource verification path for scientific bundles; the contract does not infer verified bytes from a Project document identity. `reviewProjectDerivedField` returns `current`, `stale`, `missing`, or `unverified`. Only `current` yields a bounded recipe cache key. `currentProjectDerivedFieldResult` releases a supplied numerical result only when that key still matches, so source edits and failed verification withhold values. This slice saves intent and admission state; numerical sampling and job publication are subsequent work.

Explorer reads the collection through `buildProjectExplorer`; Explorer and Graphs can both use `listProjectDerivedFields` and `projectDerivedFieldsForDocument`. Project save retains the collection while only part of the workspace is loaded. Project import advertises `project.derived-fields.v1`. Deleting a vector document with a dependent derived chain is blocked.

## Review fixture

`tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d` is a normal Project containing the GF-01 source and GF-02 selections plus three GF-03 documents. Regenerate or check it with `npx tsx scripts/write-gf03-derived-field-fixture.ts [--check]`. `tests/unit/projectDerivedFields.test.ts` checks exact Project save/reopen, source generations, units, domains and operation parameters; rejects incompatible units, rank, domain and cycles; and confirms cached values are withheld when the source changes or is unverified. Project transfer tests check retention under partial editor capture.
