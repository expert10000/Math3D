import React from "react";

export type GeometryDerivedStatus = "ready" | "stale" | "available" | "planned" | "failed";
export type GeometryDerivedOperation = "wireframe" | "bounding-box" | "normals" | "point-cloud" | "convex-hull" | "section";

export const GEOMETRY_DERIVED_STATUS_META: Record<
  GeometryDerivedStatus,
  { symbol: string; label: string; border: string; background: string; color: string }
> = {
  ready: { symbol: "✓", label: "ready", border: "#16a34a", background: "#ecfdf5", color: "#166534" },
  stale: { symbol: "!", label: "stale", border: "#ef4444", background: "#fef2f2", color: "#991b1b" },
  available: { symbol: "+", label: "available", border: "#2563eb", background: "#eff6ff", color: "#1d4ed8" },
  planned: { symbol: "", label: "planned", border: "#f59e0b", background: "#fffbeb", color: "#92400e" },
  failed: { symbol: "×", label: "failed", border: "#dc2626", background: "#fef2f2", color: "#991b1b" },
};

export const GEOMETRY_DERIVED_PRODUCT_SPECS: Array<{
  operation: GeometryDerivedOperation;
  label: string;
  defaultStatus: GeometryDerivedStatus;
}> = [
  { operation: "wireframe", label: "Wireframe", defaultStatus: "available" },
  { operation: "bounding-box", label: "Bounding box", defaultStatus: "available" },
  { operation: "normals", label: "Normals", defaultStatus: "available" },
  { operation: "point-cloud", label: "Point cloud", defaultStatus: "available" },
  { operation: "convex-hull", label: "Convex hull", defaultStatus: "available" },
  { operation: "section", label: "Section", defaultStatus: "planned" },
];

export type GeometryDerivedProductRow = {
  operation: GeometryDerivedOperation;
  label: string;
  status: GeometryDerivedStatus;
  sourceName: string;
  sourceVersion: number | null;
  staleReason: string | null;
  entry: {
    id: string;
    generatedAt?: number;
    resultObjectId?: string;
    errorMessage?: string;
  } | null;
};

type GeometryDerivedProductsPanelProps = {
  products: GeometryDerivedProductRow[];
  onPlanConvexHull: () => void;
  onGenerate: (operation: GeometryDerivedOperation) => void;
  onOpenResult: (objectId: string) => void;
  onDelete: (entryId: string) => void;
  onRegenerateStale: () => void;
  onDeleteStale: () => void;
};

