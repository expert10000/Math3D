// src/screens/ChebyshevScreen.tsx
import React from "react";
import { uiStyles as styles } from "../uiStyles";

export type ChebyshevScreenProps = {
  n: number;
  onChangeN: (n: number) => void;
};

export const ChebyshevScreen: React.FC<ChebyshevScreenProps> = ({
  n,
  onChangeN,
}) => {
  const update = (value: number) => {
    if (Number.isNaN(value)) return;
    const clamped = Math.max(0, Math.min(30, value));
    onChangeN(clamped);
  };

  return (
    <section>
      <h2 style={styles.h2}>Chebyshev polynomial Tₙ</h2>

      <div style={styles.group}>
        <label>Degree n</label>
        <input
          type="number"
          min={0}
          max={30}
          value={n}
          onChange={(e) => update(Number(e.target.value))}
        />
      </div>

      <div style={styles.group}>
        <label>Degree (slider)</label>
        <input
          type="range"
          min={0}
          max={30}
          value={n}
          onChange={(e) => update(Number(e.target.value))}
        />
      </div>

      <p style={styles.hint}>
        The W-plane shows the graph of Tₙ(x) on a symmetric interval around 0.
      </p>
    </section>
  );
};
