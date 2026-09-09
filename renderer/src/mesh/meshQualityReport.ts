import type { SurfaceMeshData } from "./surfaceMesh";

export type MeshQualityPoint3 = { x: number; y: number; z: number };
export type MeshQualityNumericSummary = { min: number | null; avg: number | null; max: number | null };

export type MeshTriangleQualityMetricKey =
  | "triangleArea" | "aspectRatio" | "edgeRatio" | "minimumAngleDeg"
  | "maximumAngleDeg" | "radiusRatio" | "scaledJacobian";
export type MeshQualityMetricDirection = "higher-is-worse" | "lower-is-worse";
export type MeshTriangleQualityDefinition = {
  id: MeshTriangleQualityMetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  method: string;
  direction: MeshQualityMetricDirection;
  idealValue: number | null;
};

export const MESH_TRIANGLE_QUALITY_DEFINITIONS: ReadonlyArray<MeshTriangleQualityDefinition> = [
  { id: "triangleArea", label: "Triangle area", shortLabel: "Area", unit: "mesh units^2", method: "VTK/Verdict cross-product area", direction: "lower-is-worse", idealValue: null },
  { id: "aspectRatio", label: "Aspect ratio", shortLabel: "Aspect", unit: "ratio", method: "VTK/Verdict greatest edge / (2 sqrt(3) inradius)", direction: "higher-is-worse", idealValue: 1 },
  { id: "edgeRatio", label: "Edge ratio", shortLabel: "Edge ratio", unit: "ratio", method: "VTK/Verdict longest edge / shortest edge", direction: "higher-is-worse", idealValue: 1 },
  { id: "minimumAngleDeg", label: "Minimum angle", shortLabel: "Min angle", unit: "degrees", method: "VTK/Verdict smallest interior angle", direction: "lower-is-worse", idealValue: 60 },
  { id: "maximumAngleDeg", label: "Maximum angle", shortLabel: "Max angle", unit: "degrees", method: "VTK/Verdict largest interior angle", direction: "higher-is-worse", idealValue: 60 },
  { id: "radiusRatio", label: "Radius ratio", shortLabel: "Radius", unit: "ratio", method: "VTK/Verdict circumradius / (2 inradius)", direction: "higher-is-worse", idealValue: 1 },
  { id: "scaledJacobian", label: "Scaled Jacobian", shortLabel: "Jacobian", unit: "normalized", method: "VTK/Verdict minimum normalized corner Jacobian", direction: "lower-is-worse", idealValue: 1 },
];

export const meshTriangleQualityDefinition = (metric: MeshTriangleQualityMetricKey): MeshTriangleQualityDefinition =>
  MESH_TRIANGLE_QUALITY_DEFINITIONS.find((entry) => entry.id === metric) ?? MESH_TRIANGLE_QUALITY_DEFINITIONS[0];

export type MeshQualityFaceDefect = { faceIndex: number; centroid: MeshQualityPoint3; area: number; aspectRatio: number };
export type MeshQualityEdgeDefect = {
  edgeId: string; a: number; b: number; pointA: MeshQualityPoint3; pointB: MeshQualityPoint3;
  midpoint: MeshQualityPoint3; length: number; incidentFaceCount: number; incidentFaces: number[];
};
export type MeshQualityFaceFields = Record<MeshTriangleQualityMetricKey, Float64Array>;

