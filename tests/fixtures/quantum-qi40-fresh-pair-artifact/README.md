# Retained fresh QWZ pair fixture

This is a selected byte-for-byte copy of artifact
`qi40-unsigned-dev-pair-44097555120` from [Windows run 44282845421](https://github.com/expert10000/Math3D/actions/runs/44282845421).
It retains the candidate manifest, installed-pair report, consumer and direct
acceptance reports, two consumer screenshots, the fresh saved worker run, and
both complete fresh scene bundles with their study handoff. The installed-pair
report SHA-256 is
`f4c2c74ab1c87f398454bf9297d641e329550df04d583427125f661355d00a42`.
The [review](../../../docs/releases/2.0.0/QI40_FRESH_INSTALLED_PAIR_REVIEW.md)
records source commits, setup hashes, and limitations.

The selected files can be checked without the short-lived Actions artifact:

```powershell
npm run build:main
npm run build:renderer
node scripts/review-qi40-installed-pair.mjs tests/fixtures/quantum-qi40-fresh-pair-artifact f4c2c74ab1c87f398454bf9297d641e329550df04d583427125f661355d00a42
$env:MATH3D_QI40_PAIR_ARTIFACT_ROOT = 'tests/fixtures/quantum-qi40-fresh-pair-artifact'
$env:MATH3D_QI40_PAIR_REPORT_SHA256 = 'f4c2c74ab1c87f398454bf9297d641e329550df04d583427125f661355d00a42'
npx playwright test tests/e2e/quantum-qi08-study-handoff.spec.ts --reporter=list
```

This fixture does not contain the installers, installed executables, complete
installation logs, duplicate direct-launch study, or 80-cycle memory trace.
It lets the exact scientific data and source-app journey be replayed; the
original workflow artifact remains the installation evidence. This was an
unsigned Dev diagnostic, not a signed stable 2.0 release candidate.
