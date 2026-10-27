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
| Kitaev bulk invariant | `tests/fixtures/quantum-scene/run-75fb3f43371e40d58fc0eda2e8c14fa1-kitaev-invariant.qscene` | Producer Pfaffian signs, conditional parity and sampled real-pairing winding, exact BdG curve and momentum samples | **Bounded post-v0.1 extension**: read-only exact inspection; undefined at a bulk gap closure; no finite-end inference |
| Weyl local cone | `tests/fixtures/quantum-scene/run-f8bf5412469c49b7bb878b8001d341cf-weyl.qscene` | Producer-supplied enclosing sphere, occupied-band Berry vectors, Wilson face flux, local chirality and conditional occupied Chern | **Bounded post-v0.1 extension**: read-only exact sample inspection; no periodic lattice, partner node, surface band or Fermi arc |
| Nodal continuum ring | `tests/fixtures/quantum-scene/run-404460538ac24288b4b1c0ee240551ee-nodal.qscene` | Producer-supplied ring, radial-z loop, both band energies and conditional linking-loop Berry phase | **Bounded post-v0.1 extension**: read-only exact sample inspection; no surface or drumhead state |
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
unchanged. BHZ, BBH, Kitaev and the local Weyl cone were admitted as bounded post-v0.1 producer-first extensions;
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

## Post-v0.1 Rice–Mele pump admission (2026-10-27)

The static Rice–Mele bands and open-chain scene remain separate from the
new `run-19f513c1ee9d4d1f8716a590fc7f1dc0-pump.qscene`. Theory Lab's
bounded cycle computes an occupied-band FHS Chern and independently checks
Wilson polarization winding on coarse and refined periodic meshes. It saves
the exact hoppings, stagger, energy samples, plaquette phases, gaps and
conditional status in an immutable run. The scene carries that result's hash.

Open **File → Verified quantum examples → Rice–Mele → filled-band pump**.
The read-only profile exposes exact band, plaquette and polarization samples,
producer status and units. Restart and changed-byte refusal are covered by
`tests/e2e/quantum-rice-mele-pump.spec.ts`. The supported claim is ideal
adiabatic transport for a filled band; no finite-speed current or finite-chain
edge motion is supplied or calculated by Math3D.

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

A newer **Kitaev · bulk Pfaffian and winding** example is a third, independent
source-linked view. It displays the producer's periodic BdG chiral curve and
conditional Pfaffian parity and real-pairing winding. Select a curve sample to
inspect its exact momentum and BdG coordinates. The producer withholds both
claims at a bulk gap closure and the winding on an unresolved mesh. The older
bands/end-density pair remains frozen with its original no-invariant label.
Restart and changed-byte refusal are covered by the invariant desktop test.

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
profile remain unchanged. Later nodal and Landau-level admissions are recorded
below; Hall transport remains unsupported.

## Post-v0.1 local Weyl admission (2026-10-25)

Theory Lab evaluates its pinned Atlas linearization `Hχ(q)=χv q·σ` on a
bounded, outward-oriented sphere. Worker Wilson face phases give the lower
band's enclosing flux; an independent geometric solid-angle check validates
every saved face before the run is accepted. The verified fixture uses
`χ=+1`, `v=1`, radius `1`, and 162 sphere samples. Its occupied Chern is
`-1`, while the node chirality is `+1` under the declared convention.

Open **File → Verified quantum examples → Weyl → Weyl · local enclosed node**.
The mesh and Berry arrows are producer data. Select a sphere sample to inspect
its exact `q` and radial Berry value in source units. The viewer rechecks the
bundle on opening, selection and restart; changed bytes are refused. The
local continuum model supplies no Brillouin zone, lattice partner, surface
states or Fermi arcs. Math3D does not compute the charge.

## Post-v0.1 continuum nodal-ring admission (2026-10-25)

Theory Lab evaluates the pinned Atlas two-band continuum Hamiltonian
`[m−B(kx²+ky²)]σx+vkzσz`. The source run stores 64 ring positions and a
64-sample radial-z loop with both band energies. Its gauge-invariant
occupied-band Berry phase is π for the linked fixture, checked against
independent d-vector winding and a doubled sample grid. At a loop/node
intersection the producer marks the phase undefined.

Open **File → Verified quantum examples → Nodal → Nodal · continuum ring and
Berry loop**. Inspect a loop marker for its exact supplied momentum and
upper-band energy. The lower band remains in the verified bundle. Import,
restart, selection and tamper tests reject changed source bytes. This
continuum model contains no surface calculation or drumhead state; Math3D
does not calculate the Berry phase.

## Post-v0.1 continuum Landau-level admission (2026-10-26)

Theory Lab solves a bounded 2D charged-particle uniform-field model. Its worker
checks a Landau-gauge finite-difference spectrum against the analytic ladder,
including charge and field reversals and a doubled-grid convergence check. An
immutable run records the signed field samples, exact level energies, units,
and both coarse and fine errors. The `.qscene` exports those values as five
level paths with exact sample markers and a source result hash.

