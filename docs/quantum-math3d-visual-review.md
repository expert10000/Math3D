# Theory Lab and Math3D quantum visual review

The 2026-11-04 review archive contains 58 direct Theory Lab Electron screenshots
and 46 Math3D Electron screenshots. Math3D captures cover all 36 pinned,
verified quantum examples plus ten orbital Volume and density-surface variants.
The archive includes `index.html` for browsing, `review-manifest.json` with
SHA-256 for every PNG, `scene-review-matrix.md` and `.json`, and
`roundtrip-evidence.json`. The Theory Lab screens came from its passing desktop
smoke run at commit `3c883fa`; Math3D scenes were recaptured after the
source-run guidance correction. PC29 remains complete; PC03 and PC05 keep
their documented Partial limits.

## Scientific review result

All 36 pinned scenes passed Math3D's strict bundle, schema, dataset hash and
catalog-fingerprint checks. Twenty-three scene result hashes matched archived
Theory Lab producer result files byte for byte; their run IDs, model, inputs
and engine also matched. The remaining thirteen scenes are labeled *scene only*
in the matrix because this fixture archive has no matching producer result
file. The scene bundle is still independently verified, but its claimed Lab
run is not thereby available in the user's current Lab profile.

Three fresh Lab worker → immutable run → `.qscene` → Math3D importer checks
passed for BBH finite density, Rice–Mele periodic bands, and Landau levels.
Each compared the exact source result hash, model parameters, units, array
length, and three decoded samples with the saved result. A changed dataset
byte was refused in all three cases. The UI review found one clarity issue:
the source-run action on pinned examples did not explicitly say the saved run
may be absent locally. The viewer and Lab handoff guide now say so. No sampled
scientific-value discrepancy was found. These checks cover representative
producer paths and all pinned bundle integrity; they are not an exhaustive
recalculation of every model's physics.

Recreate the Math3D part from this repository with:

```powershell
node scripts/capture-quantum-review.mjs C:\path\to\review\Math3D
node scripts/audit-quantum-review.mjs C:\path\to\review
node scripts/test-quantum-review-roundtrip.mjs C:\path\to\theory-lab C:\path\to\review\roundtrip-evidence.json
```

The script opens Math3D in an isolated Electron profile, opens each pinned
example through the real UI, captures its preview, and closes the temporary
profile. To index a review directory that already contains `Theory-Lab` and
`Math3D` PNG folders, run:

```powershell
node scripts/package-quantum-review.mjs C:\path\to\review <lab-commit> <math3d-commit>
```

Then zip that directory for sharing. These captures show computed Lab results
and Math3D's read-only scene consumer. They do not establish that Math3D
calculates the displayed quantum physics.