export const GeometryDerivedProductsPanel: React.FC<GeometryDerivedProductsPanelProps> = ({
  products,
  onPlanConvexHull,
  onGenerate,
  onOpenResult,
  onDelete,
  onRegenerateStale,
  onDeleteStale,
}) => {
  const staleCount = products.filter((product) => product.status === "stale").length;
  return (
    <div
      data-testid="geometry-derived-products"
      style={{ border: "1px solid #dbe4f0", borderRadius: 8, padding: "8px 10px", background: "#f8fbff", display: "grid", gap: 8 }}
    >
      <div style={{ fontSize: 11, fontWeight: 700 }}>Derived products</div>
      <div style={{ fontSize: 10, color: "#475569" }}>
        Results are versioned against the selected source. Parameter or transform edits mark generated results stale.
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {products.map((product) => {
          const statusMeta = GEOMETRY_DERIVED_STATUS_META[product.status];
          const generated = !!product.entry;
          return (
            <div
              key={`geometry-derived-product-${product.operation}`}
              style={{ border: "1px solid #e2e8f0", borderRadius: 7, background: "#fff", padding: "6px 7px", display: "grid", gap: 5 }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{product.label}</div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    border: `1px solid ${statusMeta.border}`,
                    color: statusMeta.color,
                    background: statusMeta.background,
                    borderRadius: 999,
                    padding: "2px 7px",
                  }}
                >
                  {statusMeta.symbol ? `${statusMeta.symbol} ` : ""}
                  {statusMeta.label}
                </span>
              </div>
              {generated && (
                <div style={{ fontSize: 10, color: "#475569", display: "grid", gap: 2 }}>
                  <div>
                    <strong>Generated from:</strong> {product.sourceName}
                  </div>
                  <div>
                    <strong>Operation:</strong> {product.label.toLowerCase()}
                  </div>
                  <div>
                    <strong>Source version:</strong> history step {product.sourceVersion ?? "n/a"}
                  </div>
                  <div>
                    <strong>Generated at:</strong> {product.entry?.generatedAt ? new Date(product.entry.generatedAt).toLocaleString() : "not generated yet"}
                  </div>
                  <div>
                    <strong>Status:</strong> {statusMeta.label}
                  </div>
                  {product.staleReason && (
                    <div style={{ color: "#991b1b" }}>
                      <strong>Outdated after:</strong> {product.staleReason}
                    </div>
                  )}
                  {product.entry?.errorMessage && (
                    <div style={{ color: "#991b1b" }}>
                      <strong>Error:</strong> {product.entry.errorMessage}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {product.operation === "convex-hull" && !generated && (
                  <button type="button" onClick={onPlanConvexHull} style={{ fontSize: 10 }}>
                    Plan
                  </button>
                )}
                {(product.status === "available" || product.status === "planned") && (
                  <button type="button" onClick={() => onGenerate(product.operation)} style={{ fontSize: 10 }}>
                    {product.operation === "convex-hull" ? "Generate hull mesh" : "Generate"}
                  </button>
                )}
                {(product.status === "ready" || product.status === "stale" || product.status === "failed") && (
                  <button type="button" onClick={() => onGenerate(product.operation)} style={{ fontSize: 10 }}>
                    Regenerate
                  </button>
                )}
                {product.entry?.resultObjectId && product.status !== "planned" && (
                  <button type="button" onClick={() => onOpenResult(product.entry!.resultObjectId!)} style={{ fontSize: 10 }}>
                    Open result
                  </button>
                )}
                {product.entry && (
                  <button type="button" onClick={() => onDelete(product.entry!.id)} style={{ fontSize: 10 }}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={onRegenerateStale} disabled={staleCount === 0} style={{ fontSize: 10 }}>
          Regenerate stale selected{staleCount ? ` (${staleCount})` : ""}
        </button>
        <button type="button" onClick={onDeleteStale} disabled={staleCount === 0} style={{ fontSize: 10 }}>
          Delete stale
        </button>
      </div>
    </div>
  );
};

type GeometryStaleSummaryPanelProps = {
  products: Array<{ id: string; name: string; sourceName: string }>;
  onRegenerateAll: () => void;
  onDeleteAll: () => void;
};

export const GeometryStaleSummaryPanel: React.FC<GeometryStaleSummaryPanelProps> = ({ products, onRegenerateAll, onDeleteAll }) => (
  <div
    data-testid="geometry-stale-summary"
    style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid #f1c27d", background: products.length ? "#fffbeb" : "#f8fafc", display: "grid", gap: 6 }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 700 }}>Derived dependency status</div>
      <span style={{ fontSize: 10, fontWeight: 800, color: products.length ? "#92400e" : "#166534" }}>
        {products.length ? `! ${products.length} stale` : "✓ up to date"}
      </span>
    </div>
    {products.length ? (
      <>
        <div style={{ fontSize: 10, color: "#475569" }}>
          {products.map((product) => `${product.name} from ${product.sourceName}`).join(" · ")}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={onRegenerateAll} style={{ fontSize: 10 }}>
            Regenerate all stale
          </button>
          <button type="button" onClick={onDeleteAll} style={{ fontSize: 10 }}>
            Delete stale
          </button>
        </div>
      </>
    ) : (
      <div style={{ fontSize: 10, color: "#475569" }}>No stale generated products in the scene.</div>
    )}
  </div>
);
