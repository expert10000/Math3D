import type { SageRuntimeProbe } from "../../services/sageOperationExecution";

export type AlgebraRuntimeCapability = Readonly<{
  supported: boolean;
  label: string;
  detail: string;
  next: string | null;
}>;

/** Uses the broker's route-filtered capability list, not the worker's raw operation list. */
export const describeAlgebraRuntime = (probe: SageRuntimeProbe): AlgebraRuntimeCapability => {
  const label = `${probe.backend === "local" ? "Local WSL" : probe.backend === "docker" ? "Docker" : "Private gateway"} SageMath${probe.health.engineVersion ? ` ${probe.health.engineVersion}` : ""}`;
  if (!probe.health.available) return { supported: false, label,
    detail: `${label} is unavailable: ${probe.health.status}`,
    next: probe.backend === "docker" ? "Start the Docker Sage worker and check Compute → Runtimes."
      : probe.backend === "local" ? "Check the Local WSL Sage setup in Compute → Runtimes."
      : "Check the private gateway in Compute → Runtimes." };
  if (probe.operations.some((item) => item.operationType === "algebra.reconstruct")) return {
    supported: true, label, detail: `${label} advertises bounded algebra reconstruction through this app route.`, next: null,
  };
  if (probe.backend === "local") return { supported: false, label,
    detail: `${label} is available, but the Local WSL app route does not advertise bounded algebra reconstruction.`,
    next: "Use the Docker Sage worker for constructor preview; local definition validation remains available." };
  if (probe.backend === "private") return { supported: false, label,
    detail: `${label} is available, but this route accepts only bounded Number Theory operations.`,
    next: "Use the Docker Sage worker for constructor preview." };
  return { supported: false, label,
    detail: `${label} is available, but its worker does not advertise sage.algebra.reconstruct.`,
    next: "Update and restart the Docker Sage worker, then refresh its capabilities." };
};
