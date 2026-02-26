export type Vec3 = { x: number; y: number; z: number };

export type Point3 = Vec3 & {
  id?: string;
  label?: string;
  color?: number;
  size?: number;
  opacity?: number;
};

export type Segment3 = {
  a: Point3;
  b: Point3;
  color?: number;
  opacity?: number;
  radiusScale?: number;
};

export type Line3 = {
  origin: Point3;
  direction: Vec3;
  length?: number;
  color?: number;
  opacity?: number;
  radiusScale?: number;
};

export type Plane3 = {
  point: Point3;
  normal: Vec3;
  size?: number;
  color?: number;
  opacity?: number;
};

export type Triangle3 = {
  a: Point3;
  b: Point3;
  c: Point3;
  color?: number;
  opacity?: number;
};

export type Polygon3 = {
  id?: string;
  label?: string;
  vertices: Point3[];
  color?: number;
  opacity?: number;
};

export type Polyhedron = {
  faces: Polygon3[];
  color?: number;
  opacity?: number;
};

export type GeometryScene = {
  points?: Point3[];
  segments?: Segment3[];
  lines?: Line3[];
  planes?: Plane3[];
  triangles?: Triangle3[];
  polygons?: Polygon3[];
  polyhedra?: Polyhedron[];
};
