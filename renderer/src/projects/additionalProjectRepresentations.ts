import { canonicalJsonStringify, createCurveDocument, createSurfaceDocument, createGeometryDocument, geometryDocumentToSceneDocument,
  evaluateDerivedConstructionObjects, canonicalizeFinite2DTopologyDocument, createTopologyDocument, createDocumentIdentity, type CurveDocument, type SurfaceDocument,
  type GeometryDocument, type TopologyDocument, type MixedWorkspaceEntry, type CanonicalJsonValue } from "@math3d/core";
import { createSplineDefinition, evaluateSpline } from "@math3d/core";
import { validateSavedSplineSurfaceSettings } from "../math/splineSurface";
import { compileExpression } from "../math/expression";
import { marchingSquares } from "../math/marchingSquares";
import { marchingCubesVolume } from "../math/marchingCubes";
import { bakeParamSurface, bakeWeierstrassSurface } from "../math/bakeSurface";
import { decodeMeshBuffers } from "../mesh/meshResourceStore";
import { tessellateCurveConstruction } from "../curveAnalysis/curveConstructionGeometry";
import type { CurveConstructionRecord } from "../curveAnalysis/curveConstructionKernel";
import { buildGeometryRenderData } from "../geometry/render";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type { GeometryScene } from "../geometry/types";
import type { VerifiedProjectResources } from "./projectResources";

