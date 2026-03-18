# Web App

This app entrypoint currently proxies to the existing Vite app in `renderer/`.

Planned migration target:

- `apps/web/src` owns browser-specific bootstrap and routing.
- Shared scene model and project format come from `@math3d/core`.
- Rendering and scene construction are pulled from `@math3d/renderer`.
