import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
const App = () => {
    const [mode, setMode] = useState("mobius");
    // simple controlled state examples – you can extend later
    const [samples, setSamples] = useState(800);
    const [linkHover, setLinkHover] = useState(true);
    return (_jsxs(_Fragment, { children: [_jsxs("header", { children: [_jsx("h1", { children: "M\u00F6bius maps & Chebyshev (React design)" }), _jsxs("div", { className: "tabs", children: [_jsx("button", { className: `tab ${mode === "mobius" ? "active" : ""}`, onClick: () => setMode("mobius"), children: "M\u00F6bius map" }), _jsx("button", { className: `tab ${mode === "chebyshev" ? "active" : ""}`, onClick: () => setMode("chebyshev"), children: "Chebyshev T\u2099" }), _jsx("button", { className: `tab ${mode === "transform" ? "active" : ""}`, onClick: () => setMode("transform"), children: "Transform" })] }), _jsxs("div", { className: "controls", children: [_jsxs("div", { className: "group", children: [_jsx("label", { children: "Mode (debug)" }), _jsxs("select", { value: mode, onChange: (e) => setMode(e.target.value), children: [_jsx("option", { value: "mobius", children: "M\u00F6bius" }), _jsx("option", { value: "chebyshev", children: "Chebyshev" }), _jsx("option", { value: "transform", children: "Transform" })] })] }), _jsxs("div", { className: "group", children: [_jsx("label", { children: "Samples" }), _jsx("input", { type: "number", min: 64, max: 4096, value: samples, onChange: (e) => setSamples(Number(e.target.value) || 64) })] }), _jsxs("div", { className: "group", children: [_jsx("label", { children: "\u00A0" }), _jsxs("label", { style: {
                                            display: "flex",
                                            gap: 6,
                                            alignItems: "center",
                                            fontSize: 12,
                                        }, children: [_jsx("input", { type: "checkbox", checked: linkHover, onChange: (e) => setLinkHover(e.target.checked) }), "Link hover (z \u21A6 w)"] })] }), _jsxs("div", { className: "group wide", children: [_jsx("button", { onClick: () => console.log("Reset presets"), children: "Reset" }), _jsx("div", { className: "hint", children: "Presets (to be wired later): Identity, Flip, Inversion, Rotate, Translate, Cayley, Half-plane\u2192disk\u2026" })] })] })] }), _jsxs("div", { className: "wrap", children: [_jsxs("div", { className: "panel-left", children: [mode === "mobius" && _jsx(MobiusPanel, {}), mode === "chebyshev" && _jsx(ChebyshevPanel, {}), mode === "transform" && _jsx(TransformPanel, {})] }), _jsxs("div", { className: "stack", children: [_jsx("h3", { style: { margin: 0, fontSize: 13 }, children: "Z-plane (domain)" }), _jsx("svg", { viewBox: "0 0 900 320", preserveAspectRatio: "xMidYMid meet" }), _jsx("h3", { style: { margin: 0, fontSize: 13 }, children: "W-plane (image)" }), _jsx("svg", { viewBox: "0 0 900 320", preserveAspectRatio: "xMidYMid meet" })] })] })] }));
};
export default App;
/* ---------- Sub-panels (pure TSX) ---------- */
const MobiusPanel = () => {
    const [aRe, setARe] = useState(1);
    const [aIm, setAIm] = useState(0);
    const [bRe, setBRe] = useState(0);
    const [bIm, setBIm] = useState(0);
    const [cRe, setCRe] = useState(0);
    const [cIm, setCIm] = useState(0);
    const [dRe, setDRe] = useState(1);
    const [dIm, setDIm] = useState(0);
    return (_jsxs("section", { children: [_jsx("h2", { children: "M\u00F6bius parameters" }), _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 6,
                    fontSize: 12,
                }, children: [_jsx("label", { children: "a.re" }), _jsx("input", { type: "number", step: 0.1, value: aRe, onChange: (e) => setARe(Number(e.target.value)) }), _jsx("label", { children: "a.im" }), _jsx("input", { type: "number", step: 0.1, value: aIm, onChange: (e) => setAIm(Number(e.target.value)) }), _jsx("label", { children: "b.re" }), _jsx("input", { type: "number", step: 0.1, value: bRe, onChange: (e) => setBRe(Number(e.target.value)) }), _jsx("label", { children: "b.im" }), _jsx("input", { type: "number", step: 0.1, value: bIm, onChange: (e) => setBIm(Number(e.target.value)) }), _jsx("label", { children: "c.re" }), _jsx("input", { type: "number", step: 0.1, value: cRe, onChange: (e) => setCRe(Number(e.target.value)) }), _jsx("label", { children: "c.im" }), _jsx("input", { type: "number", step: 0.1, value: cIm, onChange: (e) => setCIm(Number(e.target.value)) }), _jsx("label", { children: "d.re" }), _jsx("input", { type: "number", step: 0.1, value: dRe, onChange: (e) => setDRe(Number(e.target.value)) }), _jsx("label", { children: "d.im" }), _jsx("input", { type: "number", step: 0.1, value: dIm, onChange: (e) => setDIm(Number(e.target.value)) })] }), _jsx("h3", { style: { fontSize: 13, marginTop: 10 }, children: "Presets" }), _jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: [_jsx("button", { type: "button", children: "Identity" }), _jsx("button", { type: "button", children: "Flip (\u2212z)" }), _jsx("button", { type: "button", children: "Inversion (1/z)" }), _jsx("button", { type: "button", children: "Rotate 90\u00B0" }), _jsx("button", { type: "button", children: "Translate (1+i)" }), _jsx("button", { type: "button", children: "Cayley" }), _jsx("button", { type: "button", children: "Half-plane\u2192disk" })] })] }));
};
const ChebyshevPanel = () => {
    const [deg, setDeg] = useState(5);
    return (_jsxs("section", { children: [_jsx("h2", { children: "Chebyshev T\u2099 parameters" }), _jsxs("div", { className: "group", children: [_jsx("label", { children: "n (degree)" }), _jsx("input", { type: "number", min: 0, max: 100, value: deg, onChange: (e) => setDeg(Number(e.target.value) || 0) })] }), _jsx("p", { className: "hint", children: "Plot will show T\u2099(x) on [\u22121,1] with zeros and extrema (to be added)." })] }));
};
const TransformPanel = () => {
    const [prim, setPrim] = useState("vline");
    return (_jsxs("section", { children: [_jsx("h2", { children: "Transform viewer" }), _jsx("label", { children: "Primitive" }), _jsxs("select", { value: prim, onChange: (e) => setPrim(e.target.value), children: [_jsx("option", { value: "vline", children: "Vertical line (Re z = x\u2080)" }), _jsx("option", { value: "hline", children: "Horizontal line (Im z = y\u2080)" }), _jsx("option", { value: "circle", children: "Circle" }), _jsx("option", { value: "poly", children: "Polyline" })] }), _jsx("p", { className: "hint", style: { marginTop: 8 }, children: "This is only the React design. Mapping logic (M\u00F6bius + chain) will be added with D3 or SVG later." })] }));
};
