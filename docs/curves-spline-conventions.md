# Curve spline conventions

Math3D stores Bézier, B-spline, and NURBS curves as mathematical definitions. Display tessellation is derived data and is never serialized as the curve definition.

## Canonical definition

A version 1 spline contains a stable ID and revision, name, kind, dimension, degree, ordered control points, complete knot vector, one positive weight per control point, closure/periodicity/clamping flags, and the valid parameter domain. The knot vector has `controlPointCount + degree + 1` nondecreasing entries. The valid domain is `[U[degree], U[controlPointCount]]`.

Bézier curves use a clamped two-value knot vector with endpoint multiplicity `degree + 1`; their degree is `controlPointCount - 1`. Non-rational B-splines store unit weights. NURBS weights are finite and strictly positive. Rational evaluation occurs in homogeneous coordinates before projection back to Euclidean space.

`closed` means the evaluated endpoints represent one topological point. `periodic` means the basis and control sequence repeat across the seam. `clamped` means each endpoint knot has multiplicity `degree + 1`. A definition cannot be both periodic and clamped.

## Evaluation and editing

Knot spans use the half-open convention `[U[i], U[i+1])`, with the final domain endpoint assigned to the last span. Basis values use the stable local Cox–de Boor recurrence. Bézier construction evidence uses De Casteljau levels; B-spline and NURBS evidence uses De Boor levels and the active basis values.

Control-point, knot, degree, and weight edits create a new revision. Bézier subdivision and degree elevation preserve geometry exactly. Degree reduction and knot removal return no result when reconstruction exceeds the requested tolerance. Knot insertion uses homogeneous coordinates for NURBS curves.

Join tools use these meanings:

- `C0`: coincident endpoint position.
- `C1`: equal first derivative after accounting for degree.
- `C2`: equal first and second derivatives after accounting for degree.
- `G1`: parallel tangents with the receiving curve's handle length retained.
- `G2`: `G1` plus aligned second-order shape behavior.

## Serialization

Spline JSON stores the complete version 1 definition, including control points, knots, and weights. Parsing validates the definition and returns an independent copy. Runtime evaluators, construction evidence, display samples, and undo cursor state are rebuilt and are not serialized into the curve definition.
