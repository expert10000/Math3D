// src/screens/MobiusScreen.tsx
import React from "react";
import { uiStyles as styles } from "../uiStyles";
import type { MobiusParams } from "../math/mobius";

type MobiusScreenProps = {
  params: MobiusParams;
  onChange: (p: MobiusParams) => void;
};

const MobiusScreen: React.FC<MobiusScreenProps> = ({ params, onChange }) => {
  const { a, b, c, d } = params;

  // log on each render so we see the live state
  console.log("[MobiusScreen] render", { a, b, c, d });

  const updateCoeff = (
    which: "a" | "b" | "c" | "d",
    part: "re" | "im",
    value: number
  ) => {
    console.log("[MobiusScreen] updateCoeff", { which, part, value });

    onChange({
      ...params,
      [which]: {
        ...params[which],
        [part]: value,
      },
    });
  };

  // preset helper
  const setPreset = (p: MobiusParams) => {
    console.log("[MobiusScreen] setPreset", p);
    onChange(p);
  };

  return (
    <section>
      <h2 style={styles.h2}>Möbius parameters</h2>

      <div style={styles.grid4}>
        <label>a.re</label>
        <input
          type="number"
          step={0.1}
          value={a.re}
          onChange={(e) => updateCoeff("a", "re", Number(e.target.value))}
        />

        <label>a.im</label>
        <input
          type="number"
          step={0.1}
          value={a.im}
          onChange={(e) => updateCoeff("a", "im", Number(e.target.value))}
        />

        <label>b.re</label>
        <input
          type="number"
          step={0.1}
          value={b.re}
          onChange={(e) => updateCoeff("b", "re", Number(e.target.value))}
        />

        <label>b.im</label>
        <input
          type="number"
          step={0.1}
          value={b.im}
          onChange={(e) => updateCoeff("b", "im", Number(e.target.value))}
        />

        <label>c.re</label>
        <input
          type="number"
          step={0.1}
          value={c.re}
          onChange={(e) => updateCoeff("c", "re", Number(e.target.value))}
        />

        <label>c.im</label>
        <input
          type="number"
          step={0.1}
          value={c.im}
          onChange={(e) => updateCoeff("c", "im", Number(e.target.value))}
        />

        <label>d.re</label>
        <input
          type="number"
          step={0.1}
          value={d.re}
          onChange={(e) => updateCoeff("d", "re", Number(e.target.value))}
        />

        <label>d.im</label>
        <input
          type="number"
          step={0.1}
          value={d.im}
          onChange={(e) => updateCoeff("d", "im", Number(e.target.value))}
        />
      </div>

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
              a: { re: -1, im: 0 }, // z ↦ -z
              b: { re: 0, im: 0 },
              c: { re: 0, im: 0 },
              d: { re: 1, im: 0 },
            })
          }
        >
          Flip (−z)
        </button>

        <button
          type="button"
          onClick={() =>
            setPreset({
              // placeholder 1/z-type Möbius
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
              a: { re: 0, im: 1 }, // multiply by i
              b: { re: 0, im: 0 },
              c: { re: 0, im: 0 },
              d: { re: 1, im: 0 },
            })
          }
        >
          Rotate 90°
        </button>

        <button
          type="button"
          onClick={() =>
            setPreset({
              a: { re: 1, im: 0 },
              b: { re: 1, im: 1 }, // z ↦ z + (1 + i)
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
              // Cayley: (z - i) / (z + i)
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
              // same as Cayley for now – true half-plane→disk map
              a: { re: 1, im: 0 },
              b: { re: 0, im: -1 },
              c: { re: 1, im: 0 },
              d: { re: 0, im: 1 },
            })
          }
        >
          Half-plane→disk
        </button>
      </div>
    </section>
  );
};

export default MobiusScreen;
