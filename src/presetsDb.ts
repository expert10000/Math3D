import Database from "better-sqlite3";
import * as path from "node:path";
import { app } from "electron";

export type PresetKind = "graph" | "implicit" | "param";

export type SurfacePresetRecord = {
  id: string;
  kind: PresetKind;
  label: string;
  expr?: string;
  xExpr?: string;
  yExpr?: string;
  zExpr?: string;
  createdAt: number;
  updatedAt: number;
};

let db: Database.Database | null = null;

function getDb() {




  if (db) return db;

  const dbPath = path.join(app.getPath("userData"), "surface_presets.db");
  console.log("[presetsDb] DB PATH =", dbPath);
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS surface_presets (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      expr TEXT,
      x_expr TEXT,
      y_expr TEXT,
      z_expr TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_surface_presets_kind ON surface_presets(kind);
  `);

  return db;
}

export function listPresets(kind: PresetKind): SurfacePresetRecord[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT id, kind, label, expr, x_expr, y_expr, z_expr, created_at, updated_at
       FROM surface_presets
       WHERE kind = ?
       ORDER BY updated_at DESC`
    )
    .all(kind);

  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    expr: r.expr ?? undefined,
    xExpr: r.x_expr ?? undefined,
    yExpr: r.y_expr ?? undefined,
    zExpr: r.z_expr ?? undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }));
}

export function upsertPreset(p: SurfacePresetRecord) {
  const d = getDb();
  d.prepare(
    `INSERT INTO surface_presets
      (id, kind, label, expr, x_expr, y_expr, z_expr, created_at, updated_at)
     VALUES
      (@id, @kind, @label, @expr, @x_expr, @y_expr, @z_expr, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       kind=excluded.kind,
       label=excluded.label,
       expr=excluded.expr,
       x_expr=excluded.x_expr,
       y_expr=excluded.y_expr,
       z_expr=excluded.z_expr,
       updated_at=excluded.updated_at`
  ).run({
    id: p.id,
    kind: p.kind,
    label: p.label,
    expr: p.expr ?? null,
    x_expr: p.xExpr ?? null,
    y_expr: p.yExpr ?? null,
    z_expr: p.zExpr ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  });
}

export function removePreset(id: string) {
  const d = getDb();
  d.prepare(`DELETE FROM surface_presets WHERE id = ?`).run(id);
}
