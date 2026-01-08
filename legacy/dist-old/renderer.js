import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
const container = document.getElementById("root");
if (!container) {
    console.error("No #root element");
}
else {
    const root = createRoot(container);
    root.render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
}
