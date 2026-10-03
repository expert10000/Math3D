# PRJ25–PRJ27 Graph/Curve acceptance

**Projects → Documents and relations → Edit Curve** opens independent, nonperiodic
explicit or parametric literal sources in 2D/3D. Edit expressions and domain bounds,
then **Apply Curve**, **Undo**, **Redo**, **Save**. The preview shows XY or a labelled
isometric projection. Invalid expressions/domains leave the source and history intact.
Other Curve recipes remain saved previews with their qualification reason.

**Documents and relations → Relations → Create refreshed Curve** explicitly forks
a supported stale Graph→Curve companion using the current Graph object. Existing
Curves, relations and analysis remain historical. The source must be available,
unarchived and evaluable; current/unsupported/already-created copies are blocked.
The explorer includes active committed changes. Refresh writes the complete project
before replacing editor sessions; it never overwrites a historical companion.

Generate the public 20-document fixture with all eight modules, two Graphs, a
literal 3D helix and five checked source resources:

```powershell
node scripts/projects-mobile-curves.mjs generate C:/path/to/evidence
$env:MATH3D_PRJ27_OUTPUT = 'C:/path/to/evidence'
npm run build:core
npx playwright test tests/e2e/project-mobile-curves.spec.ts --reporter=list
```

Record the Samsung library identities and an existing baseline export. Update the
app with the shared-signer internal APK; never uninstall or clear data. Import the
desktop checkpoint package through **Projects → New Project → Math3D project**.
Open the helix and inspect the 3D projection; dependent/spline Curves stay previews.

Open the parabola Graph, change `x^2` to `x*x+4`, verify undo/redo, and save. Perform
the Graph undo/redo check before refresh: it advances the Graph's source generation.
Under its stale promotion
relation, create the refreshed Curve. Check that the original companion remains
and the action rejects a duplicate copy. Open the new Curve, attempt an invalid
expression, then change its y expression to `x*x+5`. Apply, undo, redo and save.
Switch Graph/Curve and confirm the saved expressions and available independent
histories without undoing the Graph again after capture, then force-stop/relaunch.
The selected Curve and history must return. Export through the native folder picker.

```powershell
node scripts/projects-mobile-curves.mjs verify C:/path/to/native-return.math3d.project-package.json C:/path/to/evidence
$env:MATH3D_PRJ27_RETURN = 'C:/path/to/native-return.math3d.project-package.json'
npx playwright test tests/e2e/project-mobile-curves.spec.ts --reporter=list
node scripts/projects-preview-roundtrip.mjs C:/path/to/native-return.math3d.project-package.json C:/path/to/browser-evidence http://127.0.0.1:5186
```

The actual returned package must retain the original documents, metadata, results,
scripts and resources, plus exactly one refreshed Curve and its exact lineage.
Shared kernels and Electron must restore independent Graph and Curve undo/redo.
Fresh-browser exports before/after reload must remain byte-exact.

Run the exact-installed-APK damaged-store runner; its isolated fixture now retains
Graph history, Curve history, an active Curve and source bytes. Compare normal
library identities and the original export after acceptance. Commit only public
fixture evidence; keep APKs, signing material and private inventory outside Git.
Physical iOS acceptance and additional Curve representations remain separate work.

## Recorded Samsung acceptance

The October 4 run passed on Samsung SM-A566B / API 36 with the shared-key internal
APK from clean source `12f8e1e`. The actual returned package contains 21 documents
and five source resources; Electron restored both histories and browser
export/reload retained exact bytes. Native recovery passed 10/10 preparation and
11/11 restart checks. All 23 existing library identities and the original baseline
export remain unchanged. [Public evidence and exact build identity](evidence/projects-prj27-samsung-2026-10-04/acceptance.json)
exclude private inventories, APKs and signing material.
