# M3D20-17d — exact-candidate release rehearsal

The release rehearsal is **pending**. There is no reviewed 2.0 source freeze or signed candidate for the current 2.0 source tree. Inspect the input list with `node scripts/verify-release20-rc2-rehearsal.mjs --plan`. After RC2 inputs exist, build the public site locally with its 2.0 gallery and exact installer link, then run:

```text
node scripts/verify-release20-rc2-rehearsal.mjs --run <candidate> <freeze> <fresh-install-evidence> <upgrade-evidence> <source-soak-evidence> <verified-gallery-dir> <built-site-dir> <report-json>
```

The verifier checks that one source commit and installer SHA-256 appear in the candidate, freeze, Windows release assets, fresh installation, 1.7 upgrade, two-hour source soak, and three installed gallery scenarios. It checks the Windows asset checksums, complete SBOM file coverage and attribution copies, public license metadata, staged gallery image bytes, and the exact `v2.0.0` installer URL in the built site. It rejects site copy that still presents 1.7 as the current desktop download. The report records hashes of each evidence receipt and the release asset checksum list.

The site URL check is a **local rehearsal**; it does not assert that GitHub has published the 2.0 asset. The source soak is not installed-app endurance evidence. Keep the clean-machine, physical device, Linux package, live backend, and final uploaded-download receipts with the same candidate identity before written RC2 sign-off. Run the installer only at the agreed end stage.
