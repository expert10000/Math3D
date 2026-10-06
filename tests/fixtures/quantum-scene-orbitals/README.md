# Real Theory Lab orbital scene fixtures

These regular `quantum-scene/v1` bundles were exported from five immutable
hydrogenic runs made by the Theory Lab Python worker on 2026-10-06. The worker
used the native SciPy 1.18.1 engine and the existing QVIS scene adapter. They
are pinned compatibility inputs for Math3D, not Math3D-computed orbitals.

| Folder | Stored inputs | Expected feature |
| --- | --- | --- |
| `orbital-1s.qscene` | `n=1, l=0, m=0, Z=1, basis=complex, radius=8 a0, grid=21` | Central density `1/π a0^-3` |
| `orbital-2s.qscene` | `n=2, l=0, m=0, Z=1, basis=complex, radius=12 a0, grid=21` | Central density `1/(8π) a0^-3`; radial sign and phase jump visible at 1% density threshold |
| `orbital-2p.qscene` | `n=2, l=1, m=1, Z=1, basis=complex, radius=16 a0, grid=21` | Origin node; phase undefined at the node |
| `orbital-3p.qscene` | `n=3, l=1, m=1, Z=1, basis=real_cos, radius=24 a0, grid=21` | Real-harmonic positive/negative sign and phase 0/π |
| `orbital-3d.qscene` | `n=3, l=2, m=2, Z=1, basis=complex, radius=18 a0, grid=21` | Complex phase traverses all eight display bins |

`bundle.json` and each dataset SHA-256 are verified before preview. The
Math3D test checks stored inputs and source units, central samples and nodes,
the bounded 21×21 display plane, and sign/phase bins on bounded density
isosurfaces. The files contain supplied amplitudes; density and phase colors
are visualization-derived. These fixtures cover the named 1s–3d family but
do not complete source locate-back or native project admission.
