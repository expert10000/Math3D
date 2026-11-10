export type WorkerRuntimeEvent = "worker-exit" | "startup-rejected" | "restart-blocked" |
  "admission-rejected" | "job-start" | "job-finish";

/** Process loss invalidates the prior startup handshake until a new success is recorded. */
export function workerRuntimeAvailability(event: WorkerRuntimeEvent): {
  available: false; statusMessage: string
} | null {
  if (event === "worker-exit") return { available: false,
    statusMessage: "Python worker exited. A new startup check is required." };
  if (event === "startup-rejected") return { available: false,
    statusMessage: "Python worker startup was rejected." };
  if (event === "restart-blocked") return { available: false,
    statusMessage: "Python worker restart is temporarily blocked." };
  return null;
}
