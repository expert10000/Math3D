import React from "react";
import type { FaceInfo } from "../geometry/polyhedra";
import type { FaceIncenter, IncenterPlaneCheck } from "../geometry/demoScene";
import { formatConstraintValue } from "../geometry/analysis";

const BADGE_COLORS = {
  ok: "#2e7d32",
  fail: "#c62828",
  invalid: "#6b7280",
};

const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "-");
const fmt3 = (v: { x: number; y: number; z: number }) => `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;

export type StereometryAnalyzerPanelProps = {
  faces: FaceInfo[];
  faceIncenters: FaceIncenter[];
  planeCheck: IncenterPlaneCheck | null;
  incenterTolerance: number;
  selectedFaceId: string | null;
  onSelectFace: (id: string) => void;
};

export const StereometryAnalyzerPanel: React.FC<StereometryAnalyzerPanelProps> = ({
  faces,
  faceIncenters,
  planeCheck,
  incenterTolerance,
  selectedFaceId,
  onSelectFace,
}) => {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Stereometry Analyzer</div>

      <div style={{ display: "grid", gap: 6 }}>
        {faceIncenters.map((face) => {
          const selected = face.faceId === selectedFaceId;
          const status =
            face.incenter == null
              ? "invalid"
              : face.residual != null && face.residual <= incenterTolerance
              ? "ok"
              : "fail";
          const color = BADGE_COLORS[status];
          const incenter = face.incenter;
          return (
            <button
              key={face.faceId}
              type="button"
              onClick={() => onSelectFace(face.faceId)}
              style={{
                borderRadius: 8,
                border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: selected ? "var(--accent-soft)" : "transparent",
                padding: "6px 8px",
                textAlign: "left",
                display: "grid",
                gap: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: `${color}22`,
                    color,
                    fontWeight: 700,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.3px",
                  }}
                >
                  {status}
                </span>
                <div style={{ fontWeight: 700 }}>{face.label}</div>
              </div>
              <div style={{ fontFamily: "monospace", opacity: 0.7, fontSize: 11 }}>
                Incenter {incenter ? fmt3(incenter) : "-"} * r {formatConstraintValue(face.radius)}
              </div>
              <div style={{ fontFamily: "monospace", opacity: 0.7, fontSize: 11 }}>
                delta {face.residual == null ? "-" : formatConstraintValue(face.residual)} {"<="}{" "}
                {formatConstraintValue(incenterTolerance)}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Plane Through Incenters</div>
        {planeCheck && planeCheck.plane ? (
          <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: `${BADGE_COLORS[planeCheck.status]}22`,
                  color: BADGE_COLORS[planeCheck.status],
                  fontWeight: 700,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                }}
              >
                {planeCheck.status}
              </span>
              <div>Check incenter of {planeCheck.targetFaceId.toUpperCase()}</div>
            </div>
            <div style={{ fontFamily: "monospace", opacity: 0.7, fontSize: 11 }}>
              n {fmt3(planeCheck.plane.normal)} * x + {fmt(
                -(planeCheck.plane.normal.x * planeCheck.plane.point.x +
                  planeCheck.plane.normal.y * planeCheck.plane.point.y +
                  planeCheck.plane.normal.z * planeCheck.plane.point.z)
              )}{" "}
              = 0
            </div>
            <div style={{ fontFamily: "monospace", opacity: 0.7, fontSize: 11 }}>
              |distance| {formatConstraintValue(planeCheck.distance)} {"<="}{" "}
              {formatConstraintValue(planeCheck.tolerance)}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>Plane check unavailable.</div>
        )}
      </div>

      {faces?.length ? (
        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
          Faces: {faces.map((f) => f.label || f.id).join(", ")}
        </div>
      ) : null}
    </div>
  );
};
