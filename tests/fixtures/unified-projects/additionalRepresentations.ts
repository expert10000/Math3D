import { createCurveDocument, createSurfaceDocument, createGeometryDocument, createTopologyDocument, createStableDocumentId, createDocumentIdentity, createMath3DProject, createMixedWorkspaceDocument, type CurveDocumentSource, type SurfaceDocumentSource, type TopologyDocumentSource, type MixedWorkspaceEntry } from "@math3d/core";

export const additionalRepresentationFixture = () => {
  const curve = (name: string, representation: CurveDocumentSource["representation"], definition: CurveDocumentSource["definition"], patch: Partial<CurveDocumentSource> = {}) => createCurveDocument({ stableKey: `prj16/${name}`, metadata: { title: name }, source: { representation, dimension: 3, domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false }, units: { position: "mm", parameter: "unitless", angle: "rad" }, orientation: { direction: "forward" }, derivatives: null, dependencies: [], definition, ...patch } });
  const surface = (name: string, representation: SurfaceDocumentSource["representation"], definition: SurfaceDocumentSource["definition"], patch: Partial<SurfaceDocumentSource> = {}) => createSurfaceDocument({ stableKey: `prj16/${name}`, metadata: { title: name }, source: { representation, domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } }, units: { length: "mm" }, orientation: { sign: 1 }, definition, parameters: {}, branchPolicy: null, ...patch } });
  const parent = curve("Construction parent", "parametric", { familyId: "literal", expressions: { x: "1+t", y: "t", z: "0" } });
  const second = curve("Second parent", "polyline", { familyId: "measured", points: [[1,0,2],[2,1,2]], pointCount: 2 });
  const patch = surface("Chart parent", "parametric", { familyId: "chart", expressions: { x: "u", y: "v", z: "u+v" } });
  const controls = [[0,0,0],[1,2,0],[2,0,0]];
  const curves = [
    curve("Saved polyline", "polyline", { familyId: "measured", points: [[3,0,0],[3.2,4,1],[8,0,2]], pointCount: 3, settings: { annotation: "retain" } }),
    curve("Saved derived samples", "derived", { familyId: "intersection-snapshot", points: [[1,2,3],[2,3,4]], pointCount: 2 }),
    curve("Saved polar", "polar", { familyId: "polar", expressions: { radius: "2", angleParameter: "t" } }, { dimension: 2, domain: { parameter: "t", min: 0, max: 360, closed: true, periodic: false }, units: { position: "mm", parameter: "deg", angle: "deg" } }),
    curve("Saved implicit Curve", "implicit", { familyId: "circle", expressions: { formula: "x*x+y*y-1" }, settings: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 } }, { dimension: 2 }),
    ...(["bezier", "b-spline", "nurbs"] as const).map((kind) => curve(`Saved ${kind}`, kind, { familyId: kind, controlPoints: controls, controlPointCount: 3, settings: { degree: 2 }, ...(kind !== "bezier" ? { knots: [0,0,0,1,1,1] } : {}), ...(kind === "nurbs" ? { weights: [1,2,1] } : {}) })),
    curve("Saved chart Curve", "curve-on-surface", { familyId: "chart", expressions: { u: "t", v: "t*t" }, surfaceLink: { surfaceId: patch.identity.id, surfaceRevision: patch.identity.revision } }),
  ];
  const grid = JSON.stringify([[[0,0,0],[0,1,0]],[[1,0,0],[1,1,1]]]);
  const surfaces = [
    surface("Saved explicit Surface", "explicit", { familyId: "graph", expressions: { formula: "x+y" } }, { domain: { kind: "graph", x: [-1,1], y: [-2,2] } }),
    surface("Saved implicit Surface", "implicit", { familyId: "sphere", expressions: { formula: "x*x+y*y+z*z-1" }, settings: { isoValue: 0 } }, { domain: { kind: "spatial-bounds", min: [-1.5,-1.5,-1.5], max: [1.5,1.5,1.5] } }),
    surface("Saved periodic patch", "parametric", { familyId: "cylinder", expressions: { x: "cos(u)", y: "sin(u)", z: "v" } }, { domain: { kind: "parameter", u: { min: 0, max: 2*Math.PI, periodic: true }, v: { min: 0, max: 1 } } }),
    surface("Saved Weierstrass", "weierstrass", { familyId: "literal", expressions: { g: "0", phi: "1" } }),
    ...(["bezierSurface", "bSplineSurface", "nurbsSurface"] as const).map((kind) => surface(`Saved ${kind}`, "spline", { familyId: kind, settings: { splineSettings: JSON.stringify(kind === "bezierSurface" ? { bezierControlGridText: grid } : kind === "bSplineSurface" ? { bSplineControlGridText: grid, bSplineDegreeU: 1, bSplineDegreeV: 1, bSplineKnotUText: "0,0,1,1", bSplineKnotVText: "0,0,1,1" } : { nurbsControlGridText: grid, nurbsDegreeU: 1, nurbsDegreeV: 1, nurbsKnotUText: "0,0,1,1", nurbsKnotVText: "0,0,1,1", nurbsWeightsText: "1,1\n1,1" }) } })),
    ...(["extrusion", "revolution", "ruled-surface", "loft", "sweep", "tube-surface"] as const).map((kind) => {
      const parents = ["ruled-surface","loft"].includes(kind) ? [parent,second] : [parent];
      return surface(`Saved ${kind}`, "constructed", { familyId: kind, sourceIds: parents.map((p)=>p.identity.id) }, { domain: { kind: "curve-construction", u: [0,1], v: [0,1] }, parameters: { depth: 3, angle: Math.PI, axis: "z", radius: 0.2, uSegments: 16, vSegments: 8, sourceGenerations: parents.map((p)=>({ documentId:p.identity.id,revision:p.identity.revision,structuralHash:p.identity.structuralHash,generation:p.identity.revision })) } });
    }),
  ];
  const geometry = createGeometryDocument({ stableKey: "prj16/scene", metadata: { title: "Saved scene constructions" }, source: { objects: [], surfaces: [], relationships: [], parameters: {}, extensions: {}, geometry: { points: [{ id:"a",x:0,y:0,z:0 },{ id:"b",x:4,y:0,z:0 }] }, constructions: [{ id:"mid",type:"midpoint",sourceObjectIds:["a","b"] },{ id:"circle",type:"circle",sourceObjectIds:["a"],radius:1,circleNormal:{x:0,y:0,z:1} }] } });
  const topology = (kind: TopologyDocumentSource["kind"], model: TopologyDocumentSource["model"]) => {
    const id=createStableDocumentId("topology",`prj16/${kind}`),source={sourceId:`${id}/source`,kind,model};
    return createTopologyDocument({identity:createDocumentIdentity(id,source),source,canonicalComplex:null,results:[],displayRealizations:[],provenance:{origin:"native",sourceFormat:"prj16",sourceVersion:1,diagnostics:[]}});
  };
  const topologies = [topology("cw-complex",{id:"interval",name:"Interval",vertices:[{id:"a"},{id:"b"}],edges:[{id:"ab",endpoints:["a","b"]}],faces:[]}),topology("simplicial-complex",{id:"triangle",name:"Triangle",vertexIds:["a","b","c"],edges:[{id:"ab",vertices:["a","b"]},{id:"bc",vertices:["b","c"]},{id:"ca",vertices:["c","a"]}],triangles:[{id:"abc",vertices:["a","b","c"]}]})];
  const docs=[...curves,...surfaces,geometry,...topologies,parent,second,patch];
  const entries:MixedWorkspaceEntry[]=docs.map((document)=>({module:document.format==="math3d.curve-document"?"curve":document.format==="math3d.surface-document"?"surface":document.format==="math3d.geometry-document"?"geometry":"topology",checkpoint:document,expected:document.identity,replay:null}));
  const project=createMath3DProject(createMixedWorkspaceDocument({entries,activeDocumentIds:[curves[0].identity.id],relations:[],results:[],artifacts:[],constructions:[],committedSelection:null}),{stableKey:"prj16-additional",title:"PRJ16 saved representations"});
  return {docs,project};
};
