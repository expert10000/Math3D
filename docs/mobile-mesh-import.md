# Math3D mobile mesh import

The Workspace **Add to Project → Mesh** flow picks, parses, previews, and atomically commits bounded mesh files. No project state changes before confirmation.

## MOB60 formats

- OBJ supports positions, normals, positive/negative indices, independent normal indices, and fan triangulation. Texture coordinates and materials are reported but not retained.
- STL supports ASCII and binary records. Invalid or missing facet normals are regenerated.
- PLY supports ASCII, binary little-endian, and binary big-endian scalar/list properties. Polygon faces are triangulated; unsupported vertex attributes are summarized.

OBJ, STL, and PLY coordinates are treated as Math3D Z-up, unitless scene units. The preview states those assumptions before commit.

## Safety and persistence

Source files are capped at 32 MB, embedded imports at 250,000 vertices and 500,000 triangles, and parsing has a processing-time deadline. Truncation, invalid counts, non-finite coordinates, out-of-range indices, and unsupported formats fail before persistence.

Every decoded mesh passes through the MOB52 admission controller. A full or locally reduced preview may render, while the validated source geometry remains embedded in the project's `math3d.scene-object.imports.v1` record. Reopening the project reconstructs and re-admits that mesh before GPU upload. Cancellation, rejection, and storage failure leave the project unchanged.
