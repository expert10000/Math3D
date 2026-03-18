# Desktop App

This app entrypoint currently proxies to the existing Electron shell in the repository root.

Planned migration target:

- `apps/desktop/src` owns Electron main/preload runtime.
- Scene/project I/O uses the shared `@math3d/core` format.
- Browser renderer loaded by Electron comes from `apps/web`.
