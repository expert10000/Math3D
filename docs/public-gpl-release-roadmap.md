# Math3D Public GPL Release Roadmap

## Status and authority

**Path:** A — public distribution

**License:** GPL-3.0-or-later for the combined Math3D release

**Status:** active

**Immediate target:** first fully audited GPL release

This document is the executable roadmap for public Math3D releases. The
two-path decision and the conditions for changing direction remain in
`docs/licensing-and-distribution-roadmap.md`. Where the documents differ, this
roadmap owns public-release execution and the combined roadmap owns policy.

This is an engineering compliance plan, not legal advice.

## Objective

Publish Windows, Linux, web, and later mobile Math3D releases so that every
recipient receives:

- the GPLv3-or-later permissions applicable to the combined work;
- required component notices and license texts;
- equivalent access to the exact corresponding source;
- the scripts and configuration needed to build and modify the distributed
  executable;
- verifiable mappings from every binary artifact to its source, version,
  license, and checksum.

The release must fail closed. A missing source archive, unknown license,
unresolved binary, or mismatched dependency version blocks publication.

## Current baseline

Already implemented:

- root `LICENSE`, `package.json`, package lock, and README declare
  GPL-3.0-or-later;
- the previous Apache-2.0 text is preserved in
  `LICENSES/Apache-2.0.txt`;
- `THIRD_PARTY_NOTICES.md` and `SOURCE_OFFER.md` document the known
  scientific-worker licensing boundary;
- frozen Python dependencies use exact version pins;
- CGAL, CGAL Python bindings, pygalmesh, GMP, and MPFR sources are described
  by version, target, URL, and SHA-256;
- Windows and Linux release jobs create corresponding-source assets and copy
  them beside release binaries;
- installers include the project license, historical license, notices, and
  source offer;
- public compliance and native-CGAL gates are automated;
- the standalone native CGAL worker remains excluded until its separate
  packaging gate passes.

This baseline addresses the known CGAL/pygalmesh conflict. It is not yet a
claim that every transitive dependency and historical binary has been audited.

## Release invariants

1. Every official combined distribution is GPL-3.0-or-later.
2. Component copyright and license notices are retained; the GPL declaration
   does not erase Apache, BSD, MIT, LGPL, or other component terms.
3. Exact sources must be available from the same release location as binaries
   at no additional charge.
4. Source and build information must correspond to the actual release commit,
   release-time version patch, platform, worker inventory, and native closure.
5. Floating package versions are forbidden in a release worker.
6. A package absent from the SBOM is absent from the installer; an unexplained
   installer file blocks release.
7. Recipient-built binaries must not be prevented from running solely because
   they were modified or signed by someone else.
8. Public releases do not embed commercial-only credentials, SDKs, models, or
   data.
9. Source availability is tested before publication, not promised for later.
10. Historical releases are not described as compliant until audited
    individually.

## Executable sequence

### GPL-P01 — license transition baseline

**Status:** complete

**Deliverables:**

- GPL-3.0-or-later root license and package metadata;
- preserved Apache-2.0 historical license;
- public README declaration;
- third-party notices and source offer;
- two-path policy and public/private separation.

**Acceptance:** all repository declarations agree and the automated compliance
check passes.

### GPL-P02 — known copyleft source closure

**Status:** complete for the current Python worker

**Deliverables:**

- exact CGAL Python bindings and pygalmesh versions;
- platform CGAL source baselines;
- GMP/MPFR source baselines;
- reviewed HTTPS sources and SHA-256 hashes;
- Windows and Linux source-asset generation.

**Acceptance:** source generation succeeds from a clean environment for both
platform targets and fails on any altered byte.

### GPL-P03 — transitive SBOM generation

**Status:** next

Generate machine-readable SPDX or CycloneDX documents for:

- root and workspace npm packages;
- Electron/Chromium and native Node modules;
- the frozen Python worker and its native libraries;
- Windows PE/DLL and Linux ELF shared-library closures;
- web bundles and copied static assets;
- fonts, icons, screenshots, fixture models, sample meshes, and datasets;
- Android/iOS packages when they become public release targets.

Normalize package identity, version, supplier, source URL, checksum, license
expression, copyright notice, and binary paths.

**Acceptance:** the generated SBOM has no `NOASSERTION`, unknown license, or
unowned binary entry unless an explicit reviewed exception identifies an
owner, reason, expiry, and release decision.

### GPL-P04 — installer-to-SBOM reconciliation

**Status:** next

Unpack every produced installer/package and compare its file inventory with
the SBOM and source manifest. Cover:

- Windows NSIS installer and portable tree;
- Linux AppImage, DEB, and RPM;
- frozen worker internals;
- Electron ASAR and unpacked resources;
- DLL/SO transitive dependencies;
- updater metadata and bundled documentation.

