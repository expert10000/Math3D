# M3D-Q08 fixture audit and v0.1 topological scope

Audited 2026-10-21 against the Math3D and Theory Lab checkouts. This is an
inventory of **producer-supplied, hash-verified scene data**, not a list of
Hamiltonians that Math3D can compute. Math3D remains a read-only consumer.

## Fixture inventory

| Family | Portable producer fixtures in Math3D | Supplied quantities | v0.1 topological study profile |
| --- | --- | --- | --- |
| QWZ | `tests/fixtures/quantum-scene/run-97a132d1d712414bb62bb8c9212f517e.qscene` and its `-bands.qscene` companion | 2D lower-band Berry-curvature samples, Chern result/status/method, reciprocal guides, two band surfaces and worker bulk gap | **Supported**: paired bands/curvature view and exact stored-sample inspection |
| SSH | `tests/fixtures/quantum-scene/run-145ac3f06cb940c28d457937345b0243.qscene` and its `-bands.qscene` companion | Finite-chain sites, `t1`/`t2` bonds, midgap-pair density, winding result/status/method, two 1D bands and worker bulk gap | **Supported**: paired chain/bands view and exact stored-sample inspection |
| BHZ | `tests/fixtures/quantum-scene/run-b918512202b94cfaa0e181c9afd1f158-bands.qscene` (added after the v0.1 freeze) | Producer-computed four bulk bands on a 21 × 21 grid, sampled bulk gap, two block Chern values, spin-conserved Z₂ status and exact source coordinates | **Bounded post-v0.1 extension**: read-only four-band view and exact sample inspection; fixed `A=B=1`, `ε=0` lattice slice only |
| Atlas BHZ continuum and ribbon | `tests/fixtures/quantum-scene/run-c53d91611dd34bac80a93f9b56f0e74e-continuum-bands.qscene` and its `-lattice-bands.qscene` companion | Variable A/B/C/D/M and optional R, four continuum and four lattice bands, conditional inversion Z₂, finite-ribbon eigenvalues and outer-cell weights | **Additive post-v0.1 profile**: two read-only verified views and exact band-sample inspection; the complete eigenvectors remain in the source Theory Lab run |
| BBH | `tests/fixtures/quantum-scene/run-4fb258a3692f40479c097181ca9d779a-bands.qscene` and its `-bbh-finite.qscene` companion | Four periodic bulk bands, sampled bulk gap, four finite midgap energies, and exact mean cell densities | **Bounded post-v0.1 extension**: read-only bands and finite open-lattice density; corner localization is an observation, not a quadrupole invariant |
| BBH nested Wilson | `tests/fixtures/quantum-scene/run-7f366d57030b42c88d1c4afa89e059fe-bbh-wilson.qscene` | Four occupied Wilson branches, nested sector polarizations, explicit bulk/Wannier gap diagnostics and conditional quadrupole from a newer verified producer run | **Bounded post-v0.1 extension**: read-only exact branch samples and producer invariant/status; no Math3D computation or inference from corners |
| Kitaev | `tests/fixtures/quantum-scene/run-18145016435540afafc5a2a06870566f-bands.qscene` and its `-kitaev-finite.qscene` companion | Two exact periodic BdG energy paths, bulk gap, and per-site mean density of a finite near-zero pair | **Bounded post-v0.1 extension**: read-only bands and finite open-chain end density; no topological invariant or Majorana classification |
| Weyl | None | No Theory Lab QVIS result-to-scene adapter or pinned Math3D bundle | Not supported |
| Nodal families | None | No Theory Lab QVIS result-to-scene adapter or pinned Math3D bundle | Not supported |
| Landau/Hall | None | Theory Lab has a Landau–Zener dynamics model, **not** a Landau-level or Hall producer scene | Not supported |

The four original QWZ/SSH folders are actual Theory Lab `RunStore.prepareSceneHandoff`
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

Theory Lab's scene producer in `packages/quantum-scene/from-result.ts` and
`bands.ts` now also accepts its bounded BHZ worker result. The pinned BHZ
bundle is a real worker computation exported by `scripts/export-bhz-fixture.ts`;
the accompanying `bhz-producer-result.json` preserves the exact producer
result and SHA-256. The independent Math3D importer and UI tests check the
four bands, source attribution, and changed-byte refusal. A generic contract
alone remains insufficient evidence for any named model.

## Agreed v0.1 supported set

