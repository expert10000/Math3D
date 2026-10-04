# PRJ28–PRJ30 mobile Surface acceptance

## Delivered software scope

**Projects → Documents and relations → Edit Surface** opens an unarchived,
independent literal parametric Surface with finite increasing nonperiodic u/v
bounds. Edit x(u,v), y(u,v), z(u,v) and the four bounds; **Apply Surface** commits
one undo step, **Save** retains the complete mixed project. The 17×17 wireframe
shows the saved source as an isometric projection. Invalid drafts keep the source
and undo/redo unchanged. Each retained history recipe must also qualify.

Surface replay uses the same shared bounded kernel adapter as desktop, with the
existing `math3d.surface-replay.v1` format. Mobile library schema 6 migrates schemas
1–5 through the atomic primary/backup writer. Only one Graph, Curve or Surface is
selected for cold restart. Switching, creating/importing projects and explicit
refresh first preserve committed edits in the complete enclosing container.

**Relations → Create refreshed Surface** explicitly forks Graph revolution or
extrusion, or a saved extrusion/revolution from one independent literal parametric
t Curve. Curve constructions require normalized [0,1] u/v domains and qualified
saved parameters. Four adapters reproduce desktop fork identities and lineage.
Previous targets, metadata, scripts, results and verified source resources remain
unchanged. Current, archived, missing, unsupported and already-refreshed sources
show disabled reasons. Constructed/procedural targets remain mobile saved previews.

Desktop/browser reopening recovers captured Curve source hashes from verified
retained history when viewing a historical construction. Its geometry remains tied
to its captured generation. A missing captured recipe does not fall back to the
current Curve. Other mobile editors/representations and physical iOS remain outside
this acceptance scope.

## Repeatable workflow

Generate the public package with:

```powershell
node scripts/projects-mobile-surfaces.mjs generate <output-directory>
```

The manifest lists the project identity, two Graphs, literal helix, literal saddle,
and four Surface relation IDs. The package contains all eight modules, source
resources and historical analysis. Record the existing handset library and a
baseline export before installing the clean signed internal build as an update.
Do not uninstall, clear app data or replace the normal library.

1. Import the package through **New Project → IMPORT → Math3D project**. Export it
   before editing and compare its bytes with the input.
2. Open the second Graph, change its parabola to `x*x+4`, Apply, Undo, Redo and Save.
   Finish Graph undo/redo before generating refreshed targets: each replay changes
   the source generation.
3. Open Literal helix. Change z(t) to `t/2`, Apply, Undo, Redo and Save.
4. Open Literal saddle. Reject `u+` and a zero-width domain. Then set z(u,v) to
   `u*u-v*v+2` and U maximum to `2`, Apply, Undo, Redo and Save.
5. Switch Graph/Curve/Surface and verify each committed source. In **Relations**,
   explicitly refresh Graph extrusion and helix extrusion. Confirm the original
   targets remain and duplicate refresh is disabled. Revolution parity is also
   checked by the host-model suite; record separately if physically exercised.
6. Leave Surface selected, force-stop/relaunch and verify its expression/domain,
   Undo/Redo and save. Export the actual package with resources.
7. Verify the actual return, then run Electron reopening and fresh-browser
   import/export/reload using that exact file:

```powershell
node scripts/projects-mobile-surfaces.mjs verify <native-export> <verification-output>
$env:MATH3D_PRJ30_RETURN = '<native-export>'
$env:MATH3D_PRJ30_OUTPUT = '<desktop-output>'
npx playwright test tests/e2e/project-mobile-surfaces.spec.ts --reporter=list
```

8. Run the exact-installed-build damaged-store diagnostic. Its isolated fixture
   retains Graph, Curve and Surface replay plus a selected Surface with redo.
   Force-stop/relaunch between preparation and completion. The normal library
   fingerprints and the acceptance export must remain unchanged.
9. Re-scan the real library: every original identity must remain; only PRJ30 may
   be added. Re-export the original baseline and compare its bytes.

`simulate` creates a **model-only preflight** return for host tests; it is never
physical Samsung evidence.

## Acceptance status

Software contracts and model-only historical construction restoration pass.
Signed Samsung and actual desktop/browser return checks are in progress.
