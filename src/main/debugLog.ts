const TRUE_VALUES = new Set(["1", "true", "yes", "on", "debug"]);

const envFlagEnabled = (name: string) => TRUE_VALUES.has(String(process.env[name] ?? "").toLowerCase());

export const isMainDebugLoggingEnabled = () =>
  envFlagEnabled("MATH3D_DEBUG_LOGS") || envFlagEnabled("MATH3D_WORKER_DEBUG_LOGS");

export const mainDebugLog = (...args: unknown[]) => {
  if (!isMainDebugLoggingEnabled()) return;
  console.log(...args);
};
