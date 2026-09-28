# Math3D Licensing and Distribution Roadmap

## Decision and status

**Current release path:** public GPL-3.0-or-later distribution

**Alternative future path:** privately developed/commercially licensed distribution

**Decision date:** 2026-09-28

**Scope:** source repository, desktop installers, frozen Python worker, native
workers, web/mobile artifacts, release source, notices, and dependency evidence

Math3D will proceed now as a public GPLv3-or-later project. Release binaries may
contain GPL-covered CGAL packages and pygalmesh only when recipients receive
equivalent access to the complete corresponding source. The commercial path is
retained as a future business option, but it is not the active release policy.

This roadmap is an engineering compliance plan, not a substitute for legal
advice.

## Executable companion roadmaps

| Path | Document | Authority |
| --- | --- | --- |
| Public GPL | `docs/public-gpl-release-roadmap.md` | Active release execution, remaining audit gates, and public-release freeze. |
| Commercial/private | `docs/commercial-private-licensing-roadmap.md` | Inactive future program for rights, vendor licenses, edition separation, and private release. |

This document owns the decision between paths. The companion documents own
their detailed execution sequences.

## Why the license changed

Math3D was previously declared Apache-2.0 while its packaged scientific worker
could contain:

- GPL-covered CGAL algorithms and Python bindings;
- GPL-3.0-or-later pygalmesh;
- LGPL-covered GMP and MPFR libraries;
- a CGAL-based native geodesic helper.

Publishing the Math3D repository was necessary but not sufficient. A binary
release must also carry the correct combined-work license, notices, exact source
for the shipped versions, build and installation scripts, and recipient rights
to modify and rebuild the program.

Apache-2.0 material remains identified in `LICENSES/Apache-2.0.txt`. Existing
Apache permissions and notices are preserved while the combined release is
distributed under GPL-3.0-or-later.

## Two maintained paths

### Path A — public GPL distribution (active)

```text
public Math3D source + GPL dependencies
                  |
                  v
         GPL-3.0-or-later release
                  |
       +----------+-----------+
       |                      |
       v                      v
release binaries       corresponding source
and checksums          and build information
```

License fee: zero. Compliance work remains mandatory.

Path A permits free or paid distribution, donations, hosted services, and paid
support. Every recipient keeps GPL rights to inspect, modify, rebuild, and
redistribute the covered work.

### Path B — commercial/private development (inactive)

Path B is available if the project later needs proprietary source, proprietary
downstream products, or non-GPL redistribution. It requires all of the
following before activation:

1. A commercial CGAL Industrial Development license covering every used
   GPL-covered CGAL package and every distributed platform.
2. A separate commercial pygalmesh license, or removal/replacement of
   pygalmesh with directly licensed C++ adapters.
3. Continued GMP/MPFR LGPL compliance or licensed replacement libraries.
4. A new third-party legal and technical audit of the exact release closure.
5. A reviewed license transition for all post-transition Math3D contributions;
   public GPL contributions cannot simply be made private without sufficient
   relicensing rights from their copyright holders.

Published commercial pricing currently includes EUR 6,000/year for an
Industrial Research license and EUR 1,000/year for an Academic Research
license, neither permitting commercialization. The relevant Industrial
Development license is a one-time, per-component quotation with no royalties;
optional annual maintenance is 20% of component prices. pygalmesh commercial
pricing is separately quoted by its author.

Path B therefore has no reliable fixed budget until CGAL package usage and
pygalmesh strategy are frozen and written quotations are obtained.

## Active public-release invariants

1. Root package metadata and the combined distribution declare
   `GPL-3.0-or-later`.
2. The full GPLv3 text is stored in `LICENSE` and shipped with installers.
3. Historical Apache-2.0 terms are preserved in
   `LICENSES/Apache-2.0.txt` and described in third-party notices.
4. `THIRD_PARTY_NOTICES.md` and `SOURCE_OFFER.md` ship beside each installed
   worker.
5. Python worker dependencies use exact version pins; a release may not depend
   on whatever package version happens to be newest on build day.
6. Every binary release has a tagged Math3D source archive and source archives
   for the GPL/LGPL native dependencies actually shipped on that platform.
7. Source archive SHA-256 values are reviewed in
   `compliance/public-source-manifest.json` and verified while downloading.
8. The release records the exact Python package inventory and Git commit.
9. A binary is not published when source preparation, hashing, notices, or
   license verification fails.
10. Recipient-built binaries are not blocked by activation, signature checks,
    remote attestation, or an exclusive vendor updater.

## Delivery program

### LIC-01 — license and attribution baseline

**Status:** complete in the GPL transition change.

- Adopt GPL-3.0-or-later for the combined Math3D distribution.
- Preserve Apache-2.0 historical terms.
- Update package metadata and public documentation.
- Add third-party notices and the corresponding-source offer.

**Gate:** repository license declarations agree and the complete license texts
are present.

### LIC-02 — exact dependency inventory

**Status:** complete for the current frozen-worker baseline.

