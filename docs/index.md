# Math3D Docs

This site combines:

- Project guides and operational docs (MkDocs content).
- Full API reference generated from TypeScript sources (TypeDoc output).
- Architecture docs for cross-runtime workspace planning.
- Runtime architecture overview: `runtime-architecture.md` (Electron main thread, React renderer, Python worker with CGAL/VTK).
- Repository folder map: `repository-layout.md`.

## Build locally

1. Generate API docs:
   - `npm run docs:api`
2. Build the MkDocs site:
   - `python -m pip install mkdocs`
   - `npm run docs:site`

Generated output:

- TypeDoc HTML: `docs/api/`
- Combined site: `site/`
