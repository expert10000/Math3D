# QI-34–36 implementation evidence · 2026-11-05

## QI-34 · Quantum and native overlay

Project quantum scene rows now open a read-only overlay with a saved Mesh or Geometry document. Each open re-verifies the external `.qscene` source through the desktop importer. The overlay accepts only an identity coordinate transform: the native document must declare a frame, the operator must confirm its name, and all three axes, units, and handedness must exactly match the quantum scene. No implicit unit conversion or mixed-axis plot overlay is offered. Promoted Geometry and Mesh copies carry that frame declaration when the quantum scene has three equal spatial units (for example orbital scenes in `a0`).

Both layers have independent visibility and opacity. A shared Z slab clips triangles and line segments, and filters points. Mesh picks state the owning layer, mesh key, face and coordinate. Source links open each owning document. The 500,000-vertex limit applies before clipping. The source bundle and native documents remain unchanged. The overlay state is transient; saved compositions and non-identity transforms remain future work.

## QI-35 · DevShell worker diagnostics

DevShell's desktop-five Theory Lab repository card now probes worker `hello`, `health`, `capabilities`, and `resources` through a configured Python environment. It checks a native two-level fixture twice against the analytic eigenvalues and shows the worker version and a reproducible energy SHA-256 in Health check. The Python CLI can write a JSON report and optionally run the acceleration benchmark with its numerical and repeatability gates. See DevShell `docs/quantum-runtime-diagnostics.md` and its Windows report. The dashboard's probe is deliberately short; the full worker suite remains a separate release check.

## QI-36 · Portable opening across hosts

The existing `.qpack` path stores `scenes/<fingerprint>.qscene` references, content-addressed blobs, and a project hash. The Math3D unit test relocates a two-scene QWZ + native Geometry pack, opens it through `openQuantumProjectPack`, verifies both scene fingerprints, and rejects changed blobs. It now also opens with `QLAB_PYTHON` pointed at a nonexistent worker and checks that the serialized Project has no Windows `.qscene` drive path.

The same exported pack was inspected and reconstructed with `scripts/verify_quantum_pack.py` on Windows and Ubuntu/WSL without a Python science worker. Both hosts reported two scenes and project SHA-256 `f000549200aff3f035c2c356865e1f140ae98a9a17003f0a889afd4b2ec4e36f`. The Linux check verifies portable bytes, relative references, and JSON reconstruction; a native Linux Math3D UI open was not run because this host has no Linux Node/Electron runtime. Mobile/web consumption remains read-only design work: previously computed scene data can be displayed only when a verified scene importer is available, while the current web UI reports the missing desktop capability.
