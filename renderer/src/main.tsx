import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installWebWorkerProxyBridge } from "./services/webWorkerProxyBridge";
import { readBrowserThemePreference, resolveTheme, systemPrefersDark } from "./themePreference";
import { recoverDurableProjectLibrary } from "./projects/projectLibrary";

if (window.projectDurability) {
  try {
    const recovery = recoverDurableProjectLibrary(localStorage, window.projectDurability.read());
    if (recovery.error) console.error("Durable Project recovery refused:", recovery.error);
  } catch (error) { console.error("Durable Project recovery unavailable:", error); }
}

document.documentElement.dataset.theme = resolveTheme(readBrowserThemePreference(), systemPrefersDark());

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
