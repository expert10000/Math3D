# Self-contained scientific Project packages

Project package v2 includes the exact scientific manifest and component bytes in the existing Project resource inventory. The first supported slice is a complete `scientific-scene/v1` vector grid with 2–32 samples per axis. Existing package v1 and plain Project JSON remain readable; their external references still require the native verifier unless source bytes are already present.

Use **Projects → Import / export → Download with resources**. Small verified native sources are captured in full. Reduced previews, chunked/tiled bundles, and larger grids are refused by this portable exporter rather than being presented as complete source data. A browser can import and re-export the resulting package without an installed helper, filesystem bridge, or computation service.

The manifest resource ID is its fingerprint and each component resource ID is its SHA-256. A and B share identical bytes, while the inventory records every document owner. Project/source identities, original locator metadata, selections, result provenance, and baseline generations are retained. Import does not relink or rewrite the scientific source.

Both package parsers enforce manifest hashes, component hashes, byte lengths, grid shape, finite values, ownership, and the existing package/resource size budgets. Package v2 requires all scientific sources, including pinned baselines. The same core vector verifier used by native sources checks browser transfers before sampling. An incomplete or corrupt packaged source never falls back to a matching external file.

The renderer reads Project-owned bytes from the existing transactional IndexedDB archive. Successful Project activation is committed only after verification. Browser restart reopens and verifies this archive; invalid source data blocks activation and retains the current workspace. Reimporting the correct package restores the source bytes without changing scientific identities.

## Acceptance

`Scientific Project Web Packages` runs resource/package regressions, full type checking, the production web build, and a real Chromium journey in both configured locales. The journey starts without `window.scientificScenes`, explores linked A/B views, exports to a fresh profile, restarts the browser process, verifies exact identities/resources/results, rejects damaged imports and persisted resources, and recovers from the original package. Native acceptance also retains reference-only v1 missing/corrupt-file recovery.
