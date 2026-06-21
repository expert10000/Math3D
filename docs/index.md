# Math3D Docs

This site combines:

- Project guides and operational docs (MkDocs content).
- Full API reference generated from TypeScript sources (TypeDoc output).
- Architecture docs for cross-runtime workspace planning.
- Runtime architecture overview: `runtime-architecture.md` (Electron main thread, React renderer, Python worker with CGAL/VTK).
- Renderer memory profiling and regression workflow: `memory-profiling.md`.
- Install and run modes guide: `install-and-run-modes.md` (desktop, browser, and Docker browser modes, including worker requirements).
- Repository folder map: `repository-layout.md`.

## Public frontend

- Public browser frontend path: `https://expert10000.github.io/Math3D/app/`
- Public landing page path: `https://expert10000.github.io/Math3D/landing/`
- This static deployment includes the React app and the landing site.
- Worker-backed API endpoints (`/api/worker`) are not hosted on GitHub Pages, so CGAL/VTK operations that require the backend are unavailable there unless you provide a separate backend service.

## Build locally

1. Generate API docs:
   - `npm run docs:api`
2. Build the MkDocs site:
   - `python -m pip install mkdocs`
   - `npm run docs:site`

Generated output:

- TypeDoc HTML: `docs/api/`
- Combined site: `site/`
