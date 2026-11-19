# M3D20-17d — exact-candidate release rehearsal

The release rehearsal is **pending**. There is no reviewed 2.0 source freeze or signed candidate for the current 2.0 source tree. Inspect the input list with `node scripts/verify-release20-rc2-rehearsal.mjs --plan`. After RC2 inputs exist, build the public site locally with its 2.0 gallery and exact installer link, then run:

```text
node scripts/verify-release20-rc2-rehearsal.mjs --run <candidate> <freeze> <fresh-install-evidence> <upgrade-evidence> <source-soak-or-memory-deferral> <verified-gallery-dir> <built-site-dir> <report-json>
```

The verifier checks that one source commit and installer SHA-256 appear in the candidate, freeze, Windows release assets, fresh installation, 1.7 upgrade, and three installed gallery scenarios. The fifth input must be either a passing two-hour source soak or an explicit `math3d/release20-memory-deferral/v1` receipt tied to the same freeze. A deferral must identify 2.0.0, earliest follow-up 2.5.0, the unpassed 800-switch, two-hour source memory, and installed memory checks, a release-note limitation, and failed evidence references. The report records `memoryGate.status` as `passed` or `deferred`; `status: passed` for the overall rehearsal never means a deferred memory check passed. The verifier also checks Windows asset checksums, complete SBOM file coverage and attribution copies, public license metadata, staged gallery image bytes, and the exact `v2.0.0` installer URL in the built site. It rejects site copy that still presents 1.7 as the current desktop download. The report records hashes of each evidence receipt and the release asset checksum list.

For the 2026-11-19 scope decision, create the deferral receipt **outside the source checkout** after freezing the candidate. Use this shape with the exact freeze identity and real failed receipt paths:

```json
{
  "schema": "math3d/release20-memory-deferral/v1",
  "status": "deferred",
  "releaseVersion": "2.0.0",
  "earliestVersion": "2.5.0",
  "sourceCommit": "<40-character frozen commit>",
  "freezeManifestSha256": "<SHA-256 of the freeze manifest bytes>",
  "unpassedChecks": ["800-switch", "two-hour-source-memory", "installed-memory"],
  "knownLimitation": "Long-running mixed Mesh and Volume use has not passed the memory budget.",
  "failedEvidence": ["docs/releases/2.0.0/evidence/m3d20-long-memory-review-v2-79325f2d.json"]
}
```

The site URL check is a **local rehearsal**; it does not assert that GitHub has published the 2.0 asset. A passed source soak is not installed-app endurance evidence. A memory deferral is not a soak, scientific-result, Project-recovery, or installed-performance pass; keep those distinct receipts and the limitation visible. Keep the clean-machine and live backend receipts, host-specific receipts for any additional platform claimed, and final uploaded-download audit with the same candidate identity before written RC2 sign-off. Run the installer only at the agreed end stage.
