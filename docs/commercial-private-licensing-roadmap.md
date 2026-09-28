# Math3D Commercial and Private Licensing Roadmap

## Status and authority

**Path:** B — commercial/private development and non-GPL distribution

**Status:** inactive; planning only

**Current product license:** GPL-3.0-or-later

**Activation rule:** Path B cannot ship until every rights, vendor-license,
dependency, separation, and release gate in this document passes.

This roadmap describes a possible future proprietary or commercially licensed
edition. It does not grant relicensing rights, authorize private use of public
contributions, or change the license of current Math3D releases.

## Objective

Create a legally and technically independent distribution that may keep its
own source private and may be redistributed under commercial terms, while:

- respecting all GPL rights in the public Math3D line;
- using only code for which the commercial edition has sufficient rights;
- obtaining commercial rights for GPL-covered CGAL packages and pygalmesh, or
  replacing them;
- retaining LGPL and permissive-license obligations;
- preventing accidental copying between public GPL and private codebases.

## Non-negotiable boundary

```text
PUBLIC GPL EDITION                    PRIVATE/COMMERCIAL EDITION
GPL contributions                    owned/relicensed/clean-room code
public CI and releases                access-controlled CI and artifacts
GPL CGAL/pygalmesh                    commercial licenses or replacements
public issue/code provenance          private provenance and rights ledger
          |                                      |
          +-------- stable protocol only --------+
```

A branch name, private repository, separate executable, or process boundary
does not itself create relicensing permission. Copyright and license rights
must cover every copied implementation and dependency.

## Entry conditions

Path B should start only when there is a concrete business requirement such as:

- a customer requires private modifications;
- an OEM needs non-GPL redistribution;
- a hosted or embedded product requires proprietary modules;
- commercial revenue justifies vendor licenses, legal review, and duplicated
  maintenance cost.

It should not start merely to reserve an option. From the activation point,
every public contribution increases the future rights-analysis burden unless a
relicensing policy is already in place.

## Executable sequence

### COM-P01 — business case and product boundary

**Status:** inactive

Define:

- which customers and platforms require a private edition;
- whether it is distributed, hosted, embedded, or used only internally;
- which public features must exist in the commercial product;
- revenue, support, security, and update expectations;
- acceptable one-time and annual licensing budgets;
- whether the public GPL edition remains feature-complete or becomes a shared
  foundation.

**Acceptance:** a signed product decision identifies distribution model,
features, customers, platforms, budget owner, and accountable legal reviewer.

### COM-P02 — copyright and relicensing rights ledger

**Status:** must precede private coding

Inventory every Math3D file and contribution by:

- author/copyright holder;
- original license and date;
- contribution agreement or DCO evidence;
- whether commercial relicensing rights exist;
- generated/vendor/copied status;
- whether the implementation may enter the private edition.

The current repository history is primarily one contributor, but this must be
verified at activation time. Future outside GPL contributions require explicit
commercial-relicensing permission or must remain public-only.

**Acceptance:** every private-edition source file maps to owned code, a valid
commercial grant, a permissive dependency, or a reviewed clean-room rewrite.

### COM-P03 — CGAL package usage map

**Status:** inactive

Map each compiled header and algorithm to the CGAL package and release used by:

- polygon-mesh Boolean/corefinement;
- surface shortest paths;
- surface and volume meshing;
- repair/remeshing/intersection features;
- Python bindings and the standalone native worker.

Record development, production, CI, customer distribution, cloud, and OEM
usage separately. Commercial terms may differ by use and package.

**Acceptance:** GeometryFactory can quote from an exact package/platform/use
list rather than a generic request for “CGAL.”

### COM-P04 — commercial CGAL quotation and contract

**Status:** inactive

Request an Industrial Development quotation from GeometryFactory. Confirm in
writing:

- all required CGAL components and versions;
- permitted products, affiliates, contractors, CI, and deployment platforms;
- redistribution, OEM, hosted, and internal-use rights;
- developer, build-agent, territory, and customer limitations;
- source/header delivery and upgrade rights;
- whether runtime royalties apply;
- maintenance/support price and renewal effects;
- treatment of GMP/MPFR and optional replacement number types.

Published vendor information describes Industrial Development licenses as
one-time, per-component fees independent of developer count and without
distribution royalties; the actual component prices require a quotation.

**Acceptance:** executed contracts cover the exact implementation and planned
distribution. A quote alone is not a license.

### COM-P05 — pygalmesh decision

**Status:** inactive

Choose one:

1. Obtain a separate commercial pygalmesh license from its copyright holder.
2. Remove pygalmesh and implement the required meshing protocol directly over
   commercially licensed CGAL C++ packages.
3. Keep pygalmesh only in the public GPL edition and provide a different
   private capability with explicit parity/limitation documentation.

Evaluate transitive dependencies such as meshio separately.

**Acceptance:** no GPL pygalmesh code, binary, generated binding, or copied
implementation enters the private product without a commercial grant.

### COM-P06 — LGPL and permissive dependency plan

**Status:** inactive

