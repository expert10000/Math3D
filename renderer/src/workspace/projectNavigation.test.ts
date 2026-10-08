import { expect, it } from "vitest";
import { ProjectNavigation } from "./projectNavigation";
it("keeps navigation independent of scientific undo and truncates abandoned forward history", () => {
  const history = new ProjectNavigation();
  history.visit({ id: "surface", module: "surface" }); history.visit({ id: "surface", module: "surface" });
  expect(history.canBack).toBe(false);
  history.visit({ id: "mesh", module: "mesh" });
  expect(history.back()?.id).toBe("surface"); expect(history.forward()?.id).toBe("mesh");
  history.back(); history.visit({ id: "graph", module: "graph2d" }); expect(history.canForward).toBe(false);
  expect(history.back()?.id).toBe("surface");
});
