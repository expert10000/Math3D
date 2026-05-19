// src/screens/MobiusScreen.tsx
import React, { useMemo } from "react";
import { uiStyles as styles } from "../uiStyles";
import type { MobiusParams } from "../math/mobius";
import { abs2, add, div, mul, sub, type Complex } from "../math/complex";

type MobiusScreenProps = {
  params: MobiusParams;
  onChange: (p: MobiusParams) => void;
};

const EPS = 1e-12;

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

const MobiusScreen: React.FC<MobiusScreenProps> = ({ params, onChange }) => {
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
    const valid = abs2(det) >= EPS;
    const pole = abs2(c) < EPS ? null : cNeg(div(d, c));
    const fixed = mobiusFixedPoints(params);
    return { det, valid, pole, fixed };
  }, [a, b, c, d, params]);

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div>
        <h2 style={{ ...styles.h2, marginTop: 0, marginBottom: 6 }}>Möbius map</h2>
        <div style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", opacity: 0.88 }}>
          w = (az + b) / (cz + d)
        </div>
      </div>

      <div style={{ border: "1px solid #dbe4f0", borderRadius: 10, padding: 10, background: "#f8fbff", display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>Matrix</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {([
            ["a", a],
            ["b", b],
            ["c", c],
            ["d", d],
          ] as Array<[keyof MobiusParams, Complex]>).map(([name, z]) => (
            <div key={name} style={{ border: "1px solid #dbe4f0", borderRadius: 8, padding: 8, background: "#fff", display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{name}</div>
              <label style={{ display: "grid", gap: 2, fontSize: 11 }}>
                <span>re</span>
                <input type="number" step={0.1} value={z.re} onChange={(e) => updateCoeff(name, "re", Number(e.target.value))} />
              </label>
              <label style={{ display: "grid", gap: 2, fontSize: 11 }}>
                <span>im</span>
                <input type="number" step={0.1} value={z.im} onChange={(e) => updateCoeff(name, "im", Number(e.target.value))} />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div style={{ border: "1px solid #dbe4f0", borderRadius: 10, padding: 10, background: "#fff", display: "grid", gap: 4, fontSize: 12 }}>
        <div>
          <b>det(ad - bc):</b>{" "}
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{cToShort(summary.det)}</span>
        </div>
        <div>
          <b>status:</b> {summary.valid ? "valid" : "singular"}
        </div>
        <div>
          <b>pole:</b>{" "}
          {summary.pole
            ? <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{cToShort(summary.pole)}</span>
            : "none"}
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
        <div style={styles.presetsRow}>
          <button
            type="button"
            onClick={() =>
              setPreset({
                a: { re: 1, im: 0 },
                b: { re: 0, im: 0 },
                c: { re: 0, im: 0 },
                d: { re: 1, im: 0 },
              })
            }
          >
            Identity
          </button>
          <button
            type="button"
            onClick={() =>
              setPreset({
                a: { re: -1, im: 0 },
                b: { re: 0, im: 0 },
                c: { re: 0, im: 0 },
                d: { re: 1, im: 0 },
              })
            }
          >
            Flip (-z)
          </button>
          <button
            type="button"
            onClick={() =>
              setPreset({
                a: { re: 0, im: 0 },
                b: { re: 1, im: 0 },
                c: { re: 1, im: 0 },
                d: { re: 0, im: 0 },
              })
            }
          >
            Inversion (1/z)
          </button>
          <button
            type="button"
            onClick={() =>
              setPreset({
                a: { re: 0, im: 1 },
                b: { re: 0, im: 0 },
                c: { re: 0, im: 0 },
                d: { re: 1, im: 0 },
              })
            }
          >
            Rotate 90 deg
          </button>
          <button
            type="button"
            onClick={() =>
              setPreset({
                a: { re: 1, im: 0 },
                b: { re: 1, im: 1 },
                c: { re: 0, im: 0 },
                d: { re: 1, im: 0 },
              })
            }
          >
            Translate (1+i)
          </button>
          <button
            type="button"
            onClick={() =>
              setPreset({
                a: { re: 1, im: 0 },
                b: { re: 0, im: -1 },
                c: { re: 1, im: 0 },
                d: { re: 0, im: 1 },
              })
            }
          >
            Cayley
          </button>
          <button
            type="button"
            onClick={() =>
              setPreset({
                a: { re: 1, im: 0 },
                b: { re: 0, im: -1 },
                c: { re: 1, im: 0 },
                d: { re: 0, im: 1 },
              })
            }
          >
            Half-plane to disk
          </button>
        </div>
      </div>
    </section>
  );
};

export default MobiusScreen;
