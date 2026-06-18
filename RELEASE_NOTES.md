# Math3D 1.4.6-beta.4

## Type
Beta build for Linux/VMware graphics stability and selected extension stability.

## Added
- Added selected extension subset.
- Added/improved dependency tree workflow.
- Added safer handling of construction dependencies.
- Added VM-safe graphics mode for Linux Electron builds.
- Added clearer renderer/GPU crash diagnostics for white-screen reports.

## Improved
- Improved geometry workflow stability.
- Improved object selection and inspector synchronization.
- Improved scene state persistence.
- Improved main-window state messaging after renderer shutdown.
- Reduced WebGL pressure in 3D viewers when VM-safe graphics mode is active.

## Fixed
- Fixed crashes caused by stale dependencies.
- Fixed UI desynchronization after object deletion.
- Fixed selected-object refresh after recomputation.

## Known limitations
- Some extension features remain experimental.
- Full parametric geometry is planned for a later release.
- Deep mesh editing remains outside this release scope.
