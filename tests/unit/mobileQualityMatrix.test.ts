import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Matrix = {
  layouts: Array<{ id: string; width: number; height: number; fontScale: number; appearance: string; orientation: string }>;
  lifecycle: Array<{ id: string; runner: string }>;
};

const matrix = JSON.parse(readFileSync(resolve("tests/mobile/mobile-quality-matrix.json"), "utf8")) as Matrix;

describe("mobile quality matrix", () => {
  it("covers compact and current portrait phones plus phone landscape", () => {
    expect(matrix.layouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 320, height: 640, orientation: "portrait" }),
      expect.objectContaining({ width: 360, height: 800, orientation: "portrait" }),
      expect.objectContaining({ width: 412, height: 915, orientation: "portrait" }),
      expect.objectContaining({ width: 800, height: 360, orientation: "landscape" }),
    ]));
    expect(Math.max(...matrix.layouts.map((profile) => profile.fontScale))).toBeGreaterThanOrEqual(1.5);
    expect(new Set(matrix.layouts.map((profile) => profile.appearance))).toEqual(new Set(["light", "dark"]));
  });

  it("assigns every required lifecycle failure to an executable runner", () => {
    const ids = new Set(matrix.lifecycle.map((scenario) => scenario.id));
    expect(ids).toEqual(new Set([
      "background-foreground", "network-loss", "gl-context-recreation", "process-kill-restore",
      "corrupt-scene", "storage-full", "cache-full",
    ]));
    expect(matrix.lifecycle.every((scenario) => scenario.runner.length > 0)).toBe(true);
  });
});
