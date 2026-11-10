# M3D20-01d — Shared architecture freeze proposal

**Prepared:** 2026-11-07. **Review state:** ready for architecture review; approval is still required for the M3D20-01 exit criterion. This record builds on [the contract inventory](CONTRACT_INVENTORY.md). It freezes ownership and extension rules for 2.0 work; it does not certify a 2.0 release candidate.

## Canonical ownership

| Concern | Owner | Extension rule |
| --- | --- | --- |
| Project ID, Notes, Workbook references, scene references, algebra collections | `Math3DProject` in `math3dProject.ts` | Add versioned Project fields or references through its validator and migration. Never wrap it in another owning Project envelope. |
| Documents, source checkpoints, saved results, artifact manifest, relations, scientific selections | `MixedWorkspaceDocument` in `mixedWorkspace.ts` | Add a discriminated document or bounded collection with a checkpoint/replay validator. Keep one workspace source for document/result relationships. |
| Document revision and structural hash | `DocumentIdentity` in `documentIdentity.ts` | Preserve stable ID, exact revision, and canonical structural hash. Project revision does not substitute for a document generation. |
| Derived lineage | `DocumentRelation` in `documentRelations.ts` | Record exact source generations and typed targets; resolve current/stale/broken/unavailable from those identities. Never infer lineage from names or coordinates. |
| Saved result evidence | `AnalysisResultEnvelope` in `analysisResults.ts` | Publish through the existing source-generation check; reference artifacts by handle. A Result Card is a view over this envelope and artifact availability. Renderer analysis state remains a transient producer, not a second saved registry. |
| Jobs and operations | `ScientificJobRequest`/service and `MATH3D_WORKER_OPERATION_REGISTRY` | Add an operation ID and host implementation to existing catalogs. Do not add a generic runner. Worker success, resource integrity, and mathematical authority remain separate. |
| Host facilities | `PlatformCapabilitySnapshot` | Probe the actual host. Runtime names alone do not establish availability. |
| Project-owned mathematical selections | `ScientificSelection` v1 and `projectScientificSelections.ts` | Preserve saved authored IDs and explicit legacy migration. A future v2 must have a separate migration and reader. |
| Committed viewer entities | `ViewerCommittedSelection` | Only committed source-linked entities may be saved. Hover, preview, and Inspector focus remain ephemeral. |
| Source and artifact bytes | Project package/sidecar verifier and kernel resource store | Keep bytes under existing resource owners. Study, Result Card, and adapter records reference verified hashes and report absent bytes. |

Legacy `math3d.scene-project`, Project handoff, and workspace handoff remain explicit transport/compatibility inputs. They do not replace `Math3DProject`. `QuantumStudyDocument` remains its existing domain-specific model while a general Project-owned Study record is designed; no rename or automatic reinterpretation is authorized by this freeze.

### Result publication receipt

`math3d.result-publication/v1` is a derived export view, not a saved result owner. It carries a module and result ID, exact source identity where known, a recorded producer claim, a separate independent-check statement, source qualification and a bounded summary. A `withheld` or `preview` receipt has a null summary and an explicit omission. Module-specific evidence formats can include this receipt while retaining their existing schemas. CSV writers use the same two-column escaping rule; formula-like cells are neutralized before spreadsheet import. The receipt never upgrades a producer result to a proof or silently reopens external bytes at export time.

## Cross-module adapter contract

`packages/core/src/crossModuleAdapterRegistry.ts` defines a **version 1 declarative registry**. Each descriptor names its source/target workspace module, selection kind, source/target frame IDs, ordered axes with dimension and unit, versioned mapping ID and accuracy, required host facilities, and optional existing worker operation ID. Descriptors are validated, bounded, and unique by ID. They contain no document bytes, result payload, execution function, or new persistence owner.

