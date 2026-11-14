# Four-journey installed Windows gate

The [qualification workflow](../../../.github/workflows/release20-qualification.yml) installs the signed candidate whose SHA-256 the reviewer approved. The fresh runner checks uploaded bytes, Authenticode signer, pinned NSIS component, and the installed `Math3D.exe` and worker digests before launching desktop acceptance. Each launch uses that installed executable and verifies app version 2.0.0.

The selected Playwright run executes five connected tests for four journeys:

| Journey | Test and required negative paths |
| --- | --- |
| Surface → Curve → Mesh → comparison → Workbook | `project-surface-ridge-publication.spec.ts`: native worker cancellation and retry, restart, source change, missing and corrupt mesh sidecar, import cancellation, clean-profile transfer. |
| QWZ → Study → Graph/evidence | `quantum-qi08-study-handoff.spec.ts`: two independent QWZ scene fixtures, restart without producer worker, verified and withheld evidence, changed and missing scene files, portable pack transfer, corrupt and missing blobs. |
| CAS → locus → Geometry/Curve | `casLocusJourney.spec.ts` and `casDockerIdealJourney.spec.ts`: live SageMath 10.10 polynomial and ideal routes, cancellation, exact result, sampled Geometry and Curve, offline reopen, changed source, clean-profile import and direct open. |
| Field Explorer → line profile → Graph → exact Field return | `project-field-flagship-journey.spec.ts`: Gallery Study and Workbook, exact cursor return, restart, clean-profile transfer, changed Field and missing Graph table refusal. |

Before the desktop tests, the runner calls the configured Sage service `/health` and runs cusp and smooth singularity oracles for both 3D ideals and 2D polynomials through `/run`. Set the repository secret `MATH3D_RELEASE20_SAGE_SERVICE_URL` to a reachable SageMath 10.10 service endpoint built from the frozen commit. A remote endpoint must use HTTPS. The job fails if the service is absent, reports an unsupported version, or returns wrong oracle results. It must remain available for both CAS tests; the tests deliberately redirect to an unavailable local endpoint for their offline checks.

After the memory gate passes and the signer provisions the four Windows signing inputs described in [signing readiness](SIGNING_READINESS.md), freeze one reviewed commit. Build and upload one signed installer from that commit. Dispatch the qualification workflow with its candidate run ID, the full source commit, approved installer SHA-256, and approved freeze-manifest SHA-256. The workflow checks those values independently in the integrity, fresh-install, and upgrade jobs. The final receipt requires all five installed tests, the live Sage oracle, the first-use Study, and the 1.7 upgrade and rollback to pass for the same commit and installer hash. Inspect the uploaded Playwright JSON, Sage oracle, four-journey, and qualification receipts. A source-build pass or an unsigned Dev installer is not an installed-candidate pass.
