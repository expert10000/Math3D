# Native CGAL worker: Phase 3A release review

Status (2026-09-28): **public GPL distribution selected; standalone native
executable packaging remains gated on its source bundle and SBOM**. This is a
technical/license inventory, not legal advice or approval to distribute. The
existing Electron installer configuration still excludes `native/cgal-worker`
and `build/native/cgal-worker`; packaged desktop builds continue to select the
Python compatibility worker when the native executable is absent.

## Reviewed local reference build

The `x64-windows` vcpkg installation used for Phase 3A reports CGAL 6.2.1,
GMP 6.3.0, MPFR 4.2.2, and Boost Core 1.92.0. The native executable's build
directory includes `gmp-10.dll` and `mpfr-6.dll`. These are recorded in
`native/cgal-worker/dependency-manifest.json`; `npm run
verify:cgal-native-distribution` checks the local versions, DLL presence, and
the installed corefinement header's SPDX marker. This is a *reference-build
check*, not a complete transitive-dependency SBOM or a cross-platform pin.

| Component used by the worker | License finding | Distribution consequence to resolve |
| --- | --- | --- |
| CGAL Polygon Mesh Processing corefinement | Installed `CGAL/Polygon_mesh_processing/corefinement.h` identifies `GPL-3.0-or-later OR LicenseRef-Commercial`; [CGAL's package overview](https://doc.cgal.org/latest/Manual/packages.html) identifies Polygon Mesh Boolean Operations as GPL. | Choose and document a GPL-compliant distribution plan or obtain a commercial license covering the exact packages and release. Merely running CGAL in a separate process is **not** treated here as a license exemption. |
| CGAL supporting headers | CGAL contains both GPL and LGPL packages; see the [CGAL license page](https://www.cgal.org/license.html) and the installed package's per-file headers. | Inventory the headers actually compiled and their dependencies; do not infer a single license for all of CGAL. |
| GNU MP (GMP) | [GMP's copying terms](https://gmplib.org/manual/Copying.html) offer LGPL-3.0-or-later or GPL-2.0-or-later. | Select a distribution path, include required notices/source access, and review linking/replacement obligations for the shipped DLL. |
| GNU MPFR | [MPFR's current manual](https://mpfr.org/mpfr-current/mpfr.html) states LGPL-3.0-or-later and describes source/re-link requirements for distribution. | Carry license/source information and verify replacement/re-link support for the shipped DLL. |

CGAL's [license explanation](https://doc.cgal.org/latest/Manual/license.html)
states that software distributed based on GPL-covered CGAL components has GPL
source-distribution obligations, while commercial licenses are available.
Math3D now declares GPL-3.0-or-later for the combined distribution and
preserves its earlier Apache-2.0 terms separately. That resolves the selected
open-source license direction, but each installer still requires exact source,
notices, an SBOM, and qualified review of its actual dependency closure. This
document intentionally does not assert that process isolation settles a
licensing question.

## Technical conformance added

`npm run test:cgal-native-release` uses the tracked Fandisk and Spot Cow OBJ
fixtures directly. It checks nonempty, oriented closed-manifold results and
volume relationships for intersection and difference; rejects the open
Stanford Bunny; then kills the worker during an active real-mesh job and
verifies queued restart. It separately cancels an active job plus a queued job
and checks that a new worker starts healthy. The small cube protocol suite
remains at `npm run test:cgal-native-worker`.

These local tests do **not** yet prove a packaged executable's dependency
closure, notices, source offer, signatures, or clean-machine behavior.

## Explicit release gate

Before adding `native-cgal` to `electron-builder.config.cjs` or any other
installer path:

1. Apply the selected public GPL-3.0-or-later compliance plan to the standalone
   worker and review GMP/MPFR obligations and all transitive native
   dependencies as part of the same release closure.
2. Produce a version-pinned dependency lock, SBOM, license texts/notices,
   corresponding source or source offer where required, and reproducible
   build instructions. Confirm the exact DLLs and redistributables included
   for each target platform.
3. Build the worker and installer in CI, run the real-mesh/crash/cancellation
   corpus against the packaged executable on a clean machine, and verify that
   the app still works through Python when the native executable is absent.
4. Change the distribution manifest status and packaging policy only in the
   same reviewed release change. Until then,
   `scripts/cgal-native-distribution-gate.cjs` rejects native CGAL resources
   in the Electron configuration and the bundling opt-in flag.

Important adjacent audit: `python/worker/freeze.py` conditionally collects
CGAL Python bindings and `pygalmesh` into the existing frozen Python worker.
In the inspected local build,
`build/python-worker-dist/worker/_internal` contains `CGAL`, `cgal.libs`,
and `pygalmesh-0.10.7.dist-info`. The local Python environment's metadata
identifies the CGAL wheel as `6.0.1.post202410241521` with a GPLv3+ classifier
and `pygalmesh` as GPL-3.0-or-later; the frozen `CGAL` directory also contains
GMP/MPFR DLLs. These versions are distinct from the new standalone worker's
vcpkg versions. Keeping that worker as the compatibility fallback does **not**
itself resolve the licensing of CGAL components already present there. Audit
that frozen-worker dependency tree, notices, and actual release artifact
separately before treating the entire installer as license-cleared. This Phase
3A gate only prevents adding the new standalone executable without approval.
