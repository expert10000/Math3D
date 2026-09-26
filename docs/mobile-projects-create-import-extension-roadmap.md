# Math3D Mobile projects, creation, and import extension

Updated September 26, 2026. This document turns the proposed Projects/Create/Import extension into the executable mobile sequence after MOB54. The canonical phase summary remains in the [mobile roadmap](mobile-roadmap.md).

## Starting point

MOB24–MOB63 are complete. Mobile already has:

- a persistent multi-object `SceneDocument` inside `math3d.scene-project`;
- atomic project storage, recovery, thumbnails, rename, duplicate, reversible delete, full-project import/export, and native project sharing;
- primitive, explicit, parametric, and implicit surface creation;
- one New Project flow that atomically creates, saves, and opens empty, authored, imported, example, starter-template, and compatible desktop projects;
- one Workspace Add to Project launcher whose working Create and Explore routes commit atomically, select the added object, remain undoable, and refresh saved-project thumbnails;
- six versioned, validated offline templates that instantiate with fresh project/object identities and persisted template provenance;
- a versioned `math3d.scene-object` contract with deterministic serialization, content hashing, v0 migration, bounded embedded geometry, and reviewed validity/rejection fixtures;
- a pick/preview/confirm mobile importer for semantic Math3D objects that atomically adds editable definitions, remaps collisions, and retains the validated source envelope for lossless attributes and provenance;
- bounded OBJ, ASCII/binary STL, and ASCII/binary PLY import with normal generation, format degradation summaries, MOB52 admission, and embedded project persistence;
- self-contained GLB and managed local glTF import with buffer/accessor validation, node-transform flattening, Y-up conversion, and remote/compressed dependency rejection;
- lossless single-object export/share with semantic read-back validation, collision-safe names, and confirmed derived OBJ/PLY/STL export;
- a shared deterministic composition planner for collision-safe IDs, declared internal-reference rewriting, dependency closure validation, and portable source provenance;
- a shared example catalog, worker pairing and jobs, analysis overlays, large-mesh admission, and Android/iOS companion gates.

The shared layer and mobile UI now validate, preview, import, export, and share semantic Math3D objects, plus import OBJ/STL/PLY/GLB/glTF meshes and export derived OBJ/PLY/STL geometry. Shared core can plan a collision-safe multi-object composition without dangling references. The app does not yet expose selective add-from-project or preserve a desktop/mobile handoff revision.

The governing model is:

```text
CREATE ─┐
IMPORT ─┼─> Project -> SceneDocument -> Scene objects -> View / Inspect / Analyze
EXPLORE ┤
COMPUTE ┘
```

Every path must produce or update the same shared project and scene contracts. Feature-specific shadow stores are out of scope.

## Product flow

The long-term navigation remains:

```text
Home | Explore | Workspace | Projects | Settings
```

### New project

`Projects -> New Project` presents:

```text
Empty
Create: Primitive | Surface
Import: Mesh/file | Math3D project
Start from: Example | Template | Desktop project
```

The result is always a normal saved project. Creating from an object, example, or template creates the project first and then adds content through the same mutation service used by Workspace.

### Add to project

One primary Workspace `+` action presents:

```text
Create: Primitive | Surface
Import: Mesh | Math3D object | Objects from project
Explore: Preset | Example
Connect: From desktop
```

Curve and construction entries remain hidden until those object types have an implemented editor and shared contract.

### Import language

- **Import object** adds one object to the current project.
- **Import project** creates or restores a separate project.
- **Add from project** copies selected objects from another project into the current project.

The picker title, confirmation copy, and success message must use those terms consistently.

## Architecture contracts

### Canonical ownership

- `packages/core` owns versioned project and object transfer envelopes, validation, migration, identity rules, and deterministic serialization.
- `apps/mobile` owns pickers, previews, confirmation, native sharing, project transactions, progress, and actionable errors.
- Format adapters produce validated shared scene objects. They cannot write directly to mobile storage or renderer state.
- The active project is the persistence boundary. Workspace mutations update one in-memory scene and commit one validated project transaction.

### Semantic object transfer

Add a versioned `math3d.scene-object` envelope. It contains one supported scene object plus the data required to reconstruct it:

