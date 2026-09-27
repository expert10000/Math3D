import { Graph2DPointTableStore } from "@math3d/core";

const PREFIX = "math3d.graph2d.table.";

/** Shared by authoring and plotting; tables remain outside scene commands and document JSON. */
export const pointTableStore = new Graph2DPointTableStore({
  read: (id) => typeof localStorage === "undefined" ? null : localStorage.getItem(PREFIX + id),
  write: (id, content) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(PREFIX + id, content);
  },
});
