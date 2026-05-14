import * as THREE from "three";
import type { GeometryScene, Point3, Segment3 } from "@math3d/core";
import { createDefaultLineMaterial } from "./materials";

const toVector3 = (p: Point3): THREE.Vector3 => new THREE.Vector3(p.x, p.y, p.z);

const buildPointsObject = (points: Point3[]): THREE.Points => {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    vertices[i * 3 + 0] = p.x;
    vertices[i * 3 + 1] = p.y;
    vertices[i * 3 + 2] = p.z;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  const material = new THREE.PointsMaterial({ size: 0.05, color: 0xef4444 });
  return new THREE.Points(geometry, material);
};

const buildSegmentObject = (segments: Segment3[]): THREE.LineSegments => {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array(segments.length * 2 * 3);
  for (let i = 0; i < segments.length; i += 1) {
    const a = segments[i].a;
    const b = segments[i].b;
    const base = i * 6;
    vertices[base + 0] = a.x;
    vertices[base + 1] = a.y;
    vertices[base + 2] = a.z;
    vertices[base + 3] = b.x;
    vertices[base + 4] = b.y;
    vertices[base + 5] = b.z;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  return new THREE.LineSegments(geometry, createDefaultLineMaterial());
};

export const buildThreeSceneFromGeometry = (geometryScene: GeometryScene): THREE.Group => {
  const root = new THREE.Group();
  if (geometryScene.points?.length) root.add(buildPointsObject(geometryScene.points));
  if (geometryScene.segments?.length) root.add(buildSegmentObject(geometryScene.segments));
  if (geometryScene.lines?.length) {
    for (const line of geometryScene.lines) {
      const start = toVector3(line.origin);
      const length = Math.max(0.1, line.length ?? 2);
      const end = start.clone().add(new THREE.Vector3(line.direction.x, line.direction.y, line.direction.z).multiplyScalar(length));
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      root.add(new THREE.Line(lineGeometry, createDefaultLineMaterial({ color: line.color, opacity: line.opacity })));
    }
  }
  return root;
};

export const createReferenceGrid = (size = 20, divisions = 20): THREE.GridHelper =>
  new THREE.GridHelper(size, divisions, 0x64748b, 0xcbd5e1);
