# Layered Workspace Architecture

Companion architecture docs:

- Runtime process/IPC/worker view: `runtime-architecture.md`
- CGAL/VTK/three.js compute pipeline: `vtk-cgal-threejs-pipeline.md`

## 1. Architecture: Split Into Clear Layers

The long-term target is to make Math3D behave like one platform with multiple runtimes, not one Electron-only app.  
Core rule: desktop and browser must share the same domain model and the same project format.

### A. Shared core

`packages/core` owns all cross-runtime semantics:

- Math/domain model types.
- Scene object definitions.
- Command schema.
- Scene/project serialization format.
- Validation logic.

Key shared types include:

- `SceneDocument`
- `SurfaceDefinition`
- `OverlayDefinition`
- `CameraPreset`
- `SceneCommand` / `CommandEnvelope`

### B. Rendering layer

`packages/renderer` owns Three.js-oriented conversion/building logic:

- Scene builders from shared geometry/scene definitions.
- Mesh and line conversion helpers.
- Shared materials and grid helpers.

### C. UI layer

`packages/ui` owns reusable UI contracts/components:

- Inspector section/field schemas.
- Toolbar action definitions.
- Reusable panel abstractions.

### D. Workbook layer

`packages/workbook` owns workbook/task/demo structures:

- Workbook document types.
- Stage/block types.
- Template schemas and default stage ordering.

### E. Compute worker

`python/worker` (target label: `python-worker`) owns symbolic/numeric heavy work and stays runtime-agnostic relative to UI shell choices.

### F. Runtime shells

- `apps/desktop`: Electron shell.
- `apps/web`: browser shell.

Both runtimes should consume shared packages instead of redefining models locally.

## 2. Shared Scene Format Contract

Canonical file format is defined in `@math3d/core`:

- format id: `math3d.scene-project`
- version: `1`
- root payload:
  - `scene` (`SceneDocument`)
  - optional `commandLog`
  - optional `workbookId`

`ConstructionLabPanel` now exports/imports this canonical format and keeps legacy scene bundle import compatibility.

## 3. Boundary Rules

- Persistent file schemas are defined only in `packages/core`.
- `apps/*` may orchestrate runtime behavior, but must not fork scene/document contracts.
- `packages/renderer` must consume shared models instead of defining duplicate geometry/scene types.
- Feature code requiring symbolic or heavy numeric compute should call into `python-worker` rather than embedding ad hoc math in UI components.

## 4. Cross-Runtime Interoperability Goal

This layer split enables workflow parity:

- Run demo task in browser.
- Open the same file in desktop.
- Export scene from workbook.
- Import scene into viewer.
- Compare results across browser and desktop using one project format.

## 5. Current Migration Status (March 18, 2026)

- Workspace package/app skeleton exists: `packages/*`, `apps/*`.
- Shared aliases are wired in renderer TypeScript and Vite config.
- Scene/project serialization + validation lives in `@math3d/core`.
- Renderer geometry types now re-export from `@math3d/core`.
- Desktop/web app folders currently proxy to legacy runtime roots and are ready for incremental source migration.
