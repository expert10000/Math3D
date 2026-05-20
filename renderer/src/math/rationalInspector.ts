import { C, type Complex } from "./complex";

export type RationalRoot = {
  point: Complex;
  order: number;
};

export type RationalInspection = {
  normalizedExpr: string;
  numeratorExpr: string;
  denominatorExpr: string;
  zeros: RationalRoot[];
  poles: RationalRoot[];
  removable: RationalRoot[];
  reducedExpression: string;
  error?: string;
};

type Token =
  | { kind: "num"; value: number }
  | { kind: "var" }
  | { kind: "op"; value: "+" | "-" | "*" | "^" }
  | { kind: "lp" }
  | { kind: "rp" };

type Poly = number[]; // ascending coefficients: c0 + c1 z + c2 z^2 + ...

type Cx = { re: number; im: number };

const EPS = 1e-9;

const cAdd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cDiv = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  if (d <= EPS) return { re: NaN, im: NaN };
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const cAbs = (z: Cx) => Math.hypot(z.re, z.im);

const isNearZero = (v: number) => Math.abs(v) < EPS;

const normalizePoly = (p: Poly): Poly => {
  const out = p.slice();
  while (out.length > 1 && isNearZero(out[out.length - 1])) out.pop();
  if (!out.length) return [0];
  return out;
};

const polyAdd = (a: Poly, b: Poly): Poly => {
  const n = Math.max(a.length, b.length);
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  }
  return normalizePoly(out);
};

const polySub = (a: Poly, b: Poly): Poly => {
  const n = Math.max(a.length, b.length);
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  }
  return normalizePoly(out);
};

const polyMul = (a: Poly, b: Poly): Poly => {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      out[i + j] += a[i] * b[j];
    }
  }
  return normalizePoly(out);
};

const polyPow = (base: Poly, exponent: number): Poly => {
  if (exponent < 0 || !Number.isInteger(exponent)) throw new Error("Exponent must be a non-negative integer.");
  let out: Poly = [1];
  let b = normalizePoly(base);
  let e = exponent;
  while (e > 0) {
    if (e & 1) out = polyMul(out, b);
    e >>= 1;
    if (e > 0) b = polyMul(b, b);
  }
  return normalizePoly(out);
};

const sanitizeExpr = (src: string) => {
  let out = src.trim();
  out = out.replace(/^f\s*\(\s*z\s*\)\s*=\s*/i, "");
  out = out.replace(/^w\s*=\s*/i, "");
  out = out.replace(/\s+/g, "");
  return out;
};

const splitTopLevelRational = (src: string): { numerator: string; denominator: string } => {
  let depth = 0;
  let slash = -1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "/" && depth === 0) {
      if (slash >= 0) {
        throw new Error("Only one top-level division is supported for rational inspection.");
      }
      slash = i;
    }
  }
  if (depth !== 0) throw new Error("Mismatched parentheses.");
  if (slash < 0) return { numerator: src, denominator: "1" };
  const numerator = src.slice(0, slash) || "0";
  const denominator = src.slice(slash + 1) || "1";
  return { numerator, denominator };
};

