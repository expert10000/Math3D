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
- Mobile roadmap: `mobile-roadmap.md` (completed MOB24–MOB63 sequence and the next phase plan).
- Mobile Projects/Create/Import extension: `mobile-projects-create-import-extension-roadmap.md` (MOB55–MOB68 contracts, commit scopes, dependencies, and acceptance gates).
- Semantic scene-object transfer: `scene-object-transfer-v1.md` (v1 envelope, supported kinds, safety boundary, hashing, and migration policy).
- Mobile mesh import: `mobile-mesh-import.md` (supported formats, unit/axis assumptions, admission, persistence, and failure boundary).
- Mobile object export: `mobile-object-export.md` (lossless semantic export, derived OBJ/PLY/STL, validation, naming, and native sharing).
- Scene-object composition: `scene-object-composition.md` (deterministic collision remapping, internal-reference rewriting, dependency validation, and provenance).
- Mobile add from project: `mobile-add-from-project.md` (selective source preview, dependencies, collision plan, and atomic Workspace commit).
- Mobile project library: `mobile-project-library.md` (source metadata, My Projects/Imported/Shared/Files filters, search, sorting, and card status).
- Desktop/mobile project handoff: `mobile-desktop-project-round-trip.md` (revision-aware file exchange and conflict choices).
- Mobile project-transfer gate: `mobile-project-transfer-gate.md` (golden matrix, Android USB evidence, and iOS gate status).
- Graph2D desktop/mobile roadmap: `math3d-graph2d-desktop-mobile-roadmap.md` (shared 2D graph engine, desktop workspace, mathematical analysis, mobile parity, interop, and release gates).
- [Graph2D architecture, schemas, algorithms and parity](graph2d-architecture-schema-algorithms-parity.md): maintained G2D35 guide, mathematical limits, platform behavior and verification commands.
- [Graph2D mobile gallery acceptance](graph2d-gallery-ggl07-ggl09-acceptance.md): normal project launch, all-catalog model checks and physical Android/Electron exchange; full G13 pending.
- [Graph2D desktop/web gallery acceptance](graph2d-gallery-ggl01-ggl06-acceptance.md): 20 editable scenes, previews, launch preservation and runtime checks.
- [Graph2D gallery, presets and showcase roadmap](graph2d-gallery-presets-showcase-roadmap.md): shared catalog, desktop/web/native gallery, interactive presets and My Graphs delivered through GGL11; GGL12 portable personal preset exchange next.
- Graph2D software acceptance: [desktop/mobile round trip](graph2d-g33-round-trip-acceptance.md) and [numerical, visual and migration corpus](graph2d-g34-parity-corpus.md).
- Graph2D physical release acceptance: [MOB-G11–13 gate](mobile-graphs-g11-g13-acceptance.md) and [partial Android USB readiness evidence](mobile-graphs-g13-readiness-2026-09-28.md); full G13 signoff remains pending.

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
