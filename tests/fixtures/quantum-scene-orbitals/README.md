# Real Theory Lab orbital scene fixtures

These regular `quantum-scene/v1` bundles were exported from two immutable
hydrogenic runs made by the Theory Lab Python worker on 2026-10-06. The worker
used the native SciPy 1.18.1 engine and the existing QVIS scene adapter. They
are pinned compatibility inputs for Math3D, not Math3D-computed orbitals.

| Folder | Stored inputs | Expected feature |
| --- | --- | --- |
| `orbital-1s.qscene` | `n=1, l=0, m=0, Z=1, basis=complex, radius=8 a0, grid=21` | Central density `1/π a0^-3` |
| `orbital-2p.qscene` | `n=2, l=1, m=1, Z=1, basis=complex, radius=16 a0, grid=21` | Origin node; phase undefined at the node |

`bundle.json` and each dataset SHA-256 are verified before preview. The
Math3D test checks stored inputs and source units, an exact central sample,
the 2p node, and the bounded 21×21 display plane. The files contain supplied
amplitudes; density and phase colors are visualization-derived. These two
fixtures do not complete M3D-Q02's broader 1s–3d and isosurface acceptance.
