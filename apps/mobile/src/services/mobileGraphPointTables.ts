import { Directory, File, Paths } from "expo-file-system";
import { canonicalJsonStringify, Graph2DPointTableStore, GRAPH2D_POINT_TABLE_MAX_BYTES, type Graph2DPreset } from "@math3d/core";

const directory = new Directory(Paths.document, "math3d-graph-tables");
const file = (id: string) => {
  if (!/^graph2d-table:[0-9a-f]{32}$/.test(id)) throw new TypeError("Invalid point table ID.");
  return new File(directory, `${id.slice(14)}.json`);
};
export const mobileGraphPointTables = new Graph2DPointTableStore({
  read: (id) => { const target = file(id); return target.exists && target.size <= GRAPH2D_POINT_TABLE_MAX_BYTES ? target.textSync() : null; },
  write: (id, content) => { directory.create({ intermediates: true, idempotent: true }); const target = file(id);
    // Immutable content-addressed files; an interrupted write is detected by the shared checksum reader.
    target.create({ intermediates: true, overwrite: true }); target.write(content, { encoding: "utf8" }); },
}, 4 * 1024 * 1024);
export const stageMobileGraphPresetSidecars = (sidecars: Graph2DPreset["sidecars"]) => {
  const created: File[] = [], pending: File[] = [];
  const rollback = () => {
    for (const target of [...pending, ...created]) if (target.exists) target.delete();
    mobileGraphPointTables.clearCache();
  };
  try {
    for (const sidecar of sidecars) {
      const reference = new Graph2DPointTableStore().publish(sidecar.rows);
      if (reference.id !== sidecar.id) throw new TypeError("Catalog point table identity mismatch.");
      const target = file(sidecar.id);
      if (target.exists) {
        if (new Graph2DPointTableStore(mobileGraphPointTables.backing).resolve(reference) === null)
          throw new TypeError("An existing point table is corrupt. Repair that sidecar before opening this data example.");
        continue;
      }
      directory.create({ intermediates: true, idempotent: true });
      const staged = new File(directory, `${sidecar.id.slice(14)}.gallery.tmp`); pending.push(staged);
      staged.create({ intermediates: true, overwrite: true }); staged.write(canonicalJsonStringify(sidecar.rows), { encoding: "utf8" });
      const verified = new Graph2DPointTableStore({ read: () => staged.textSync(), write: () => {} }).resolve(reference);
      if (verified === null) throw new TypeError("Staged catalog point table failed validation.");
      staged.move(target); pending.pop(); created.push(target);
    }
    mobileGraphPointTables.clearCache(); return rollback;
  } catch (error) { rollback(); throw error; }
};
export const pickMobileGraphPointText = async (): Promise<string | null> => {
  try {
  const result = await File.pickFileAsync();
  const target = Array.isArray(result) ? result[0] : result;
  if (!target) return null;
  if (target.size > GRAPH2D_POINT_TABLE_MAX_BYTES) throw new TypeError("Point import exceeds 1 MiB.");
  return target.text();
  } catch (error) {
    if (String((error as Error).message).toLowerCase().includes("picker was cancelled")) return null;
    throw error;
  }
};
