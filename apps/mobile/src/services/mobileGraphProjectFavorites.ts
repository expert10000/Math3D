import { Directory, File, Paths } from "expo-file-system";
import { parseGraph2DProjectFavorites, type Graph2DProjectFavorites } from "@math3d/core";
const dir = () => new Directory(Paths.document, "math3d-mobile");
const file = () => new File(dir(), "graph-project-favorites.json");
const backup = () => new File(dir(), "graph-project-favorites.backup.json");
export function loadMobileGraphProjectFavorites() { const primary = file(), f = primary.exists ? primary : backup();
  if (f.exists && f.size > 32768) throw new TypeError("Project favorites exceed their size limit.");
  return parseGraph2DProjectFavorites(f.exists ? f.textSync() : null);
}
export function saveMobileGraphProjectFavorites(value: Graph2DProjectFavorites) {
  const raw = JSON.stringify(parseGraph2DProjectFavorites(JSON.stringify(value)));
  dir().create({ intermediates: true, idempotent: true });
  const target = file(), staged = new File(dir(), "graph-project-favorites.tmp");
  staged.create({ intermediates: true, overwrite: true }); staged.write(raw);
  parseGraph2DProjectFavorites(staged.textSync());
  const saved = backup();
  if (target.exists) {
    // Keep the previous bytes until replacement succeeds, including an explicitly reset corrupt file.
    if (saved.exists) saved.delete();
    target.copy(saved);
  }
  try {
    if (target.exists) target.delete();
    staged.move(target);
  } catch (error) {
    if (!target.exists && saved.exists) saved.copy(target);
    throw error;
  } finally { if (staged.exists) staged.delete(); }
}
