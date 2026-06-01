# Traceability Scenarios

This document provides two UI walkthroughs to validate Geometry/Mesh traceability in the app.

## Prerequisites

- Run desktop app in dev mode: `npm run dev`
- Open modules used below: `Geometry` and `Surfaces`
- If VTK actions are used, ensure Python worker is available

## Scenario 1: Geometry -> Mesh Traceability

Goal: confirm a geometry object keeps trace links after promotion and mesh mutations.

1. Open `Geometry` mode and create/select a procedural object (for example `Box`).
2. Use `Bake selected geometry object to mesh dataset and open Mesh module`.
3. Confirm app switches to `Surfaces` with `surfaceViewerKind = mesh`.
4. Open the `Promotion traceability` card in Surfaces.
5. Verify it shows:
- Source geometry object name/id
- Promoted mesh snapshot label
- Operation history with initial promotion step
6. Run one or more mesh mutations in Surfaces:
- `VTK decimate` or `VTK smooth`
- `Weld vertices`
- `Triangulate` / `Subdivide`
7. Re-open/refresh `Promotion traceability` and confirm operation history includes those mutations.
8. Switch back to `Geometry`, select the baked mesh object, and check info panel:
- `Source geometry id` is present
- Promotion mode and created timestamp are present

Expected result:
- Promotion source remains linked.
- Mutation operations are appended and trace chain is preserved.

## Scenario 2: Mesh -> Geometry -> Mesh Traceability

Goal: confirm imported mesh lineage is retained through Geometry conversion and later mesh edits.

1. Open `Surfaces` and load a mesh (`Import mesh file` or bundled preset).
2. Convert/send current mesh into Geometry scene (`Clone/Convert into Geometry 3D` flow).
3. In `Geometry`, select the created mesh object.
4. Verify object promotion metadata in panel:
- Mesh object exists with promotion metadata
- `Source geometry id` can be `n/a` for mesh-origin inputs
- Mode and counts are present
5. Perform manual mesh edits in Geometry (for example `Move vertex`, `Weld vertices`, `Delete face`).
6. Bake/send edited object back to Mesh module.
7. In `Surfaces`, run one additional mesh mutation (for example `VTK clean` or `Normalize scale`).
8. Check `Promotion traceability` card in Surfaces and verify operation chain includes:
- Mesh-to-Geometry conversion step
- Manual Geometry mesh edit step(s)
- Surfaces mesh mutation step(s)

Expected result:
- Trace chain is continuous across module boundaries.
- For topology-changing edits, lineage is preserved conservatively (best-effort element mapping, no chain loss).

## Notes

- Exact per-element mapping is strongest when topology is unchanged.
- For heavy topology rewrites (boolean split, strong decimation/subdivision), fallback lineage is conservative but still linked.

## Quick Pass/Fail Checklist

Use this after running both scenarios.

- [ ] Geometry -> Mesh promotion shows source object id/name.
- [ ] Promotion traceability history records at least one downstream mutation.
- [ ] Mesh -> Geometry conversion keeps promotion metadata visible on the mesh object.
- [ ] Manual Geometry mesh edits appear in subsequent trace chain.
- [ ] Returning edited mesh to Surfaces preserves trace chain continuity.
- [ ] At least one topology-changing operation still keeps lineage linked (conservative fallback).
- [ ] No step breaks navigation between Geometry and Surfaces modules.
