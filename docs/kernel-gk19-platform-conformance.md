# GK19 platform and execution conformance

The general platform snapshot is `@math3d/core` schema v1 and is separate from the
F08 scientific-backend discovery snapshot. Host adapters probe facilities; the
kernel does not infer access from a runtime label. An unavailable facility has an
explicit reason. `guardScientificBackendForPlatform` suppresses unsupported
operation advertisements and rejects execution before backend transport.

| Runtime | Evidence in this gate | Limit |
| --- | --- | --- |
| Browser | Built web renderer and Chromium UI smoke; shared workspace shows browser snapshot and absent desktop bridges | No native dialogs or host filesystem |
| Desktop | Electron UI save/reopen/replay/lineage test and worker-failure test; shared workspace shows desktop snapshot | Optional compute engines discovered separately |
| Mobile | Expo adapter uses shared v1 schema and mobile TypeScript gate; common SceneProject serializer is consumed by mobile storage | No device/emulator run in this gate; DOM, browser Web Worker, desktop files/dialogs not advertised |
| Worker | Pure worker adapter probe and worker failure-injection UI test | No DOM, dialog, or nested-worker claim |
| Remote | Contract fixture only | No shipped workspace server |

The GK19 command runs domain adapter conformance, job/broker cancellation,
deadline and stale-source tests, selection, artifact, dependency, mixed replay,
and tests for Geometry, Mesh, Surface, Curve, Volume, Topology, and Complex
adapters. It then typechecks desktop and mobile, builds the desktop and web
renderer, and exercises Electron and Chromium UI. The worker-failure test covers
failure recovery in the shipped desktop worker route. Fixture rows prove contract
shape and admission behavior, not a claim of execution on physical mobile
hardware or a remote service.

On this Windows development host the `.venv-worker` environment has VTK and
pygalmesh/native CGAL. `npm run test:kernel:gk19:optional-backends` passed the
VTK sphere/triangle reference checks, CGAL geodesics, and real-mesh Boolean
smoke. Sage is not installed; no Sage parity is claimed. The optional suite is
not a required CI gate when native dependencies are absent. WebAssembly remains
covered by existing feature-specific tests rather than a generic GK19 backend
adapter; any future adapter must advertise operations and limits through F08.

Run `npm run test:kernel:gk19` for the required gate and
`npm run check:kernel:boundaries` for layer directions. A physical mobile runtime
and installed Sage are additional release-environment checks, not silently
treated as passing by these fixtures.
