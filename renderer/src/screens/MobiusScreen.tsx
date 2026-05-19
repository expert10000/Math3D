// src/screens/MobiusScreen.tsx
import React, { useMemo } from "react";
import { uiStyles as styles } from "../uiStyles";
import type { MobiusParams } from "../math/mobius";
import { abs2, add, div, mul, sub, type Complex } from "../math/complex";

type MobiusScreenProps = {
  params: MobiusParams;
  onChange: (p: MobiusParams) => void;
  integrationActions?: {
    saveAsWorkbookDemo: () => void;
    promoteToSceneOverlay: () => void;
    exportZWPlaneImage: () => void;
    exportRiemannSphereScene: () => void;
    createLessonCard: () => void;
  };
  integrationStatus?: string | null;
};

const EPS = 1e-12;
const NEAR_SINGULAR_EPS = 1e-6;

const cNeg = (z: Complex): Complex => ({ re: -z.re, im: -z.im });
const cSqrt = (z: Complex): Complex => {
  if (Math.abs(z.re) < EPS && Math.abs(z.im) < EPS) return { re: 0, im: 0 };
  const r = Math.hypot(z.re, z.im);
  const re = Math.sqrt((r + z.re) * 0.5);
  const imSign = z.im < 0 ? -1 : 1;
  const im = imSign * Math.sqrt(Math.max(0, (r - z.re) * 0.5));
  return { re, im };
};
const cToShort = (z: Complex): string => `${z.re.toFixed(4)}${z.im < 0 ? " - " : " + "}${Math.abs(z.im).toFixed(4)}i`;

type MobiusPresetGroup = {
  title: string;
  items: Array<{
    id: string;
    label: string;
    desc: string;
    params: MobiusParams;
  }>;
};

const PRESET_GROUPS: MobiusPresetGroup[] = [
  {
    title: "Basic",
    items: [
      {
        id: "identity",
        label: "Identity",
        desc: "w = z",
        params: { a: { re: 1, im: 0 }, b: { re: 0, im: 0 }, c: { re: 0, im: 0 }, d: { re: 1, im: 0 } },
      },
      {
        id: "translation",
        label: "Translation",
        desc: "w = z + (1 + i)",
        params: { a: { re: 1, im: 0 }, b: { re: 1, im: 1 }, c: { re: 0, im: 0 }, d: { re: 1, im: 0 } },
      },
      {
        id: "rotation",
        label: "Rotation",
        desc: "w = i z (90°)",
        params: { a: { re: 0, im: 1 }, b: { re: 0, im: 0 }, c: { re: 0, im: 0 }, d: { re: 1, im: 0 } },
      },
      {
        id: "scaling",
        label: "Scaling",
        desc: "w = 2z",
        params: { a: { re: 2, im: 0 }, b: { re: 0, im: 0 }, c: { re: 0, im: 0 }, d: { re: 1, im: 0 } },
      },
      {
        id: "flip",
        label: "Flip",
        desc: "w = -z",
        params: { a: { re: -1, im: 0 }, b: { re: 0, im: 0 }, c: { re: 0, im: 0 }, d: { re: 1, im: 0 } },
      },
    ],
  },
  {
    title: "Singular / Nonlinear",
    items: [
      {
        id: "inversion",
        label: "Inversion",
        desc: "w = 1/z",
        params: { a: { re: 0, im: 0 }, b: { re: 1, im: 0 }, c: { re: 1, im: 0 }, d: { re: 0, im: 0 } },
      },
      {
        id: "general",
        label: "General Möbius",
        desc: "General nonlinear fractional map",
        params: { a: { re: 1, im: 0.4 }, b: { re: -0.3, im: 0.8 }, c: { re: 0.6, im: -0.2 }, d: { re: 1, im: 0 } },
      },
      {
        id: "pole-near",
        label: "Pole near domain",
        desc: "Pole near z = 0.2 + 0.1i",
        params: { a: { re: 1, im: 0 }, b: { re: 0, im: 0 }, c: { re: 1, im: 0 }, d: { re: -0.2, im: -0.1 } },
      },
    ],
  },
  {
    title: "Classical maps",
    items: [
      {
        id: "cayley",
        label: "Cayley transform",
        desc: "Maps upper half-plane to unit disk.",
        params: { a: { re: 1, im: 0 }, b: { re: 0, im: -1 }, c: { re: 1, im: 0 }, d: { re: 0, im: 1 } },
      },
      {
        id: "halfplane-disk",
        label: "Half-plane → disk",
        desc: "Maps right half-plane to unit disk.",
        params: { a: { re: 1, im: 0 }, b: { re: -1, im: 0 }, c: { re: 1, im: 0 }, d: { re: 1, im: 0 } },
      },
      {
        id: "disk-auto",
        label: "Disk automorphism",
        desc: "Automorphism of unit disk.",
        params: { a: { re: 1, im: 0 }, b: { re: -0.35, im: -0.2 }, c: { re: -0.35, im: 0.2 }, d: { re: 1, im: 0 } },
      },
      {
        id: "uhp-self",
        label: "Upper half-plane self-map",
        desc: "w = z + 1 (preserves Im z > 0).",
        params: { a: { re: 1, im: 0 }, b: { re: 1, im: 0 }, c: { re: 0, im: 0 }, d: { re: 1, im: 0 } },
      },
    ],
  },
];

