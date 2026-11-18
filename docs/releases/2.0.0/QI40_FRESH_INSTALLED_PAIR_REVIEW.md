# QI-40 fresh installed Dev pair science and visual review

Date: 2026-11-18. This review uses artifact
`qi40-unsigned-dev-pair-44097555120` from the [successful clean Windows run](https://github.com/expert10000/Math3D/actions/runs/44282845421).
The archived `installed-pair.json` SHA-256 is
`f4c2c74ab1c87f398454bf9297d641e329550df04d583427125f661355d00a42`.
The [machine-readable review](evidence/qi40-fresh-installed-dev-pair-review-44282845421.json)
pins the two setup hashes, fresh result and study hashes, scene hashes, and
screenshot hashes.

## Independent data check

Run `npm run build:main`, download the workflow artifact, then run:

```powershell
node scripts/review-qi40-installed-pair.mjs '<downloaded-artifact-root>' f4c2c74ab1c87f398454bf9297d641e329550df04d583427125f661355d00a42
```

The reviewer first checks the downloaded report hash, the candidate manifest,
the direct and consumer acceptance reports, the fresh worker result, the study,
both scene descriptions, and both screenshot hashes. Math3D's scene importer
verifies the bundle datasets before the reviewer compares their values with an
independent two-band QWZ formula at all 441 saved reciprocal points. It checks
the lower-band Berry curvature and both energy bands against that formula and
against the fresh worker result. Maximum absolute difference was
`5.551115123125783e-16`, below the script's `1e-12` tolerance. The fresh run
reports Chern `-1` and bulk gap `2` at mass `-1` on a 21 × 21 grid.
The retained-fixture reviewer also checks the periodic reciprocal grid and
surface heights, recomputes the sampled band gap from both energy arrays, and
integrates the verified curvature samples over the grid. The sampled gap is
`2.0002494853248947`; the independent curvature integral is approximately
`-1.0000019282277401`, consistent with Chern `-1` at this resolution.

## Screenshot inspection

I opened both archived 1008 × 655 PNGs whose hashes appear in the consumer
acceptance report. The curvature view shows a rendered surface, Brillouin-zone
boundary and stored path; its Inspector says the source is current and displays
the producer Chern value `-1`. The band view shows two separate energy surfaces
in the reciprocal frame, with source verification visible. Neither capture is
blank or shows a visible error. The 655-pixel viewport crops lower Inspector
content, so this review does not inspect every panel or interaction state.

## Disposition

This is a science-array and bounded visual pass for the **exact unsigned Dev
installed pair** in the linked run. The installed consumer and direct-launch
reports independently matched the fresh run and result hashes. The check does
not qualify a signed stable 2.0 installer, repeated installation reliability,
the four complete installed flagship journeys, or the longer mixed-route
memory plateau. Those release gates remain open.

## Fresh-scene source journey follow-up

The [QWZ Study handoff desktop test](../../../tests/e2e/quantum-qi08-study-handoff.spec.ts)
now accepts a downloaded installed-pair artifact only when the caller supplies
the exact `installed-pair.json` SHA-256. It checks the fresh study and both
scene-description hashes against that report before copying their exact bytes
into the source Electron test handoff. The normal fixture path remains the
default. To repeat the fresh-scene run from the repository root in PowerShell:

```powershell
$env:MATH3D_QI40_PAIR_ARTIFACT_ROOT = '<downloaded-artifact-root>'
$env:MATH3D_QI40_PAIR_REPORT_SHA256 = 'f4c2c74ab1c87f398454bf9297d641e329550df04d583427125f661355d00a42'
npx playwright test tests/e2e/quantum-qi08-study-handoff.spec.ts --reporter=list
```

After `npm run build:main` and `npm run build:renderer` on application source
`5caba31a`, the test committed at `9c2193c9` passed from a clean checkout on
2026-11-18 (`1 passed`, 1.3 minutes). That commit changes only this test, so
the built application source is unchanged. The test stages the four-view QWZ
Study, pins a reciprocal selection, publishes saved band samples and an authored
path to Graph, writes a source-linked Note, and checks the saved evidence. It
then reopens the Project, verifies source return, withholds changed and missing
scene evidence, transfers the quantum package to an independent profile,
checks offline readback, and refuses changed or missing package blobs. The
same test also passed with its default fixture path (`1 passed`, 1.3 minutes).

This is a **source Electron** journey using fresh scenes produced by the
installed Theory Lab in the archived pair run. It does not run the complete
journey inside the installed Math3D Dev executable or qualify a signed stable
candidate.

## Clean Windows source repeat

The [manual Windows workflow](https://github.com/expert10000/Math3D/actions/runs/44292652841)
repeated that fresh-scene journey on clean source commit `5104f491` and passed
all jobs. Its archived build identity says version `2.0.0`, clean commit
`5104f491b1d12dcfdb5a648037f0b69f639355a0`, and renderer hash
`085430a822e8002469c798f755198f526e783187175946a10623aadde5dfa75c`.
The artifact's independent fresh-pair review passed again at a maximum
`5.551115123125783e-16` QWZ sample difference. Playwright reported one
expected pass, zero unexpected or flaky results, in 78.4 seconds. The
[CI review summary](evidence/qi40-fresh-pair-source-ci-5104f491.json) pins
the archived review and Playwright JSON hashes.

This clean-runner result strengthens the source-app journey evidence. It does
not use an installed Math3D executable. The signed stable installed journey
and longer memory release gates remain open.

## Retained byte-exact replay

The [selected fixture](../../../tests/fixtures/quantum-qi40-fresh-pair-artifact/README.md)
keeps 41 original artifact files in the repository, including the fresh worker
run, both complete scenes, study, acceptance reports, and two screenshots. All
41 selected files matched the downloaded artifact byte for byte before commit;
Git attributes preserve the original line endings and binary bytes. The
reviewer also checks the fresh worker job and manifest hashes. This enables
science and source-app replay after the Actions artifact expires, while the
original workflow remains the installation evidence.

The [clean Windows fixture replay](https://github.com/expert10000/Math3D/actions/runs/44294789205)
passed on source commit `96ed243c`. Its build identity was clean, and its
fresh-pair review JSON has the **same SHA-256**
`c13c6624ba99b8911a4367c168a00b235c523a74d07f9da93f233d6b09d35358`
as the earlier downloaded-artifact run. Playwright recorded one expected pass
and zero unexpected or flaky results. The [fixture CI summary](evidence/qi40-retained-fixture-source-ci-96ed243c.json)
pins the source and archived report hashes. This remains source-app evidence;
the signed installed candidate and memory gates remain open.

## Production-runtime source replay

The workflow now accepts `production_runtime: true`, which launches the source
app with `MATH3D_E2E=0` and its normal hardware GPU mode default. The first
launch Settings dialog in a clean independent profile is closed through its
visible button before the portable Project transfer. This still uses source
Electron and a test-isolated profile; it does not measure which GPU device the
Windows runner ultimately uses.

The [clean Windows production-runtime replay](https://github.com/expert10000/Math3D/actions/runs/44298131950)
passed on commit `b66c1b46` after the earlier [production-runtime pass](https://github.com/expert10000/Math3D/actions/runs/44297139415)
on `3295ffdc`. Its enhanced review checks both scene coordinate grids,
curvature surface heights, sampled band gap, and the curvature integral as
well as all 441 QWZ samples. Playwright reported one expected pass, zero
unexpected or flaky results. The [production-runtime CI receipt](evidence/qi40-production-runtime-source-ci-b66c1b46.json)
pins the clean source build and archived review and Playwright hashes. The
signed installed Math3D journey and mixed-route memory gate remain open.
