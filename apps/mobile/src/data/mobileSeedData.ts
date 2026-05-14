import type { SceneDocument } from "@math3d/core";
import type { MobileFunctionPreset, MobileGalleryItem } from "../models/mobileScene";

const now = Date.now();

export const mobileGallery: MobileGalleryItem[] = [
  {
    id: "g-1",
    title: "Catenoid",
    description: "Minimal parametric surface",
    surface: {
      id: "surface-catenoid",
      kind: "parametric",
      xExpr: "cosh(v)*cos(u)",
      yExpr: "cosh(v)*sin(u)",
      zExpr: "v",
      domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -1.4, vMax: 1.4 },
      resolution: 90,
    },
  },
  {
    id: "g-2",
    title: "Implicit Torus",
    description: "Reference implicit setup",
    surface: {
      id: "surface-torus",
      kind: "implicit",
      expression: "(x*x + y*y + z*z + 3 - 4)^2 - 4*(x*x + y*y)",
      resolution: 80,
    },
  },
  {
    id: "g-3",
    title: "Graph Saddle",
    description: "Classic z = x^2 - y^2 shape",
    surface: {
      id: "surface-saddle",
      kind: "explicit",
      expression: "x*x - y*y",
      domain: { xSpan: 2.6, ySpan: 2.6 },
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
