import type { SceneDocument } from "@math3d/core";
import type { MobileFunctionPreset, MobileGalleryItem } from "../models/mobileScene";

const now = Date.now();

export const mobileGallery: MobileGalleryItem[] = [
  {
    id: "g-implicit-1",
    title: "Implicit Torus",
    description: "Reference implicit setup",
    surface: {
      id: "surface-implicit-torus",
      kind: "implicit",
      expression: "(x*x + y*y + z*z + 3 - 4)^2 - 4*(x*x + y*y)",
      domain: { xSpan: 2.4, ySpan: 2.4, zSpan: 2.4 },
      resolution: 84,
    },
  },
  {
    id: "g-implicit-2",
    title: "Gyroid Slice",
    description: "Triply periodic implicit structure",
    surface: {
      id: "surface-implicit-gyroid",
      kind: "implicit",
      expression: "sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x)",
      domain: { xSpan: 3.2, ySpan: 3.2, zSpan: 3.2 },
      resolution: 80,
    },
  },
  {
    id: "g-implicit-3",
    title: "Double Cone",
    description: "Signed quadratic cone surface",
    surface: {
      id: "surface-implicit-cone",
      kind: "implicit",
      expression: "x*x + y*y - z*z",
      domain: { xSpan: 2.2, ySpan: 2.2, zSpan: 2.2 },
      resolution: 82,
    },
  },
  {
    id: "g-explicit-1",
    title: "Graph Saddle",
    description: "Classic z = x^2 - y^2 shape",
    surface: {
      id: "surface-explicit-saddle",
      kind: "explicit",
      expression: "x*x - y*y",
      domain: { xSpan: 2.6, ySpan: 2.6 },
      resolution: 96,
    },
  },
  {
    id: "g-explicit-2",
    title: "Sinc Ripple",
    description: "Radial damped oscillation",
    surface: {
      id: "surface-explicit-sinc",
      kind: "explicit",
      expression: "sin(3*sqrt(x*x+y*y)) / (0.25 + sqrt(x*x+y*y))",
      domain: { xSpan: 4.2, ySpan: 4.2 },
      resolution: 100,
    },
  },
  {
    id: "g-explicit-3",
    title: "Hyperbolic Bowl",
    description: "Mixed polynomial surface",
    surface: {
      id: "surface-explicit-bowl",
      kind: "explicit",
      expression: "0.35*x*x + 0.08*x*y - 0.24*y*y",
      domain: { xSpan: 3.2, ySpan: 3.2 },
      resolution: 92,
    },
  },
  {
    id: "g-param-1",
    title: "Catenoid",
    description: "Minimal parametric surface",
    surface: {
      id: "surface-param-catenoid",
      kind: "parametric",
      xExpr: "cosh(v)*cos(u)",
      yExpr: "cosh(v)*sin(u)",
      zExpr: "v",
      domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -1.4, vMax: 1.4 },
      resolution: 90,
    },
  },
  {
    id: "g-param-2",
    title: "Helicoid",
    description: "Spiral ruled parametric sheet",
    surface: {
      id: "surface-param-helicoid",
      kind: "parametric",
      xExpr: "v*cos(u)",
      yExpr: "v*sin(u)",
      zExpr: "0.42*u",
      domain: { uMin: -3.2 * Math.PI, uMax: 3.2 * Math.PI, vMin: -1.2, vMax: 1.2 },
      resolution: 86,
    },
  },
  {
    id: "g-param-3",
    title: "Wave Torus",
    description: "Torus with periodic radial modulation",
    surface: {
      id: "surface-param-wave-torus",
      kind: "parametric",
      xExpr: "(1.6 + 0.42*cos(v) + 0.12*cos(5*u))*cos(u)",
      yExpr: "(1.6 + 0.42*cos(v) + 0.12*cos(5*u))*sin(u)",
      zExpr: "0.45*sin(v)",
      domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI },
      resolution: 96,
    },
  },
];

export const mobileFunctionPresets: MobileFunctionPreset[] = [
  {
    id: "fp-1",
    name: "Sphere",
    description: "Implicit unit sphere",
    surface: {
      id: "surface-func-sphere",
      kind: "implicit",
      expression: "x*x + y*y + z*z - 1",
      resolution: 96,
    },
  },
  {
    id: "fp-2",
    name: "Paraboloid",
    description: "Explicit bowl",
    surface: {
      id: "surface-func-paraboloid",
      kind: "explicit",
      expression: "x*x + y*y",
      resolution: 96,
    },
  },
  {
    id: "fp-3",
    name: "Helicoid",
    description: "Parametric minimal surface",
    surface: {
      id: "surface-func-helicoid",
      kind: "parametric",
      xExpr: "v*cos(u)",
      yExpr: "v*sin(u)",
      zExpr: "u",
      resolution: 80,
    },
  },
];

export const mobileSeedScenes: SceneDocument[] = [
  {
    id: "scene-implicit-sphere",
    title: "Implicit Sphere",
    createdAt: now - 7 * 86_400_000,
    updatedAt: now - 1 * 86_400_000,
    surfaces: [mobileFunctionPresets[0].surface],
  },
  {
    id: "scene-enneper-study",
    title: "Enneper Study",
    createdAt: now - 10 * 86_400_000,
    updatedAt: now - 2 * 86_400_000,
    surfaces: [
      {
        id: "surface-enneper-weierstrass",
        kind: "weierstrass",
        gExpr: "z",
        phiExpr: "1",
        domain: { uMin: -1.4, uMax: 1.4, vMin: -1.4, vMax: 1.4 },
        resolution: 80,
      },
    ],
  },
  {
    id: "scene-parametric-lab",
    title: "Parametric Lab",
    createdAt: now - 14 * 86_400_000,
    updatedAt: now - 3 * 86_400_000,
    surfaces: [mobileGallery[0].surface, mobileFunctionPresets[2].surface],
  },
];