**Acceptance:** every material file is classified as Math3D source/output,
operating-system component, generated metadata, or a known third-party item.
Unexpected executable content fails CI.

### GPL-P05 — installed notice and replacement verification

**Status:** planned

- Add an in-product **About → Licenses and Source** surface.
- Link to local license/notices and the release source page.
- Verify that a recipient can replace the frozen worker or rebuild the desktop
  package without an activation key or vendor-only signing secret.
- Document updater behavior for modified builds.
- Record platform-specific LGPL relinking/replacement instructions for GMP and
  MPFR.

**Acceptance:** clean-machine tests locate the notices and source instructions,
and a locally modified worker completes the public protocol smoke test.

### GPL-P06 — release reproducibility and provenance

**Status:** planned

- Pin Python, Node, compiler, package-manager, and base image/toolchain
  versions.
- Record Git commit, workflow identity, runner image, compiler versions,
  dependency locks, environment flags, and artifact hashes.
- Remove uncontrolled download-latest behavior from release jobs.
- Produce deterministic outputs where practical and document unavoidable
  timestamp/signature differences.

**Acceptance:** an independent clean build from published source produces the
same functional inventory and dependency versions, with explained binary hash
differences only.

### GPL-P07 — historical release audit and remediation

**Status:** required

For every downloadable release:

1. Acquire and hash the original artifacts.
2. Inspect for CGAL, pygalmesh, GMP, MPFR, native helpers, and other copyleft
   components.
3. Recover the exact source commit, build scripts, and dependency versions.
4. Attach corresponding source and notices where evidence is sufficient.
5. Replace or withdraw binaries whose complete corresponding source cannot be
   reconstructed confidently.
6. Publish a factual correction record.

**Acceptance:** every public binary has a documented disposition of compliant,
remediated, replaced, or withdrawn.

### GPL-P08 — contribution and copyright policy

**Status:** planned before external contributions scale

- Add `CONTRIBUTING.md` with GPL-3.0-or-later contribution terms.
- Require Developer Certificate of Origin sign-off or adopt a reviewed CLA.
- State whether contributors grant optional commercial-relicensing rights.
- Record third-party code provenance in pull requests.
- Require maintainers to reject copied code without verified compatible terms.

**Acceptance:** every new contribution has a traceable copyright holder,
license grant, and provenance record compatible with the active public path.

### GPL-P09 — standalone native CGAL release

**Status:** gated

- Finish the CGAL 6.2.1/GMP/MPFR native SBOM.
- Bundle its exact sources and build configuration.
- Include runtime DLL and compiler-runtime notices.
- Add clean-machine crash, cancellation, Boolean, and fallback tests.
- Change the native distribution manifest and Electron packaging policy in the
  same reviewed commit.

**Acceptance:** native worker inclusion passes the public source, SBOM,
installer reconciliation, and functional gates without weakening the Python
fallback.

### GPL-P10 — first audited public release freeze

**Status:** pending GPL-P03 through GPL-P08; GPL-P09 is required only if the
standalone native worker is included

Freeze:

- supported platforms and artifact list;
- complete SBOMs;
- license and notice inventory;
- corresponding-source assets;
- historical-release status;
- contributor policy;
- release evidence and known limitations.

**Acceptance:** a release reviewer can start with a binary filename and trace
it to its checksum, SBOM, source archive, build recipe, license expression, and
test evidence without relying on an unrecorded local environment.

## Dependency order

```text
GPL-P01 -> GPL-P02                           COMPLETE
                 |
                 +--> GPL-P03 SBOM
                 |       |
                 |       v
                 +--> GPL-P04 package reconciliation
                 |       |
                 |       v
                 +--> GPL-P05 notices/replacement
                 |       |
                 |       v
                 +--> GPL-P06 reproducibility
                 |
                 +--> GPL-P07 historical audit
                 |
                 +--> GPL-P08 contributions
                 |
                 +--> GPL-P09 native CGAL (optional for first release)
                         |
                         v
                    GPL-P10 freeze
```

GPL-P03, GPL-P07, and GPL-P08 can proceed in parallel. GPL-P09 must not delay a
release that omits the standalone native worker and provides the declared
Python/VTK capability set.

## First-public-release gate

```text
GPL declarations consistent                       PASS
known CGAL/pygalmesh source closure               PASS
Windows/Linux source-bundle generation            PASS
transitive SBOMs                                   REQUIRED
installer-to-SBOM reconciliation                  REQUIRED
installed license/source visibility               REQUIRED
clean build and replacement evidence              REQUIRED
historical downloadable artifacts disposition     REQUIRED
contribution policy                               REQUIRED
native CGAL gate                                  OPTIONAL / MUST REMAIN EXCLUDED
```

No release note may claim complete license clearance until every required row
has reviewed evidence.
