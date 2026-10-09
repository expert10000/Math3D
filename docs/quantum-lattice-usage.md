# Quantum lattice scenes: Theory Lab → Math3D

This guide covers the bounded M3D-Q04 desktop path. Theory Lab produces a
`quantum-scene/v1` `.qscene` **folder**; Math3D independently verifies and
displays that folder. Neither app calls the other's physics worker.

## Prepare the two source checkouts

Build Theory Lab using its [Windows setup](https://github.com/expert10000/theory-lab#run-on-windows)
(`npm ci`, `npm run setup:python`, `npm run build`, `npm start`). In this Math3D
checkout, run `npm ci`, `npm run build:core`, then `npm start`. The current
Theory Lab launcher asks for the built Math3D checkout folder on first use;
packaged-app discovery is not part of this path. Rebuild either checkout after
changing its source. Math3D's verified scene importer is desktop-only.

## A. Open a bounded lattice example

1. In Theory Lab, open **Scenes → Bounded lattice examples**. Choose
   **Real-space cells**, then **Square**, **Honeycomb**, or **Simple cubic**.
   Set the repeats (1–8 per active axis; a planar example has one z cell) and
   select **Preview geometry example**.
2. Select **Export scene bundle** and choose a parent directory. Theory Lab
   creates a new `.qscene` folder containing `bundle.json`, `scene.json`, and
   hashed binary datasets. It does not overwrite an existing bundle. Keep the
   entire folder together.
3. In Math3D desktop, choose **File → Open verified quantum scene** (or the
   command-palette action of the same name) and select that `.qscene` folder.
   The Geometry viewer opens only after the manifest, scene, and datasets verify.

These examples are geometry fixtures, **not saved numerical runs**. They do not
appear in Theory Lab Runs. The Lab's **Open in Math3D** button does not apply to
them; use export and Math3D's File action. Math3D does not offer
**Open source run in Theory Lab** for a geometry fixture.

For a compatible **saved numerical run**, use Theory Lab **Scenes**, select the
run under **Saved numerical run**, then choose **Open in Math3D** instead. The
Lab creates and verifies a regular bundle, then launches the selected Math3D
checkout. You can also export that
run's scene and open its folder manually. Only a matching, hash-verified saved
run can be reopened from Math3D with **Open source run in Theory Lab**.

## Inspect and expand in Math3D

- Click a supplied site marker, or use **Inspect first** in the right inspector.
  The inspector shows the portable object ID, verified dataset sample, declared
  coordinates and units, and—when lattice metadata exists—the cell and basis
  identity. The lattice section lists supplied basis positions, repeat counts,
  translation vectors, and open boundary. Amber guides show the declared
  primitive translations.
- Under **Derived supercell preview**, set the axis cell counts and choose
  **Preview expanded cells**. Math3D re-verifies the source before displaying
  deterministic basis-mapped site instances and primitive-cell guides. Click a
  derived marker to see its cell, basis, source dataset, and matching source
  sample when one exists. **Return to supplied geometry** restores the original
  verified scene.
- Expansion is a transient display derivation, not a new `.qscene`, saved
  numerical result, editable Geometry, or inferred crystal. It allows 1–8 cells
  per axis, at most 512 derived sites and 2,500 cell edges. A changed source,
  invalid input, or exceeded bound is refused. Math3D rechecks the source on
  recent-scene and saved-workspace reopening as well.

The original source may contain geometric links. The derived preview does
**not** expand those links or create chemical bonds, hopping parameters, or
periodic-wrap bonds. The frozen v1 lattice metadata admits only 2D/3D **open**
boundaries. A supplied 1D chain or SSH scene remains visible as Geometry, but
has no v1 cell/basis inspector or supercell controls. Periodic-wrap identities
and native 1D lattice metadata need a separately versioned producer contract;
M3D-Q04's full acceptance gate remains open.

Hashes establish byte integrity relative to the bundle, not producer identity
or scientific correctness. Use only scenes from sources you trust. For the
contract and project-link behavior, see the [integration roadmap](math3d-quantum-integration-roadmap.md)
and [saved Project guide](quantum-scene-project-links.md).

## Check the bounded path

From the Math3D checkout, run `npm run test:quantum-scene:import` for the pinned
and generated bundle fixtures, and
`npx playwright test tests/e2e/quantum-scene-import.spec.ts` for the Electron workflow. These cover
open square, honeycomb, simple-cubic, supplied 1D/SSH geometry, selection,
units, reopening, and tamper refusal; they do not assert unsupported periodic
bonds or chemistry.
