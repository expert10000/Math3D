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
