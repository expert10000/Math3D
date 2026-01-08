Math3D

Build the renderer into /dist

npm run build

Functionality

Overview

Math3D is a desktop visual lab for classical geometry and modern surface theory. It combines
three main visualization modes (implicit, explicit graph, and parametric) with a shared set of
tools for lighting, materials, probing, slicing, and comparative inspection. The goal is to
let you explore geometry interactively with minimal friction, while keeping the math visible
and editable.

Core modes

1) Implicit surfaces (f(x,y,z)=0)

- Purpose: Explore level sets of scalar fields in 3D.
- Rendering: A Marching Cubes grid is sampled over a finite box to extract the isosurface.
- Presets: Classical quadric families and named minimal surfaces are available, with custom
  expressions for user-defined forms.
- Custom expression: Enter f(x,y,z)=0 using standard math syntax. The surface is updated
  in real time and errors are reported inline.

2) Graph surfaces (z=f(x,y))

- Purpose: Study height fields and explicit graphs with curvature and contour tools.
- Rendering: A parametric grid in the domain (x,y) is mapped to world coordinates using
  z=f(x,y). This keeps normals and derivative-based measurements consistent across tools.
- Presets: Saddles, waves, Gaussians, and several radially symmetric examples. Custom
  expressions are also supported.
- Curvature: The app computes local invariants (K, H, k1, k2) at the probe point and can
  color the mesh by curvature.

3) Parametric surfaces (sigma(u,v))

- Purpose: Work with classical parametrizations, global topology, and geodesic tools.
- Rendering: A parametric grid in (u,v) is sampled and mapped into 3D. Domains can be
  edited to control coverage and reduce self-intersection clutter.
- Presets: Canonical examples such as torus, helicoid, catenoid, Enneper, and others.
- Custom param: Provide X(u,v), Y(u,v), Z(u,v) expressions for custom surfaces.

Surface catalog and presets

Math3D ships with a curated set of presets in each category. These are grouped by mode and
shown in the surface picker. The list includes:

- Implicit: sphere, ellipsoid, hyperboloids, torus (implicit), gyroid, superquadric, and
  other named examples.
- Graph: saddles, waves, Gaussian bumps, ripple families, and multiple sinc variants.
- Parametric: plane, cylinder, cone, sphere, torus, Moebius, Klein bottle, and more.

Presets are intended to be simple but illustrative. They serve as a starting point for
investigating curvature, topology, and singularities. The graph and implicit modes both
support custom expressions, and parametric mode supports custom coordinate maps.

Material and lighting controls

The viewer includes a unified material palette shared across modes:

- Material roughness and metalness to control specular response.
- Opacity to study self-intersections and internal structure.
- Wireframe toggle for geometric analysis.
- Multiple lighting presets for clarity or depth.

Lighting presets are designed to emphasize shape and curvature without overwhelming the
surface with shadows. Use softer presets for smooth curvature analysis and higher contrast
for structural forms.

Color modes and palettes

Color is a key analytic tool in Math3D. The app offers several color modes:

- Solid: clean material color, no vertex coloring.
- Height: color by world-space height.
- Radius: color by distance from origin.
- Curvature: graph mode and implicit overlays, color by curvature magnitude.
- Gaussian / mean / principal curvatures for graph and parametric modes.

You can also choose from multiple palettes (blue-red, rainbow, grayscale, red-yellow).

Probe and inspection tools

Probe mode provides precise local inspection:

- Click a surface to retrieve a point p and a unit normal n.
- Show normals, tangents, and a local tangent plane.
- For graph surfaces, compute curvature invariants (K, H, k1, k2).
- Probe coordinates are displayed in the side panel and can be reused as domain inputs.

This enables a workflow like: pick a point, inspect derivatives, adjust parameters, compare
with a second surface, and quickly see the geometric changes.

Implicit overlays

Implicit surfaces can be hard to read because the surface is extracted from a volume. Two
extra overlays improve insight:

- Normal lines derived from the gradient of f(x,y,z), displayed as small vectors.
- Curvature coloring computed from gradient and Hessian samples.

These overlays can be toggled independently, and they are useful for understanding behavior
near singularities or asymptotic regions.

Contours and slicing

Graph mode includes contour lines that represent level sets of z in the domain. This makes
it easy to connect geometry to 2D intuition. The number of contour levels is adjustable.

Slicing adds multi-plane cross sections:

- Enable XY, YZ, and XZ slices independently.
- Adjust offsets per plane to sweep through the surface.
- Optional slice sheets and line coloring for visual clarity.

Slicing is effective for understanding the implicit surfaces because it reveals how the
level set intersects coordinate planes.

Domain pickers and presets

Right-panel domain tools let you control where your surface is sampled:

- Graph domains define x-span and y-span, changing the visible region.
- Parametric domains define u/v min and max values, controlling coverage.

Both graph and param domains support saved presets:

- Save a domain per surface with an optional label.
- Reapply saved domains to restore a preferred view.
- Domains are stored per surface to keep changes local and reproducible.

Domain pickers also support direct clicking to send a domain point to the active surface
viewer, enabling quick targeting for probes or custom evaluations.

Compare mode

The compare mode provides a side-by-side view with synchronized cameras. This is useful for
studying variations between related surfaces, parameter choices, or expression tweaks.

Key behaviors:

- A leader view drives camera updates in the compare view.
- Both views share lighting/material settings for consistent analysis.
- Compare mode is available for implicit, graph, and parametric modes.

Examples of use cases:

- Compare a catenoid and a helicoid.
- Compare two graph expressions with only one parameter changed.
- Contrast implicit torus vs parametric torus.

Command console

An inline command interface supports quick changes without hunting through controls:

- Switch surfaces and modes.
- Change expressions for graph and implicit modes.
- Adjust resolution and color modes.
- Inspect probe data from the current cursor selection.

This is intended for power users and for repeatable workshop demos.

Data storage

Presets and domain preferences are stored locally in the browser storage environment, with
keys scoped by surface id. This keeps the state user-specific without requiring an external
backend.

Performance notes

Surface rendering is compute-heavy. To keep interaction smooth:

- Use moderate resolutions for Marching Cubes.
- Increase resolution only when studying small-scale details.
- Avoid overly large domain spans for implicit and graph surfaces.

When compare mode is enabled, rendering cost doubles. If performance drops, lower resolution
or disable heavy overlays (curvature or dense contours).

Tips for exploration

- Start with a canonical surface (sphere, torus, saddle) and enable curvature coloring.
- Use probe mode to locate critical points and read off curvature values.
- Activate slicing to reveal hidden structure inside implicit surfaces.
- Save multiple domains for a single surface to quickly switch viewpoints.

Troubleshooting

- If a surface fails to render, check for syntax errors in custom expressions.
- If the view looks empty, reduce the domain spans or reset them to defaults.
- If performance drops, lower resolution or turn off overlays.

Limitations and future extensions

Math3D focuses on interactive clarity. Some advanced features are approximated numerically
(e.g., curvature for implicit surfaces is estimated from local samples). The system is
extensible and designed to support additional surface families, export options, and more
specialized analytic tools.

Summary

Math3D provides a cohesive environment for studying surfaces across implicit, explicit, and
parametric definitions. With probes, overlays, slicing, and compare tools, it supports both
intuitive exploration and mathematically precise inspection.
