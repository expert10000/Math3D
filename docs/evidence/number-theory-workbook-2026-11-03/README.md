# Desktop Number Theory Workbook acceptance — 2026-11-03

This gate ran the Windows Electron development build against the real local SageMath Docker service at `127.0.0.1:8767`. Its `/health` response reported SageMath 10.10 and both bounded Number Theory operations. The isolated worktree started at remote `main` commit `cb19d173b0027749069b6e911fc76580ddf8b4bb`. The new acceptance test used the service directly, without replacing its HTTP responses.

| Calculation | Exact input and saved result | Workbook and export |
| --- | --- | --- |
| GCD | `gcd(84, 30) = 6` | Saved as a successful `sage.numberTheory.gcd` result with `values: ["84", "30"]`. |
| Modular inverse | `3⁻¹ mod 11 = 4` | Saved as a successful `sage.numberTheory.modInverse` result with `a: "3"`, `modulus: "11"`. |
| Inverse without a solution | `2 mod 4` has no inverse | Sage returned a failed result with `inverse of Mod(2, 4) does not exist`. The failure, exact request, engine version, and diagnostic were saved to Workbook. |

All three `sage-result/v1` records were present in the exported `.math3d` bundle with the Docker backend, SageMath 10.10, freeform Number Theory source metadata, exact request parameters, and complete responses. The Markdown export retained all inputs, successful values, a `Failed` status, and the inverse error. A fresh Electron profile imported the bundle; its Workbook displayed the failure and Sage version. Re-exporting from that profile yielded the same three evidence records. Freeform inputs remain explicitly unlinked to a saved scene source.

The gate exposed two export presentation issues: failed Sage results were displayed in Markdown as `Result: {}` without their error, and freeform Number Theory inputs were labeled `Source: F`. The saved text now includes success/failure status and the error, labels freeform inputs `Input`, and shows the outcome in the Workbook evidence card. The structured `.math3d` response already retained the failure.

`npm run build:core`, `npm run typecheck:noemit`, the new live Docker Workbook flow, the existing live Docker Number Theory flow, and the mocked desktop Number Theory flow passed.

## Evidence files

| Artifact | SHA-256 |
| --- | --- |
| [Workbook session bundle](number-theory-workbook.math3d) | `3f3c130d983ada3d576bb4e11334f63426d95417a6410ffbcd7908437c708b1e` |
| [Markdown export](number-theory-workbook.md) | `052c726207dbb3e1d649666b715046f94ff1a4645d1e38c32c67f430e6faa205` |
| [Structured observations](number-theory-observation.json) | `fcc347f9ea04e52234d7cb4168da991a1f1d0fe15e8bebe77a7455812656449b` |

Screenshots show the [valid inverse](number-theory-valid-inverse.png), [failed inverse](number-theory-failed-inverse.png), and [independently imported Workbook result](number-theory-independent-import.png).

This acceptance covers the local Docker service and desktop development build. It does not certify a hosted gateway, another SageMath version, or a packaged installer.
