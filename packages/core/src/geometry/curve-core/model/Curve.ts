import type { CurveDomain } from "./CurveDomain";

export type CurveKind =
  | "parametric"
  | "bezier"
  | "bspline"
  | "nurbs"
  | "polyline"
  | "custom";

export type CurveFamily = "parametric" | "explicit" | "implicit" | "polyline";

export type ParametricCurveSubtype = "2d" | "3d" | "polynomial" | "rational" | "spline" | "nurbs";

export interface CurveBase {
  id: string;
  name: string;
  kind: CurveKind;
  family?: CurveFamily;
  subtype?: ParametricCurveSubtype;
  domain: CurveDomain;
}
