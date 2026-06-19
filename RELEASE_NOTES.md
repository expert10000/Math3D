# Math3D 1.4.6-beta.7

## Type
Beta stabilization release focused on renderer memory and startup behavior.

## Improved
- Bounded gallery thumbnail caching and image decode concurrency.
- Released inactive surface samples, calculated workbook fields, and procedural mesh caches.
- Replaced repeated full-workbook hash serialization with incremental deterministic hashing.
- Added underlying cancellation for worker-backed mesh and volume calculations.
- Lazy-loaded mode-specific viewers and reduced the bootstrap entry to under 1 KB minified.
- Added automated renderer memory diagnostics and repeated navigation stress coverage.

## Validation
- Renderer production build passes.
- Workbook, worker-contract, and Three.js lifecycle tests pass.
- Repeated Surfaces/Volume/Geometry/Curves/Topology navigation passes memory thresholds.
- WebGL context creation/disposal remains balanced after stress navigation.

## Beta limitations
- `pygalmesh` remains optional; robust CGAL meshing requires a build containing that native dependency.
- The large workspace module is deferred but still requires further component extraction before a stable release.
- This candidate must pass installed Debian-package smoke testing before publication.

## Known limitations
- Some extension features remain experimental.
- Full parametric geometry is planned for a later release.
- Deep mesh editing remains outside this release scope.
