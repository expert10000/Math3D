import type { SceneDocument, SurfaceDefinition, WorkerCapabilityId } from "@math3d/core";
import type { Math3DExample, Math3DExampleCategory } from "../models/mobileScene";

const now = Date.now();
const IMPLICIT_CAPABILITY: WorkerCapabilityId = "vtk.preview-implicit";

const example = (args: {
  id: string;
  title: string;
  description: string;
  category: Math3DExampleCategory;
  surface: SurfaceDefinition;
  capabilities?: WorkerCapabilityId[];
  learnTopic?: Math3DExample["learnTopic"];
}): Math3DExample => ({
  id: args.id,
  title: args.title,
  description: args.description,
  category: args.category,
  surfaceType: args.surface.kind,
  capabilities: args.capabilities ?? [],
  learnTopic: args.learnTopic,
  scene: {
    id: `example-scene-${args.id}`,
    title: args.title,
    createdAt: 0,
    updatedAt: 0,
    surfaces: [args.surface],
  },
});

export const mobileExamples: Math3DExample[] = [
  example({
    id: "implicit-torus", title: "Implicit Torus", description: "Reference implicit setup", category: "implicit",
    capabilities: [IMPLICIT_CAPABILITY],
    learnTopic: { title: "Implicit level sets", summary: "A surface is the zero set of a scalar function in three variables." },
    surface: { id: "surface-implicit-torus", kind: "implicit", expression: "(x*x + y*y + z*z + 3 - 4)^2 - 4*(x*x + y*y)", domain: { xSpan: 2.4, ySpan: 2.4, zSpan: 2.4 }, resolution: 84 },
  }),
  example({
    id: "gyroid", title: "Gyroid Slice", description: "Triply periodic implicit structure", category: "periodic",
    capabilities: [IMPLICIT_CAPABILITY],
    learnTopic: { title: "Triply periodic surfaces", summary: "Repeating trigonometric fields form connected structures without straight lines." },
    surface: { id: "surface-implicit-gyroid", kind: "implicit", expression: "sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x)", domain: { xSpan: 3.2, ySpan: 3.2, zSpan: 3.2 }, resolution: 80 },
  }),
  example({
    id: "double-cone", title: "Double Cone", description: "Signed quadratic cone surface", category: "implicit",
    capabilities: [IMPLICIT_CAPABILITY],
    surface: { id: "surface-implicit-cone", kind: "implicit", expression: "x*x + y*y - z*z", domain: { xSpan: 2.2, ySpan: 2.2, zSpan: 2.2 }, resolution: 82 },
  }),
  example({
    id: "graph-saddle", title: "Graph Saddle", description: "Classic z = x² - y² shape", category: "graphs",
    learnTopic: { title: "Gaussian curvature", summary: "A saddle bends in opposite directions and has negative Gaussian curvature." },
    surface: { id: "surface-explicit-saddle", kind: "explicit", expression: "x*x - y*y", domain: { xSpan: 2.6, ySpan: 2.6 }, resolution: 96 },
  }),
  example({
    id: "sinc-ripple", title: "Sinc Ripple", description: "Radial damped oscillation", category: "graphs",
    surface: { id: "surface-explicit-sinc", kind: "explicit", expression: "sin(3*sqrt(x*x+y*y)) / (0.25 + sqrt(x*x+y*y))", domain: { xSpan: 4.2, ySpan: 4.2 }, resolution: 100 },
  }),
  example({
    id: "hyperbolic-bowl", title: "Hyperbolic Bowl", description: "Mixed polynomial surface", category: "graphs",
    surface: { id: "surface-explicit-bowl", kind: "explicit", expression: "0.35*x*x + 0.08*x*y - 0.24*y*y", domain: { xSpan: 3.2, ySpan: 3.2 }, resolution: 92 },
  }),
  example({
    id: "catenoid", title: "Catenoid", description: "Minimal parametric surface", category: "minimal",
    learnTopic: { title: "Minimal surfaces", summary: "Minimal surfaces have zero mean curvature at regular points." },
    surface: { id: "surface-param-catenoid", kind: "parametric", xExpr: "cosh(v)*cos(u)", yExpr: "cosh(v)*sin(u)", zExpr: "v", domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -1.4, vMax: 1.4 }, resolution: 90 },
  }),
  example({
    id: "helicoid", title: "Helicoid", description: "Spiral ruled parametric sheet", category: "minimal",
    surface: { id: "surface-param-helicoid", kind: "parametric", xExpr: "v*cos(u)", yExpr: "v*sin(u)", zExpr: "0.42*u", domain: { uMin: -3.2 * Math.PI, uMax: 3.2 * Math.PI, vMin: -1.2, vMax: 1.2 }, resolution: 86 },
  }),
  example({
    id: "wave-torus", title: "Wave Torus", description: "Torus with periodic radial modulation", category: "periodic",
    surface: { id: "surface-param-wave-torus", kind: "parametric", xExpr: "(1.6 + 0.42*cos(v) + 0.12*cos(5*u))*cos(u)", yExpr: "(1.6 + 0.42*cos(v) + 0.12*cos(5*u))*sin(u)", zExpr: "0.45*sin(v)", domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI }, resolution: 96 },
  }),
  example({
    id: "sphere", title: "Sphere", description: "Implicit unit sphere", category: "classic",
    capabilities: [IMPLICIT_CAPABILITY],
    learnTopic: { title: "Closed surface topology", summary: "A triangulated sphere is closed, connected, and has Euler characteristic 2." },
    surface: { id: "surface-func-sphere", kind: "implicit", expression: "x*x + y*y + z*z - 1", resolution: 96 },
  }),
  example({
    id: "paraboloid", title: "Paraboloid", description: "Explicit bowl", category: "classic",
    surface: { id: "surface-func-paraboloid", kind: "explicit", expression: "x*x + y*y", resolution: 96 },
  }),
  example({
    id: "enneper", title: "Enneper Surface", description: "Classic Weierstrass minimal surface", category: "minimal",
    learnTopic: { title: "Weierstrass representation", summary: "Complex data can parameterize a minimal surface in three-dimensional space." },
    surface: { id: "surface-enneper-weierstrass", kind: "weierstrass", gExpr: "z", phiExpr: "1", domain: { uMin: -1.4, uMax: 1.4, vMin: -1.4, vMax: 1.4 }, resolution: 80 },
  }),
];

const exampleSurface = (id: string): SurfaceDefinition => {
  const surface = mobileExamples.find((item) => item.id === id)?.scene.surfaces?.[0];
  if (!surface) throw new Error(`Missing bundled mobile example ${id}.`);
  return surface;
};

export const mobileSeedScenes: SceneDocument[] = [
  { id: "scene-catenoid-workspace", title: "Catenoid", createdAt: now - 5 * 86_400_000, updatedAt: now, surfaces: [exampleSurface("catenoid")] },
  { id: "scene-implicit-sphere", title: "Implicit Sphere", createdAt: now - 7 * 86_400_000, updatedAt: now - 1 * 86_400_000, surfaces: [exampleSurface("sphere")] },
  { id: "scene-enneper-study", title: "Enneper Study", createdAt: now - 10 * 86_400_000, updatedAt: now - 2 * 86_400_000, surfaces: [exampleSurface("enneper")] },
  { id: "scene-parametric-lab", title: "Parametric Lab", createdAt: now - 14 * 86_400_000, updatedAt: now - 3 * 86_400_000, surfaces: [exampleSurface("implicit-torus"), exampleSurface("helicoid")] },
];
