# Theory Lab and Math3D quantum visual review

The 2026-11-04 review archive contains 58 direct Theory Lab Electron screenshots
and 46 Math3D Electron screenshots. Math3D captures cover all 36 pinned,
verified quantum examples plus ten orbital Volume and density-surface variants.
The archive includes `index.html` for browsing and `review-manifest.json` with
SHA-256 for every PNG. The Theory Lab screens came from its passing desktop
smoke run at commit `3c883fa`; the Math3D scenes were captured from commit
`12366f6c` before the PC29 test-only changes.

Recreate the Math3D part from this repository with:

```powershell
node scripts/capture-quantum-review.mjs C:\path\to\review\Math3D
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
