import { Graph2DPointTableStore } from "@math3d/core";

const portableTables = new Map<string, string>();
export const installPortablePointTables = (tables: readonly { id: string; content: string }[]) => {
  const previous = new Map(portableTables);
  portableTables.clear();
  for (const table of tables) portableTables.set(table.id, table.content);
  pointTableStore.clearCache();
  return () => { portableTables.clear(); for (const [id, content] of previous) portableTables.set(id, content); pointTableStore.clearCache(); };
};

const PREFIX = "math3d.graph2d.table.";

/** Shared by authoring and plotting; tables remain outside scene commands and document JSON. */
export const pointTableStore = new Graph2DPointTableStore({
  read: (id) => portableTables.get(id) ?? (typeof localStorage === "undefined" ? null : localStorage.getItem(PREFIX + id)),
  write: (id, content) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(PREFIX + id, content);
  },
});
