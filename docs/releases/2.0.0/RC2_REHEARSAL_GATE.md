# M3D20-17d — exact-candidate release rehearsal

The trusted Windows GA rehearsal is **pending**. Draft [PR #114](https://github.com/expert10000/Math3D/pull/114) records a locally self-signed prerelease build, but it is not the publicly trusted, exact installed candidate required here. Inspect the input list with `node scripts/verify-release20-rc2-rehearsal.mjs --plan`. After the exact freeze and GA inputs exist, build the public site locally with its 2.0 Gallery and installer link, then run:

```text
node scripts/verify-release20-rc2-rehearsal.mjs --run <candidate> <freeze> <fresh-install-evidence> <upgrade-evidence> <source-recovery-evidence> <verified-gallery-dir> <built-site-dir> <report-json>
```

The verifier checks that one source commit and installer SHA-256 appear in the candidate, freeze, Windows release assets, fresh installation, 1.7 upgrade, and three installed Gallery scenarios. It requires the new [source recovery receipt](RC2_SOAK_GATE.md), including first-use Study and hard-exit Project recovery on the same freeze commit, and refuses a missing or failed check. It checks Windows asset checksums, complete SBOM file coverage and attribution copies, public license metadata, staged Gallery image bytes, and the exact `v2.0.0` installer URL in the built site. It rejects site copy that still presents 1.7 as the current desktop download. The v2 rehearsal report records `memoryQualification: "deferred-to-2.5-or-later"` and hashes of each required receipt; it does not declare the local or installed memory gates passed.

The site URL check is a **local rehearsal**; it does not assert that GitHub has published the 2.0 asset. Keep the clean-machine, live backend, and final uploaded-download receipts with the same candidate identity before written RC2 sign-off. Physical Android and Linux package claims require their own host receipts if advertised. Run the installer only at the agreed end stage. The [two-hour memory gate](../2.5.0/MEMORY_QUALIFICATION.md) remains open for the later release track.
