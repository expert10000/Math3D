import schema from "./schema";

export type Vec3 = [number, number, number];
export interface SceneDataset {
  id: string; path: string; format: "f64le"; count: number; components: 1 | 3;
  unit: string; bytes: number; sha256: string;
}
export interface SceneObject {
  id: string; label: string; kind: "point-cloud" | "polyline" | "segments" | "vectors" | "mesh";
  positions: string; values?: string; indices?: string; scalars?: string; visible: boolean;
  colorMap?: "phase";
  style: { color: string; opacity: number; size: number };
}
export interface SceneField {
  id: string; label: string; kind: "scalar-field" | "complex-field";
  real: string; imaginary?: string;
  grid: { shape: [number, number, number]; origin: Vec3; spacing: Vec3; order: "xyz-z-fastest" };
}
export interface QuantumScene {
  schema: "quantum-scene/v1"; id: string; title: string;
  provenance: { runId: string; jobId: string; model: string; engine: string; engineVersion: string;
    computedAt: string; resultSha256: string; adapter: "qvis/1";
    kind?: "geometry-fixture" | "numerical-result";
    parameters?: Record<string, number | string>;
    source?: { repository: string; revision: string; entryId: string } };
  coordinates: { handedness: "right"; axes: [string, string, string]; units: [string, string, string] };
  camera: { position: Vec3; target: Vec3; up: Vec3 };
  datasets: SceneDataset[]; objects: SceneObject[];
  fields?: SceneField[];
  lattice?: SceneLattice;
  reciprocal?: SceneReciprocal;
  bands?: SceneBands;
  topology?: SceneTopology;
  annotations: { id: string; text: string; position: Vec3 }[];
}
export interface SceneLattice {
  dimensions: 2 | 3;
  basis: {label: string; position: Vec3}[];
  translations: Vec3[];
  repeats: [number, number, number];
  boundary: "open";
  sites: string; cells: string; basisIndices: string;
}
export interface SceneReciprocal {
  directBasis: Vec3[]; basis: Vec3[]; directUnit: string; reciprocalUnit: string;
  pointObject: string;
  points: {id: string; label: string; position: Vec3}[];
  paths: {object: string; label: string; points: string[]}[];
  boundaryObjects: string[];
}
export interface SceneBands {
  kind: "path" | "surface"; coordinates: string; energies: string[];
  objects: string[]; labels: string[]; energyUnit: string; bulkGap: number;
  grid?: [number, number];
}
export interface ScenePayload { scene: QuantumScene; artifacts: Record<string, Uint8Array> }
export interface SceneTopology {
  quantities: {id:string;label:string;kind:"berry-curvature"|"berry-connection"|"pseudospin"|"berry-phase";object:string;dataset:string;convention:string}[];
  invariants: {id:string;label:string;value:number|null;status:"verified"|"supplied"|"undefined"|"unresolved";method:string}[];
  limitations: string[];
}
export const MAX_SCENE_BYTES = 16 * 1024 * 1024;

// Interpret only the vocabulary used by this fixed schema. No eval/code generation,
// Node imports, URLs or file reads: this boundary also works under the browser CSP.
function check(rule: any, value: any, path: string): void {
  if (rule.$ref) return check((schema.definitions as any)[rule.$ref.split("/").pop()], value, path);
  const fail = () => { throw new Error(`Invalid quantum-scene/v1 at ${path}`); };
  if (rule.anyOf) {
    for (const candidate of rule.anyOf) { try { check(candidate, value, path); return; } catch { /* Try the next declared variant. */ } }
    fail();
  }
  if ("const" in rule && value !== rule.const) fail();
  if (rule.enum && !rule.enum.includes(value)) fail();
  if (rule.type === "number" || rule.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (rule.type === "integer" && !Number.isInteger(value)) || value < rule.minimum || value > rule.maximum) fail();
  } else if (rule.type === "string") {
    if (typeof value !== "string" || value.length < (rule.minLength ?? 0) || value.length > (rule.maxLength ?? Infinity) || (rule.pattern && !new RegExp(rule.pattern).test(value))) fail();
  } else if (rule.type === "boolean") { if (typeof value !== "boolean") fail(); }
  else if (rule.type === "array") {
    if (!Array.isArray(value) || value.length < (rule.minItems ?? 0) || value.length > (rule.maxItems ?? Infinity)) fail();
    for (let i = 0; i < value.length; i++) check(rule.items, value[i], `${path}[${i}]`);
  } else if (rule.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail();
    if (Object.keys(value).length < (rule.minProperties ?? 0) || Object.keys(value).length > (rule.maxProperties ?? Infinity)) fail();
    for (const key of rule.required ?? []) if (!Object.prototype.hasOwnProperty.call(value, key)) fail();
    for (const key of Object.keys(value)) {
      if (rule.propertyNames) check(rule.propertyNames, key, `${path}.key`);
      if (Object.prototype.hasOwnProperty.call(rule.properties ?? {}, key)) check(rule.properties[key], value[key], `${path}.${key}`);
      else if (rule.additionalProperties && typeof rule.additionalProperties === "object") check(rule.additionalProperties, value[key], `${path}.${key}`);
      else fail();
    }
  }
}

