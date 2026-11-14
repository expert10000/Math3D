# Self-contained scientific Project packages

## Direct browser bundle import

Use **Projects → Import / export → Import scientific data** to choose a `.sscene` folder or ZIP. The browser stages the upload, verifies its manifest and every component, and presents the ordinary Project compatibility preview. **Open project** commits through the same verified Project archive and activation transaction. Reading or rejecting an upload does not change the open Project.

Choose **Create new Project** for an independent copy, or **Add to current Project** after opening or saving a Project. Adding stages all incoming vector datasets alongside the live Project capture, including existing probes, authored selections and saved comparisons. Review the combined preview, then choose **Add to current Project**. The Project keeps its ID; existing documents keep their source identities and hashes. The Project revision advances to include the added documents. Resources use the existing hash inventory, including shared components across different manifests.

The current Project and its source bytes are independently verified before combining them. Missing or corrupted incoming data, a changed workspace, a concurrent saved edit, or a failed activation leaves existing work intact. The addition uses the normal transactional resource archive and an explicit save with a concurrent-edit check; ordinary Project-file import still rejects a different saved version with the same Project ID.

In **Scientific Field Explorer → Analyze**, choose **Dataset A** and **Dataset B · Second saved field**. Changing A checkpoints its current probe/view state before opening the selected source. Comparison reuses the existing Cartesian frame, axis, unit, identical-grid or explicit physical-overlap checks. Incompatible sources withhold numerical comparisons; importing them does not imply that their coordinate frames are compatible. Save the comparison and field, save the Project, then **Download with resources** to transfer both complete sources and their saved work together.

The initial importer accepts complete v1 Cartesian vector bundles with 2–32 samples per axis, component units matching coordinates per second, at most 16 component files, and at most 4 MiB of decoded data. All datasets become ordinary vector3d documents. Repeated imports create independent Project/document identities while retaining the original manifest fingerprint and component hashes. Shared components deduplicate in the existing resource inventory. Source locators explicitly identify browser imports; no filesystem path or native source registry is required.

ZIP import checks the complete archive envelope and rejects duplicate/ambiguous paths, unsupported compression, incomplete entries, and over-budget decoded output, including streamed entries with no declared size. No archive entry is extracted to a filesystem. The shared core validator also rejects missing components, wrong lengths/hashes, unsupported grids or units, and non-finite values. Browser acceptance covers folder and ZIP upload, linked A/B probes and saved comparisons, package transfer to an independent profile, process restart, invalid input/archive rejection, and exact-byte recovery in both locales.

Project package v2 includes the exact scientific manifest and component bytes in the existing Project resource inventory. The first supported slice is a complete `scientific-scene/v1` vector grid with 2–32 samples per axis. Existing package v1 and plain Project JSON remain readable; their external references still require the native verifier unless source bytes are already present.

Use **Projects → Import / export → Download with resources**. Small verified native sources are captured in full. Reduced previews, chunked/tiled bundles, and larger grids are refused by this portable exporter rather than being presented as complete source data. A browser can import and re-export the resulting package without an installed helper, filesystem bridge, or computation service.

The manifest resource ID is its fingerprint and each component resource ID is its SHA-256. A and B share identical bytes, while the inventory records every document owner. Project/source identities, original locator metadata, selections, result provenance, and baseline generations are retained. Import does not relink or rewrite the scientific source.

Both package parsers enforce manifest hashes, component hashes, byte lengths, grid shape, finite values, ownership, and the existing package/resource size budgets. Package v2 requires all scientific sources, including pinned baselines. The same core vector verifier used by native sources checks browser transfers before sampling. An incomplete or corrupt packaged source never falls back to a matching external file.

The renderer reads Project-owned bytes from the existing transactional IndexedDB archive. Successful Project activation is committed only after verification. Browser restart reopens and verifies this archive; invalid source data blocks activation and retains the current workspace. Reimporting the correct package restores the source bytes without changing scientific identities.

## Acceptance

`Scientific Project Web Packages` runs resource/package regressions, full type checking, the production web build, and a real Chromium journey in both configured locales. The journey starts without `window.scientificScenes`, explores linked A/B views, exports to a fresh profile, restarts the browser process, verifies exact identities/resources/results, rejects damaged imports and persisted resources, and recovers from the original package. Native acceptance also retains reference-only v1 missing/corrupt-file recovery.
