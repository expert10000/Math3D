# Self-signed 2.0 prerelease asset staging

The Windows owner-signed prerelease uses the separate build path in `SELFSIGNED_PRERELEASE.md`. Its certificate is self-signed and is not publicly trusted. This staging command prepares a draft asset set; it does not qualify installed journeys, approve publication, or satisfy the trusted Windows GA gate.

From a checkout containing `scripts/stage-release20-selfsigned-prerelease.mjs`, first inspect the build artifacts:

```text
node scripts/stage-release20-selfsigned-prerelease.mjs <artifact-root> --plan
```

After reviewing the source commit and installer hash, stage to a **new** directory outside the source checkout:

```text
node scripts/stage-release20-selfsigned-prerelease.mjs <artifact-root> <new-stage-dir>
```

The command checks the installer, exact freeze, public signer certificate, signature receipt, pinned NSIS component, corresponding-source manifest and every archive, plus the SBOM source identity. It copies only those expected public files, verifies each copied hash, and writes `RELEASE_ASSET_MAP.json` and `SHA256SUMS.txt`. Private PFX, password, and key files are never selected. The map states `evidence-staging-only`, `publiclyTrustedPublisher: false`, and `installedJourneysQualified: false`.

The provisional 2026-11-19 build from `300493c92c42a1f3b611bf09fef0d70f529a333e` staged 24 input assets plus the map and checksum file. Its signed installer SHA-256 is `3c749ca2a75f173536e4a94df0a4afe0bcb1d9c07c269c2b343f694e24654396`. An independent check matched all 25 listed SHA-256 values and found no private-key files. These bytes precede final source integration. Rebuild and stage again after the final source commit is frozen, then use that exact installer for clean Windows installed acceptance and a later downloaded-byte audit.
