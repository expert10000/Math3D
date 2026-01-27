export type DiskPoint3 = { x: number; y: number; z: number };

export type GeodesicDiskStats = {
  vertexCount: number;
  triangleCount: number;
  area: number;
  perimeter: number;
  phi: {
    min: number;
    max: number;
    mean: number;
  };
};

export type GeodesicDiskMesh = {
  positions: Float32Array;
};

export type GeodesicDiskResult = {
  mesh: GeodesicDiskMesh | null;
  boundary: DiskPoint3[][];
  stats: GeodesicDiskStats;
};

type Vertex = { x: number; y: number; z: number; phi: number };
type Segment3 = { a: DiskPoint3; b: DiskPoint3 };

function triArea(a: DiskPoint3, b: DiskPoint3, c: DiskPoint3) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

function interpolate(a: Vertex, b: Vertex, level: number): Vertex {
  const dv = b.phi - a.phi;
  if (Math.abs(dv) < 1e-12) {
    return {
      x: 0.5 * (a.x + b.x),
      y: 0.5 * (a.y + b.y),
      z: 0.5 * (a.z + b.z),
      phi: level,
    };
  }
  const t = Math.max(0, Math.min(1, (level - a.phi) / dv));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    phi: level,
  };
}

function clipTriangle(verts: Vertex[], level: number, eps: number): Vertex[] {
  const out: Vertex[] = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const insideA = a.phi <= level + eps;
    const insideB = b.phi <= level + eps;
    if (insideA && insideB) {
      out.push(b);
    } else if (insideA && !insideB) {
      out.push(interpolate(a, b, level));
    } else if (!insideA && insideB) {
      out.push(interpolate(a, b, level));
      out.push(b);
    }
  }
  return out;
}

function stitchSegments3D(segments: Segment3[], eps: number): DiskPoint3[][] {
  const polylines: DiskPoint3[][] = [];
  if (!segments.length) return polylines;
  const eps2 = eps * eps;
  const near = (p: DiskPoint3, q: DiskPoint3) => {
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const dz = p.z - q.z;
    return dx * dx + dy * dy + dz * dz <= eps2;
  };
  const addPoint = (line: DiskPoint3[], p: DiskPoint3, toStart: boolean) => {
    if (!line.length) {
      line.push({ x: p.x, y: p.y, z: p.z });
      return;
    }
    const existing = toStart ? line[0] : line[line.length - 1];
    if (near(existing, p)) return;
    if (toStart) line.unshift({ x: p.x, y: p.y, z: p.z });
    else line.push({ x: p.x, y: p.y, z: p.z });
  };

  for (const seg of segments) {
    const { a, b } = seg;
    let ia = -1;
    let ib = -1;
    let aAtStart = false;
    let bAtStart = false;

    for (let i = 0; i < polylines.length; i++) {
      const line = polylines[i];
      if (near(line[0], a)) {
        ia = i;
        aAtStart = true;
        break;
      }
      if (near(line[line.length - 1], a)) {
        ia = i;
        aAtStart = false;
        break;
      }
    }

    for (let i = 0; i < polylines.length; i++) {
      const line = polylines[i];
      if (near(line[0], b)) {
        ib = i;
        bAtStart = true;
        break;
      }
      if (near(line[line.length - 1], b)) {
        ib = i;
        bAtStart = false;
        break;
      }
    }

    if (ia === -1 && ib === -1) {
      polylines.push([
        { x: a.x, y: a.y, z: a.z },
        { x: b.x, y: b.y, z: b.z },
      ]);
      continue;
    }

    if (ia !== -1 && ib === -1) {
      const line = polylines[ia];
      addPoint(line, b, aAtStart);
      continue;
    }

    if (ia === -1 && ib !== -1) {
      const line = polylines[ib];
      addPoint(line, a, bAtStart);
      continue;
    }

    if (ia === ib) {
      continue;
    }

    const lineA = polylines[ia];
    const lineB = polylines[ib];
    if (aAtStart) lineA.reverse();
    if (!bAtStart) lineB.reverse();
    lineA.push(...lineB);
    polylines.splice(ib, 1);
  }

  return polylines;
}

