# Corresponding Source for Math3D Releases

Math3D release binaries that contain GPL- or LGPL-covered components are
published with equivalent access to the complete corresponding source.

For every release, obtain source from the same GitHub release page as the
binary. The release assets include:

- `Math3D-<version>-source.zip`: the exact tagged Math3D source, build scripts,
  packaging configuration, interface definitions, and license material;
- upstream source archives for CGAL, CGAL Python/SWIG bindings, pygalmesh,
  GMP, and MPFR that correspond to the packaged platform;
- `SOURCE_MANIFEST-<platform>.json`, recording source URLs, versions, target
  platforms, SHA-256 hashes, the Math3D commit, and the frozen Python package
  inventory;
- package checksum files covering all release assets.

The source bundle is generated from the release tag with:

```text
npm ci
npm run verify:license-compliance
npm run release:source -- --target windows --out release-source
# or: --target linux
```

Build the application using the commands and workflows stored in that tagged
source. The primary desktop packaging commands are:

```text
npm run dist:ci
npm run dist:linux:ci
```

Python worker dependencies are pinned in
`python/worker/requirements.freeze.txt`. Native reference versions and source
hashes are stored in `compliance/public-source-manifest.json` and
`native/cgal-worker/dependency-manifest.json`.

Release sources are offered at no additional charge and remain available for
at least as long as the corresponding binaries are offered. If a release page
is missing a listed source asset, do not redistribute that binary; report the
problem through the repository issue tracker.

This offer applies to source for GPL/LGPL-covered parts and the material needed
to generate, install, run, and modify the distributed executable. It does not
remove the separate notices and permissions of permissively licensed
components.
