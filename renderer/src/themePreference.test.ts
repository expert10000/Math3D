import { describe, expect, it } from "vitest";
import {
  LEGACY_THEME_KEY,
  THEME_PREFERENCE_KEY,
  readThemePreference,
  resolveTheme,
} from "./themePreference";

const storage = (values: Record<string, string> = {}) => ({
  getItem: (key: string) => values[key] ?? null,
});

describe("theme preference", () => {
  it("uses the system theme for new visitors and legacy default Light", () => {
    expect(readThemePreference(storage())).toBe("system");
    expect(readThemePreference(storage({ [LEGACY_THEME_KEY]: "light" }))).toBe("system");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("preserves existing Dark and Dot selections", () => {
    expect(readThemePreference(storage({ [LEGACY_THEME_KEY]: "dark" }))).toBe("dark");
    expect(readThemePreference(storage({ [LEGACY_THEME_KEY]: "dot" }))).toBe("dot");
  });

  it("keeps explicit choices independent of system appearance", () => {
    const preference = readThemePreference(storage({
      [LEGACY_THEME_KEY]: "dark",
      [THEME_PREFERENCE_KEY]: "light",
    }));
    expect(preference).toBe("light");
    expect(resolveTheme(preference, true)).toBe("light");
  });
});
