# QI-40: QEC pin, visual review, profile rollback · 2026-11-05

These are three source-checkout gates after the first saved QEC scene. They do not sign off the QI-40 release freeze.

## 1. Pinned QEC source and scene

The 39-row `quantum-qi40-scene-matrix.json` adds `saved-ideal-qec`, with exact scene JSON hash and importer fingerprint. `tests/fixtures/quantum-qec/saved-run.json` is the real Theory Lab worker's three-round saved-run manifest; its adjacent portable bundle was exported from that record. `node scripts/test-quantum-qec-baseline.mjs` checks manifest, worker-trace and result hashes, independently applies flips `[0, none, 1]`, recomputes all syndromes, temporal defects and data bits, checks the final correction/logical result, and matches all 21 imported bit values. The scene is an ideal three-bit example, not a surface-code experiment.

## 2. Current visual review

`node scripts/capture-quantum-release-review.mjs output/qi40-39-review` captures the 36 example-library scenes and opens the two saved QWZ scenes and saved QEC scene directly from their pinned bundles. It records 39 screenshots, source fingerprints, PNG SHA-256 hashes, dimensions and a color-signal heuristic in `capture-index.json` and `visual-signal.json`. The current Windows run captured all 39 with zero heuristic blank flags. Three contact sheets and full-size inspection of the sparse SSH, finite-chain, BBH, Hofstadter and QEC views showed scientific marks in each. This review found a clipped QEC scene-space lane annotation; the producer now leaves lane explanation in the Math3D inspector, and the QEC scene was re-pinned and recaptured. The screenshot archive is a review artifact, not a pixel-perfect compatibility promise across GPUs or fonts.

## 3. Narrow rollback proof

`npm run test:quantum:qec-rollback` builds the renderer with `VITE_QEC_PROFILE=off`, opens the saved QEC scene through the generic viewer, then independently opens pinned QWZ v1 and Rice–Mele v2 bundles with unchanged fingerprints. The test passed on Windows and the script restored the normal renderer build afterward. It demonstrates removal of the QEC-specific inspector profile while retaining both current readers. It does not establish rollback of every result adapter, broker path or installed build.

## Open release work

Long-duration RAM/VRAM budgets, genuine GPU device loss, fresh-VM installer coverage, full adapter rollback, and surface-code science remain open. A separate 24-cycle run provides initial one-host memory and simulated WebGL-loss observations. The 39-scene visual review covers this checkout and current Windows renderer only.