function perimeterFromPolylines(polylines: DiskPoint3[][], eps: number) {
  let total = 0;
  for (const line of polylines) {
    if (line.length < 2) continue;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    const first = line[0];
    const last = line[line.length - 1];
    const loopDist = Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z);
    if (loopDist <= eps) total += loopDist;
  }
  return total;
}

export function buildGeodesicDisk(params: {
  positions: ArrayLike<number>;
  indices: ArrayLike<number> | null;
  phi: ArrayLike<number>;
  radius: number;
}): GeodesicDiskResult {
  const { positions, indices, phi, radius } = params;
  const vertexCount = Math.floor(positions.length / 3);
  const triCount = indices && indices.length >= 3
    ? Math.floor(indices.length / 3)
    : Math.floor(vertexCount / 3);
  const level = radius;
  const eps = Math.max(1e-8, Math.abs(radius) * 1e-6);

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  const stitchEps = Math.max(1e-6, diag * 1e-5);

  let insideCount = 0;
  let phiSum = 0;
  let phiMin = Infinity;
  let phiMax = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const v = phi[i];
    if (!Number.isFinite(v)) continue;
    if (v <= level + eps) {
      insideCount++;
      phiSum += v;
      if (v < phiMin) phiMin = v;
      if (v > phiMax) phiMax = v;
    }
  }

  const outPositions: number[] = [];
  let area = 0;
  let triOut = 0;
  const segments: Segment3[] = [];

  for (let t = 0; t < triCount; t++) {
    const base = t * 3;
    const i0 = indices ? Number(indices[base]) : base;
    const i1 = indices ? Number(indices[base + 1]) : base + 1;
    const i2 = indices ? Number(indices[base + 2]) : base + 2;
    if (
      i0 < 0 || i1 < 0 || i2 < 0 ||
      i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount
    ) {
      continue;
    }
    const p0: Vertex = {
      x: positions[i0 * 3],
      y: positions[i0 * 3 + 1],
      z: positions[i0 * 3 + 2],
      phi: phi[i0],
    };
    const p1: Vertex = {
      x: positions[i1 * 3],
      y: positions[i1 * 3 + 1],
      z: positions[i1 * 3 + 2],
      phi: phi[i1],
    };
    const p2: Vertex = {
      x: positions[i2 * 3],
      y: positions[i2 * 3 + 1],
      z: positions[i2 * 3 + 2],
      phi: phi[i2],
    };
    if (
      !Number.isFinite(p0.phi) ||
      !Number.isFinite(p1.phi) ||
      !Number.isFinite(p2.phi)
    ) {
      continue;
    }

    const clipped = clipTriangle([p0, p1, p2], level, eps);
    if (clipped.length >= 3) {
      const a = clipped[0];
      for (let i = 1; i + 1 < clipped.length; i++) {
        const b = clipped[i];
        const c = clipped[i + 1];
        outPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        area += triArea(a, b, c);
        triOut++;
      }
    }

    const inside0 = p0.phi <= level;
    const inside1 = p1.phi <= level;
    const inside2 = p2.phi <= level;
    const pts: DiskPoint3[] = [];
    if (inside0 !== inside1) pts.push(interpolate(p0, p1, level));
    if (inside1 !== inside2) pts.push(interpolate(p1, p2, level));
    if (inside2 !== inside0) pts.push(interpolate(p2, p0, level));
    if (pts.length === 2) {
      segments.push({ a: pts[0], b: pts[1] });
    }
  }

  const boundary = stitchSegments3D(segments, stitchEps);
  const perimeter = perimeterFromPolylines(boundary, stitchEps);
  const mesh = outPositions.length ? { positions: new Float32Array(outPositions) } : null;
  const stats: GeodesicDiskStats = {
    vertexCount: insideCount,
    triangleCount: triOut,
    area,
    perimeter,
    phi: {
      min: Number.isFinite(phiMin) ? phiMin : NaN,
      max: Number.isFinite(phiMax) ? phiMax : NaN,
      mean: insideCount ? phiSum / insideCount : NaN,
    },
  };

  return { mesh, boundary, stats };
}
