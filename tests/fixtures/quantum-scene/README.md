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