export type MeshQualityReport = {
  generatedAt: string;
  vertexCount: number;
  faceCount: number;
  metrics: {
    edgeLength: MeshQualityNumericSummary;
    triangleArea: MeshQualityNumericSummary;
    aspectRatio: MeshQualityNumericSummary;
    edgeRatio: MeshQualityNumericSummary;
    minimumAngleDeg: MeshQualityNumericSummary;
    maximumAngleDeg: MeshQualityNumericSummary;
    radiusRatio: MeshQualityNumericSummary;
    scaledJacobian: MeshQualityNumericSummary;
    vertexValence: MeshQualityNumericSummary;
    dihedralAngleDeg: MeshQualityNumericSummary;
  };
  fields: {
    face: MeshQualityFaceFields;
    faceValidMask: Uint8Array;
    faceCentroids: Float32Array;
    vertexValence: Float64Array;
    edgeLength: Float64Array;
    dihedralAngleDeg: Float64Array;
  };
  conventions: {
    backend: "Math3D VTK/Verdict-compatible";
    domain: "triangle faces";
    invalidValue: "NaN";
    idealEquilateral: "aspect ratio = edge ratio = radius ratio = scaled Jacobian = 1; angles = 60 deg";
  };
  topology: { boundaryEdgeCount: number; nonManifoldEdgeCount: number; degenerateFaceCount: number };
  defects: { degenerateFaces: MeshQualityFaceDefect[]; highAspectFaces: MeshQualityFaceDefect[]; nonManifoldEdges: MeshQualityEdgeDefect[] };
};

export type MeshQualityReportOptions = { highAspectRatioThreshold?: number; maxListedDefects?: number; onProgress?: (event: MeshQualityReportProgressEvent) => void };
export type MeshQualityReportPhase = "faces" | "edges" | "finalize";
export type MeshQualityReportProgressEvent = { phase: MeshQualityReportPhase; progress: number };
export type MeshQualityFaceSelection =
  | { mode: "threshold"; value: number; comparison?: "at-most" | "at-least" }
  | { mode: "worst-percent"; percent: number };
export type MeshQualityFaceSelectionResult = {
  selected: Uint8Array; count: number; cutoff: number | null;
  metric: MeshTriangleQualityMetricKey; mode: MeshQualityFaceSelection["mode"];
};

type FaceRecord = { faceIndex: number; area: number; aspectRatio: number; centroid: MeshQualityPoint3; normal: MeshQualityPoint3 | null; degenerate: boolean };
type EdgeRecord = { a: number; b: number; pointA: MeshQualityPoint3; pointB: MeshQualityPoint3; length: number; incidentFaces: number[] };
const RAD_TO_DEG = 180 / Math.PI;
const SQRT_3 = Math.sqrt(3);
const EPSILON_LENGTH = 1e-12;
const EPSILON_AREA_X2 = 1e-18;

const summary = (values: ArrayLike<number>): MeshQualityNumericSummary => {
  let min = Infinity, max = -Infinity, sum = 0, count = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value); max = Math.max(max, value); sum += value; count += 1;
  }
  return count ? { min, avg: sum / count, max } : { min: null, avg: null, max: null };
};
const asPoint = (positions: ArrayLike<number>, vertexIndex: number): MeshQualityPoint3 => {
  const base = vertexIndex * 3;
  return { x: Number(positions[base] ?? 0), y: Number(positions[base + 1] ?? 0), z: Number(positions[base + 2] ?? 0) };
};
const edgeKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const safeAcosDeg = (dot: number): number => Math.acos(Math.max(-1, Math.min(1, dot))) * RAD_TO_DEG;
const angleDeg = (origin: MeshQualityPoint3, first: MeshQualityPoint3, second: MeshQualityPoint3): number => {
  const ax = first.x - origin.x, ay = first.y - origin.y, az = first.z - origin.z;
  const bx = second.x - origin.x, by = second.y - origin.y, bz = second.z - origin.z;
  const denom = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz);
  return denom > EPSILON_LENGTH ? safeAcosDeg((ax * bx + ay * by + az * bz) / denom) : 0;
};
const triangleFromIndex = (indices: ArrayLike<number> | null, triangleIndex: number, vertexCount: number): { a: number; b: number; c: number } | null => {
  if (indices && indices.length >= 3) {
    const base = triangleIndex * 3, a = Number(indices[base]), b = Number(indices[base + 1]), c = Number(indices[base + 2]);
    if (![a, b, c].every((value) => Number.isInteger(value) && value >= 0 && value < vertexCount)) return null;
    return { a, b, c };
  }
  const a = triangleIndex * 3, b = a + 1, c = a + 2;
  return c < vertexCount ? { a, b, c } : null;
};
const createFaceFields = (faceCount: number): MeshQualityFaceFields => {
  const make = () => { const values = new Float64Array(faceCount); values.fill(Number.NaN); return values; };
  return { triangleArea: make(), aspectRatio: make(), edgeRatio: make(), minimumAngleDeg: make(), maximumAngleDeg: make(), radiusRatio: make(), scaledJacobian: make() };
};