- object identity and kind;
- mathematical definition, formula, domain, and resolution intent;
- geometry or a declared computed-result reference when applicable;
- transform, visibility, and supported style;
- source provenance and compatible analysis metadata;
- schema and producer versions plus a content hash.

Semantic explicit, parametric, and implicit surfaces retain their definitions. Exporting OBJ, STL, PLY, or GLB is an explicit derived-mesh export and tells the user that formulas and editable semantics are not represented by that format.

### Transactional ingress

Every import follows the same stages:

```text
pick -> size/type admission -> parse -> validate/migrate -> preview
     -> identity/dependency plan -> user confirmation -> atomic scene commit
```

A failure before commit leaves the current project unchanged. A successful commit creates one undoable project mutation and schedules a thumbnail refresh. Imports report the failing file/object and a specific reason.

### Identity and provenance

- Full-project import keeps source object IDs when the new project has no collision, while the project ID is remapped if it conflicts locally.
- Object import and project merge remap conflicting IDs before commit and rewrite internal references as one operation.
- Reimport never silently overwrites an existing object. It offers add as copy; replacement is deferred until stable source identity and revision comparison exist.
- Provenance records source format, source project/object identity when available, import time, producer version, and content hash. It excludes device paths and access tokens.
- Desktop handoff preserves project/object IDs and adds a base revision so divergence can be detected rather than overwritten.

### Mesh format boundary

The delivery order is intentional:

1. Math3D semantic object JSON;
2. OBJ, binary/ascii STL, and PLY geometry;
3. self-contained GLB;
4. glTF with managed local dependencies.

All decoded meshes pass through MOB52 admission before GPU upload. Parsers enforce byte, vertex, triangle, attribute, recursion, and processing-time limits. Unsupported materials or attributes are summarized before import. glTF external network URIs are rejected; local dependencies must come from one explicitly selected package or managed picker session.

### Project package and desktop handoff

The existing `math3d.scene-project` JSON stays the basic portable project document. The handoff manifest adds producer/platform version, project revision, base revision, content hashes, capability requirements, and optional result descriptors. Cached results are references unless a later package format explicitly embeds them.

Initial round trip is manual and deterministic:

```text
Desktop export/share -> Mobile open -> Inspect/edit -> Mobile export/share -> Desktop resume
```

Cloud synchronization, live collaboration, automatic conflict merging, accounts, and remote asset hosting are separate product work.

## Commit sequence

### M9 — Project-first entry flows

| ID | Commit | Scope and acceptance evidence |
| --- | --- | --- |
| **MOB55** | `feat(mobile-projects): add unified project creation flow` | Add New Project choices for empty, create, import, example, template, and desktop sources. All successful paths produce a saved project and open it in Workspace. Cancel and validation failure create no project. Focused controller and compact-layout checks cover every route. This absorbs the earlier proposed MOB34A without rewriting completed history. |
| **MOB56** | `feat(mobile-workspace): add unified add-to-project launcher` | Add one Workspace launcher for Create, Import, Explore, and Connect. Reuse existing primitive/surface/example actions through one project mutation boundary. Preserve selection, undo, save, and thumbnail behavior. |
| **MOB57** | `feat(mobile-projects): add reusable project templates` | Ship versioned offline templates for Empty 3D Scene, Surface Study, Mesh Inspection, Curvature Analysis, Topology Study, and Implicit Surface Study. Instantiation creates fresh project/object IDs and records the template ID/version. Validate every bundled template in CI. |

### M10 — Object import and export

| ID | Commit | Scope and acceptance evidence |
| --- | --- | --- |
| **MOB58** | `feat(core): define semantic scene-object transfer contract` | Add the versioned `math3d.scene-object` envelope, validators, migrations, deterministic serialization, content hash inputs, and fixture corpus in `packages/core`. Document supported object kinds and rejected dependencies. No mobile UI in this commit. |
| **MOB59** | `feat(mobile-import): preserve semantic definitions during object import` | Pick, preview, and atomically add a Math3D object. Preserve formulas, domains, resolution intent, transforms, style, provenance, and compatible analysis metadata. Cover malformed, future-version, oversized, duplicate-ID, and cancelled imports. |
| **MOB60** | `feat(mobile-import): add OBJ STL and PLY mesh import` | Add bounded parsers/adapters, unit/axis and normal handling, a pre-import summary, and MOB52 admission. Golden fixtures cover binary/ascii variants, missing normals, malformed counts, truncation, cancellation, and reduced preview. |
| **MOB61** | `feat(mobile-import): add GLB and managed glTF import` | Import self-contained GLB first, then glTF whose local dependencies are explicitly available. Reject remote URIs and unsupported compression with clear recovery guidance. Report material/attribute degradation before commit. |
| **MOB62** | `feat(mobile-export): add object export and native sharing` | Export/share semantic Math3D objects and supported derived mesh formats. Validate and read back semantic exports. Show a semantics-loss confirmation for mesh-only formats and use collision-safe file names. |

