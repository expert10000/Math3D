# M3D20-16 — RC1 acceptance and blocker register

RC1 is **not yet signed off**. Use `node scripts/release20-rc1-checks.mjs --plan` to inspect the repeatable source checks. After a reviewed 2.0 integration branch and a matching [freeze manifest](RC1_FREEZE_GATE.md) exist, run `node scripts/release20-rc1-checks.mjs --run <freeze-manifest> <evidence-json>`. The runner refuses a 1.7 checkout, a dirty worktree, or mismatched freeze identity. It records each command, result, duration, the source commit, and freeze-manifest hash. A failing check stops the sequence and leaves the partial evidence file for triage.

The source sequence covers TypeScript, Project contracts and desktop journeys, scientific goldens, a quantum baseline, Sage gateway units, SBOM tests, site/gallery integrity, core/renderer builds, kernel acceptance, and the first-use Study journey. This is a **focused repeatable subset**, not a substitute for the full CI matrix, live Sage backends, physical Android, hosted deployment, Linux packages, or installed candidate tests. Link the full CI run and those environment-specific receipts to the same commit before RC1 review. Installer execution is reserved for the later release qualification stage.

## Current blocker register

| Item | Current state | RC1 disposition |
| --- | --- | --- |
| Reviewed 2.0 integration commit and freeze manifest | Repository package is 1.7.0; no 2.0 integration baseline identified | Blocking: choose reviewed commit, align versions, generate and verify manifest |
| General Project-owned Study and shared cursor | Roadmap target; current narrow quantum Study and starter Projects do not prove the general model | Blocking if advertised as a 2.0 flagship capability; otherwise narrow the release claim and acceptance journey |
| Public native CGAL source bundle | Existing native distribution gate still requires public source-bundle integration | Blocking for a distributable build containing that component |
| Signing identity and exact 2.0 candidate | No signed 2.0 installer or matching candidate evidence in this checkout | Blocking before release signoff; installer qualification runs at the end |
| Three flagship gallery captures | Current gallery has source-build images with mixed commit attribution | Blocking before any image is labeled an installed 2.0 capture; use the [gallery gate](GALLERY_EVIDENCE_GATE.md) |
| Hosted browser, physical Android, installed Linux | Capability matrix records unverified deployment, device, and package journeys | Keep claims limited; promote only with host-specific evidence |

At RC1 review, classify every open defect as **blocking**, **nonblocking with a documented limitation**, or **deferred outside the advertised scope**. Record owner, affected journey, exact reproduction, source/artifact identity, and evidence for the chosen disposition. Data loss, silent scientific mislabeling, invalid provenance, security-sensitive runtime exposure, broken supported 1.x migration, or a supported clean-install failure are release blockers. After the actual freeze, admit only blocker fixes and documentation corrections; rerun the affected checks and issue a new freeze manifest for any changed source commit.
