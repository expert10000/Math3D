import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installWebWorkerProxyBridge } from "./services/webWorkerProxyBridge";

const ignoredResizeObserverMessages = new Set([
  "ResizeObserver loop completed with undelivered notifications.",
  "ResizeObserver loop limit exceeded",
]);

window.addEventListener(
  "error",
  (event) => {
    if (ignoredResizeObserverMessages.has(event.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);

installWebWorkerProxyBridge();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
