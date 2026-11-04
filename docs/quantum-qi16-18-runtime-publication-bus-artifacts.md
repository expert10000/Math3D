# QI-16–18: publication, local bus and artifact retention

## Final publication

Theory Lab computes and validates a saved run before publication. It writes the job, result, optional exact checked data bytes, and manifest to a hidden `.run-finalizing-*` directory. The final run ID becomes visible only after a directory rename. A `.run-claim-<id>` directory prevents two writers from publishing or changing the pin for the same run at once. Incomplete staging directories are excluded from the saved run inventory. The completion callback runs after the final rename.

Scene bundles use the same boundary: a `.qscene-finalizing-*` directory is written and reopened with full bundle verification before it is renamed to `<scene-id>.qscene`. A per-ID claim prevents concurrent publication. Scene IDs beginning `preview-` cannot be published through the final bundle writer. Display previews are ephemeral; the Scene Lab labels saved run sources as verified final scenes.

## Local Integration Bus

Theory Lab advertises `quantum-local-bus/v1` in `~/.quantum-integration-bus/discovery.json`, or an absolute `QUANTUM_INTEGRATION_BUS_HOME`. The discovery file contains a local named pipe on Windows or Unix socket elsewhere and a random token; it is owner-only on POSIX. Requests are bounded to 4096 bytes, authenticated, and restricted to `hello`, `latest`, `subscribe`, and `resolve-scene`. Subscriptions receive validated `job-progress` and `run-completed` notices. On startup, the broker seeds `latest` from the newest saved run that still passes verification.

The Math3D Project button **Open latest completed Lab run** uses `latest` and requests `resolve-scene` with the exact run ID and result SHA-256. Theory Lab reopens the run and prepares a verified scene handoff. Math3D independently verifies the bundle and compares its provenance with the notice before opening it. The existing `.qscene` folder picker, study handoffs, source-run launch and portable packs remain available when the bus is unavailable. The bus does not accept arbitrary commands, paths, jobs, or deep links.

## Shared artifacts and recovery

Both apps write to `~/.quantum-integration-artifacts/v1`, or an absolute `QUANTUM_SHARED_ARTIFACT_HOME`. Objects are deduplicated by SHA-256 under `objects/sha256/<prefix>/<hash>`. Lab pins saved job, result and data bytes under `run-<id>`. Before a Math3D Project save, main process reopens every scene reference, copies its verified bundle metadata and datasets into the store, rechecks the source fingerprint, and writes a `project-<hash>` pin. A cross-process write lock serializes pin updates with GC. Removing a temporary `.qscene` folder therefore does not remove the Project's pinned blobs. The Project's original source link still needs relinking or an exported portable pack to reopen after that folder is removed.

`npm run quantum:artifact-gc -- --dry-run` lists unreferenced objects and bytes. `--quarantine` moves only unpinned objects out of the live object inventory; `--restore <sha256>` returns a quarantined object after rechecking its hash. There is no automatic permanent deletion. Existing `.qpack` exports embed their verified scene dependencies and can be moved to another machine independently of the local store.

## Verification

- Theory Lab: publication, saved run pin, authenticated bus progress/completion/resolve, artifact GC and saved rerun tests; typecheck and desktop build.
- Math3D: authenticated bus client and Project retention/GC tests; main and renderer builds and typecheck.

The bus is local to the active user profile. It provides completion and resolution, not remote job submission or cross-app selection; those are later roadmap capabilities.
