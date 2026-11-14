# Windows 2.0 signing readiness and signer handoff

**Audit:** 2026-11-14, `main` at `d15c694e`. **Disposition:** release closure TODO #7 remains open. This is an input inventory and handoff, not an approved certificate, freeze, candidate, or installed receipt.

## Observed state

| Check | Observation |
| --- | --- |
| Repository Actions secrets | `gh secret list --repo expert10000/Math3D` lists Android signing secrets, but none of the three `MATH3D_WINDOWS_*` secrets below. Repository Actions variables are empty. Organization-level grants, if any, are not visible in this repository listing. |
| Local signer | No valid Code Signing EKU certificate with a private key was found in `Cert:\CurrentUser\My` or `Cert:\LocalMachine\My`. No required signing environment variable is set. Three x64 Windows SDK `signtool.exe` copies are present; tool availability is not a signing identity. |
| Clean source preflight | `node scripts/release20-candidate.mjs --preflight` stops with “Windows signer, certificate password, timestamp URL and thumbprint are required.” The [candidate input test](../../../scripts/test-release20-candidate.mjs) passes its absent-signer, dirty-source, old-version, drift and tamper refusals. |
| Remote preflight | The last [candidate workflow run](https://github.com/expert10000/Math3D/actions/runs/43120840246) failed at **Refuse an unreviewed version or absent signer**. No 2.0 signed candidate or exact installed receipt was produced. |

## Inputs the signer must provision

Set these directly in **GitHub repository Settings → Secrets and variables → Actions** (or an organization secret explicitly granted to this repository). Keep the PFX and password outside the repository, PRs, logs and chat. The signer should verify that the certificate is currently valid, has a private key and Code Signing EKU, chains to a trusted issuer, and is permitted for this release.

| GitHub input | Kind | Exact value required by the workflow |
| --- | --- | --- |
| `MATH3D_WINDOWS_CSC_LINK` | Secret | Base64 encoding of the complete PKCS#12/PFX certificate **with its private key**, without a file path or data-URL prefix. `build-release20-candidate.ps1` maps it to electron-builder's `CSC_LINK`; the worker signing hook decodes it into a temporary PFX. |
| `MATH3D_WINDOWS_CSC_KEY_PASSWORD` | Secret | Password for that PFX. The build maps it to `CSC_KEY_PASSWORD`; both app/installer and frozen worker signing use it. |
| `MATH3D_WINDOWS_SIGNER_THUMBPRINT` | Secret | Forty hexadecimal characters identifying the certificate in that PFX. Post-build Authenticode verification requires the installer, app executable and worker to have a **Valid** signature from this exact thumbprint. |
| `MATH3D_WINDOWS_TIMESTAMP_URL` | Repository variable | The issuer-approved RFC 3161 timestamp service URL. The worker signer passes it to `signtool /tr` with SHA-256 digest and timestamp algorithms. |

The [candidate workflow](../../../.github/workflows/release20-candidate.yml) injects the same four names into its preflight and build steps. `release20-candidate.mjs --preflight` checks the clean 2.0 source/dependency pins and input presence. The new `verify-release20-signer-inputs.ps1` then imports the PFX in ephemeral memory and checks its password, single private-key signer, validity period, Code Signing EKU, approved thumbprint, and timestamp URL syntax. A temporary test PFX passed; a mismatched thumbprint and missing inputs were refused. **This does not prove issuer trust or timestamp-service availability.** `release20-sign-worker.cjs` signs the frozen worker during packaging; `verify-release20-signatures.ps1` later requires valid Authenticode and the expected thumbprint on the installer, app and worker. Candidate manifest creation binds those verified file hashes and signer identity. Do not report #7 complete until the real signer inputs and exact candidate pass.

## Exact release handoff after provisioning

1. The signer sets the four inputs above and confirms their names appear in the repository's Actions secret/variable listings. Do not report their values in a ticket or review. The signer can rotate or revoke them through the same settings after the candidate work is complete.
2. After the memory and four-journey source changes merge, a reviewer selects one clean 2.0 commit and runs `node scripts/prepare-release20-freeze.mjs <new-file-outside-checkout>`. Independently review the manifest and its SHA-256; any source change requires a new freeze and hash.
3. Dispatch **Build signed 2.0 Windows candidate** on that reviewed commit with the independently approved `approved_freeze_sha256` input. The workflow regenerates the freeze and refuses a different digest before dependency installation or packaging. Its build stage also refuses a dirty tree, invalid signatures, the wrong signer, an unpinned NSIS component, missing source/SBOM ownership or inconsistent asset hashes.
4. Record the workflow run ID, exact source commit, freeze SHA-256, installer SHA-256 and signer thumbprint from the candidate artifact. Dispatch [exact-candidate qualification](../../../.github/workflows/release20-qualification.yml) with those approved identities. It independently downloads the same bytes and runs clean install, first-use Study, 1.7 upgrade and rollback. Installed memory and the remaining release gates still need their own receipts.

The owner of #7 is the Windows release signer. Release engineering can verify the wiring and fail-closed behavior now; only the signer can provide a trusted certificate and approved timestamp endpoint. Keep #7, #11–14 and GA sign-off open until the exact signed candidate passes their separate checks.
