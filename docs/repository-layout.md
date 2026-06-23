# Repository Layout

This page describes what each top-level folder is for in the Math3D repository.

## Active project folders

- `.github/workflows/` - CI/CD workflows (build, test, release, docs).
- `analysis/` - generated architecture/dependency analysis artifacts.
- `apps/` - runtime shells (`apps/desktop`, `apps/web`).
- `data/` - optional local-only demo/reference assets; keep large generated files out of the default deploy path unless they are intentionally published.
- `docs/` - MkDocs content and generated API docs inputs.
- `gallery-images/` - gallery source captures and generated thumbnails.
- `packages/` - shared workspace packages (`core`, `renderer`, `ui`, `workbook`).
- `py/` - Python geodesic/math modules used by worker flows.
- `python/` - Python worker runtime, protocol handlers, freeze/build scripts.
- `renderer/` - React/Vite renderer app source.
- `scripts/` - repo automation scripts (build/test/release helpers).
- `src/` - Electron main/preload runtime source.
- `tests/e2e/` - Playwright end-to-end tests.
- `wiki/` - local copies/material for project wiki docs.

## Legacy / optional folders

- `legacy/` - older prototype/runtime code kept for reference.
- `output/` - generated local outputs/artifacts (non-core source).

## Important note about `tariff-transformation/`

`tariff-transformation/` is not part of the Math3D app/runtime pipeline.
It is a leftover scaffold and should be ignored for Math3D development,
build, testing, and release flows.
