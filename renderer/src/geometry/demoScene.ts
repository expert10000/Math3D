import type { GeometryScene, Point3, Polygon3, Polyhedron } from "./types";

const pt = (x: number, y: number, z: number, label: string): Point3 => ({ x, y, z, label });

export const buildDemoPyramidScene = (): GeometryScene => {
  const A = pt(-1.2, -1.0, 0, "A");
  const B = pt(1.25, -1.0, 0, "B");
  const C = pt(1.0, 1.1, 0, "C");
  const D = pt(-1.1, 1.1, 0, "D");
  const S = pt(0.1, 0.2, 1.6, "S");

  const base: Polygon3 = { vertices: [A, B, C, D], opacity: 0.25 };
  const faceABS: Polygon3 = { vertices: [A, B, S], opacity: 0.35 };
  const faceBCS: Polygon3 = { vertices: [B, C, S], opacity: 0.35 };
  const faceCDS: Polygon3 = { vertices: [C, D, S], opacity: 0.35 };
  const faceDAS: Polygon3 = { vertices: [D, A, S], opacity: 0.35 };

  const pyramid: Polyhedron = {
    faces: [base, faceABS, faceBCS, faceCDS, faceDAS],
  };

  return {
    points: [A, B, C, D, S],
    polyhedra: [pyramid],
  };
};
