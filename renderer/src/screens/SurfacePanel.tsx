// src/screens/SurfacePanel.tsx
import React from "react";
import { uiStyles as styles } from "../uiStyles";
import type { SurfaceId } from "./SurfaceScreen";

type Props = {
  surfaceId: SurfaceId;
  onChange: (id: SurfaceId) => void;
};

const LABELS: { id: SurfaceId; label: string; desc: string }[] = [
  { id: "sphere",      label: "Sphere",      desc: "x² + y² + z² = R²" },
  { id: "cylinder",    label: "Cylinder",    desc: "x² + y² = R²" },
  { id: "cone",        label: "Cone",        desc: "z² = x² + y²" },
  {
    id: "paraboloid",
    label: "Paraboloid",
    desc: "z = a(x² + y²) (elliptic paraboloid)",
  },
  {
    id: "hyperboloid",
    label: "Hyperboloid",
    desc: "x² + y² - z² = 1 (one sheet, truncated)",
  },
];

const SurfacePanel: React.FC<Props> = ({ surfaceId, onChange }) => {
  const meta = LABELS.find((s) => s.id === surfaceId) ?? LABELS[0];

  return (
    <section>
      <h2 style={styles.h2}>Classical surfaces</h2>

      <div style={{ marginBottom: 8 }}>
        {LABELS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            style={{
              padding: "6px 10px",
              marginRight: 6,
              marginBottom: 6,
              borderRadius: 6,
              border:
                "1px solid " + (surfaceId === s.id ? "#0a66c2" : "#ddd"),
              background: surfaceId === s.id ? "#e6f0ff" : "#fff",
              fontWeight: surfaceId === s.id ? 600 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p style={styles.hint}>{meta.desc}</p>
      <p style={styles.hint}>
        Drag with the mouse to rotate, scroll to zoom. This is pure WebGL
        (react-three-fiber) living happily next to our D3 complex-plane views.
      </p>
    </section>
  );
};

export default SurfacePanel;
