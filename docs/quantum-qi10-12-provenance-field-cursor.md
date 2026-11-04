# QI-10–12: provenance, hydrogen field bridge, and Scientific Cursor

Implemented on 2026-11-04 against the pinned QWZ and hydrogen fixtures.

## QI-10: source, derivation, display

- `QuantumSceneDocument.identity.structuralHash` continues to cover only the immutable scene source descriptor. Camera, opacity, and selection are validated under `view` and can change without changing that hash.
- `QuantumDerivationRecord` binds sorted source dataset IDs and SHA-256 hashes to an algorithm, version, parameters, algorithm-version hash, and recipe hash. The density surface records its relative level and absolute threshold; color and camera stay display settings.
- The hydrogen field document stores the `complex-density` derivation separately from its source and slice view. Isosurface derivations are added to that document when a promoted field is displayed as a density surface.

## QI-11: bounded hydrogen bridge

- The first promotion is the single regular hydrogen complex ψ grid. It uses the existing `.qscene` importer and its byte verifier. The mapping explicitly declares `scientific-scene/v1` compatibility, Cartesian axes, units, origin, spacing, and last-axis-fastest sample order. The source datasets remain in the original bundle.
- `QuantumFieldDocument` is a native Project `field` checkpoint. Source identity includes the verified scene descriptor and field mapping; display orientation, slice index, and quantity are separate view state. Project references and relink update the document location without changing its source identity.
- Reopen verifies the saved fingerprint and source descriptor before displaying. Exact probes and slices still call the quantum source verifier. Missing or changed sources are withheld. The Project pack retains the external `.qscene` reference.
- This narrow bridge supports the hydrogen complex family. QWZ curvature and generic scalar promotion remain candidates after their own coordinate and exact-sample admission tests. It does not route `.qscene` bytes through the generic `.sscene` reader.

## QI-12: Scientific Cursor

- The renderer bus owns sequence numbers and retains the last coordinate-aware cursor. Projections never republish, avoiding feedback loops.
- QWZ band vertices and Berry-curvature cell centers have different grids. On view switch, the desktop verifier scans the exact target coordinates, chooses the nearest sample with a documented lowest-index tie rule, and reports the offset and number of equally near candidates. A later exact-sample read confirms the selected target coordinate.
- Hydrogen slice selections publish a physical Cartesian point. Orthogonal slices project it to an exact target grid sample, or report an outside, ambiguous, mismatched-grid, or incompatible-source status.

## Verification

- Typecheck and main/renderer builds passed.
- Focused contract tests cover source hash invariance, derivation tampering, SSR mapping, exact hydrogen probing, Project round-trip and relink, source refusal, cursor sequence and coordinate mismatch.
- Electron tests cover QWZ linked cursor projection and hydrogen promotion, cursor sync, recipe display, Project save, restart, and view restoration.
