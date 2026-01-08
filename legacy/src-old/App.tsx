import React, { useState } from "react";

type Mode = "mobius" | "chebyshev" | "transform";

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>("mobius");

  // simple controlled state examples – you can extend later
  const [samples, setSamples] = useState(800);
  const [linkHover, setLinkHover] = useState(true);

  return (
    <>
      <header>
        <h1>Möbius maps &amp; Chebyshev (React design)</h1>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${mode === "mobius" ? "active" : ""}`}
            onClick={() => setMode("mobius")}
          >
            Möbius map
          </button>
          <button
            className={`tab ${mode === "chebyshev" ? "active" : ""}`}
            onClick={() => setMode("chebyshev")}
          >
            Chebyshev Tₙ
          </button>
          <button
            className={`tab ${mode === "transform" ? "active" : ""}`}
            onClick={() => setMode("transform")}
          >
            Transform
          </button>
        </div>

        {/* Top controls */}
        <div className="controls">
          <div className="group">
            <label>Mode (debug)</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="mobius">Möbius</option>
              <option value="chebyshev">Chebyshev</option>
              <option value="transform">Transform</option>
            </select>
          </div>

          <div className="group">
            <label>Samples</label>
            <input
              type="number"
              min={64}
              max={4096}
              value={samples}
              onChange={(e) => setSamples(Number(e.target.value) || 64)}
            />
          </div>

          <div className="group">
            <label>&nbsp;</label>
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 12,
              }}
            >
              <input
                type="checkbox"
                checked={linkHover}
                onChange={(e) => setLinkHover(e.target.checked)}
              />
              Link hover (z ↦ w)
            </label>
          </div>

          <div className="group wide">
            <button onClick={() => console.log("Reset presets")}>Reset</button>
            <div className="hint">
              Presets (to be wired later): Identity, Flip, Inversion, Rotate,
              Translate, Cayley, Half-plane→disk…
            </div>
          </div>
        </div>
      </header>

      <div className="wrap">
        {/* LEFT: parameters panel */}
        <div className="panel-left">
          {mode === "mobius" && <MobiusPanel />}
          {mode === "chebyshev" && <ChebyshevPanel />}
          {mode === "transform" && <TransformPanel />}
        </div>

        {/* RIGHT: plots */}
        <div className="stack">
          <h3 style={{ margin: 0, fontSize: 13 }}>Z-plane (domain)</h3>
          <svg viewBox="0 0 900 320" preserveAspectRatio="xMidYMid meet">
            {/* later: D3 / React drawing */}
          </svg>
          <h3 style={{ margin: 0, fontSize: 13 }}>W-plane (image)</h3>
          <svg viewBox="0 0 900 320" preserveAspectRatio="xMidYMid meet">
            {/* later: D3 / React drawing */}
          </svg>
        </div>
      </div>
    </>
  );
};

export default App;

/* ---------- Sub-panels (pure TSX) ---------- */

const MobiusPanel: React.FC = () => {
  const [aRe, setARe] = useState(1);
  const [aIm, setAIm] = useState(0);
  const [bRe, setBRe] = useState(0);
  const [bIm, setBIm] = useState(0);
  const [cRe, setCRe] = useState(0);
  const [cIm, setCIm] = useState(0);
  const [dRe, setDRe] = useState(1);
  const [dIm, setDIm] = useState(0);

  return (
    <section>
      <h2>Möbius parameters</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          fontSize: 12,
        }}
      >
        <label>a.re</label>
        <input
          type="number"
          step={0.1}
          value={aRe}
          onChange={(e) => setARe(Number(e.target.value))}
        />
        <label>a.im</label>
        <input
          type="number"
          step={0.1}
          value={aIm}
          onChange={(e) => setAIm(Number(e.target.value))}
        />
        <label>b.re</label>
        <input
          type="number"
          step={0.1}
          value={bRe}
          onChange={(e) => setBRe(Number(e.target.value))}
        />
        <label>b.im</label>
        <input
          type="number"
          step={0.1}
          value={bIm}
          onChange={(e) => setBIm(Number(e.target.value))}
        />
        <label>c.re</label>
        <input
          type="number"
          step={0.1}
          value={cRe}
          onChange={(e) => setCRe(Number(e.target.value))}
        />
        <label>c.im</label>
        <input
          type="number"
          step={0.1}
          value={cIm}
          onChange={(e) => setCIm(Number(e.target.value))}
        />
        <label>d.re</label>
        <input
          type="number"
          step={0.1}
          value={dRe}
          onChange={(e) => setDRe(Number(e.target.value))}
        />
        <label>d.im</label>
        <input
          type="number"
          step={0.1}
          value={dIm}
          onChange={(e) => setDIm(Number(e.target.value))}
        />
      </div>

      <h3 style={{ fontSize: 13, marginTop: 10 }}>Presets</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button">Identity</button>
        <button type="button">Flip (−z)</button>
        <button type="button">Inversion (1/z)</button>
        <button type="button">Rotate 90°</button>
        <button type="button">Translate (1+i)</button>
        <button type="button">Cayley</button>
        <button type="button">Half-plane→disk</button>
      </div>
    </section>
  );
};

const ChebyshevPanel: React.FC = () => {
  const [deg, setDeg] = useState(5);

  return (
    <section>
      <h2>Chebyshev Tₙ parameters</h2>
      <div className="group">
        <label>n (degree)</label>
        <input
          type="number"
          min={0}
          max={100}
          value={deg}
          onChange={(e) => setDeg(Number(e.target.value) || 0)}
        />
      </div>
      <p className="hint">
        Plot will show Tₙ(x) on [−1,1] with zeros and extrema (to be added).
      </p>
    </section>
  );
};

const TransformPanel: React.FC = () => {
  const [prim, setPrim] = useState<"vline" | "hline" | "circle" | "poly">(
    "vline"
  );

  return (
    <section>
      <h2>Transform viewer</h2>

      <label>Primitive</label>
      <select
        value={prim}
        onChange={(e) => setPrim(e.target.value as any)}
      >
        <option value="vline">Vertical line (Re z = x₀)</option>
        <option value="hline">Horizontal line (Im z = y₀)</option>
        <option value="circle">Circle</option>
        <option value="poly">Polyline</option>
      </select>

      {/* More inputs later – x0, y0, cx, cy, radius, chain params, etc. */}
      <p className="hint" style={{ marginTop: 8 }}>
        This is only the React design. Mapping logic (Möbius + chain) will be
        added with D3 or SVG later.
      </p>
    </section>
  );
};
