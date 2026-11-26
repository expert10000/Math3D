import { afterEach, describe, expect, it, vi } from "vitest";
import { getPythonWorkerDiagnostics } from "./pythonWorkerDiagnosticsClient";
import { installWebWorkerProxyBridge } from "./webWorkerProxyBridge";

describe("hosted worker Access recovery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("turns an interactive login redirect into a distinct sign-in state", async () => {
    vi.stubGlobal("window", { location: { hostname: "compute-preview.math3dlab.com" } });
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://blue-base-7519.cloudflareaccess.com/cdn-cgi/access/login" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    installWebWorkerProxyBridge();

    const status = await getPythonWorkerDiagnostics();
    expect(status.available).toBe(false);
    expect(status.lastError?.category).toBe("access-required");
    expect(status.lastError?.code).toBe("WORKER_ACCESS_SIGN_IN_REQUIRED");
    expect(status.lastError?.message).toBe("Compute access sign-in required.");
    expect(fetchMock).toHaveBeenCalledWith("/api/worker/diagnostics", expect.objectContaining({ redirect: "manual" }));
  });

  it("recognizes the opaque redirect returned by a browser cross-origin login", async () => {
    vi.stubGlobal("window", { location: { hostname: "compute-preview.math3dlab.com" } });
    const redirected = Object.defineProperty(new Response(null), "type", { value: "opaqueredirect" });
    vi.stubGlobal("fetch", vi.fn(async () => redirected));
    installWebWorkerProxyBridge();

    const status = await getPythonWorkerDiagnostics();
    expect(status.lastError?.category).toBe("access-required");
  });

  it("keeps a configured backend failure separate from Access expiry", async () => {
    vi.stubGlobal("window", { location: { hostname: "app.math3dlab.com" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Hosted compute service is not configured." }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })));
    installWebWorkerProxyBridge();

    const status = await getPythonWorkerDiagnostics();
    expect(status.lastError?.category).toBe("unknown");
    expect(status.lastError?.message).toBe("Hosted compute service is not configured.");
  });
});
