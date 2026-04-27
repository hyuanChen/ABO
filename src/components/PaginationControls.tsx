interface PaginationControlsProps {
  totalCount: number;
  page: number;
  pageSize: number;
  itemLabel?: string;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  emptyText?: string;
}

export function PaginationControls({
  totalCount,
  page,
  pageSize,
  itemLabel = "项",
  pageSizeOptions = [20, 50],
  onPageChange,
  onPageSizeChange,
  emptyText = "当前没有匹配项",
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = totalCount === 0 ? 0 : ((safePage - 1) * pageSize) + 1;
  const pageEnd = Math.min(safePage * pageSize, totalCount);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
        {totalCount > 0
          ? `第 ${safePage} / ${totalPages} 页，当前显示 ${pageStart}-${pageEnd} ${itemLabel}`
          : emptyText}
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        {onPageSizeChange && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            每页显示
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              style={{
                padding: "7px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.75rem",
              }}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} 个
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          style={{
            padding: "7px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-card)",
            color: safePage <= 1 ? "var(--text-muted)" : "var(--text-secondary)",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: safePage <= 1 ? "not-allowed" : "pointer",
          }}
        >
          上一页
        </button>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          style={{
            padding: "7px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-light)",
            background: "var(--bg-card)",
            color: safePage >= totalPages ? "var(--text-muted)" : "var(--text-secondary)",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: safePage >= totalPages ? "not-allowed" : "pointer",
          }}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
