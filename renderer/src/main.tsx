import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { installWebWorkerProxyBridge } from "./services/webWorkerProxyBridge";
import { installMemoryDiagnostics } from "./diagnostics/memoryDiagnostics";

installWebWorkerProxyBridge();
installMemoryDiagnostics();

const App = React.lazy(() => import("./App"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <React.Suspense fallback={<div className="app-loading">Loading workspace…</div>}>
      <App />
    </React.Suspense>
  </React.StrictMode>
);
