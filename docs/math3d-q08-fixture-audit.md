# M3D-Q08 fixture audit and v0.1 topological scope

Audited 2026-10-21 against the Math3D and Theory Lab checkouts. This is an
inventory of **producer-supplied, hash-verified scene data**, not a list of
Hamiltonians that Math3D can compute. Math3D remains a read-only consumer.

## Fixture inventory

| Family | Portable producer fixtures in Math3D | Supplied quantities | v0.1 topological study profile |
| --- | --- | --- | --- |
| QWZ | `tests/fixtures/quantum-scene/run-97a132d1d712414bb62bb8c9212f517e.qscene` and its `-bands.qscene` companion | 2D lower-band Berry-curvature samples, Chern result/status/method, reciprocal guides, two band surfaces and worker bulk gap | **Supported**: paired bands/curvature view and exact stored-sample inspection |
| SSH | `tests/fixtures/quantum-scene/run-145ac3f06cb940c28d457937345b0243.qscene` and its `-bands.qscene` companion | Finite-chain sites, `t1`/`t2` bonds, midgap-pair density, winding result/status/method, two 1D bands and worker bulk gap | **Supported**: paired chain/bands view and exact stored-sample inspection |
| BHZ | None | No Theory Lab QVIS result-to-scene adapter or pinned Math3D bundle | Not supported |
| BBH | None | No Theory Lab QVIS result-to-scene adapter or pinned Math3D bundle | Not supported |
| Kitaev | None | No Theory Lab QVIS result-to-scene adapter or pinned Math3D bundle | Not supported |
| Weyl | None | No Theory Lab QVIS result-to-scene adapter or pinned Math3D bundle | Not supported |
| Nodal families | None | No Theory Lab QVIS result-to-scene adapter or pinned Math3D bundle | Not supported |
| Landau/Hall | None | Theory Lab has a Landau–Zener dynamics model, **not** a Landau-level or Hall producer scene | Not supported |

The four QWZ/SSH folders are actual Theory Lab `RunStore.prepareSceneHandoff`
exports from revision `fde58fd`, not hand-authored model illustrations. They
are listed in `src/main/quantumScene/examples.ts` with fixed fingerprints,
explained in `tests/fixtures/quantum-scene/README.md`, and imported by
`scripts/test-quantum-scene-import.mjs`. Each pair has the same run ID and
result SHA-256; its two scene fingerprints differ because the views are
different. `tests/e2e/quantum-qwz-study.spec.ts` and
`tests/e2e/quantum-ssh-study.spec.ts` exercise the linked, re-verified views
and changed-byte refusal. The currently pinned four are `quantum-scene/v1`;
the reader also accepts the separate `quantum-scene/v2` 1D reciprocal extension.

Five hydrogenic `.qscene` bundles (1s, 2s, 2p, 3p, 3d) exist under
`tests/fixtures/quantum-scene-orbitals`. They support the orbital/field path,
not another topological family. Generic lattice, reciprocal, Bloch and vector
contract fixtures and the non-quantum `.sscene` fixtures likewise do not
establish BHZ/BBH/Kitaev/Weyl/nodal/Landau-Hall physics support.

Theory Lab's scene producer is currently limited by
`packages/quantum-scene/from-result.ts` and `bands.ts`: its topology adapters
are SSH and QWZ. A generic contract that can carry supplied objects, bands or
quantities is not evidence that a named model's numerical producer exists.

## Agreed v0.1 supported set

For **M3D-Q08 topological study profiles**, freeze the supported model set to
**QWZ and SSH** with their four pinned bundles. All other named families stay
in the Q08 roadmap as future expansion, not hidden or relabeled as complete.
The supported claims are limited to the quantities in the table. In
particular, Math3D does not infer band inversion, edge/bulk phase, nodes,
Berry connection, or a phase diagram from a visual shape. The QWZ curvature
surface is not an FHS plaquette array; SSH open-chain density is not a Berry
connection. A Chern or winding value is shown only with its producer status
and method. Both profiles refuse mismatched or tampered companion bundles.

A new family can enter a later reviewed support set only after a producer
supplies at least one bounded, portable `.qscene` bundle with declared units,
coordinates, result hash, model parameters, status/method for any invariant,
and stable sample IDs; the independent Math3D importer accepts it; a
source-backed inspector and negative/tamper test pass; and its browser/desktop
capabilities are recorded. No Math3D-side physics calculation is an admission
shortcut.
