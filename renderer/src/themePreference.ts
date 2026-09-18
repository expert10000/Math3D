export type AppTheme = "light" | "dark" | "dot";
export type ThemePreference = AppTheme | "system";

export const THEME_PREFERENCE_KEY = "math3d.ui.themePreference.v1";
export const LEGACY_THEME_KEY = "math3d.ui.theme.v1";

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark" || value === "dot";

export const readThemePreference = (storage: Pick<Storage, "getItem">): ThemePreference => {
  const saved = storage.getItem(THEME_PREFERENCE_KEY);
  if (isThemePreference(saved)) return saved;

  // The old app persisted its default Light choice on first load. Treat that
  // ambiguous value as System; retain intentional Dark and Dot choices.
  const legacy = storage.getItem(LEGACY_THEME_KEY);
  return legacy === "dark" || legacy === "dot" ? legacy : "system";
};

export const readBrowserThemePreference = (): ThemePreference => {
  try {
    return readThemePreference(window.localStorage);
  } catch {
    return "system";
  }
};

export const resolveTheme = (preference: ThemePreference, prefersDark: boolean): AppTheme =>
  preference === "system" ? (prefersDark ? "dark" : "light") : preference;

export const systemPrefersDark = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
