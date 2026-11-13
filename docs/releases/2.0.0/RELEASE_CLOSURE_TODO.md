# Math3D 2.0 release closure TODO

**Prepared:** 2026-11-13 from `main` at `f0ba7498` and the [2.0 roadmap](ROADMAP.md).
**Status:** Planning checklist. A passing source test is not an installed, hosted, device, or published release receipt.

The items are ranked by release risk and dependencies. Estimates are **engineering days for one person**; they exclude certificate procurement, CI queues, and the required two-hour soak. Web, Android, and Linux work can proceed alongside Windows work. Mark an item closed only after its required evidence identifies the reviewed source commit and, where relevant, the exact artifact hash and host.

| # | Priority | Closure item and proof | Estimate | Status |
| --- | --- | --- | --- | --- |
| 1 | P0 | Freeze the advertised 2.0 journeys and host claims. Give every open defect a blocking, limited, or deferred disposition in the [release scope](RELEASE_SCOPE.md). | 2–3 d | Drafted; scope decision pending |
| 2 | P0 | Fix retained App render contexts and mixed Mesh/Volume memory growth identified in the [memory gate](PERFORMANCE_RESILIENCE_GATE.md). | **10–20 d** | Open |
| 3 | P0 | Pass the clean-build, 800-switch mixed-route gate for heap, renderer, GPU, context loss, and page errors. | 2–5 d | Open |
| 4 | P0 | Qualify the complete Surface → Curve → Mesh → comparison → Workbook journey, including cold reopen and changed or missing sources. | **5–8 d** | Open |
| 5 | P0 | Qualify QWZ with independently verified producer bundles, reciprocal selection, Graph evidence, return navigation, and stale-source refusal. | **5–8 d** | Open |
| 6 | P0 | Qualify the bounded CAS → locus → Geometry/Curve journey against a real supported Sage route, including cancellation and offline evidence. | **5–8 d** | Open |
| 7 | P0 | Establish the Windows certificate, signer thumbprint, password, and timestamp configuration required by the [candidate gate](INSTALL_UPGRADE_GATE.md). | 1–3 d + external lead time | Open |
| 8 | P0 | Resolve the red Windows Installer Smoke workflow: supply signing inputs where required or separate source smoke from candidate packaging, while keeping the signed release gate fail-closed. | 2–4 d | Open |
| 9 | P0 | Re-freeze the **current merged commit**, rerun [RC1 checks](RC1_ACCEPTANCE_GATE.md) and full CI, and record one matching source identity. The earlier RC1 receipt belongs to an older commit. | 2–4 d | Open |
| 10 | P0 | Pass the clean-source [two-hour navigation and memory soak](RC2_SOAK_GATE.md), including hard-exit Project recovery and reviewed receipts. | 2–5 d plus run time | Open |
| 11 | P0 | Build one signed Windows candidate; verify NSIS component, worker, signatures, source inventory, SBOM, licenses, and asset hashes against its manifest. | 3–5 d | Open |
| 12 | P0 | Install that exact candidate on a clean Windows machine; launch without Python/Conda, run the worker and first-use Study, then restart and reopen it. | 2–4 d | Open |
| 13 | P0 | Upgrade the exact published 1.7 installer to 2.0, prove Project and profile byte preservation, and rehearse rollback. | **4–7 d** | Open |
| 14 | P0 | Pass installed Windows memory, cancellation, viewer disposal, and performance checks tied to the candidate installer hash. | **4–7 d** | Open |
| 15 | P1* | Qualify a hosted web deployment: storage, authorized worker routes, external scene transport, permissions, and failure behavior. | **5–10 d** | Open |
| 16 | P1* | Run browser Project/Study/Workbook import, export, reopen, narrow layout, locale, and offline-after-load journeys on the deployed build. | **4–7 d** | Open |
| 17 | P1* | Test a signed Android artifact on physical devices: supported Graph/Project round trips, missing resources, rotation, keyboard, restart, and recovery. | **5–10 d** | Open |
| 18 | P1* | Install the exact Linux AppImage/deb/rpm artifacts; verify first launch, bundled runtime, Project reopen, upgrade behavior, and a bounded scientific journey. | **5–10 d** | Open |
| 19 | P1 | Capture and review Surface, QWZ, and Algebra Gallery images from the exact installed candidate; align site, help, accessibility, and platform claims with proven behavior. | 3–6 d | Open |
| 20 | P0 | Complete [RC2 rehearsal](RC2_REHEARSAL_GATE.md), written [GA sign-off](GA_SIGNOFF_GATE.md), immutable staging, publication, and a fresh download-and-hash audit. | 3–6 d | Open |

\* **P1 becomes P0 if that host is advertised as a fully supported 2.0 release platform.** The current [platform matrix](PLATFORM_CAPABILITIES.md) limits hosted web, physical Android, and installed Linux claims. Close the memory and exact Windows installer gates first; promote other host claims only after their own receipts pass.

The [RC1 blocker register](RC1_ACCEPTANCE_GATE.md), [installation and upgrade gate](INSTALL_UPGRADE_GATE.md), and [roadmap GA exit checklist](ROADMAP.md#20-detailed-ga-exit-checklist) remain authoritative when this checklist and a gate differ. Update estimates and status as work is completed; do not treat an `Open` row as evidence that its source-level implementation is absent.
