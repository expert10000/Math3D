import React from "react";

type NoWebGLPanelProps = {
  title: string;
};

export const NoWebGLPanel: React.FC<NoWebGLPanelProps> = ({ title }) => {
  const enableForSession = () => {
    try {
      window.localStorage.setItem("math3d.noWebGL", "0");
    } catch {
      // Ignore storage failures; URL override is enough for this session.
    }
    const url = new URL(window.location.href);
    url.searchParams.set("noWebGL", "0");
    url.searchParams.set("vmSafeGraphics", "0");
    window.location.href = url.toString();
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        color: "#334155",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
          3D rendering is off for this VM-safe session because the graphics driver reports only a tiny
          software-backed video memory path. Workers and non-3D panels can still run.
        </div>
        <button
          type="button"
          onClick={enableForSession}
          style={{
            border: "1px solid #94a3b8",
            background: "#ffffff",
            color: "#0f172a",
            borderRadius: 6,
            padding: "7px 11px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Try 3D once
        </button>
      </div>
    </div>
  );
};
