export type QuantumTraceIdentity = Readonly<{ runId: string; resultSha256: string; sceneFingerprint: string; model: string }>;
export type QuantumTraceEvent = "opened" | "view" | "sample" | "error" | "first-frame" | "closed";
type Entry = Readonly<{ event: QuantumTraceEvent; elapsedMs: number }>;
const MAX_EVENTS = 64;
const safeId = (value: string) => /^[A-Za-z0-9_.-]{1,160}$/.test(value) ? value : "redacted";
const safeHash = (value: string) => /^[a-f0-9]{64}$/.test(value) ? value : "redacted";

/** Keeps only fixed event names and immutable source IDs. Never records paths, labels, parameters or sample values. */
export class QuantumViewerTrace {
  readonly identity: QuantumTraceIdentity;
  private readonly now: () => number;
  private readonly start: number;
  private readonly events: Entry[] = [];
  private readonly metrics: Record<string, number> = {};
  constructor(identity: QuantumTraceIdentity, now: () => number = () => performance.now()) {
    this.identity = identity;
    this.now = now;
    this.start = now();
  }
  record(event: QuantumTraceEvent): void {
    if (this.events.length === MAX_EVENTS) this.events.shift();
    this.events.push({ event, elapsedMs: Math.max(0, Math.round(this.now() - this.start)) });
  }
  measure(name: "importMs" | "datasetBytes" | "mappedPrimitives" | "firstFrameMs", value: number): void {
    if (Number.isFinite(value) && value >= 0) this.metrics[name] = Math.round(value);
  }
  supportBundle() {
    return { schema: "math3d.quantum-viewer-support/v1", correlation: {
      jobId: null, runId: safeId(this.identity.runId), resultSha256: safeHash(this.identity.resultSha256),
      sceneFingerprint: safeHash(this.identity.sceneFingerprint), model: safeId(this.identity.model),
    }, metrics: { ...this.metrics }, events: [...this.events] };
  }
}
