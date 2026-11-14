# M3D20-18c — immutable GA asset staging

No GA staging has passed for the current 2.0 source tree. After the reviewed `v2.0.0` tag points to the exact signed-off commit, run from that clean checkout:

```text
node scripts/stage-release20-ga.mjs <signoff> <candidate> <rc2-report> <final-release-notes> <empty-output-dir>
```

The command verifies the GA sign-off, exact tag commit, Windows release asset checksums, complete unpacked-app SBOM coverage, and installer hash. It copies the original release files and evidence receipts into an empty staging directory and checks every copied byte. The generated `RELEASE_ASSET_MAP.json` records the source commit, installer SHA-256, published platforms, original filenames, staged filenames, and per-file SHA-256. Linux packages are included only when `publishedPlatforms` explicitly includes `linux`; their AppImage, deb, rpm, SBOM, and checksum manifest must all be present and valid. A differing Windows/Linux filename receives a `linux-` prefix in staging, preserving both exact files.

The staging directory is local. Upload only the files from this verified directory after the installer and RC2 qualification stage is complete. Keep the map and original checksums with the release so downloaded bytes can be compared independently. The legacy 1.x publish workflows deliberately reject `v2.0.0`.