export type AdditionalDocument = CurveDocument | SurfaceDocument | GeometryDocument | TopologyDocument;
export type RepresentationContext = { documents: ReadonlyMap<string, MixedWorkspaceEntry["checkpoint"]>; resources?: VerifiedProjectResources };
type Point = { x: number; y: number; z: number };
export type RepresentationView = { scene: GeometryScene; meshes: SurfaceMeshData[]; qualification: string; sampleCount: number; bounds: { min: number[]; max: number[] } | null };
const fail = (message: string): never => { throw new TypeError(message); };
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const point = (values: readonly number[]): Point => ({ x: values[0]!, y: values[1]!, z: values[2] ?? 0 });
const finite = (value: Point) => [value.x, value.y, value.z].every(Number.isFinite);
const compiled = (formula: string | undefined, variables: string[]) => {
  if (!formula || formula.length > 4096 || /[+*/^,(-]\s*$/.test(formula)) fail("A complete saved expression is required.");
  const inherited = new Set(Object.getOwnPropertyNames(Object.prototype));
  if ((formula!.match(/[A-Za-z_][A-Za-z_0-9]*/g) ?? []).some((name) => inherited.has(name))) fail("Unsupported expression identifier.");
  const result = compileExpression(formula!, variables); return result.fn ?? fail(result.error?.message ?? "Unsupported saved expression.");
};
const range = (value: any): [number, number] => {
  const pair = Array.isArray(value) ? value : [value?.min, value?.max];
  return pair.length === 2 && pair.every(Number.isFinite) && pair[1] > pair[0] ? pair as [number, number] : fail("A finite increasing saved domain is required.");
};
const boundedPoints = (values: readonly (readonly number[])[] | undefined, dimension: number) => {
  if (!values || values.length < 2 || values.length > 4096 || values.some((value) => value.length !== dimension || !value.every(Number.isFinite))) fail("The saved sample/control points are incomplete or outside the native limit.");
  return values!.map(point);
};
const lineScene = (lines: Point[][]): GeometryScene => ({ segments: lines.flatMap((points) => points.slice(1).flatMap((b, index) => finite(b) && finite(points[index]!) ? [{ a: points[index]!, b }] : [])) });
const curveEvaluator = (document: CurveDocument, context: RepresentationContext, stack: string[]): ((t: number) => Point) => {
  if (stack.includes(document.identity.id) || stack.length > 12) fail("Cyclic or overly deep project source dependencies.");
  stack = [...stack, document.identity.id];
  const source = document.source, definition = source.definition, f = definition.expressions ?? {}, parameter = source.domain.parameter;
  const literal = (x: string, y: string, z = "0") => {
    const funcs = [x, y, z].map((value) => compiled(value, [parameter]));
    return (t: number) => point(funcs.map((fn) => fn({ [parameter]: t })));
  };
  if (["parametric", "explicit"].includes(source.representation)) {
    if (source.dependencies && (source.dependencies as unknown[]).length || definition.sourceIds?.length) fail("Literal Curve dependencies require an explicit snapshot representation.");
    if (source.representation === "explicit" && !f.x) {
      const formula = compiled(f.formula, [f.independentVariable ?? parameter]);
      return (t) => ({ x: t, y: formula({ [f.independentVariable ?? parameter]: t }), z: 0 });
    }
    return literal(f.x!, f.y!, source.dimension === 3 ? f.z! : "0");
  }
  if (source.representation === "polar") {
    if (source.dimension !== 2 || definition.sourceIds?.length || (source.dependencies as unknown[]).length) fail("Only independent planar polar sources are qualified.");
    const fn = compiled(f.radius, [f.angleParameter ?? parameter]);
    return (t) => { const r = fn({ [f.angleParameter ?? parameter]: t }), angle = source.units.angle === "deg" ? t * Math.PI / 180 : t; return { x: r * Math.cos(angle), y: r * Math.sin(angle), z: 0 }; };
  }
  if (["bezier", "b-spline", "nurbs"].includes(source.representation)) {
    const points = boundedPoints(definition.controlPoints, source.dimension);
    if (definition.controlPointCount !== undefined && definition.controlPointCount !== points.length || (source.dependencies as unknown[]).length) fail("Spline source count/dependencies do not match.");
    const degree = Number(definition.settings?.degree);
    if (!Number.isSafeInteger(degree) || degree < 1 || degree > 32 || definition.sourceIds?.length || source.representation !== "bezier" && !definition.knots || source.representation === "nurbs" && !definition.weights) fail("A complete saved spline degree, knots and weights are required.");
    const spline = createSplineDefinition({ id: document.identity.id, name: document.metadata.title, kind: source.representation as "bezier" | "b-spline" | "nurbs", dimension: source.dimension, degree,
      controlPoints: points, knotVector: definition.knots, weights: definition.weights, domain: { tMin: source.domain.min, tMax: source.domain.max }, closed: source.domain.closed, periodic: source.domain.periodic, clamped: !source.domain.periodic });
    if (source.domain.periodic || spline.knotVector[degree] !== source.domain.min || spline.knotVector[points.length] !== source.domain.max) fail("Only saved nonperiodic spline domains matching their active knot interval are qualified.");
    return (t) => { const value = evaluateSpline(spline, t); return { ...value, z: "z" in value ? value.z : 0 }; };
  }
  if (source.representation === "polyline" || source.representation === "derived" && definition.points) {
    const points = boundedPoints(definition.points, source.dimension);
    if (definition.pointCount !== undefined && definition.pointCount !== points.length) fail("Saved point count does not match source samples.");
    return (t) => {
      const span = source.domain.max - source.domain.min, u = Math.max(0, Math.min(1, (t - source.domain.min) / span)) * (points.length - 1), i = Math.min(points.length - 2, Math.floor(u)), a = points[i]!, b = points[i + 1]!, w = u - i;
      return { x: a.x + (b.x-a.x)*w, y: a.y + (b.y-a.y)*w, z: a.z + (b.z-a.z)*w };
    };
  }
  if (source.representation === "curve-on-surface") {
    const link = definition.surfaceLink, parent = link && context.documents.get(link.surfaceId);
    if (!parent || parent.format !== "math3d.surface-document" || parent.identity.revision !== link!.surfaceRevision) fail("Curve-on-Surface needs its exact saved Surface generation.");
    const surface = surfaceEvaluator(parent as SurfaceDocument, context, stack), u = compiled(f.u, [parameter]), v = compiled(f.v, [parameter]);
    return (t) => surface(u({ [parameter]: t }), v({ [parameter]: t }));
  }
  return fail("This Curve recipe has no qualified source evaluator or stored samples.");
};
const surfaceEvaluator = (document: SurfaceDocument, context: RepresentationContext, stack: string[]): ((u: number, v: number) => Point) => {
  if (stack.includes(document.identity.id) || stack.length > 12) fail("Cyclic project source dependencies.");
  stack = [...stack, document.identity.id];
  const source = document.source, f = source.definition.expressions ?? {};
  if (source.branchPolicy) fail("This Surface branch policy needs a dedicated evaluator.");
  const parameters: Record<string, number> = {};
  for (const [name, value] of Object.entries(source.parameters)) if (typeof value === "number" && Number.isFinite(value) && !["u","v","x","y","z","pi","e"].includes(name)) parameters[name] = value;
  if (source.representation === "parametric") {
    if (source.definition.sourceIds?.length || source.definition.meshId) fail("Parametric dependencies need a qualified construction adapter.");
    const functions = [f.x,f.y,f.z].map((value) => compiled(value, ["u","v",...Object.keys(parameters)]));
    return (u,v) => point(functions.map((fn) => fn({ ...parameters, u,v })));
  }
  if (source.representation === "explicit") { const fn = compiled(f.formula, ["x","y",...Object.keys(parameters)]); return (u,v) => ({ x:u, y:v, z:fn({ ...parameters,x:u,y:v }) }); }
  if (source.representation === "constructed" && source.definition.sourceIds?.length) {
    const generations = source.parameters.sourceGenerations;
    if (!Array.isArray(generations) || generations.length !== source.definition.sourceIds.length) fail("Constructed Surface needs exact saved source generations.");
    const curves = source.definition.sourceIds.map((id, index) => {
      const parent = context.documents.get(id), generation = (generations as CanonicalJsonValue[])[index] as Record<string, CanonicalJsonValue>;
      if (!parent || parent.format !== "math3d.curve-document" || generation.documentId !== id || generation.revision !== parent.identity.revision || generation.structuralHash !== parent.identity.structuralHash) fail("Constructed Surface parent generation is missing or stale.");
      const curve = parent as CurveDocument, fn = curveEvaluator(curve, context, stack);
      return (u: number) => fn(curve.source.domain.min + u * (curve.source.domain.max - curve.source.domain.min));
    });
    const family = source.definition.familyId;
    if (["ruled-surface", "loft"].includes(family) && curves.length >= 2) return (u,v) => { const scaled=v*(curves.length-1),left=Math.min(curves.length-2,Math.floor(scaled)),w=v>=1?1:scaled-left,a=curves[left]!(u),b=curves[left+1]!(u);return {x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w,z:a.z+(b.z-a.z)*w}; };
    if (family === "extrusion" && curves.length === 1) {
      const depth=source.parameters.depth??1;if(typeof depth!=="number"||!Number.isFinite(depth))fail("Finite saved extrusion depth required.");
      return (u,v)=>{const a=curves[0]!(u);return {...a,z:a.z+(depth as number)*v};};
    }
    if (family === "revolution" && curves.length === 1) {
      const axis=source.parameters.axis??"y",angle=source.parameters.angle??2*Math.PI;
      if(!["x","y","z"].includes(axis as string)||typeof angle!=="number"||!Number.isFinite(angle))fail("Saved revolution axis/angle is invalid.");
      return (u,v)=>{const a=curves[0]!(u),c=Math.cos((angle as number)*v),s=Math.sin((angle as number)*v);return axis==="x"?{x:a.x,y:a.y*c-a.z*s,z:a.y*s+a.z*c}:axis==="z"?{x:a.x*c-a.y*s,y:a.x*s+a.y*c,z:a.z}:{x:a.x*c+a.z*s,y:a.y,z:-a.x*s+a.z*c};};
    }
    return fail("This dependent Surface construction needs a dedicated evaluator.");
  }
  return fail("This Surface requires a mesh or numerical baker.");
};
const surfaceRanges = (document: SurfaceDocument): [[number,number],[number,number]] => {
  const domain = document.source.domain as Record<string, any>;
  if (domain.kind === "parameter" || domain.kind === "curve-construction") return [range(domain.u),range(domain.v)];
  if (domain.kind === "graph") return [range(domain.x),range(domain.y)];
  return fail("This Surface domain is not fully represented.");
};
const samplePatch = (document: SurfaceDocument, evaluator: (u:number,v:number)=>Point): SurfaceMeshData => {
  const [u,v]=surfaceRanges(document), n=33, positions=new Float32Array(n*n*3), indices:number[]=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){ const p=evaluator(u[0]+(u[1]-u[0])*i/(n-1),v[0]+(v[1]-v[0])*j/(n-1)); if(!finite(p)) fail("Surface sampling produced a non-finite point."); positions.set([p.x,p.y,p.z],(j*n+i)*3); }
  for(let j=0;j<n-1;j++)for(let i=0;i<n-1;i++){const a=j*n+i;indices.push(a,a+1,a+n,a+1,a+n+1,a+n);}
  return {label:document.metadata.title,positions,indices:Uint32Array.from(indices),source:{kind:"bakedFromParam"}};
};
export const additionalRepresentationView = (document: AdditionalDocument, context: RepresentationContext): RepresentationView => {
  let scene:GeometryScene={},meshes:SurfaceMeshData[]=[],qualification="Numerical source preview";
  if(document.format==="math3d.curve-document") {
    const source=document.source;
    if(source.representation==="implicit") {
      if(source.dimension!==2||(source.dependencies as unknown[]).length||source.definition.sourceIds?.length) fail("Only planar independent implicit curves are qualified.");
      const fn=compiled(source.definition.expressions?.formula,["x","y"]), bounds=source.definition.settings;
      const x=range([bounds?.xMin,bounds?.xMax]),y=range([bounds?.yMin,bounds?.yMax]);
      const n=65,lines=marchingSquares({nx:n,ny:n,xMin:x[0],xMax:x[1],yMin:y[0],yMax:y[1],level:0,sample:(i,j)=>fn({x:x[0]+(x[1]-x[0])*i/(n-1),y:y[0]+(y[1]-y[0])*j/(n-1)})});
      scene=lineScene(lines.map((line)=>line.map((p)=>({...p,z:0}))));qualification="Numerical implicit contours";
    } else {
      const fn=curveEvaluator(document,context,[]),points=source.representation==="polyline"||source.representation==="derived"&&source.definition.points ? boundedPoints(source.definition.points,source.dimension) : Array.from({length:257},(_,i)=>fn(source.domain.min+(source.domain.max-source.domain.min)*i/256));
      if(!points.every(finite)) fail("Curve samples are not finite on the saved domain.");
      if(source.domain.closed)points.push(points[0]!);
      scene=lineScene([points]);qualification=source.representation==="polyline"||source.representation==="derived"?"Saved sample interpolation":"Numerical saved Curve evaluation";
    }
  } else if(document.format==="math3d.surface-document") {
    const source=document.source,domain=source.domain as Record<string,any>;
    if(source.representation==="constructed") {
      const ids=source.definition.sourceIds,generations=source.parameters.sourceGenerations;
      if(!ids?.length||ids.length>16||!Array.isArray(generations)||generations.length!==ids.length||domain.kind!=="curve-construction"||canonicalJsonStringify(domain.u)!=="[0,1]"||canonicalJsonStringify(domain.v)!=="[0,1]")fail("Complete normalized construction source required.");
      const parents=ids!.map((id,index)=>{const parent=context.documents.get(id),generation=(generations as any[])[index];if(!parent||parent.format!=="math3d.curve-document"||generation.documentId!==id||generation.revision!==parent.identity.revision||generation.structuralHash!==parent.identity.structuralHash)fail("Missing or stale construction source generation.");const curve=parent as CurveDocument;curveEvaluator(curve,context,[document.identity.id]);if(!["parametric","polyline","bezier","b-spline","nurbs"].includes(curve.source.representation)||curve.source.representation==="parametric"&&curve.source.domain.parameter!=="t")fail("This Curve needs an additional construction evaluator.");return curve;});
      const kind=source.definition.familyId;
      if(!["extrusion","revolution","ruled-surface","loft","sweep","tube-surface"].includes(kind)||(["ruled-surface","loft"].includes(kind)?parents.length<2:parents.length!==1))fail("Invalid construction kind/source arity.");
      for(const [name,max] of [["uSegments",256],["vSegments",128]] as const) { const value=source.parameters[name];if(value!==undefined&&(!Number.isSafeInteger(value)||Number(value)<4||Number(value)>max))fail("Construction resolution is outside its native bound."); }
      for(const name of ["depth","angle","radius"])if(source.parameters[name]!==undefined&&(typeof source.parameters[name]!=="number"||!Number.isFinite(source.parameters[name])))fail("Finite construction parameter required.");
      if(source.parameters.axis!==undefined&&!["x","y","z"].includes(source.parameters.axis as string)||source.parameters.radius!==undefined&&Number(source.parameters.radius)<1e-6)fail("Invalid construction axis/radius.");
      const record={operationId:document.identity.id,target:document,sourceDocuments:parents,sourceGenerations:generations,promoted:false,request:{kind,parameters:source.parameters,inputs:parents.map((p)=>({curveRevision:p.identity.revision}))}} as unknown as CurveConstructionRecord;
      meshes=[tessellateCurveConstruction(record).mesh];qualification="Numerical saved Curve construction · exact parent generations";
    } else if(source.representation==="mesh-backed") {
      const parent=[...context.documents.values()].find((item)=>item.format==="math3d.mesh-document"&&(item.identity.id===source.definition.meshId||item.source.resource.id===source.definition.meshId));
      if(!parent||parent.format!=="math3d.mesh-document")fail("Mesh-backed Surface needs its saved Mesh source.");
      if(source.definition.meshId===parent!.identity.id) {
        const generation:unknown=source.parameters.meshGeneration;
        if(!record(generation)||generation.documentId!==parent!.identity.id||generation.revision!==parent!.identity.revision||generation.structuralHash!==parent!.identity.structuralHash)fail("Mesh-backed Surface needs its exact saved Mesh generation.");
      }
      const meshDoc=parent as Extract<MixedWorkspaceEntry["checkpoint"],{format:"math3d.mesh-document"}>,bytes=context.resources?.bytes({kind:"mesh-buffers",id:meshDoc.source.resource.id});
      if(!bytes)fail("Missing Mesh-backed Surface buffers.");
      const buffers=decodeMeshBuffers(bytes!);meshes=[{...buffers,label:document.metadata.title,source:{kind:"bakedFromParam"}}];qualification="Saved Mesh-backed Surface buffers";
    } else if(source.representation==="implicit") {
      if(domain.kind!=="spatial-bounds"||!Array.isArray(domain.min)||!Array.isArray(domain.max)||domain.min.length!==3||domain.max.length!==3)fail("Saved implicit spatial bounds are required.");
      const ranges=domain.min.map((min:number,i:number)=>range([min,domain.max[i]])),fn=compiled(source.definition.expressions?.formula,["x","y","z"]),n=33,scalars=new Float32Array(n*n*n);
      for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++)scalars[(z*n+y)*n+x]=fn({x:ranges[0][0]+(ranges[0][1]-ranges[0][0])*x/(n-1),y:ranges[1][0]+(ranges[1][1]-ranges[1][0])*y/(n-1),z:ranges[2][0]+(ranges[2][1]-ranges[2][0])*z/(n-1)});
      if(!scalars.every(Number.isFinite))fail("Implicit Surface samples exceed the finite viewer range.");
      const iso=Number(source.definition.settings?.isoValue??0);if(!Number.isFinite(iso))fail("Finite saved isovalue required.");
      const mesh=marchingCubesVolume({dims:[n,n,n],origin:domain.min,spacing:ranges.map(([a,b]:number[])=>(b-a)/(n-1)) as [number,number,number],scalars},iso);
      if(!mesh)fail("Implicit Surface produced no native mesh.");meshes=[{...mesh!,label:document.metadata.title,source:{kind:"bakedFromImplicit"}}];qualification="Numerical implicit isosurface";
    } else if(source.representation==="spline"||source.representation==="weierstrass") {
      const [u,v]=surfaceRanges(document),savedDomain={uMin:u[0],uMax:u[1],vMin:v[0],vMax:v[1]};
      const settings=source.definition.settings??{};
      if(source.representation==="spline") {
        if(typeof settings.splineSettings!=="string")fail("Spline Surface needs its saved control grid and knots.");
        validateSavedSplineSurfaceSettings(source.definition.familyId, JSON.parse(settings.splineSettings as string));
      }
      const built=source.representation==="spline"?bakeParamSurface({surfaceId:source.definition.familyId as never,domain:savedDomain,resolution:33,label:document.metadata.title,splineSettings:JSON.parse(settings.splineSettings as string)}):
        bakeWeierstrassSurface({gExpr:source.definition.expressions?.g??"",phiExpr:source.definition.expressions?.phi??"",domain:savedDomain,resolution:33,label:document.metadata.title,recenterRescale:false});
      if("error"in built)fail(built.error);meshes=[(built as {mesh:SurfaceMeshData}).mesh];qualification=source.representation==="weierstrass"?"Numerical Weierstrass integration":"Numerical saved spline patch";
    } else meshes=[samplePatch(document,surfaceEvaluator(document,context,[]))];
  } else if(document.format==="math3d.geometry-document") {
    if(document.source.objects.length||document.source.surfaces.length||document.display.overlays.length||document.display.cameras.length)fail("This combined Geometry scene needs an additional render adapter.");
    const saved=geometryDocumentToSceneDocument(document);scene=JSON.parse(JSON.stringify(saved.geometry??{}));
    const values=Object.values(scene).flat() as unknown[];if(values.length>512||document.source.constructions.length>256||document.source.relationships.length>512)fail("Geometry scene exceeds the native bound.");
    const pointMap=new Map((scene.points??[]).filter((p)=>p.id).map((p)=>[p.id!,p]));
    const evaluated=evaluateDerivedConstructionObjects([...document.source.constructions],pointMap,[...document.source.relationships]);
    if(evaluated.errors.length)fail(evaluated.errors.join(" "));
    for(const value of evaluated.evaluations){
      if(!value.value||document.display.constructions[value.definition.id]?.visible===false)continue;
      if(value.value.kind==="point")scene.points=[...(scene.points??[]),value.value.point];
      else if(value.value.kind==="line")scene.lines=[...(scene.lines??[]),value.value.line];
      else {
        const {center,radius,normal}=value.value.circle, length=Math.hypot(normal.x,normal.y,normal.z);
        if(!length||!Number.isFinite(radius)||radius<=0)fail("Invalid saved construction circle.");
        const n={x:normal.x/length,y:normal.y/length,z:normal.z/length}, ref=Math.abs(n.z)<0.9?{x:0,y:0,z:1}:{x:1,y:0,z:0};
        const a={x:n.y*ref.z-n.z*ref.y,y:n.z*ref.x-n.x*ref.z,z:n.x*ref.y-n.y*ref.x}, size=Math.hypot(a.x,a.y,a.z);
        a.x/=size;a.y/=size;a.z/=size;
        const b={x:n.y*a.z-n.z*a.y,y:n.z*a.x-n.x*a.z,z:n.x*a.y-n.y*a.x};
        const points=Array.from({length:129},(_,i)=>{const angle=i*Math.PI/64;return {x:center.x+radius*(a.x*Math.cos(angle)+b.x*Math.sin(angle)),y:center.y+radius*(a.y*Math.cos(angle)+b.y*Math.sin(angle)),z:center.z+radius*(a.z*Math.cos(angle)+b.z*Math.sin(angle))};});
        scene.segments=[...(scene.segments??[]),...lineScene([points]).segments!];
      }
    }
    qualification="Saved Geometry scene and canonical constructions";
  } else {
    const outcome=canonicalizeFinite2DTopologyDocument(document,Math.max(1,document.identity.revision));
    if(outcome.status!=="canonicalized")fail(outcome.diagnostics.map((d)=>d.message).join(" "));
    const complex=(outcome as Extract<typeof outcome,{status:"canonicalized"}>).complex;
    if(complex.vertices.length>256||complex.edges.length>1000||complex.faces.length>512)fail("Topology source exceeds the native canonical editor bound.");
    const points=new Map(complex.vertices.map((vertex,index)=>[vertex.id,{x:Math.cos(index*2*Math.PI/Math.max(1,complex.vertices.length))*3,y:Math.sin(index*2*Math.PI/Math.max(1,complex.vertices.length))*3,z:0}]));
    scene={points:[...points.values()],segments:complex.edges.map((edge)=>({a:points.get(edge.endpoints[0])!,b:points.get(edge.endpoints[1])!}))};qualification=`Canonical incidence · ${complex.vertices.length} vertices · ${complex.edges.length} edges · ${complex.faces.length} faces; schematic placement`;
  }
  const points:Point[]=[...(scene.points??[]),...(scene.segments??[]).flatMap((s)=>[s.a,s.b])];
  if(document.format==="math3d.geometry-document") {
    const rendered=buildGeometryRenderData(scene);
    if(rendered.mesh)for(let i=0;i<rendered.mesh.positions.length;i+=3)points.push(point(Array.from(rendered.mesh.positions.slice(i,i+3))));
  }
  for(const mesh of meshes)for(let i=0;i<mesh.positions.length;i+=3)points.push(point([mesh.positions[i]!,mesh.positions[i+1]!,mesh.positions[i+2]!]));
  if(points.some((p)=>!finite(p)||![p.x,p.y,p.z].every((n)=>Number.isFinite(Math.fround(n)))))fail("Source coordinates exceed the finite native viewer range.");
  const bounds=points.length?{min:[0,1,2].map((axis)=>points.reduce((m,p)=>Math.min(m,[p.x,p.y,p.z][axis]!),Infinity)),max:[0,1,2].map((axis)=>points.reduce((m,p)=>Math.max(m,[p.x,p.y,p.z][axis]!),-Infinity))}:null;
  return {scene,meshes,qualification,sampleCount:points.length,bounds};
};
export const additionalRepresentationEditable = (document: MixedWorkspaceEntry["checkpoint"],context:RepresentationContext) => {
  try { if(!["math3d.curve-document","math3d.surface-document","math3d.geometry-document","math3d.topology-document"].includes(document.format))return false;additionalRepresentationView(document as AdditionalDocument,context);return true; }catch{return false;}
};
export const replaceAdditionalSource = (document:AdditionalDocument,value:CanonicalJsonValue):AdditionalDocument => {
  if(document.format==="math3d.curve-document")return createCurveDocument({...document,identity:createDocumentIdentity(document.identity.id,value,document.identity.revision),source:value as unknown as CurveDocument["source"]});
  if(document.format==="math3d.surface-document")return createSurfaceDocument({...document,identity:createDocumentIdentity(document.identity.id,value,document.identity.revision),source:value as unknown as SurfaceDocument["source"]});
  if(document.format==="math3d.geometry-document")return createGeometryDocument({...document,identity:createDocumentIdentity(document.identity.id,value,document.identity.revision),source:value as unknown as GeometryDocument["source"]});
  const source=value as unknown as TopologyDocument["source"];
  return createTopologyDocument({...document,identity:createDocumentIdentity(document.identity.id,source,document.identity.revision),source,canonicalComplex:null});
};