const stripOuterParens = (src: string): string => {
  let out = src;
  while (out.startsWith("(") && out.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < out.length; i++) {
      const ch = out[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth === 0 && i < out.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    out = out.slice(1, -1);
  }
  return out;
};

const tokenize = (src: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  const push = (t: Token) => tokens.push(t);

  while (i < src.length) {
    const ch = src[i];
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      const start = i;
      i++;
      while (i < src.length) {
        const c = src[i];
        if ((c >= "0" && c <= "9") || c === ".") i++;
        else break;
      }
      const raw = src.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number '${raw}'.`);
      push({ kind: "num", value });
      continue;
    }
    if (ch === "z" || ch === "Z") {
      push({ kind: "var" });
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "^") {
      push({ kind: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      push({ kind: "lp" });
      i++;
      continue;
    }
    if (ch === ")") {
      push({ kind: "rp" });
      i++;
      continue;
    }
    throw new Error(`Unsupported token '${ch}'.`);
  }

  const out: Token[] = [];
  const isValueEnd = (t: Token) => t.kind === "num" || t.kind === "var" || t.kind === "rp";
  const isValueStart = (t: Token) => t.kind === "num" || t.kind === "var" || t.kind === "lp";
  for (let k = 0; k < tokens.length; k++) {
    const a = tokens[k];
    out.push(a);
    const b = tokens[k + 1];
    if (!b) continue;
    if (isValueEnd(a) && isValueStart(b)) {
      out.push({ kind: "op", value: "*" });
    }
  }
  return out;
};

const parsePolynomial = (src: string): Poly => {
  const tokens = tokenize(src);
  let idx = 0;

  const peek = () => tokens[idx] ?? null;
  const consume = () => tokens[idx++] ?? null;

  const parseExpression = (): Poly => {
    let left = parseTerm();
    while (true) {
      const t = peek();
      if (!t || t.kind !== "op" || (t.value !== "+" && t.value !== "-")) break;
      consume();
      const right = parseTerm();
      left = t.value === "+" ? polyAdd(left, right) : polySub(left, right);
    }
    return left;
  };

  const parseTerm = (): Poly => {
    let left = parsePower();
    while (true) {
      const t = peek();
      if (!t || t.kind !== "op" || t.value !== "*") break;
      consume();
      const right = parsePower();
      left = polyMul(left, right);
    }
    return left;
  };

  const parsePower = (): Poly => {
    let base = parseUnary();
    const t = peek();
    if (t && t.kind === "op" && t.value === "^") {
      consume();
      const expPoly = parseUnary();
      if (expPoly.length !== 1) throw new Error("Exponent must be a constant integer.");
      const exp = expPoly[0];
      if (!Number.isInteger(exp) || exp < 0 || exp > 24) {
        throw new Error("Exponent must be an integer between 0 and 24.");
      }
      base = polyPow(base, exp);
    }
    return base;
  };

  const parseUnary = (): Poly => {
    const t = peek();
    if (t && t.kind === "op" && (t.value === "+" || t.value === "-")) {
      consume();
      const rhs = parseUnary();
      return t.value === "+" ? rhs : rhs.map((c) => -c);
    }
    return parsePrimary();
  };

  const parsePrimary = (): Poly => {
    const t = consume();
    if (!t) throw new Error("Unexpected end of expression.");
    if (t.kind === "num") return [t.value];
    if (t.kind === "var") return [0, 1];
    if (t.kind === "lp") {
      const inside = parseExpression();
      const close = consume();
      if (!close || close.kind !== "rp") throw new Error("Missing closing parenthesis.");
      return inside;
    }
    throw new Error("Unexpected token while parsing polynomial.");
  };

  const out = normalizePoly(parseExpression());
  if (idx !== tokens.length) throw new Error("Unexpected trailing tokens.");
  return out;
};

const evalPoly = (poly: Poly, z: Cx): Cx => {
  let out: Cx = { re: 0, im: 0 };
  for (let i = poly.length - 1; i >= 0; i--) {
    out = cAdd(cMul(out, z), { re: poly[i], im: 0 });
  }
  return out;
};

const clusterRoots = (roots: Cx[], eps: number): RationalRoot[] => {
  const clusters: Array<{ center: Cx; members: Cx[] }> = [];
  for (const root of roots) {
    if (!Number.isFinite(root.re) || !Number.isFinite(root.im)) continue;
    let placed = false;
    for (const cluster of clusters) {
      if (cAbs(cSub(root, cluster.center)) <= eps) {
        cluster.members.push(root);
        const n = cluster.members.length;
        cluster.center = {
          re: (cluster.center.re * (n - 1) + root.re) / n,
          im: (cluster.center.im * (n - 1) + root.im) / n,
        };
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ center: root, members: [root] });
    }
  }

  return clusters.map((cluster) => ({
    point: {
      re: Math.abs(cluster.center.re) < 1e-10 ? 0 : cluster.center.re,
      im: Math.abs(cluster.center.im) < 1e-10 ? 0 : cluster.center.im,
    },
    order: cluster.members.length,
  }));
};

const durandKernerRoots = (poly: Poly): Cx[] => {
  const p = normalizePoly(poly);
  const degree = p.length - 1;
  if (degree <= 0) return [];
  if (degree === 1) {
    const a = p[1];
    if (Math.abs(a) <= EPS) return [];
    return [{ re: -p[0] / a, im: 0 }];
  }

  const lead = p[degree];
  if (Math.abs(lead) <= EPS) return [];

  const maxCoeff = p.slice(0, degree).reduce((m, c) => Math.max(m, Math.abs(c)), 0);
  const radius = 1 + maxCoeff / Math.max(EPS, Math.abs(lead));
  let roots: Cx[] = Array.from({ length: degree }, (_, k) => {
    const t = (2 * Math.PI * k) / degree;
    return { re: radius * Math.cos(t), im: radius * Math.sin(t) };
  });

  const polyMonic = p.map((c) => c / lead);

  for (let iter = 0; iter < 120; iter++) {
    let maxDelta = 0;
    const nextRoots = roots.map((root, i) => {
      let denom: Cx = { re: 1, im: 0 };
      for (let j = 0; j < roots.length; j++) {
        if (i === j) continue;
        denom = cMul(denom, cSub(root, roots[j]));
      }
      if (cAbs(denom) <= EPS) {
        const jitter = { re: 1e-6 * Math.cos(iter + i), im: 1e-6 * Math.sin(iter + i) };
        denom = cAdd(denom, jitter);
      }
      const f = evalPoly(polyMonic, root);
      const delta = cDiv(f, denom);
      const updated = cSub(root, delta);
      maxDelta = Math.max(maxDelta, cAbs(delta));
      return updated;
    });
    roots = nextRoots;
    if (maxDelta < 1e-10) break;
  }

  return roots;
};

const cancelCommonRoots = (zeros: RationalRoot[], poles: RationalRoot[]): {
  zeros: RationalRoot[];
  poles: RationalRoot[];
  removable: RationalRoot[];
} => {
  const rem: RationalRoot[] = [];
  const nextZeros = zeros.map((entry) => ({ ...entry }));
  const nextPoles = poles.map((entry) => ({ ...entry }));
  const tol = 2e-3;

  for (const z of nextZeros) {
    for (const p of nextPoles) {
      if (z.order <= 0 || p.order <= 0) continue;
      const d = cAbs(cSub(z.point, p.point));
      if (d > tol) continue;
      const cut = Math.min(z.order, p.order);
      z.order -= cut;
      p.order -= cut;
      rem.push({ point: { ...z.point }, order: cut });
    }
  }

  return {
    zeros: nextZeros.filter((entry) => entry.order > 0),
    poles: nextPoles.filter((entry) => entry.order > 0),
    removable: rem,
  };
};

const fmtNumber = (value: number) => {
  if (!Number.isFinite(value)) return "NaN";
  if (Math.abs(value) < 1e-10) return "0";
  const rounded = Math.round(value * 1e6) / 1e6;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-10) return String(Math.round(rounded));
  return String(rounded);
};

const fmtRootFactor = (root: Complex, order: number) => {
  const base =
    Math.abs(root.im) < 1e-6
      ? Math.abs(root.re) < 1e-6
        ? "z"
        : `z ${root.re >= 0 ? "-" : "+"} ${fmtNumber(Math.abs(root.re))}`
      : `z - (${fmtNumber(root.re)} ${root.im >= 0 ? "+" : "-"} ${fmtNumber(Math.abs(root.im))}i)`;
  if (order <= 1) return `(${base})`;
  return `(${base})^${order}`;
};

const buildReducedExpression = (zeros: RationalRoot[], poles: RationalRoot[], leadNumerator: number, leadDenominator: number) => {
  const constant = leadNumerator / Math.max(EPS, leadDenominator);
  const numFactors = zeros.map((root) => fmtRootFactor(root.point, root.order));
  const denFactors = poles.map((root) => fmtRootFactor(root.point, root.order));

  const constantIsOne = Math.abs(constant - 1) < 1e-8;
  const constantIsMinusOne = Math.abs(constant + 1) < 1e-8;

  const numCore = numFactors.length ? numFactors.join(" * ") : "1";
  const denCore = denFactors.length ? denFactors.join(" * ") : "1";

  let numExpr = numCore;
  if (!constantIsOne) {
    if (constantIsMinusOne) numExpr = `-(${numCore})`;
    else numExpr = `${fmtNumber(constant)} * ${numCore}`;
  }

  if (!denFactors.length) return numExpr;
  return `(${numExpr}) / (${denCore})`;
};

export const inspectRationalFunction = (expr: string): RationalInspection | null => {
  try {
    const normalizedExpr = sanitizeExpr(expr);
    if (!normalizedExpr) {
      return {
        normalizedExpr,
        numeratorExpr: "",
        denominatorExpr: "",
        zeros: [],
        poles: [],
        removable: [],
        reducedExpression: "",
        error: "Expression is empty.",
      };
    }

    const split = splitTopLevelRational(normalizedExpr);
    const numeratorExpr = stripOuterParens(split.numerator);
    const denominatorExpr = stripOuterParens(split.denominator);

    const numerator = parsePolynomial(numeratorExpr);
    const denominator = parsePolynomial(denominatorExpr);

    if (normalizePoly(denominator).length === 1 && Math.abs(denominator[0]) < EPS) {
      return {
        normalizedExpr,
        numeratorExpr,
        denominatorExpr,
        zeros: [],
        poles: [],
        removable: [],
        reducedExpression: "",
        error: "Denominator is zero.",
      };
    }

    const zeroRootsRaw = durandKernerRoots(numerator);
    const poleRootsRaw = durandKernerRoots(denominator);
    const rootScale = Math.max(1, ...zeroRootsRaw.map(cAbs), ...poleRootsRaw.map(cAbs));
    const clusterTol = Math.max(1e-4, rootScale * 4e-4);

    const zeroRoots = clusterRoots(zeroRootsRaw, clusterTol);
    const poleRoots = clusterRoots(poleRootsRaw, clusterTol);
    const canceled = cancelCommonRoots(zeroRoots, poleRoots);

    const reducedExpression = buildReducedExpression(
      canceled.zeros,
      canceled.poles,
      numerator[numerator.length - 1] ?? 1,
      denominator[denominator.length - 1] ?? 1
    );

    return {
      normalizedExpr,
      numeratorExpr,
      denominatorExpr,
      zeros: canceled.zeros,
      poles: canceled.poles,
      removable: canceled.removable,
      reducedExpression,
    };
  } catch (error) {
    return {
      normalizedExpr: sanitizeExpr(expr),
      numeratorExpr: "",
      denominatorExpr: "",
      zeros: [],
      poles: [],
      removable: [],
      reducedExpression: "",
      error: error instanceof Error ? error.message : "Failed to inspect rational function.",
    };
  }
};

export const formatRoot = (root: Complex) => {
  const re = Math.abs(root.re) < 1e-8 ? 0 : root.re;
  const im = Math.abs(root.im) < 1e-8 ? 0 : root.im;
  if (im === 0) return fmtNumber(re);
  return `${fmtNumber(re)} ${im >= 0 ? "+" : "-"} ${fmtNumber(Math.abs(im))}i`;
};

export const toComplex = (re: number, im: number) => C(re, im);
