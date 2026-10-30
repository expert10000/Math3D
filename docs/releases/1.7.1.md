# Math3D 1.7.1

This desktop and web update improves the Scientific Field Explorer's linked
selection workflow and keeps the 1.7.0 scientific source checks in place.

## Scientific Field Explorer and Graphs

- A combined vector, scalar, and complex rectangle can send six column and six
  row profiles to Graphs: vector speed, scalar value, complex magnitude,
  complex phase, divergence, and curl magnitude. Each series retains its
  physical coordinates, units, gaps, source references, and verified hashes.
- A column strip and row strip can form one physical subrectangle. In Explorer,
  two clicks on an XY, XZ, or YZ slice preview its bounds before the user
  focuses all twelve Graphs profiles. Graphs and Explorer keep the selection
  aligned after a Project reopen.
- Saved profiles and their shared selection are shown only after their point
  tables and pinned sources reverify. A changed source tile withholds the
  affected result and the shared intersection.

## Symbolic jobs and release scope

- Additional Sage polynomial, calculus, matrix, Groebner, and number-theory
  operations run through the shared execution service.
- This release retains the 1.7.0 desktop and web scope. The Android companion
  remains separately versioned at 1.6.0; no new Android artifact is published.

The tag workflow must build new Windows and Linux packages. Publication depends
on clean-install and published-1.6.0 upgrade checks against the exact Windows
installer bytes, plus matching hashes for the release assets. The 1.7.0
candidate checks do not certify 1.7.1 binaries.

Detailed scope: [scientific field roadmap](docs/scientific-field-explorer-roadmap.md)
and [installed-app signoff](docs/stable-two-app-signoff.md).