- Decide whether to ship GMP/MPFR dynamically with notices, corresponding
  source, and replacement/relinking support.
- Consider commercially licensed replacement number types only if LGPL
  operational requirements are unacceptable.
- Review VTK, Electron, Chromium, Node, Python, NumPy, SciPy, SymPy, SQLite,
  fonts, models, icons, and datasets under their individual terms.
- Generate a private-edition SBOM; commercial CGAL does not eliminate other
  open-source obligations.

**Acceptance:** every dependency has an approved use, license expression,
notice/source action, and owner.

### COM-P07 — edition architecture and protocol boundary

**Status:** inactive

Define a narrow, versioned boundary between editions. Prefer data/protocol
interoperability over shared unreviewed implementation:

```text
Math3D documents / scientific job protocol / artifact format
                         |
             +-----------+-----------+
             |                       |
      public adapters          private adapters
```

- Keep format/protocol specifications public when feasible.
- Maintain separate dependency manifests and build roots.
- Prevent private modules from importing GPL-only implementation packages.
- Prevent public builds from requiring commercial SDKs or credentials.
- Add automated dependency-direction and file-provenance checks.

**Acceptance:** both editions can be built independently from their authorized
sources, and cross-edition exchange uses documented interfaces rather than
copied GPL implementation.

### COM-P08 — repository and contribution governance

**Status:** inactive

- Choose a private repository and access-control model.
- Define who may copy fixes between editions and under which rights.
- Require provenance labels for public-to-private and private-to-public
  changes.
- Establish a security disclosure path that can patch both editions without
  license leakage.
- Adopt a CLA before accepting contributions intended for dual licensing, if
  advised by counsel.

**Acceptance:** every cross-edition change has a recorded source, author,
rights basis, reviewer, and destination license.

### COM-P09 — private build and release system

**Status:** inactive

Build separate CI that produces:

- private source and dependency attestations;
- commercial-license entitlement checks without exposing credentials;
- SBOMs and notices for redistributable dependencies;
- signed Windows/Linux packages;
- customer-specific source or object obligations where contracts require;
- update channels isolated from public GPL releases.

Commercial keys and contracts must never be committed to either repository or
embedded in public artifacts.

**Acceptance:** a clean private build proves entitlement, provenance,
dependency closure, tests, signing, notices, and customer delivery controls.

### COM-P10 — independent legal and release review

**Status:** mandatory before first distribution

Provide reviewers with:

- the rights ledger;
- CGAL and pygalmesh contracts;
- full private-edition SBOM;
- public/private dependency graph;
- build and artifact inventories;
- contribution agreements;
- customer/OEM license and EULA;
- source/notice obligations for retained open-source components.

**Acceptance:** written review approves the exact release candidate and
distribution model. Approval is version- and scope-specific, not permanent.

### COM-P11 — pilot and commercial freeze

**Status:** inactive

- Run a limited pilot with the approved platform and feature set.
- Test installation, offline operation, license enforcement, updates,
  dependency notices, support, rollback, and public-format interoperability.
- Freeze package versions, contracts, supported platforms, pricing model,
  maintenance policy, and public/private parity commitments.

**Acceptance:** the pilot artifact matches the reviewed rights ledger and SBOM,
and no GPL-only implementation appears in the private distribution.

## Dependency order

```text
COM-P01 business case
    |
    +--> COM-P02 rights ledger
    |
    +--> COM-P03 CGAL usage map -> COM-P04 CGAL contract
    |
    +--> COM-P05 pygalmesh decision
    |
    +--> COM-P06 other dependencies
                    |
                    v
              COM-P07 architecture
                    |
                    v
              COM-P08 governance
                    |
                    v
              COM-P09 private CI
                    |
                    v
              COM-P10 legal review
                    |
                    v
              COM-P11 pilot/freeze
```

COM-P02 through COM-P06 may proceed in parallel after the product boundary is
approved. Implementation begins only after the rights ledger and vendor
strategy show that the intended private product is feasible.

## Cost model

The private path budget is:

```text
CGAL one-time component licenses
+ pygalmesh commercial license or replacement engineering
+ optional annual CGAL maintenance (published as 20% of component prices)
+ LGPL operational/replacement work
+ legal review and contract negotiation
+ separate CI, signing, security, and release operations
+ ongoing dual-edition merge and test cost
```

Research licenses are not substitutes for an Industrial Development license
when the resulting software will be commercialized. No total should be
budgeted until written CGAL and pygalmesh quotations exist.

## Activation gate

```text
business case and budget owner                    REQUIRED
complete copyright/relicensing rights ledger     REQUIRED
executed CGAL commercial contract                REQUIRED
pygalmesh commercial grant or replacement        REQUIRED
LGPL/permissive dependency plan                  REQUIRED
separate edition architecture                    REQUIRED
contribution and cross-port governance           REQUIRED
private SBOM and clean build                     REQUIRED
written legal review                             REQUIRED
pilot artifact audit                             REQUIRED
```

Until every row passes, the commercial/private path remains planning-only and
all official Math3D releases continue under GPL-3.0-or-later.