### M11 — Project composition and library

| ID | Commit | Scope and acceptance evidence |
| --- | --- | --- |
| **MOB63** | `feat(core): add collision-safe object remapping and provenance` | Define deterministic ID remapping, internal-reference rewriting, provenance, and dependency validation in shared code. Golden tests prove stable output and no dangling references. |
| **MOB64** | `feat(mobile-projects): add objects from another Math3D project` | Preview a source project, select compatible objects, show dependencies and size impact, then commit the selection once. The source project remains unchanged; cancel or failure leaves the destination unchanged. |
| **MOB65** | `feat(mobile-projects): organize imported shared and file sources` | Add Projects filters/sections for My Projects, Imported, Shared, and Files without duplicating project records. Cards expose origin, compatibility state, object count, update time, and worker/result status when applicable. Search and sort work across sections. |

### M12 — Desktop/mobile round trip

| ID | Commit | Scope and acceptance evidence |
| --- | --- | --- |
| **MOB66** | `feat(core): define project handoff revision manifest` | Extend the portable contract with producer/platform metadata, project and base revisions, content hashes, capability requirements, and result descriptors. Older v1 project imports remain valid through migration. |
| **MOB67** | `feat(mobile-projects): add desktop-mobile project round trip` | Accept a desktop handoff, preserve stable IDs, display unsupported content before open, record mobile edits, and export a resumable handoff. Detect divergence from the base revision and require copy/replace resolution instead of silent overwrite. |
| **MOB68** | `test(project-transfer): add golden round-trip and recovery matrix` | Run desktop-core-mobile golden fixtures for project/object versions, semantic fidelity, mesh formats, merge remapping, unsupported capabilities, corruption, cancellation, storage failure, and divergent revisions. Add focused Android document-provider and native-share smoke plus the maintained iOS import/share gate. |

## Dependency order

```text
MOB55 -> MOB56 -> MOB57
                  |
MOB58 -> MOB59 -> MOB62
   |       |
   |       +-> MOB63 -> MOB64 -> MOB65
   +-> MOB60 -> MOB61
MOB63 -> MOB66 -> MOB67 -> MOB68
```

- MOB58 must land before semantic import/export.
- MOB60 and MOB61 reuse MOB52 admission and can proceed after MOB58 alongside MOB59.
- MOB63 lands before merge and handoff so identity behavior is shared rather than reimplemented in mobile.
- MOB68 is the release gate for advertising desktop/mobile round trip.

## Verification policy

Each commit runs the narrowest checks for the contract it changes:

- core typecheck and focused serialization/validation fixtures for shared contracts;
- mobile typecheck and focused model/service/component tests for mobile flows;
- one compact Android layout smoke for new sheets and pickers;
- document-provider/native-share device smoke when a commit changes platform I/O;
- no full local suite unless a focused failure points to a wider regression.

The phase gate adds cross-platform golden fixtures and CI matrices. Fixtures must be small, redistributable, checked into the repository, and labeled with expected semantic or geometric loss.

## Definition of done

This extension is complete when a user can:

1. create a saved project from empty, authored, example, template, imported, or desktop content;
2. add authored, explored, semantic, mesh, or project-sourced objects through one Workspace entry point;
3. see the difference between importing an object and opening a project before committing;
4. export/share one object semantically or as a derived mesh;
5. move a project desktop -> mobile -> desktop with stable identity and explicit divergence handling;
6. recover from malformed, oversized, unsupported, cancelled, or interrupted transfer without partial project changes.

## Deferred work

- curve and construction editors;
- automatic cloud synchronization and accounts;
- live multi-user collaboration;
- remote example/asset marketplace;
- arbitrary remote glTF dependencies;
- automatic three-way conflict merging;
- embedding unbounded worker caches in project packages.
