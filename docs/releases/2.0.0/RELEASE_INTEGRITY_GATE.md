# M3D20-13d — Windows release integrity

The 2.0 Windows release job must stop before uploading assets unless all of these checks pass:

1. The Windows installer, unpacked `Math3D.exe`, bundled `resources/python-worker/worker.exe`, and optional `resources/native-cgal/math3d-cgal-worker.exe` when present have valid Authenticode signatures from the certificate identified by `MATH3D_WINDOWS_SIGNER_THUMBPRINT` (40 hex characters).
2. Electron Builder receives `MATH3D_WINDOWS_CSC_LINK` (base64 PFX) and `MATH3D_WINDOWS_CSC_KEY_PASSWORD`. Its 2.0 `afterPack` hook signs the frozen worker before the installer is assembled, using `MATH3D_WINDOWS_TIMESTAMP_URL` for a trusted timestamp. All three values are supplied by repository secrets or variables, never source control.
3. Every regular file in `release-assets` appears exactly once in `SHA256SUMS.txt`, with the correct digest. The manifest excludes itself. Missing, duplicate, malformed, extra, directory, and symlink entries fail.
4. `Math3D-2.0.0-windows.cdx.json` identifies the exact 2.0 Windows app. Every file in the unpacked build has a matching SHA-256 and owner in the CycloneDX SBOM; the SBOM cannot omit or add a packaged file.
5. The published `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `SOURCE_OFFER.md` assets match both source control and the copies in the unpacked app. The Windows license inventory is present and identifies 2.0.

6. The candidate manifest, signature receipt, NSIS component receipt, build identity and SBOM must agree on one exact source commit, installer hash, signer and app/worker bytes. `scripts/stage-release20-candidate-assets.mjs` copies those receipts and assets from the candidate build into a new flat directory, writes checksums, then verifies the staged bytes.

`node scripts/test-release20-assets.mjs` exercises staging and the asset gate with tampered installer bytes, changed attribution, changed packaged bytes, and incomplete SBOM coverage. `node scripts/verify-release20-assets.mjs` checks a staged release directory. `scripts/verify-release20-signatures.ps1 -ExpectedThumbprint <thumbprint>` independently checks Authenticode on Windows; a JSON signature receipt alone is not a cryptographic verification. Neither a passing fixture nor a source build qualifies a 2.0 candidate; the exact final installer and unpacked app must pass in CI.

Current status: the gate is implemented but has no 2.0.0 release artifact or signing identity in this checkout. A CI run without the certificate, timestamp configuration, or signatures must fail. The 1.7 release path remains version scoped and does not use this 2.0-only gate.
