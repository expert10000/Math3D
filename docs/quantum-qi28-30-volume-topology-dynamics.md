# QI-28–30: volume, topology geometry and dynamics

Implemented 2026-11-05 across Math3D and Theory Lab.

## QI-28 Volume

The quantum Volume view converts a verified regular grid to ephemeral x-fastest float32 samples. It adds amplitude, transfer presets for direct volume and maximum projection, an optional second isosurface threshold, and central clipping. The source-coordinate bounding box is shown with units. The Volume renderer reports its GPU plan or CPU slice fallback; rendering controls and derived meshes do not enter the source document. Phase remains a masked slice only, since a cyclic phase is not an isosurface scalar. This stage reuses the existing GPU plan, CPU fallback and VTK/CPU isosurface paths.

## QI-29 Topology geometry

The scene view groups only source-declared BZ boundary objects, k-paths, integration surfaces and node/gap markers. Each group can be hidden without changing its verified scene. The catalog names exact object IDs and reports producer-supplied charge/gap invariants separately. A geometric marker or enclosing surface alone is not a charge calculation. Existing reciprocal coordinate selection continues to report source sample IDs and units.

## QI-30 Dynamics

Theory Lab's saved evolution view already links population plots, the Bloch sphere, density matrix and observable readouts through one run-and-sample time cursor. It now also shows a Hann-windowed discrete spectrum derived solely from recorded P₁ samples. This is a sampled response in cycles per model time unit, not an energy spectrum. The solver evidence panel identifies the completed saved grid and its SHA-256. The result contract does not provide an early-termination reason or uncertainty estimate, so neither is invented.

Verification covers source overlay classification, GPU fallback planning, saved response frequency and grid refusal, builds and desktop quantum Volume controls.
