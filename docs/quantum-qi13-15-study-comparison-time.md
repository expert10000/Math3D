# QI-13–15: studies, comparisons and time scenes

## QI-13: saved study graph

`math3d.quantum-study/v1` is an optional, bounded collection in the mixed Project workspace. A study stores the exact saved run and result hash, an ordered set of independently verified scene fingerprints with roles, per-panel selected object and sample index, a layout, and an exact-source coordinate link rule. Normalization refuses panels outside the Project, duplicate sources, changed run or result identities, and invalid selections. Individual `QuantumSceneDocument`s remain ordinary Project entries and can be opened alone.

Theory Lab's QWZ handoff remains `quantum-study-handoff/v1`. Its additive Hofstadter `v2` handoff includes bulk bands and finite strip scenes from one saved result that has strip observations. Math3D verifies each bundle and role before admitting either into a Project. The Project view displays the saved panels and lets a reviewer open each source and change its stored object selection. A study with changed or missing source bytes cannot be reopened through the exact scene link.

## QI-14: verified A/B comparison

The Project A/B control reopens both exact scene references. It requires the same model, coordinate axes and units, aligned band coordinates and band identity, or matching field grids and amplitude units. It reports parameter metadata differences and mean absolute, root mean square, and maximum absolute residuals for every aligned sample. Bands include a bulk gap delta. Complex fields compare probability density, never raw real or imaginary amplitudes, because their phase is gauge dependent. Unsupported quantities and mismatches yield explicit incompatibility reasons without a numeric difference.

## QI-15: physical time contract

An additive `quantum-scene/v2` `time` object references one scalar time dataset with a declared unit, unique frame IDs, aligned tracks, and playback bounds. The scene verifier requires strictly increasing finite times and one sample per track per frame. It does not interpolate. Theory Lab's driven two level adapter emits a Bloch trajectory and a Pauli σz expectation series from the same artifact rows, including irregular grids. Math3D independently verifies the source, loads exact frame samples once, and uses one frame index for the 3D Bloch marker and a separate time plot. A time cursor can project to another exact timeline by frame identity or matching physical value and unit.

## Verification

- Math3D: Project study roundtrip and Hofstadter selection tests; exact handoff rejection; A/B alignment and gauge tests; irregular time frame tests; cursor projection tests; main and renderer builds and typecheck.
- Theory Lab: typecheck and build; deterministic irregular time scene test. The existing worker-backed scene suite requires a ready local Python worker and is not a gate for this contract change.

The first comparison surface covers aligned bands and single fields. Other physical quantities need declared alignment rules before subtraction. Study object selections persist; numerical cross-panel projection for Hofstadter bulk and strip remains guarded by the absence of a one-to-one physical sample map.