For **M3D-Q08 topological study profiles**, freeze the supported model set to
**QWZ and SSH** with their four pinned bundles. This historical v0.1 set is
unchanged. BHZ, BBH and Kitaev were admitted as bounded post-v0.1 producer-first extensions;
all other named families stay
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

## Post-v0.1 BBH admission (2026-10-25)

Theory Lab computes a bounded four-orbital BBH Hamiltonian and a finite open
square lattice. Its worker tests independently assemble the periodic and open
matrices, verify spectra and boundary conditions, and check exact corner
localization in the finite sample. Two scenes come from the same immutable
saved result: four periodic bands and per-cell mean density of the four
finite midgap eigenstates. `bbh-producer-result.json` retains its result hash.

Open **File → Verified quantum examples → BBH** and choose either view.
The band inspector reads exact stored momentum/energy samples. The finite
inspector reads exact stored density samples with cell coordinates and units.
Each selection re-verifies the source bytes. The view reports finite-system
corner localization only; it does not calculate or claim a quadrupole
invariant, edge state classification, or phase boundary.

The newer **BBH · nested Wilson quadrupole** example is a third, independent
producer result and does not retroactively change the frozen bands/corner pair.
It carries the four occupied Wilson-center branches and the producer's nested
sector polarizations. The quadrupole is 0 or 1/2 only with open bulk and
Wannier gaps; it is undefined when those conditions fail. Math3D inspects
stored branch samples and displays the source result hash, method and status.
Restart and changed-byte refusal are covered by the BBH Wilson desktop test.

## Post-v0.1 Kitaev admission (2026-10-25)

Theory Lab independently tests a spinless nearest-neighbor BdG periodic
Hamiltonian and a finite open-chain matrix, including particle–hole symmetry,
boundary truncation, and bulk gap closing. Two `.qscene` views come from one
immutable saved result: exact periodic momentum/energy samples and the mean
site density of a finite near-zero particle-hole pair. The pinned
`kitaev-producer-result.json` preserves that result's exact bytes and hash.

Open **File → Verified quantum examples → Kitaev** and choose either view.
Band and site inspectors select the exact stored sample and reverify its
source bytes. Project/recent reopening also rechecks the same fingerprint.
The profile labels end localization as a finite-chain observation. It makes
no winding, Z₂, Majorana, or material-specific claim. Math3D performs no
BdG calculation.

## Post-v0.1 BHZ admission (2026-10-24)

The Theory Lab worker independently calculates both 2 × 2 blocks of a
spin-conserving, time-reversal-paired four-band **lattice** BHZ regularization.
It tests the four-by-four spectrum and partner pairing against a separately
assembled Hamiltonian, phase regions and gap closures, and bounded job/schema
rejection. The producer reports block Chern values using the link-variable
method and a spin-conserved Z₂ parity only when its mesh phase checks pass.
The scene carries those producer values and all four supplied band surfaces;
Math3D does not calculate a topology invariant. The Atlas continuum BHZ model
is broader than this fixed-coefficient lattice slice, so this does not close
that Atlas gap or imply support for arbitrary BHZ parameters, edge states,
eigenvectors, spin mixing, or a phase diagram.

Open **File → Verified quantum examples → BHZ → BHZ · four bulk bands**.
The inspector shows the exact source run/hash, model limits, and selected
stored `k`/energy values. `scripts/test-quantum-scene-import.mjs` and
`tests/e2e/quantum-bhz-study.spec.ts` cover import, selection, and tampering.

## Additive Atlas BHZ continuum/lattice admission

Theory Lab's `bhz_general` worker supplies the Atlas continuum four-band
Hamiltonian with bounded A/B/M and explicit C/D dispersion. The lattice view
uses a declared `a=1` regularization and optional time-reversal- and
inversion-symmetric block mixing R. It includes a finite open-y ribbon;
Math3D displays the supplied eigenvalues and outer-cell weights without
computing or assigning an edge classification. One verified result produces
two scenes with separate fingerprints and the same source-run SHA-256. The
`bhz-general-producer-result.json` fixture records its exact worker result.

Open **File → Verified quantum examples → BHZ → BHZ · Atlas continuum bands**
or **BHZ · lattice and ribbon**. The inspector states the source parameters,
units, invariant status and finite-boundary limitation. The importer tests
compare exact band samples with the producer file and reject changed bytes.
The original fixed-coefficient BHZ fixture and the frozen QWZ/SSH v0.1
profile remain unchanged. Weyl, nodal and Landau/Hall are still
unsupported until their own independently tested producer scenes exist.
