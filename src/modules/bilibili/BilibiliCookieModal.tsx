import { Eye, EyeOff, Globe, X } from "lucide-react";

interface BilibiliCookieModalProps {
  open: boolean;
  canClose: boolean;
  onClose: () => void;
  gettingFromBrowser: boolean;
  onFetchFromBrowser: () => void;
  cookiePreview: string | null;
  cookieInput: string;
  showFullCookie: boolean;
  onToggleFullCookie: () => void;
}

export function BilibiliCookieModal({
  open,
  canClose,
  onClose,
  gettingFromBrowser,
  onFetchFromBrowser,
  cookiePreview,
  cookieInput,
  showFullCookie,
  onToggleFullCookie,
}: BilibiliCookieModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={() => canClose && onClose()}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
        padding: "20px",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          maxHeight: "85vh",
          overflow: "auto",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-light)",
          background: "var(--bg-panel)",
          boxShadow: "var(--shadow-soft)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)" }}>Bilibili Cookie 配置</div>
            <div style={{ marginTop: "4px", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              首次使用或 Cookie 丢失时才会弹出。配置完成后页面内不再显示。
            </div>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "14px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-hover)",
            border: "1px solid var(--border-light)",
          }}
        >
          <div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>一键获取浏览器 Cookie</div>
            <div style={{ marginTop: "4px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              一键连接本机 Chrome 或 Edge，读取完整 B 站 Cookie。
            </div>
          </div>
          <button
            onClick={onFetchFromBrowser}
            disabled={gettingFromBrowser}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: gettingFromBrowser ? "var(--bg-muted)" : "#00AEEC",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: gettingFromBrowser ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Globe size={16} />
            {gettingFromBrowser ? "获取中..." : "一键获取"}
          </button>
        </div>

        {cookiePreview && (
          <div style={{ color: "var(--color-success)", fontSize: "0.8125rem" }}>
            已保存 Cookie，可直接预览动态、抓收藏夹和入库。
          </div>
        )}

        {cookieInput && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              type="button"
              onClick={onToggleFullCookie}
              style={{
                width: "fit-content",
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {showFullCookie ? <EyeOff size={14} /> : <Eye size={14} />}
              {showFullCookie ? "收起完整 Cookie" : "展开完整 Cookie"}
            </button>

            {showFullCookie && (
              <textarea
                readOnly
                value={cookieInput}
                spellCheck={false}
                style={{
                  width: "100%",
                  minHeight: "132px",
                  resize: "vertical",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  lineHeight: 1.55,
                  wordBreak: "break-all",
                }}
              />
            )}
          </div>
        )}

        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
          会优先连接已开启调试端口的浏览器；如未开启，会尝试启动 Chrome 或 Edge。
        </div>
      </div>
    </div>
  );
}
