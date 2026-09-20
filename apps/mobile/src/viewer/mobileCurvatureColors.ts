import * as THREE from "three";

export type MobileSurfaceColorMode = "solid" | "curvature" | "curvature-faces";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const colorForIntensity = (intensity: number) => {
  const low = new THREE.Color("#2563eb");
  const middle = new THREE.Color("#2dd4bf");
  const high = new THREE.Color("#f97316");
  const t = clamp01(intensity);
  return t <= 0.5 ? low.lerp(middle, t * 2) : middle.lerp(high, (t - 0.5) * 2);
};

/** Color each triangle by normal change per unit edge length across neighboring faces. */
export const colorizeSurfaceCurvature = (
  source: any,
  mode: Exclude<MobileSurfaceColorMode, "solid">
): any => {
  const position = source.getAttribute("position");
  if (!position || position.count < 3) return source;

  const index = source.getIndex();
  const faceCount = Math.floor((index?.count ?? position.count) / 3);
  const scores = new Float32Array(faceCount);
  const neighborCounts = new Uint8Array(faceCount);
  const normals: any[] = new Array(faceCount);
  const edges = new Map<string, { face: number; length: number }>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const vertexAt = (corner: number) => index ? index.getX(corner) : corner;

  for (let face = 0; face < faceCount; face += 1) {
    const ids = [vertexAt(face * 3), vertexAt(face * 3 + 1), vertexAt(face * 3 + 2)];
    a.fromBufferAttribute(position, ids[0]);
    b.fromBufferAttribute(position, ids[1]);
    c.fromBufferAttribute(position, ids[2]);
    normals[face] = ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize().clone();
    for (const [from, to] of [[0, 1], [1, 2], [2, 0]]) {
      const first = ids[from];
      const second = ids[to];
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      const edgeLength = Math.hypot(
        position.getX(first) - position.getX(second),
        position.getY(first) - position.getY(second),
        position.getZ(first) - position.getZ(second)
      );
      const previous = edges.get(key);
      if (previous) {
        if (normals[previous.face].lengthSq() < 1e-12 || normals[face].lengthSq() < 1e-12) continue;
        const dot = Math.max(-1, Math.min(1, normals[previous.face].dot(normals[face])));
        const change = Math.acos(dot) / Math.max(1e-6, (previous.length + edgeLength) * 0.5);
        if (Number.isFinite(change)) {
          scores[face] += change;
          scores[previous.face] += change;
          neighborCounts[face] += 1;
          neighborCounts[previous.face] += 1;
        }
      } else {
        edges.set(key, { face, length: edgeLength });
      }
    }
  }

  for (let face = 0; face < faceCount; face += 1) {
    scores[face] = neighborCounts[face] ? scores[face] / neighborCounts[face] : 0;
  }
  const ordered = Array.from(scores).filter(Number.isFinite).sort((left, right) => left - right);
  const low = ordered[Math.floor((ordered.length - 1) * 0.1)] ?? 0;
  const high = ordered[Math.floor((ordered.length - 1) * 0.9)] ?? 0;
  const normalized = (score: number) => high > low + 1e-9 ? clamp01((score - low) / (high - low)) : 0.5;

  if (mode === "curvature-faces") {
    const geometry = index ? source.toNonIndexed() : source;
    const colors = new Float32Array(faceCount * 9);
    for (let face = 0; face < faceCount; face += 1) {
      const color = colorForIntensity(normalized(scores[face]));
      for (let corner = 0; corner < 3; corner += 1) color.toArray(colors, face * 9 + corner * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  const vertexScores = new Float32Array(position.count);
  const vertexCounts = new Uint32Array(position.count);
  for (let face = 0; face < faceCount; face += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = vertexAt(face * 3 + corner);
      vertexScores[vertex] += scores[face];
      vertexCounts[vertex] += 1;
    }
  }
  const colors = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const score = vertexCounts[vertex] ? vertexScores[vertex] / vertexCounts[vertex] : 0;
    colorForIntensity(normalized(score)).toArray(colors, vertex * 3);
  }
  source.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return source;
};
