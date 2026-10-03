# PRJ24 mixed project acceptance

Generate a public package with 19 documents across all eight modules, two Graphs,
one point table, two Mesh buffer resources and two Volume payloads:

```powershell
node scripts/projects-mobile-roundtrip.mjs generate C:/path/to/evidence
$env:MATH3D_PRJ24_OUTPUT = 'C:/path/to/evidence'
npm run build:core
node node_modules/@playwright/test/cli.js test tests/e2e/project-mobile-roundtrip.spec.ts --reporter=list
```

The Electron test imports the complete package through the project UI and exports
`desktop-delivery.math3d.project-package.json`. It verifies document generations
and the actual resource sidecars. Its profile is isolated from personal projects.
The desktop delivery exports the saved checkpoint preview. Opening a full project
in desktop editors adds module-specific replay, so non-Graph replay must be
checkpointed before mobile delivery.

Update the Samsung using an APK signed with the existing application's internal
certificate. Record its source commit, build metadata, APK hash and certificate;
do not uninstall or clear application data. Record the existing library identities
and export an existing project before the update.

On Samsung, import `missing.math3d.project.json` through **Projects → New Project →
Math3D project**. In **Documents and relations**, the data Graph must be blocked
because its table is missing; the explicit Graph must remain editable. Attempt to
attach `corrupt.math3d.project-package.json` and confirm rejection. Attach the
desktop delivery using **Import project resources**; all five resources must
become available and both Graph editors must be enabled.

Pan the data Graph, switch to the explicit Graph and change its function to
`x*x+2`. Undo and redo, then save. Switch between Graphs and confirm independent
history. Force-stop and relaunch the application; confirm the selected Graph and
saved edit return, with undo/redo available. Export the complete project through
the native folder picker. Attaching the original package after these edits must
reject the mismatched workspace version. Importing a duplicate identity must
preserve the existing project. Export again after rejection to compare bytes.

Verify the actual native export, without reconstructing it from model output:

```powershell
node scripts/projects-mobile-roundtrip.mjs verify C:/path/to/native-return.math3d.project-package.json C:/path/to/evidence
$env:MATH3D_PRJ24_RETURN = 'C:/path/to/native-return.math3d.project-package.json'
node node_modules/@playwright/test/cli.js test tests/e2e/project-mobile-roundtrip.spec.ts --reporter=list
node scripts/projects-preview-roundtrip.mjs C:/path/to/native-return.math3d.project-package.json C:/path/to/browser-evidence http://127.0.0.1:5186
```

The return verifier checks original non-Graph entries, metadata, scripts,
relations, historical results, resource descriptors and source bytes. It restores
both Graph replay kernels and checks independent undo. Electron checks the actual
Graph undo/redo keyboard shortcuts and their rendered effects; a fresh browser checks byte-exact export before and after
reload, including the resource archive.

Run `scripts/mobile-android-storage-recovery.mjs` against the exact installed APK.
Its isolated mixed-project fixture includes resources and Graph replay. Require
all preparation and restart checks to pass, with the real library digest unchanged.
Compare library identities after acceptance; only the acceptance project may be
added. Re-export the baseline personal project and compare its hash.

Keep private project names, APKs and signing material outside Git. Commit only
public input/returned packages, screenshots of this fixture and qualified results.
Physical iOS acceptance and non-Graph mobile editors are separate work.
