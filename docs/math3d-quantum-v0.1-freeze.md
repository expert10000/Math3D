# Quantum Lab → Math3D v0.1 release profile

**Profile frozen for review on 2026-10-21; M3D-Q10 release sign-off is still
partial.** This freezes what may be claimed by the existing implementation;
it does not turn untested browser functionality or future Hamiltonian families
into release features. The source inventory and topological decision are in
[`math3d-q08-fixture-audit.md`](math3d-q08-fixture-audit.md).

## Interchange and fixture freeze

| Boundary | v0.1 decision |
| --- | --- |
| Theory Lab → Math3D | A portable `.qscene` **directory** containing `bundle.json`, `scene.json` and only declared binary artifacts; no direct worker connection or private Lab state. |
| Bundle envelope | `quantum-scene-bundle/v1`, exact `scene.json` path, byte count and SHA-256. |
| Scene schema | `quantum-scene/v1`; `quantum-scene/v2` is accepted for the pinned 1D reciprocal extension. Unknown majors are refused. The four topological study fixtures are v1. |
| Producer adapter | `qvis/1`; provenance includes run/job IDs, model, engine/version, time and source result SHA-256. A hash proves byte integrity, **not** producer identity. |
| Binary datasets | `f64le` only, scalar or 3-component records. Dataset count, byte length, unit and SHA-256 must match exactly. Complex fields use separately declared real and imaginary datasets; field order is `xyz-z-fastest`. |
| Object vocabulary | Supplied point clouds, polylines, segments, vectors and meshes; scalar/complex regular fields; optional lattice, reciprocal, bands and topology metadata. Display tessellation/LOD is not a new scientific value. |
| Topological models | QWZ curvature + bands and SSH finite chain + bands only. The fixed corpus is the four `.qscene` folders in `tests/fixtures/quantum-scene`; `src/main/quantumScene/examples.ts` pins each fingerprint. |
| Other fixed examples | Five hydrogenic orbital bundles under `tests/fixtures/quantum-scene-orbitals`; these prove fields, not additional topological profiles. Synthetic lattice/vector/large-band fixtures prove bounded rendering mechanics, not other models. |
| Limits | `scene.json` and `bundle.json` at most 128 KiB each; declared binary datasets at most 16 MiB in aggregate; schema limits include 64 datasets, 64 objects, four fields and a 49³ field grid. The independent importer rejects unexpected files, links, length/hash/shape mismatches, unsupported encodings and over-budget scenes. |
| Persistence | Project/workspace stores compact references and fingerprints, not source arrays. Reopen/relink re-verifies exact external bytes; missing or changed sources are unavailable rather than silently replaced. |
| Migration | Keep explicit v1/v2 readers. No implicit conversion of a newer or unknown schema; adding a family, field, encoding or version requires reviewed producer fixtures, independent parity/negative tests, and an updated matrix. Remove a reader only after a separate compatibility decision and migration evidence. |

The corpus is pinned by the current source tree, not by model name alone. Its
QWZ pair shares run `run-97a132d1d712414bb62bb8c9212f517e` and result
SHA-256 `abbcae23a0bb3fe113205cab2ffd769c8c22c79f83cd4369215aba24328d9713`.
Its SSH pair shares run `run-145ac3f06cb940c28d457937345b0243` and result
SHA-256 `e58086ffcf87011885959d47b3a386882bfd6dbefdf9d71363841830b96b31a0`.
The four scene fingerprints are distinct and must never be substituted by
matching a title or model name.

## Desktop/browser capability matrix

| Capability | Math3D Electron desktop | Math3D browser | Theory Lab browser |
| --- | --- | --- | --- |
| Import a local `.qscene` folder with independent hash/shape admission | **Yes**, native picker and pinned examples | **No**: Math3D's importer is an Electron main-process API; the shared renderer reports desktop-only | **Yes**, its own browser bundle reader and file-folder input; this is not Math3D import |
| QWZ/SSH linked study profile and exact source-backed pick | **Yes**, four paired pinned bundles | **No** | Theory Lab has its own scene viewer, not the Math3D linked-study UI |
| Theory Lab **Open in Math3D** from a verified run | **Yes**, absolute `.qscene` folder handoff to Electron | **No** browser handoff | May create/export the scene, but does not run Math3D in the browser |
| Orbital slice, density surface and Volume previews | **Yes**, five pinned field bundles | **No** Math3D `.qscene` viewer | Its own field viewer supports saved scenes |
| Keep a verified scene link in a Project and reopen/relink by fingerprint | **Yes** | **No** for `.qscene` sources | Separate Theory Lab saved-run workflow |
| Direct Math3D physics worker or Math3D-side topology computation | **No** | **No** | Theory Lab computes through its own backend, not through Math3D |

The browser columns are deliberately separate: Theory Lab's web scene path
does not provide evidence for a Math3D browser importer. Math3D's browser
build shares application UI but does not expose `window.quantumScenes`; its
File command reports that verified quantum import is desktop-only. No browser
topological profile or browser round trip is claimed in v0.1.

## Release evidence and remaining gates

`npm run test:quantum-scene:import` checks pinned examples, independent
admission, coordinates/units, source hashes, tampering, bounded scene types,
and negative cases. The QWZ/SSH Playwright studies check matched-view
selection and changed-byte refusal. Q09 desktop tests cover native picker,
pinned example, actual Lab button, export/import, restart, relink and tamper
refusal. Run those tests against the release commit and retain the CI run URL.

The **contract/fixture matrix above is frozen**; final M3D-Q10 sign-off is not
yet asserted. It needs a maintained green CI run of the quantum gate at the
release commit. The browser capability boundary is exercised by
`npm run test:quantum:browser`: no Electron import API is present and the
`.qscene` command explicitly reports desktop-only availability. The broader Q08
families remain out of v0.1; they are not blockers for the QWZ/SSH scoped
profile, but must not appear in release claims.

## User path and known limits

In Theory Lab, save a supported run, open **Scenes**, select its verified view,
then use **Open in Math3D**. In Math3D desktop, use **File → Open Theory Lab
quantum scene (.qscene)** for a bundle directory, or **File → Verified quantum
examples** for the pinned examples. The similarly named `.sscene` command is
the separate generic scientific interchange, not a quantum bundle reader.
QWZ and SSH study controls link only exact same-run verified companions.
Missing/tampered data are refused. A Project link holds a location and
fingerprint, not a portable copy of the scientific arrays; move the source and
use exact-hash relink. There is no Math3D-side recomputation, arbitrary
topological-family parser, or automatic phase classification.
