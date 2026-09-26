# Mobile object export and sharing

MOB62 adds single-object export and native sharing from Workspace > Object.

## Lossless semantic export

`Export object` and `Share object` create a versioned `math3d.scene-object` JSON envelope. The export keeps the mathematical definition, domain and resolution intent, transform, visibility, supported style, compatible analysis metadata, source project/object identity, producer, and content hash. Before the file is offered to the user, mobile serializes it canonically, reads it back through the shared validator, and verifies the content hash. File-system exports are read back again after writing.

Names contain a portable object slug, UTC timestamp, and content-hash prefix. If the chosen directory already contains that name, the native export service adds a numeric suffix instead of replacing the file.

## Derived mesh export

OBJ, ASCII PLY, and ASCII STL are supported. A confirmation explains that these formats do not contain formulas, editable definitions, domains, analysis metadata, or Math3D provenance. The user may then export to a selected folder or open the native share sheet.

Locally renderable explicit, parametric, and Weierstrass objects are tessellated at the active mobile quality. Implicit objects require a computed mesh. Imported mesh objects reuse their admitted embedded geometry. Every output is checked for finite positions, triangle indices, and valid index bounds before serialization.

Derived output intentionally contains geometry and normals only. Math3D style, materials, textures, and semantic definitions are not represented.
