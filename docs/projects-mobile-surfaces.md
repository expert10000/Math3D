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

PRJ28–PRJ30 are delivered for the declared Android/desktop/browser scope.
The clean shared-key internal APK from `99363f9` passed
[Android CI](https://github.com/expert10000/Math3D/actions/runs/37194699115) and was
verified and installed as an update on Samsung SM-A566B / Android API 36.

The native journey began on signed `125a837`: byte-exact import/export, independent
Graph/Curve/Surface edits and explicit extrusion refresh passed. A cross-project
transition exposed an outgoing Curve being used with the incoming session ref.
`99363f9` guards each editor by session membership. The final APK retained the edits
and previews, passed the original Curve→new Graph crash regression and Graph/Curve/
Surface switching, rejected invalid Surface expressions/domains without advancing
revision, and retained Surface undo/redo/save through cold restart.

The actual 54,077-byte native return contains 27 documents, 11 relations and all five
resources. Direct verification preserves original entries except the three edited
documents, and keeps historical results, artifacts, metadata, scripts and source bytes; the
two refreshed Surfaces have exact captured lineage. Electron restored all three
independent histories. Fresh browser contexts passed exact import/export/reload and
Surface undo/redo in both en-US/UTC and pl-PL/Auckland. Reopening now selects the
saved Surface definition in the inspector instead of a prior scene object.

The exact installed APK passed **10/10 recovery preparation and 11/11 restart
checks**, including selected Surface and retained Surface redo. The runner fully
resets the shared scroll position before finding its controls. Normal library
fingerprints remained unchanged and the post-recovery export matched the accepted
return. All 24 original identities remain; only PRJ30 was added. The existing
40,534-byte PRJ27 export remained byte-identical.

[Public packages, verification, build identity and screenshots](evidence/projects-prj30-samsung-2026-10-04/acceptance.json)
record this continuation. Graph/Curve extrusion was physically exercised; revolution
parity is covered by the model suite. Physical iOS and published-release signoff
remain separate gates.