export const selectMeshQualityFaces = (report: MeshQualityReport, metric: MeshTriangleQualityMetricKey, selection: MeshQualityFaceSelection): MeshQualityFaceSelectionResult => {
  const values = report.fields.face[metric];
  const selected = new Uint8Array(values.length);
  const valid: Array<{ index: number; value: number }> = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (report.fields.faceValidMask[index] && Number.isFinite(value)) valid.push({ index, value });
  }
  if (!valid.length) return { selected, count: 0, cutoff: null, metric, mode: selection.mode };
  let count = 0, cutoff: number | null = null;
  if (selection.mode === "threshold") {
    const comparison = selection.comparison ?? (meshTriangleQualityDefinition(metric).direction === "lower-is-worse" ? "at-most" : "at-least");
    cutoff = selection.value;
    for (const sample of valid) {
      if (comparison === "at-most" ? sample.value <= cutoff : sample.value >= cutoff) { selected[sample.index] = 1; count += 1; }
    }
  } else {
    const lowerIsWorse = meshTriangleQualityDefinition(metric).direction === "lower-is-worse";
    valid.sort((a, b) => lowerIsWorse ? a.value - b.value || a.index - b.index : b.value - a.value || a.index - b.index);
    const requested = Math.max(0, Math.min(valid.length, Math.ceil(valid.length * Math.max(0, Math.min(100, selection.percent)) / 100)));
    for (let index = 0; index < requested; index += 1) { selected[valid[index].index] = 1; count += 1; }
    cutoff = requested ? valid[requested - 1].value : null;
  }
  return { selected, count, cutoff, metric, mode: selection.mode };
};

