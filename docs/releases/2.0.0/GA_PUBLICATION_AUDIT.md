# M3D20-18d — uploaded release audit and recovery

No 2.0 release has been published or audited from this checkout. After the exact candidate has passed RC2, the GA sign-off is approved, and the `v2.0.0` tag points to that commit, upload only files from the [immutable GA staging directory](GA_STAGING_GATE.md). Preserve the original evidence and staged directory outside the source checkout. The legacy 1.x workflows reject `v2.0.0`; they are not a GA publication route.

After publication, run:

```text
node scripts/verify-release20-uploaded.mjs <staged-RELEASE_ASSET_MAP.json> <audit-report-json>
```

The audit resolves the **remote** tag to its commit, requires a public stable release, compares its notes and complete asset-name set to the staged bundle, then downloads every asset and hashes its bytes. It records the installer SHA-256, asset-map SHA-256, remote release ID, and each downloaded size and digest. `GH_TOKEN` may be set for the GitHub API; downloaded public assets are still checked byte for byte. Keep the audit report with the RC2 and install receipts. A green local staging check is not proof that the uploaded download works.

## Critical regression response

1. Preserve the original candidate manifest, GA sign-off, staged files, remote audit report, exact failing download, install profile backup, and reproduction steps. Record the affected source commit, asset hash, host, and user data format.
2. Stop directing new users to an affected download until its impact is understood. Keep the original evidence available for investigation; do not overwrite the tagged source, replace an asset under the same name, or silently edit release notes to claim the old binary was fixed.
3. Classify whether the defect affects data integrity, scientific interpretation, security, supported migration, or a supported clean install. For an affected release, prepare a new corrective version and run the relevant source, installer, upgrade, staging, and uploaded-byte gates again against its own exact commit and assets.
4. Publish a dated advisory and migration or restore instructions that name the affected hashes and versions. Verify the corrected uploaded assets and clean installation before restoring download links.

This procedure does not itself remove or modify a published release. Final installation and first-launch checks must use assets downloaded from the published release at the agreed end stage.