const mobiusFixedPoints = (p: MobiusParams): { kind: string; values: Complex[] } => {
  const A = p.a;
  const B = p.b;
  const C = p.c;
  const D = p.d;
  if (abs2(C) < EPS) {
    const denom = sub(A, D);
    if (abs2(denom) < EPS) {
      if (abs2(B) < EPS) return { kind: "all", values: [] };
      return { kind: "none", values: [] };
    }
    return { kind: "single", values: [div(cNeg(B), denom)] };
  }
  const linear = sub(D, A);
  const disc = add(mul(linear, linear), mul({ re: 4, im: 0 }, mul(C, B)));
  const sqrtDisc = cSqrt(disc);
  const twoC = mul({ re: 2, im: 0 }, C);
  return {
    kind: "pair",
    values: [div(add(cNeg(linear), sqrtDisc), twoC), div(sub(cNeg(linear), sqrtDisc), twoC)],
  };
};

const MobiusScreen: React.FC<MobiusScreenProps> = ({ params, onChange, integrationActions, integrationStatus }) => {
  const { a, b, c, d } = params;

  const updateCoeff = (which: "a" | "b" | "c" | "d", part: "re" | "im", value: number) => {
    onChange({
      ...params,
      [which]: { ...params[which], [part]: value },
    });
  };

  const setPreset = (p: MobiusParams) => onChange(p);

  const summary = useMemo(() => {
    const det = sub(mul(a, d), mul(b, c));
    const detAbs = Math.sqrt(abs2(det));
    const valid = abs2(det) >= EPS;
    const nearSingular = valid && detAbs < NEAR_SINGULAR_EPS;
    const pole = abs2(c) < EPS ? null : cNeg(div(d, c));
    const infImage = abs2(c) < EPS ? null : div(a, c);
    const fixed = mobiusFixedPoints(params);
    return { det, detAbs, valid, nearSingular, pole, infImage, fixed };
  }, [a, b, c, d, params]);

  const complexRow = (name: "a" | "b" | "c" | "d", z: Complex) => (
    <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
      <span style={{ minWidth: 18, fontWeight: 700 }}>{name} =</span>
      <input
        type="number"
        step={0.1}
        value={z.re}
        onChange={(e) => updateCoeff(name, "re", Number(e.target.value))}
        style={{ width: 72 }}
        aria-label={`${name} real`}
      />
      <span>+</span>
      <input
        type="number"
        step={0.1}
        value={z.im}
        onChange={(e) => updateCoeff(name, "im", Number(e.target.value))}
        style={{ width: 72 }}
        aria-label={`${name} imaginary`}
      />
      <span>i</span>
    </div>
  );

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div>
        <h2 style={{ ...styles.h2, marginTop: 0, marginBottom: 6 }}>Möbius map</h2>
        <div style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", opacity: 0.88 }}>
          w = (az + b) / (cz + d)
        </div>
      </div>

      <div style={{ border: "1px solid #dbe4f0", borderRadius: 10, padding: 10, background: "#f8fbff", display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>Matrix coefficients</div>
        <div style={{ display: "grid", gap: 6 }}>
          {complexRow("a", a)}
          {complexRow("b", b)}
          {complexRow("c", c)}
          {complexRow("d", d)}
        </div>
      </div>

      <div style={{ border: "1px solid #dbe4f0", borderRadius: 10, padding: 10, background: "#fff", display: "grid", gap: 4, fontSize: 12 }}>
        <div>
          <b>det = ad - bc =</b>{" "}
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{cToShort(summary.det)}</span>
        </div>
        <div style={{ opacity: 0.78 }}>normalized matrix:</div>
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>[ a  b ]</div>
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>[ c  d ]</div>
      </div>

      <div style={{ border: "1px solid #dbe4f0", borderRadius: 10, padding: 10, background: "#fff", display: "grid", gap: 4, fontSize: 12 }}>
        {!summary.valid && (
          <div style={{ color: "#b91c1c" }}>
            <b>Invalid:</b> ad - bc = 0
          </div>
        )}
        {summary.nearSingular && (
          <div style={{ color: "#b45309" }}>
            <b>Near singular:</b> determinant very small (|ad - bc| = {summary.detAbs.toExponential(2)})
          </div>
        )}
        <div>
          <b>Pole: z = -d/c</b>{" "}
          {summary.pole
            ? <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{cToShort(summary.pole)}</span>
            : "none"}
        </div>
        <div>
          <b>Infinity maps to: a/c</b>{" "}
          {summary.infImage
            ? <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{cToShort(summary.infImage)}</span>
            : "∞ (affine case c = 0)"}
        </div>
        <div>
          <b>fixed points:</b>{" "}
          {summary.fixed.kind === "all"
            ? "all points"
            : summary.fixed.kind === "none"
              ? "none"
              : summary.fixed.values.map(cToShort).join(" ; ")}
        </div>
      </div>

      <div>
        <h3 style={styles.h3}>Presets</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {PRESET_GROUPS.map((group) => (
            <div key={group.title} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{group.title}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPreset(item.params)}
                    style={{ textAlign: "left", display: "grid", gap: 2, padding: "6px 8px" }}
                    title={item.desc}
                  >
                    <span style={{ fontWeight: 700 }}>{item.label}</span>
                    <span style={{ fontSize: 11, opacity: 0.82 }}>{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {integrationActions && (
        <div style={{ border: "1px solid #dbe4f0", borderRadius: 10, padding: 10, background: "#fff", display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>Math3D integration</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button type="button" onClick={integrationActions.saveAsWorkbookDemo}>Save as workbook demo</button>
            <button type="button" onClick={integrationActions.promoteToSceneOverlay}>Promote to scene overlay</button>
            <button type="button" onClick={integrationActions.createLessonCard}>Create lesson card</button>
            <button type="button" onClick={integrationActions.exportZWPlaneImage}>Export Z/W plane as image</button>
            <button type="button" onClick={integrationActions.exportRiemannSphereScene}>Export Riemann sphere scene</button>
          </div>
          <div style={{ fontSize: 12 }}>
            <b>Workbook demos:</b>{" "}
            Demo 1: Lines become circles. Demo 2: Inversion and the pole. Demo 3: Cayley transform. Demo 4: Cross-ratio preservation. Demo 5: Riemann sphere and infinity.
          </div>
          {integrationStatus && <div style={{ fontSize: 11, color: "#0f766e" }}>{integrationStatus}</div>}
        </div>
      )}
    </section>
  );
};

export default MobiusScreen;