export function assertScene(value: unknown): asserts value is QuantumScene {
  check(schema, value, "scene");
  const scene = value as QuantumScene;
  if (!scene.objects.length && !scene.fields?.length) throw new Error("Scene has no objects or fields");
  const unique = (ids: string[]) => { if (new Set(ids).size !== ids.length) throw new Error("Duplicate scene identity"); };
  unique([...scene.objects.map(o => o.id), ...scene.annotations.map(a => a.id), ...(scene.fields ?? []).map(f => f.id)]);
  unique(scene.datasets.map(d => d.id)); unique(scene.datasets.map(d => d.path));
  if (scene.datasets.reduce((n, d) => n + d.bytes, 0) > MAX_SCENE_BYTES) throw new Error("Scene exceeds memory budget");
  const datasets = new Map(scene.datasets.map(d => [d.id, d]));
  for (const d of scene.datasets) if (d.bytes !== d.count * d.components * 8) throw new Error("Dataset shape/size mismatch");
  for (const field of scene.fields ?? []) {
    if ((field.kind === "complex-field") !== !!field.imaginary) throw new Error("Field kind/reference mismatch");
    const nodes = field.grid.shape.reduce((n, v) => n * v, 1);
    for (const id of [field.real, field.imaginary].filter(Boolean)) {
      const d = datasets.get(id!);
      if (!d || d.components !== 1 || d.count !== nodes) throw new Error("Field grid/dataset mismatch");
    }
    for (let axis = 0; axis < 3; axis++) {
      const { spacing, origin, shape } = field.grid;
      if (spacing[axis] <= 0 || Math.abs(origin[axis] + spacing[axis] * (shape[axis] - 1)) > 1000000) throw new Error("Invalid field grid extent");
    }
  }
  for (const o of scene.objects) {
    const p = datasets.get(o.positions);
    if (o.colorMap === "phase" && (!o.scalars || datasets.get(o.scalars)?.unit !== "rad")) throw new Error("Phase color requires a radian scalar dataset");
    if (!p || p.components !== 3) throw new Error("Missing position dataset");
    if (o.kind === "polyline" && p.count < 2) throw new Error("Polyline needs two points");
    if (o.kind === "segments" && (p.count < 2 || p.count % 2)) throw new Error("Segments need endpoint pairs");
    if ((o.kind === "vectors") !== !!o.values || (o.kind === "mesh") !== !!o.indices) throw new Error("Object kind/reference mismatch");
    for (const [ref, components, sameCount] of [[o.values, 3, true], [o.indices, 3, false], [o.scalars, 1, true]] as const) {
      if (!ref) continue;
      const d = datasets.get(ref);
      if (!d || d.components !== components || (sameCount && d.count !== p.count)) throw new Error("Object dataset mismatch");
    }
  }
  if (scene.lattice) {
    const l = scene.lattice, count = l.repeats.reduce((a,b)=>a*b,1)*l.basis.length;
    if (l.translations.length !== l.dimensions || (l.dimensions === 2 && l.repeats[2] !== 1)) throw new Error("Lattice dimension mismatch");
    const [a,b,c] = l.translations;
    const cross = [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    if ((l.dimensions === 2 ? Math.hypot(...cross) : Math.abs(cross.reduce((v,x,i)=>v+x*c[i],0))) < 1e-9) throw new Error("Degenerate lattice basis");
    for (const [ref, components] of [[l.sites,3],[l.cells,3],[l.basisIndices,1]] as const) {
      const d = datasets.get(ref);
      if (!d || d.components !== components || d.count !== count) throw new Error("Lattice dataset mismatch");
    }
  }
  if (scene.reciprocal) {
    const r=scene.reciprocal, objects=new Map(scene.objects.map(o=>[o.id,o]));
    unique(r.points.map(p=>p.id));unique(r.paths.map(p=>p.object));unique(r.boundaryObjects);
    if(r.directBasis.length!==r.basis.length) throw new Error("Reciprocal dimension mismatch");
    r.directBasis.forEach((a,i)=>r.basis.forEach((b,j)=>{if(Math.abs(a.reduce((n,v,k)=>n+v*b[k],0)-(i===j?2*Math.PI:0))>1e-9) throw new Error("Reciprocal basis is not dual (2pi convention)");}));
    const points=objects.get(r.pointObject);
    if(!points||points.kind!=="point-cloud"||datasets.get(points.positions)!.count!==r.points.length) throw new Error("Reciprocal point object mismatch");
    for(const path of r.paths) {
      const o=objects.get(path.object);
      if(!o||o.kind!=="polyline"||datasets.get(o.positions)!.count!==path.points.length||path.points.some(id=>!r.points.some(p=>p.id===id))) throw new Error("Reciprocal path mismatch");
    }
    for(const id of r.boundaryObjects) if(!["polyline","segments"].includes(objects.get(id)?.kind??"")) throw new Error("Reciprocal boundary mismatch");
  }
  if(scene.bands) {
    const b=scene.bands, k=datasets.get(b.coordinates);
    unique(b.energies);unique(b.objects);
    if(!k||k.components!==3||k.count>961||b.energies.length!==b.objects.length||b.labels.length!==b.objects.length||(b.kind==="surface")!==!!b.grid||(b.grid && b.grid[0]*b.grid[1]!==k.count)) throw new Error("Band layout mismatch");
    b.objects.forEach((id,i)=>{
      const o=scene.objects.find(o=>o.id===id), e=datasets.get(b.energies[i]);
      if(!o||o.kind!==(b.kind==="path"?"polyline":"mesh")||datasets.get(o.positions)!.count!==k.count||!e||e.components!==1||e.count!==k.count||e.unit!==b.energyUnit) throw new Error("Band object/dataset mismatch");
    });
  }
  if(scene.topology) {
    const t=scene.topology;
    unique([...t.quantities.map(q=>q.id),...t.invariants.map(i=>i.id)]);
    if(!t.quantities.length&&!t.invariants.length) throw new Error("Empty topology metadata");
    for(const q of t.quantities) {
      const o=scene.objects.find(o=>o.id===q.object),d=datasets.get(q.dataset),vector=["berry-connection","pseudospin"].includes(q.kind);
      if(!o||!d||d.components!==(vector?3:1)||d.count!==datasets.get(o.positions)!.count||(vector?(o.kind!=="vectors"||o.values!==q.dataset):o.scalars!==q.dataset)||(q.kind==="berry-phase"&&d.unit!=="rad")) throw new Error("Topology quantity reference mismatch");
    }
    for(const i of t.invariants) if((i.status==="undefined"||i.status==="unresolved")!==(i.value===null)) throw new Error("Topology invariant status/value mismatch");
  }
  const { position: p, target: t, up } = scene.camera;
  const direction = t.map((v, i) => v - p[i]);
  const cross = [direction[1] * up[2] - direction[2] * up[1], direction[2] * up[0] - direction[0] * up[2], direction[0] * up[1] - direction[1] * up[0]];
  if (Math.hypot(...cross) < 1e-9) throw new Error("Degenerate scene camera");
}

export function decodeDataset(bytes: Uint8Array): Float64Array {
  if (bytes.byteLength % 8) throw new Error("Incomplete f64le dataset");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float64Array.from({ length: bytes.byteLength / 8 }, (_, i) => view.getFloat64(i * 8, true));
}
export async function verifyScenePayload(payload: ScenePayload, digest: (bytes: Uint8Array) => Promise<string>): Promise<Map<string, Float64Array>> {
  assertScene(payload.scene);
  if (Object.keys(payload.artifacts).length !== payload.scene.datasets.length) throw new Error("Unexpected scene artifacts");
  const arrays = new Map<string, Float64Array>();
  for (const d of payload.scene.datasets) {
    const bytes = payload.artifacts[d.path];
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== d.bytes || await digest(bytes) !== d.sha256) throw new Error(`Scene artifact integrity failed: ${d.id}`);
    const values = decodeDataset(bytes);
    if (!values.every(Number.isFinite)) throw new Error("Non-finite scene data");
    if (d.components === 3 && !values.every(v => Math.abs(v) <= 1000000)) throw new Error("Scene coordinate exceeds bounds");
    arrays.set(d.id, values);
  }
  for (const o of payload.scene.objects) if (o.indices) {
    const count = arrays.get(o.positions)!.length / 3;
    if (!arrays.get(o.indices)!.every(v => Number.isInteger(v) && v >= 0 && v < count)) throw new Error("Invalid mesh indices");
  }
  for (const field of payload.scene.fields ?? []) if (field.kind === "complex-field") {
    for (const id of [field.real,field.imaginary!]) if (!arrays.get(id)!.every(v => Math.abs(v) <= 1e100)) throw new Error("Complex amplitude exceeds safe derived-density range");
  }
  for (const object of payload.scene.objects) if (object.colorMap === "phase" && !arrays.get(object.scalars!)!.every(v=>Math.abs(v)<=Math.PI+1e-10)) throw new Error("Phase outside radian range");
  const l = payload.scene.lattice;
  if (l) {
    const positions=arrays.get(l.sites)!, cells=arrays.get(l.cells)!, basis=arrays.get(l.basisIndices)!, seen=new Set<string>();
    for(let i=0;i<basis.length;i++) {
      const cell=[cells[i*3],cells[i*3+1],cells[i*3+2]], k=basis[i], id=`${cell.join(",")}/${k}`;
      if(!Number.isInteger(k)||k<0||k>=l.basis.length||cell.some((v,a)=>!Number.isInteger(v)||v<0||v>=l.repeats[a])||seen.has(id)) throw new Error("Invalid lattice site identity");
      seen.add(id);
      for(let a=0;a<3;a++) {
        const expected=l.basis[k].position[a]+l.translations.reduce((sum,t,j)=>sum+t[a]*cell[j],0);
        if(Math.abs(positions[i*3+a]-expected)>1e-9) throw new Error("Lattice position disagrees with cell and basis");
      }
    }
  }
  const r=payload.scene.reciprocal;
  if(r) {
    const objects=new Map(payload.scene.objects.map(o=>[o.id,o]));
    const checkPoints=(object:string,points:Vec3[])=>{
      const values=arrays.get(objects.get(object)!.positions)!;
      points.forEach((p,i)=>p.forEach((v,a)=>{if(Math.abs(values[i*3+a]-v)>1e-9)throw new Error("Reciprocal point coordinates disagree");}));
    };
    checkPoints(r.pointObject,r.points.map(p=>p.position));
    for(const path of r.paths) checkPoints(path.object,path.points.map(id=>r.points.find(p=>p.id===id)!.position));
  }
  const bands=payload.scene.bands;
  if(bands) {
    const k=arrays.get(bands.coordinates)!, energies=bands.energies.map(id=>arrays.get(id)!), n=k.length/3;
    for(let i=0;i<n;i++) {
      if(k[i*3+2]!==0 || (bands.kind==="path" && (k[i*3+1]!==0 || (i>0 && k[i*3]<=k[(i-1)*3])))) throw new Error("Invalid band coordinates");
      if(bands.grid) {
        const ny=bands.grid[1], x=Math.floor(i/ny),y=i%ny;
        if(k[i*3]!==k[x*ny*3]||k[i*3+1]!==k[y*3+1]||(x>0 && k[x*ny*3]<=k[(x-1)*ny*3])||(y>0 && k[y*3+1]<=k[(y-1)*3+1])) throw new Error("Invalid band grid order");
      }
      if(energies.some((e,j)=>j>0 && e[i]<energies[j-1][i])) throw new Error("Unordered bands");
      if(energies[energies.length-1][i]-energies[0][i]<bands.bulkGap-1e-9) throw new Error("Reported bulk gap exceeds sampled separation");
      bands.objects.forEach((id,j)=>{
        const o=payload.scene.objects.find(o=>o.id===id)!, p=arrays.get(o.positions)!;
        const expected=bands.kind==="path"?[k[i*3],energies[j][i],0]:[k[i*3],k[i*3+1],energies[j][i]];
        if(expected.some((v,a)=>Math.abs(p[i*3+a]-v)>1e-9)) throw new Error("Band geometry disagrees with supplied energies");
      });
    }
    // Surface triangles must use adjacent grid cells, never close a periodic seam.
    if(bands.grid) for(const id of bands.objects) {
      const o=payload.scene.objects.find(o=>o.id===id)!, indices=arrays.get(o.indices!)!, ny=bands.grid[1];
      for(let i=0;i<indices.length;i+=3) {
        const t=[...indices.slice(i,i+3)], xs=t.map(v=>Math.floor(v/ny)), ys=t.map(v=>v%ny);
        if(new Set(t).size!==3||Math.max(...xs)-Math.min(...xs)!==1||Math.max(...ys)-Math.min(...ys)!==1) throw new Error("Invalid band surface triangle/seam");
      }
    }
  }
  return arrays;
}

