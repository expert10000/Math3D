# Theory Lab scene handoff fixtures

These four regular `.qscene` folders were produced by the local Theory Lab checkout at
`fde58fd` on 2026-10-05. Its supervised native worker computed default SSH and QWZ
topology jobs. The Lab saved each run with `RunStore.record`, then exported standard
and bands views with `RunStore.prepareSceneHandoff`. Each folder is the exact
read-back-verified output of that handoff; no metadata or binary file was edited.

`npm run test:quantum-scene:import` verifies all four through Math3D's independent
reader, checks source hashes, coordinates and units, and rejects a damaged copy.
The source result hashes prove integrity against the supplied bytes, not producer
identity. These fixtures contain generated scientific data, not user runs.

Post-v0.1 producer fixtures also include the original fixed-coefficient BHZ
`-bands.qscene` and an additive `bhz_general` pair. The latter pair was
exported by Theory Lab's `scripts/export-bhz-general-fixtures.ts` from one
hash-verified worker run. `bhz-general-producer-result.json` is the exact
saved result used by both the continuum and lattice/ribbon bundles; each
scene has its own fingerprint and retains the same result SHA-256. Their
energy arrays are checked against that result and altered binary bytes are
refused. None of these generated fixtures contains a Math3D physics solver.

The BBH bands and finite-density pair was exported by Theory Lab's
`scripts/export-bbh-fixture.ts` from one saved worker run.
`bbh-producer-result.json` is its exact result. The density is the mean over
four finite midgap eigenstates, measured per open-lattice cell. This is a
finite-system observation and supplies no quadrupole invariant.

The separate `bbh-wilson` bundle was exported from a newer, independently
verified Theory Lab run by `scripts/export-bbh-wilson-fixture.ts`.
`bbh-wilson-producer-result.json` is its exact saved result. Four occupied
Wilson-center branches, nested-sector polarizations, and bulk/Wannier gap
conditions come from the producer. The quadrupole is reported only while the
required gaps remain open. The older BBH pair remains frozen and still makes
no invariant claim; Math3D computes none of these quantities.

The Kitaev BdG bands and finite end-density pair was exported by Theory
Lab's `scripts/export-kitaev-fixture.ts` from one saved worker run.
`kitaev-producer-result.json` is its exact saved result. The density is the
mean particle/hole probability of two finite near-zero eigenstates at each
open-chain site. End weight is a finite-system observation; no winding or
Z₂ invariant, Majorana classification, or material conclusion is supplied.

The newer `kitaev-invariant-producer-result.json` and its `-kitaev-invariant.qscene`
bundle come from Theory Lab's `scripts/export-kitaev-invariant-fixture.ts`.
The producer independently checks Pfaffian signs and the sampled real-pairing
chiral winding. The pinned scene carries exact BdG curve and momentum samples,
their source hash, conditional values and validity status. Math3D only inspects
these supplied values. The older bands and finite-density bundles stay frozen.

The separate `run-19f513c1ee9d4d1f8716a590fc7f1dc0-pump.qscene` was
exported by Theory Lab's `scripts/export-rice-mele-pump-fixture.ts` from a
verified closed-cycle run. `rice-mele-pump-producer-result.json` contains the
exact saved result whose SHA-256 is embedded in the scene. Two band surfaces,
plaquette phases and Wilson polarizations preserve exact source samples. The
conditional occupied Chern and polarization winding are producer claims for
ideal adiabatic transport of a filled band; neither finite-speed current nor
finite-chain edge motion is supplied. The earlier static Rice–Mele pair is
unchanged and makes no pump claim.

The separate `run-91b9adc301184ef9be91ea7fe2b7af73-finite-pump.qscene`
was exported by `scripts/export-rice-mele-finite-fixture.ts` in Theory Lab.
`rice-mele-finite-producer-result.json` holds the exact saved result whose
SHA-256 the scene references. Exact time series and time–momentum current
samples are supplied with units and convergence diagnostics. The finite-speed
charge is not a quantized invariant, and no finite-chain edge motion is supplied.
