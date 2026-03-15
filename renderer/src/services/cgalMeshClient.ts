export type CgalMeshRequest = {
  jobId: string;
  f: string;
  iso: number;
  domain: { min: [number, number, number]; max: [number, number, number] };
  quality: { target_edge: number; radiusBound?: number };
  scalars?: string[];
  verbose?: boolean;
  preflightSamples?: number;
};

export type CgalMeshResponse =
  | { ok: true; positions: number[]; indices: number[]; scalars?: { name: string; values: number[] }[] }
  | { ok: false; error: string };

function makeJobId() {
  const c: any = globalThis.crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}_${Math.random()}`;
}

export async function cgalHealth(): Promise<{ ok: boolean; error?: string }> {
  const api = (window as any).cgalMesh;
  if (!api?.health) return { ok: false, error: "CGAL IPC unavailable" };
  return api.health();
}

export async function cgalPing(): Promise<{ ok: boolean; pong?: boolean; error?: string }> {
  const api = (window as any).cgalMesh;
  if (!api?.ping) return { ok: false, error: "CGAL IPC unavailable" };
  return api.ping();
}

export async function cgalVersion(): Promise<{ ok: boolean; version?: string; protocol?: string; error?: string }> {
  const api = (window as any).cgalMesh;
  if (!api?.version) return { ok: false, error: "CGAL IPC unavailable" };
  return api.version();
}

export async function stopCgalWorker(): Promise<{ ok: boolean; error?: string }> {
  const api = (window as any).cgalMesh;
  if (!api?.stop) return { ok: false, error: "CGAL IPC unavailable" };
  return api.stop();
}

export async function runCgalMesh(req: Omit<CgalMeshRequest, "jobId">): Promise<CgalMeshResponse> {
  const api = (window as any).cgalMesh;
  if (!api?.mesh) return { ok: false, error: "CGAL IPC unavailable" };
  const jobId = makeJobId();
  return api.mesh({ ...req, jobId });
}
