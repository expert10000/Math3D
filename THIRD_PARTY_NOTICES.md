# Math3D Third-Party Notices

Math3D's combined release distribution is provided under GPL-3.0-or-later.
Individual third-party components retain their copyrights and licenses. This
file is a human-readable summary; the license metadata shipped inside package
distributions and the per-release SBOM/source manifest remain authoritative.

## Copyleft components in the frozen scientific worker

| Component | Release baseline | License and role |
| --- | --- | --- |
| CGAL | 6.0.1 Python-worker baseline; 5.4 Linux build baseline; 6.2.1 standalone native reference | CGAL packages use GPL-3.0-or-later or LGPL-3.0-or-later on a package-by-package basis. Math3D uses GPL-covered meshing and polygon-mesh operations. |
| CGAL Python/SWIG bindings | 6.0.1.post202410241521 | GPL-3.0-or-later or a separately purchased commercial license. |
| pygalmesh | 0.10.7 | GPL-3.0-or-later or a separately purchased commercial license. |
| GNU MP (GMP) | 6.3.0 reference baseline | LGPL-3.0-or-later or GPL-2.0-or-later, at the recipient's option. |
| GNU MPFR | 4.2.2 reference baseline | LGPL-3.0-or-later. |

Corresponding source archives for the versions used by each release are
published beside the release binaries. URLs and SHA-256 values are defined in
`compliance/public-source-manifest.json` and materialized by
`npm run release:source`.

## Principal permissive components

Math3D also distributes or depends on components under permissive licenses,
including Electron/Chromium, React, D3, Three.js, VTK, NumPy, SciPy, SymPy,
SQLite/better-sqlite3, and their transitive dependencies. Their copyright and
license files are retained in the npm/Python distributions and generated
release SBOM. VTK is distributed under its BSD-style license.

No project name or contributor name may be used to imply endorsement where a
third-party license prohibits it.

## Historical Math3D licensing

Math3D material published before the GPL transition was made available under
Apache-2.0. The Apache-2.0 text is preserved in
`LICENSES/Apache-2.0.txt`. Such material may be incorporated into the GPLv3
combined work because Apache-2.0 is GPLv3-compatible; its existing attribution
and patent terms are not removed.

## Source and relinking information

See `SOURCE_OFFER.md` for corresponding-source access and build instructions.
Recipients may rebuild and replace the worker and libraries with modified
versions. Math3D does not require a vendor signature, activation key, or remote
attestation to run a recipient-built desktop package.
