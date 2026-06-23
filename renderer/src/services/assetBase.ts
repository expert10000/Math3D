const normalizeBaseUrl = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
};

const getWindowHref = (): string | null =>
  typeof window !== "undefined" && window.location?.href ? window.location.href : null;

const isFileProtocol = (): boolean =>
  typeof window !== "undefined" && window.location?.protocol === "file:";

export const getExternalAssetBaseUrl = (): string | null =>
  normalizeBaseUrl((import.meta as ImportMeta & { env?: { VITE_MATH3D_ASSET_BASE_URL?: string } }).env?.VITE_MATH3D_ASSET_BASE_URL);

export const resolveRuntimeAssetPath = (
  relativePath: string,
  options: {
    baseHref?: string;
    desktopFilePrefix?: string;
  } = {}
): string => {
  const normalized = relativePath.replace(/^\/+/, "");
  const externalBase = getExternalAssetBaseUrl();
  if (externalBase && !isFileProtocol()) {
    try {
      return new URL(normalized, externalBase).toString();
    } catch {
      return `${externalBase}${normalized}`;
    }
  }

  const resolvedPath = isFileProtocol() && options.desktopFilePrefix ? `${options.desktopFilePrefix}${normalized}` : normalized;
  const base =
    options.baseHref ??
    (typeof document !== "undefined" && document.baseURI ? document.baseURI : getWindowHref() ?? "/");
  try {
    return new URL(resolvedPath, base).toString();
  } catch {
    return `./${resolvedPath}`;
  }
};