- Pin NumPy, SciPy, SymPy, CGAL Python bindings, pygalmesh, and VTK.
- Record CGAL, pygalmesh, GMP, and MPFR source versions, URLs, targets, and
  SHA-256 values.
- Keep the standalone native CGAL dependency manifest separate because its
  CGAL 6.2.1 closure differs from the frozen Python worker.

**Gate:** CI rejects floating worker requirements and mismatched CGAL or
pygalmesh versions.

### LIC-03 — corresponding-source release assets

**Status:** implemented; exercised on every release.

- Generate `Math3D-<version>-source.zip` from the release commit.
- Capture the release-time package-version patch when CI changes metadata.
- Download and hash the target-specific upstream source archives.
- Record the exact build commit and Python inventory in
  `SOURCE_MANIFEST-<platform>.json`.
- Publish source assets from the same GitHub release page as binaries.

**Gate:** any missing source, unavailable URL, version mismatch, or hash
mismatch fails the release before publication.

### LIC-04 — installer notice delivery

**Status:** implemented for desktop packaging.

- Ship `LICENSE`, `LICENSES/`, `THIRD_PARTY_NOTICES.md`, and
  `SOURCE_OFFER.md` as Electron resources.
- Retain dependency-owned license metadata inside npm and frozen Python
  distributions.
- Verify installed notice visibility during packaged smoke testing.

**Gate:** clean-machine package inspection finds all required notice files.

### LIC-05 — SBOM and complete transitive audit

**Status:** next hardening milestone.

- Generate CycloneDX or SPDX SBOMs for npm, Python, native DLL, web, and mobile
  closures.
- Normalize package names and licenses and fail on unknown, custom, or denied
  terms until reviewed.
- Include compiler runtimes and platform redistributables in the inventory.
- Compare installer contents with the SBOM and source manifest.

**Gate:** every shipped executable, library, package, data asset, font, and
model has an owner, version/source identity, and reviewed redistribution term.

### LIC-06 — historical release audit

**Status:** required before declaring earlier binaries compliant.

- Inventory every currently downloadable release artifact.
- Identify which releases contain CGAL, pygalmesh, GMP, MPFR, or native CGAL
  helpers.
- Add matching source/notices where a release can be cured safely.
- Withdraw and replace a binary when its exact corresponding source cannot be
  reconstructed confidently.
- Publish a concise correction note without claiming retrospective approval.

**Gate:** no downloadable binary lacks a documented license/source disposition.

### LIC-07 — contributor and future-relicensing policy

**Status:** planned.

- Add contribution terms confirming GPL-3.0-or-later contributions and
  Developer Certificate of Origin sign-off, or adopt a reviewed CLA if future
  commercial relicensing is a real objective.
- Document whether contributors grant explicit relicensing rights for Path B.
- Never imply that public GPL contributions can automatically be moved into a
  private edition.

**Gate:** contribution policy matches the intended long-term dual-path model.

### LIC-08 — native CGAL opt-in release

**Status:** blocked on packaging completion, not on the public-license choice.

- Add the standalone worker only through an explicit builder resource.
- Publish the CGAL 6.2.1, GMP 6.3.0, and MPFR 4.2.2 source closure.
- Generate a per-platform SBOM and run clean-machine functional tests.
- Keep the Python/VTK fallback available when the native worker is absent.

**Gate:** native package paths, runtime DLLs, notices, source archives, and
tests are added in one reviewed release change.

## Release sequence

```text
LIC-01 license baseline                         COMPLETE
   |
LIC-02 exact worker inventory                   COMPLETE
   |
LIC-03 source asset generation                  IMPLEMENTED
   |
LIC-04 installer notice delivery                IMPLEMENTED
   |
   +--> LIC-05 transitive SBOM audit            NEXT
   +--> LIC-06 historical release audit         NEXT
   +--> LIC-07 contributor/relicensing policy   PLANNED
   +--> LIC-08 standalone native CGAL release   GATED
```

## Release checklist

Before publishing any desktop release:

```text
[ ] GPL metadata verification passes
[ ] worker requirements are exact pins
[ ] installer build uses the recorded package inventory
[ ] Math3D tagged source archive exists
[ ] platform GPL/LGPL source archives exist and match SHA-256
[ ] source manifest records commit, versions, platform, and build patch
[ ] LICENSE and all notices exist inside the installed application
[ ] binary and source assets share the same release page
[ ] SHA256SUMS covers binaries and source assets
[ ] clean-machine package smoke passes
```

## Commercial-path activation gate

Path B must not be started merely by changing `package.json` back to Apache or
removing GPL notices. Activation requires a separate reviewed program that:

- identifies all copyright holders for Math3D changes made after this GPL
  transition;
- obtains sufficient relicensing grants or cleanly separates code that cannot
  be relicensed;
- records paid CGAL package rights and a pygalmesh replacement/license;
- regenerates the entire SBOM and installer notice set;
- verifies that public and private editions do not exchange GPL implementation
  code in a way that violates either distribution model.

Until that gate passes, every official Math3D release remains on Path A.
