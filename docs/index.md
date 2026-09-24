# Math3D Docs

This site combines:

- Project guides and operational docs (MkDocs content).
- Full API reference generated from TypeScript sources (TypeDoc output).
- Architecture docs for cross-runtime workspace planning.
- Runtime architecture overview: `runtime-architecture.md` (Electron main thread, React renderer, Python worker with CGAL/VTK).
- Install and run modes guide: `install-and-run-modes.md` (desktop, browser, and Docker browser modes, including worker requirements).
- CGAL Python worker setup: `cgal-python-worker-setup.md` (one-command vcpkg + patched pygalmesh setup).
- Surface Analysis professional roadmap: `surface-analysis-professional-implementation-roadmap.md` (12-commit consolidation plan, Surface/Mesh ownership boundary, linked SurfaceMesh workflow, and v1 acceptance target).
- Surface Analysis v1 freeze: `surface-analysis-v1-freeze.md` (final UI ownership, regression/tolerance matrix, accepted journeys, maintained gates, and change policy).
- Curves professional roadmap: `curves-professional-implementation-roadmap.md` (15-commit consolidation plan and implementation record).
- Curves v1 freeze: `curves-v1-freeze.md` (canonical workflow, mathematical conventions, result lifecycle, interoperability, QA, screenshot baselines, and change policy).
- Curve spline conventions: `curves-spline-conventions.md` (Bézier/B-spline/NURBS basis, knot, weight, continuity, editing, and serialization rules).
- Repository folder map: `repository-layout.md`.
- Mobile roadmap: `mobile-roadmap.md` (completed MOB24–MOB54 baseline and the next phase sequence).
- Mobile Projects/Create/Import extension: `mobile-projects-create-import-extension-roadmap.md` (MOB55–MOB68 contracts, commit scopes, dependencies, and acceptance gates).

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
