# Math3D 1.4.6

## Type
Stability release based on the clean Math3D 1.4.5 line.

## Added
- Added a renderer memory guard for heavy 3D viewer workloads.
- Added a paced navigation and memory diagnostic runner for hardware, disabled-GPU, and SwiftShader comparisons.

## Improved
- Tolerates normal first-viewer warm-up memory spikes before recovery actions.
- Suppresses the autosave recovery prompt after guard-triggered performance recovery reloads.
- Keeps hardware acceleration as the preferred release/default path.

## Fixed
- Fixed premature reload loops caused by transient renderer memory peaks.
- Fixed stale/blank recovery behavior during guarded reloads.
- Avoided SwiftShader as a release confidence path after it proved unstable during first heavy surface warm-up.

## Known limitations
- Deep Three.js viewer lifetime cleanup remains the next priority.
- Disabled-GPU mode remains slower and can produce test actionability delays.
- SwiftShader is not recommended for this release path.
