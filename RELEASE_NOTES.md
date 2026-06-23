# Math3D 1.4.7

## Type
Linux package and stability release based on the clean Math3D 1.4.5 line.

## Added
- Added Linux release packages for x64: AppImage, deb, and rpm.
- Added Linux package smoke coverage for Ubuntu 22.04 build compatibility.
- Added release artifact checksums for Linux packages.

## Improved
- Linux package metadata now describes Math3D as a full 3D mathematics workspace rather than an old narrow viewer.
- Linux release artifacts use explicit platform names: AppImage, deb, and rpm.
- Packaged Linux builds use the bundled Python worker executable on Linux.
- Keeps the renderer memory guard behavior for heavy 3D viewer workloads.

## Fixed
- Fixed Ubuntu 22.04 worker compatibility by building Linux packages on Ubuntu 22.04.
- Fixed Linux Electron preparation by using native unzip on Linux CI.
- Fixed Linux CI smoke launch by allowing the required no-sandbox path in CI.
- Suppresses the autosave recovery prompt after guard-triggered performance recovery reloads.

## Verified
- Ubuntu 22.04: deb install, AppImage launch, bundled worker health.
- Fedora 44: rpm install, AppImage launch, bundled worker health.
- Arch Linux rolling: AppImage launch and bundled worker health.

## Known limitations
- Deep Three.js viewer lifetime cleanup remains the next priority.
- SwiftShader remains a diagnostic fallback, not the preferred release confidence path.
