export type DomainRect = {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
};

export type WeierstrassPreset = {
  id: string;
  label: string;
  gExpr: string;
  phiExpr: string;
  resolution: number;
  recenterRescale: boolean;

  defaultDomain: DomainRect;
  suggestedDomain: DomainRect;
  safeDomainReason: string;
};

export const WEIERSTRASS_PRESETS: WeierstrassPreset[] = [
  {
    id: "enneper",
    label: "Enneper",
    gExpr: "z",
    phiExpr: "1",
    resolution: 80,
    recenterRescale: true,
    defaultDomain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
    suggestedDomain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
    safeDomainReason: "Polynomial data is stable on moderate domains.",
  },
  {
    id: "enneper2",
    label: "Enneper (order 2)",
    gExpr: "z*z",
    phiExpr: "1",
    resolution: 80,
    recenterRescale: true,
    defaultDomain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
    suggestedDomain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
    safeDomainReason: "Higher curvature; keep the domain moderate.",
  },
  {
    id: "helicoid",
    label: "Helicoid-like (exp)",
    gExpr: "exp(z)",
    phiExpr: "1",
    resolution: 120,
    recenterRescale: true,
    defaultDomain: { uMin: -0.7, uMax: 0.7, vMin: -0.7, vMax: 0.7 },
    suggestedDomain: { uMin: -0.7, uMax: 0.7, vMin: -0.7, vMax: 0.7 },
    safeDomainReason: "exp(z) grows quickly; keep |u|,|v| small.",
  },
  {
    id: "catenoid",
    label: "Catenoid-like (exp pair)",
    gExpr: "exp(z)",
    phiExpr: "exp(-z)",
    resolution: 120,
    recenterRescale: true,
    defaultDomain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
    suggestedDomain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
    safeDomainReason: "Balanced exp/exp(-z) helps, but keep the domain moderate.",
  },
  {
    id: "trig",
    label: "Trig demo",
    gExpr: "sin(z)",
    phiExpr: "1",
    resolution: 80,
    recenterRescale: true,
    defaultDomain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
    suggestedDomain: { uMin: -1, uMax: 1, vMin: -1, vMax: 1 },
    safeDomainReason: "Trig is stable; larger domains add oscillations.",
  },
];