export const computeMeshQualityReport = (mesh: Pick<SurfaceMeshData, "positions" | "indices">, options: MeshQualityReportOptions = {}): MeshQualityReport => {
  const emitProgress = (phase: MeshQualityReportPhase, progress: number) => options.onProgress?.({ phase, progress: Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) });
  const highAspectRatioThreshold = Number.isFinite(options.highAspectRatioThreshold) ? Math.max(1, Number(options.highAspectRatioThreshold)) : 8;
  const maxListedDefects = Number.isFinite(options.maxListedDefects) ? Math.max(1, Math.floor(Number(options.maxListedDefects))) : 120;
  const positions = mesh.positions, indices = mesh.indices ?? null;
  const vertexCount = Math.floor(positions.length / 3);
  const allocatedFaceCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  const faceFields = createFaceFields(allocatedFaceCount), faceValidMask = new Uint8Array(allocatedFaceCount);
  const faceCentroids = new Float32Array(allocatedFaceCount * 3); faceCentroids.fill(Number.NaN);
  const edgeMap = new Map<string, EdgeRecord>(), faces = new Map<number, FaceRecord>();
  const degenerateFaces: MeshQualityFaceDefect[] = [];
  const faceProgressStride = Math.max(1, Math.floor(allocatedFaceCount / 40));

  for (let faceIndex = 0; faceIndex < allocatedFaceCount; faceIndex += 1) {
    const tri = triangleFromIndex(indices, faceIndex, vertexCount); if (!tri) continue;
    const pA = asPoint(positions, tri.a), pB = asPoint(positions, tri.b), pC = asPoint(positions, tri.c);
    const ab = Math.hypot(pB.x-pA.x,pB.y-pA.y,pB.z-pA.z), bc = Math.hypot(pC.x-pB.x,pC.y-pB.y,pC.z-pB.z), ca = Math.hypot(pA.x-pC.x,pA.y-pC.y,pA.z-pC.z);
    const maxEdge = Math.max(ab,bc,ca), minEdge = Math.min(ab,bc,ca), perimeter = ab+bc+ca;
    const ux=pB.x-pA.x, uy=pB.y-pA.y, uz=pB.z-pA.z, vx=pC.x-pA.x, vy=pC.y-pA.y, vz=pC.z-pA.z;
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx, areaX2=Math.hypot(nx,ny,nz), area=0.5*areaX2;
    const normal = areaX2 > EPSILON_AREA_X2 ? {x:nx/areaX2,y:ny/areaX2,z:nz/areaX2} : null;
    const centroid = {x:(pA.x+pB.x+pC.x)/3,y:(pA.y+pB.y+pC.y)/3,z:(pA.z+pB.z+pC.z)/3};
    const degenerate = tri.a===tri.b || tri.b===tri.c || tri.c===tri.a || !Number.isFinite(area) || areaX2<=EPSILON_AREA_X2 || minEdge<=EPSILON_LENGTH;
    const angleA=degenerate?NaN:angleDeg(pA,pB,pC), angleB=degenerate?NaN:angleDeg(pB,pC,pA), angleC=degenerate?NaN:Math.max(0,180-angleA-angleB);
    const maxEdgeProduct=Math.max(ab*bc,bc*ca,ca*ab);
    faceFields.triangleArea[faceIndex]=degenerate?NaN:area;
    faceFields.edgeRatio[faceIndex]=degenerate?NaN:maxEdge/minEdge;
    faceFields.aspectRatio[faceIndex]=degenerate?NaN:(maxEdge*perimeter)/(2*SQRT_3*areaX2);
    faceFields.minimumAngleDeg[faceIndex]=degenerate?NaN:Math.min(angleA,angleB,angleC);
    faceFields.maximumAngleDeg[faceIndex]=degenerate?NaN:Math.max(angleA,angleB,angleC);
    faceFields.radiusRatio[faceIndex]=degenerate?NaN:(0.25*ab*bc*ca*perimeter)/(areaX2*areaX2);
    faceFields.scaledJacobian[faceIndex]=degenerate||maxEdgeProduct<=EPSILON_LENGTH?NaN:((2/SQRT_3)*areaX2)/maxEdgeProduct;
    faceValidMask[faceIndex]=degenerate?0:1;
    faceCentroids.set([centroid.x,centroid.y,centroid.z],faceIndex*3);
    const aspectRatio=faceFields.aspectRatio[faceIndex]; faces.set(faceIndex,{faceIndex,area,aspectRatio,centroid,normal,degenerate});
    if (degenerate) degenerateFaces.push({faceIndex,centroid,area,aspectRatio});
    for (const [v0,v1,pointA,pointB,length] of [[tri.a,tri.b,pA,pB,ab],[tri.b,tri.c,pB,pC,bc],[tri.c,tri.a,pC,pA,ca]] as Array<[number,number,MeshQualityPoint3,MeshQualityPoint3,number]>) {
      const key=edgeKey(v0,v1), existing=edgeMap.get(key);
      if (existing) existing.incidentFaces.push(faceIndex);
      else edgeMap.set(key,{a:Math.min(v0,v1),b:Math.max(v0,v1),pointA:v0<=v1?pointA:pointB,pointB:v0<=v1?pointB:pointA,length,incidentFaces:[faceIndex]});
    }
    if (faceIndex%faceProgressStride===0 || faceIndex===allocatedFaceCount-1) emitProgress("faces",allocatedFaceCount?(faceIndex+1)/allocatedFaceCount:1);
  }

  const vertexNeighbors=Array.from({length:vertexCount},()=>new Set<number>()), dihedralAngles:number[]=[];
  let boundaryEdgeCount=0, edgeIndex=0; const nonManifoldEdges:MeshQualityEdgeDefect[]=[];
  const edgeProgressStride=Math.max(1,Math.floor(Math.max(1,edgeMap.size)/40));
  for (const [key,edge] of edgeMap) {
    vertexNeighbors[edge.a]?.add(edge.b); vertexNeighbors[edge.b]?.add(edge.a);
    if (edge.incidentFaces.length===1) boundaryEdgeCount+=1;
    if (edge.incidentFaces.length>2) {
      const midpoint={x:(edge.pointA.x+edge.pointB.x)*.5,y:(edge.pointA.y+edge.pointB.y)*.5,z:(edge.pointA.z+edge.pointB.z)*.5};
      nonManifoldEdges.push({edgeId:key,a:edge.a,b:edge.b,pointA:edge.pointA,pointB:edge.pointB,midpoint,length:edge.length,incidentFaceCount:edge.incidentFaces.length,incidentFaces:edge.incidentFaces.slice()});
    }
    if (edge.incidentFaces.length===2) {
      const f0=faces.get(edge.incidentFaces[0]), f1=faces.get(edge.incidentFaces[1]);
      if (f0?.normal&&f1?.normal) { const angle=safeAcosDeg(f0.normal.x*f1.normal.x+f0.normal.y*f1.normal.y+f0.normal.z*f1.normal.z); if(Number.isFinite(angle)) dihedralAngles.push(angle); }
    }
    if(edgeIndex%edgeProgressStride===0||edgeIndex===edgeMap.size-1) emitProgress("edges",edgeMap.size?(edgeIndex+1)/edgeMap.size:1); edgeIndex+=1;
  }
  const vertexValence=Float64Array.from(vertexNeighbors.map((entry)=>entry.size));
  const edgeLength=Float64Array.from([...edgeMap.values()].map((entry)=>entry.length));
  const dihedralAngleDeg=Float64Array.from(dihedralAngles);
  const highAspectFaces=[...faces.values()].filter((entry)=>!entry.degenerate&&Number.isFinite(entry.aspectRatio)&&entry.aspectRatio>=highAspectRatioThreshold).sort((a,b)=>b.aspectRatio-a.aspectRatio).map((entry)=>({faceIndex:entry.faceIndex,centroid:entry.centroid,area:entry.area,aspectRatio:entry.aspectRatio}));
  emitProgress("finalize",.5);
  const report:MeshQualityReport={
    generatedAt:new Date().toISOString(),vertexCount,faceCount:faces.size,
    metrics:{edgeLength:summary(edgeLength),triangleArea:summary(faceFields.triangleArea),aspectRatio:summary(faceFields.aspectRatio),edgeRatio:summary(faceFields.edgeRatio),minimumAngleDeg:summary(faceFields.minimumAngleDeg),maximumAngleDeg:summary(faceFields.maximumAngleDeg),radiusRatio:summary(faceFields.radiusRatio),scaledJacobian:summary(faceFields.scaledJacobian),vertexValence:summary(vertexValence),dihedralAngleDeg:summary(dihedralAngleDeg)},
    fields:{face:faceFields,faceValidMask,faceCentroids,vertexValence,edgeLength,dihedralAngleDeg},
    conventions:{backend:"Math3D VTK/Verdict-compatible",domain:"triangle faces",invalidValue:"NaN",idealEquilateral:"aspect ratio = edge ratio = radius ratio = scaled Jacobian = 1; angles = 60 deg"},
    topology:{boundaryEdgeCount,nonManifoldEdgeCount:nonManifoldEdges.length,degenerateFaceCount:degenerateFaces.length},
    defects:{degenerateFaces:degenerateFaces.sort((a,b)=>a.faceIndex-b.faceIndex).slice(0,maxListedDefects),highAspectFaces:highAspectFaces.slice(0,maxListedDefects),nonManifoldEdges:nonManifoldEdges.sort((a,b)=>b.incidentFaceCount-a.incidentFaceCount).slice(0,maxListedDefects)},
  };
  emitProgress("finalize",1); return report;
};