Qualification takes a selection bound to an exact `ScientificSourceGeneration`, the current source generation, a target module/frame, a host capability snapshot, and caller-supplied checks for source-resource integrity, operation availability, and mapping implementation. A qualified link requires all applicable checks to pass. Missing checks disable the link with a machine-readable code and user-facing reason. In particular:

- A declared mapping is not an executable mapping. The host must report the matching mapping ID and version as implemented before `enabled` is true.
- Frame ID, frame kind, axis order, dimensions, and units match exactly at this boundary. Conversion requires a distinct declared, versioned mapping; visual proximity or identical numeric coordinates do not qualify.
- A source hash/revision/generation mismatch disables propagation. A missing or unverified pinned resource disables propagation. The local selection stays usable.
- An operation listed in the worker catalog still needs a host availability check. The catalog describes intent; it does not certify the runtime.
- The mapping's `accuracy` is a declaration for presentation. It does not confer `exact` or `certified` result authority; saved results retain their own status.

`crossModuleSelectionAdapters.ts` binds an existing saved `ScientificSelection` v1 to a current workspace generation only when its pinned checkpoint matches the document ID, revision, and structural hash. It also adapts a committed viewer entity selection with an explicitly supplied source module and frame. Unpinned legacy slots, dataset selections without a workspace generation, hover, and preview do not silently become linked coordinates. A later dataset adapter needs an explicit resource/fingerprint resolver and a versioned mapping.

The registry is a qualification layer over the existing Project, workspace, selection, job, operation, and host capability contracts. It is not a second owner for any of them. UI code may enumerate descriptors for `Open in…` and cursor linking, then pass only a qualified mapping request to the appropriate existing producer. Actual mapping implementations, relationship creation, and result publication need separate tests and reviews.

## 2.0 extension and migration rules

1. **Version before migration.** New persisted fields require explicit schema versioning, validation, byte/count bounds, and a read path for supported 1.x inputs. Preserve the original source on migration failure. A new generic Study must reference existing Project/workspace IDs and coexist with `QuantumStudyDocument` until a reviewed migration exists.
2. **Preserve exact evidence.** Any derivation, handoff, result, or publication must carry the document ID/revision/hash and, where relevant, resource checksum and generation. Reopen must validate checkpoints and replay against expected identity. A divergent replay is an error, never a regenerated source.
3. **Separate status axes.** Execution outcome, source/resource freshness, and mathematical authority are independent. `exact`, `certified`, `numerical`, and related result statuses cannot be inferred from a successful job or available artifact handle. Historical/stale/missing views retain metadata and state their limitations.
4. **Keep selection lifetimes distinct.** UI hover and preview are transient; committed viewer entities are source-linked; saved `ScientificSelection` is Project-owned. A Scientific Cursor coordinates qualified references and uses origin tokens to prevent update loops; it does not become a generic persisted point.
5. **Extend existing owners.** Add module documents through workspace validators, result types through `AnalysisResultEnvelope`, worker operations through the operation catalog and job service, and resources through package/sidecar verification. Do not introduce parallel Project, saved result, job, or resource registries.
6. **Test compatibility as data.** Keep legacy/current serializer fixtures and invalid ID/hash, replay, resource, and frame cases. A passing parser alone is insufficient for a 2.0 journey; save/reopen and host-limited paths need acceptance evidence at the release commit.

## Review and implementation limits

The focused M3D20-01c suite reads the existing GF-01 legacy Project fixture, migrates selections, serializes/reopens the current Project, and rejects invalid Project hashes and divergent workspace checkpoints. The new adapter fixtures cover version 1 and a future-version refusal, while tests cover stale generations, units/frames, resources, host facilities, operation availability, and missing mapping implementations.

This series does **not** implement an `Open in…` command, a cross-module coordinate transform, a general Study, a result card, or full serializer migration. The 1.x scene/handoff and external resource corruption paths still need their own 2.0 golden corpus and end-to-end acceptance. Architecture approval and exact release-commit certification remain open.
