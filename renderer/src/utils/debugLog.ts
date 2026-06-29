const TRUE_VALUES = new Set(["1", "true", "yes", "on", "debug"]);

const readLocalDebugFlag = () => {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage?.getItem("math3d.debugLogs");
    return raw ? TRUE_VALUES.has(raw.toLowerCase()) : false;
  } catch {
    return false;
  }
};

export const isDebugLoggingEnabled = () => {
  const envFlag = import.meta.env?.VITE_MATH3D_DEBUG_LOGS;
  return TRUE_VALUES.has(String(envFlag ?? "").toLowerCase()) || readLocalDebugFlag();
};

export const debugLog = (...args: unknown[]) => {
  if (!isDebugLoggingEnabled()) return;
  console.log(...args);
};
