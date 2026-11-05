import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { quantumTopologyOverlayGroups, topologyOverlayObjectVisible } from "./quantumTopologyOverlay";

const fixture = (name: string) => JSON.parse(readFileSync(resolve("tests/fixtures/quantum-scene", name, "scene.json"), "utf8"));

describe("source-linked topology overlays", () => {
  it("uses only supplied BZ and path objects and hides selected source geometry", () => {
    const groups = quantumTopologyOverlayGroups(fixture("run-97a132d1d712414bb62bb8c9212f517e.qscene"));
    expect(groups.find(group => group.id === "zone")?.objectIds.length).toBeGreaterThan(0);
    expect(groups.find(group => group.id === "path")?.objectIds.length).toBeGreaterThan(0);
    const hidden = new Set(groups.find(group => group.id === "zone")!.objectIds);
    expect(topologyOverlayObjectVisible(`${[...hidden][0]}:link:0`, hidden)).toBe(false);
    expect(topologyOverlayObjectVisible("band-0:site:0", hidden)).toBe(true);
  });
  it("labels an enclosing Weyl sphere and crossing marker without inferring charge", () => {
    const groups = quantumTopologyOverlayGroups(fixture("run-f8bf5412469c49b7bb878b8001d341cf-weyl.qscene"));
    expect(groups.find(group => group.id === "integration")?.objectIds).toContain("weyl-sphere");
    expect(groups.find(group => group.id === "marker")?.objectIds).toContain("weyl-node");
  });
});