Open **File → Verified quantum examples → Landau → Landau · continuum level
fan**, or **Open in Math3D** from the corresponding Theory Lab Scenes view.
Select a level marker to inspect its exact signed B, integer level index and
stored energy. The bundled producer result is
`tests/fixtures/quantum-scene/landau-producer-result.json`. Import, restart,
selection and changed-byte refusal are tested in both repositories. Math3D
does not calculate the levels. No filling, Hall conductivity, edge channel or
plateau is claimed; the Hofstadter lattice model is a separate future producer.

## Post-v0.1 Hofstadter magnetic-band admission (2026-10-26)

Theory Lab independently calculates a bounded square-lattice Harper matrix at
reduced magnetic flux `p/q`. The worker checks band count, flux reversal,
zero flux and a finer momentum grid. The pinned `p/q=1/4` source run saves four
bands on a 9 × 9 magnetic-zone grid with exact `p`, `q`, hopping `t`, momentum
and energy units, sampled gap and convergence diagnostics. Its `.qscene`
retains the immutable result hash and binary dataset hashes.

Open **File → Verified quantum examples → Hofstadter → Hofstadter · Harper
magnetic bands**, or **Open in Math3D** from the saved Theory Lab Scenes view.
Selecting a band surface gives the exact source `kx`, `ky`, energy, band and
dataset indices. The pinned producer result is
`tests/fixtures/quantum-scene/hofstadter-producer-result.json`. Import,
restart, exact selection and changed-byte refusal have desktop acceptance
coverage. Math3D only renders supplied bands. This historical fixture has no
Chern calculation; the displayed bulk gap is a sampled adjacent-band
separation, not a topological invariant.

## Post-v0.1 Hofstadter occupied-gap Chern admission (2026-10-26)

Theory Lab also supplies a separate `p/q=1/4` run with gauge-invariant
occupied-subspace plaquette flux on the magnetic Brillouin torus. It records
the coarse and refined momentum grids, sampled direct gap, minimum link
determinant and Chern convergence for each occupied-band gap. The central
touching gap is explicitly **undefined**; the two open gaps have integer
Chern values. This is a conditional bulk diagnosis separate from the
finite-grid energy spectrum. The source result and every binary dataset are
hash verified.

Open **File → Verified quantum examples → Hofstadter → Hofstadter · occupied-gap
Chern**. Select a flux plaquette to inspect its exact source grid index and
value in radians; select a band point to inspect its exact stored momentum and
energy. The pinned producer result is
`tests/fixtures/quantum-scene/hofstadter-chern-producer-result.json`.
Desktop acceptance covers import, exact selection, restart and changed-byte
refusal. Math3D does not calculate Berry flux or a Chern number. Open-boundary
edge spectra and Hall response at a specified filling remain separate future
producer calculations.

## Post-v0.1 finite Harper strip admission (2026-10-26)

Theory Lab separately diagonalizes an 18-site Harper strip open in x and
Bloch-periodic in y at reduced flux `1/4`. Its immutable run stores 17 exact
kᵧ samples, energy-sorted states, first/last two-site probability weights,
and eigenpair residuals. The source-linked scene contains two read-only point
sets with those weights. Their ±0.15 state-lane offsets are only a visual
separation; the source energy and kᵧ remain unchanged.

Open **File → Verified quantum examples → Hofstadter → Hofstadter · finite open
strip**, or select **Hofstadter finite strip** in Theory Lab Scenes and use
**Open in Math3D**. Inspect a left or right point to see its exact source
sample, energy, weight, unit and result hash. The pinned producer result is
`tests/fixtures/quantum-scene/hofstadter-strip-producer-result.json`.
Import, restart, exact sample inspection and changed-byte refusal have
desktop acceptance coverage. This finite-strip localization is distinct from
the periodic occupied-gap Chern result. No filling, Hall response, plateau,
or edge-channel classification is supplied or inferred by Math3D.

## Specified-filling Harper Hall admission (2026-10-26)

Theory Lab now supplies a separate pinned periodic Harper run with one of four
magnetic bands occupied. Its source result records a coarse and fine **global**
gap, a Fermi energy in that gap, the occupied FHS Chern number, a magnetic
Diophantine sign check, and the conditional ideal bulk conductance `−1 e²/h`
for reduced flux `1/4`. Math3D displays these exact source values beside the
verified band surfaces; it calculates no Hall response. The pinned result is
`tests/fixtures/quantum-scene/hofstadter-hall-producer-result.json`.

Open **File → Verified quantum examples → Hofstadter → Hofstadter · filled bulk
Hall response**. Selecting a band point reveals its exact stored energy,
momentum, dataset index, source run and hash. Restart and changed-byte refusal
are covered by the import and Electron tests. The existing finite strip stays
separate. This is an ideal clean-model bulk value, with no experimental plateau
or classification of individual finite-strip edge channels.
