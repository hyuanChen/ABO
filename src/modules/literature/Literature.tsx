import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen, Search, Plus, X, Upload, Link2, ChevronUp,
  FileText, ExternalLink, FolderOpen,
} from "lucide-react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { useStore } from "../../core/store";
import { open } from "@tauri-apps/plugin-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Paper {
  paper_id: string;
  title: string;
  authors: string;
  year: number | null;
  doi: string | null;
  digest_level: number;
  created_at: string;
  snippet?: string;
}

interface PaperNote {
  paper_id: string;
  title: string;
  authors: string;
  year: number | null;
  doi: string | null;
  digest_level: number;
  content: string;
}

// ── Digest level config ───────────────────────────────────────────────────────

const DIGEST_LEVELS = [
  { level: 0, label: "收录", color: "#94A3B8", bg: "rgba(148, 163, 184, 0.15)" },
  { level: 1, label: "扫读", color: "#3B82F6", bg: "rgba(59, 130, 246, 0.15)" },
  { level: 2, label: "精读", color: "#6366F1", bg: "rgba(99, 102, 241, 0.15)" },
  { level: 3, label: "内化", color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.15)" },
  { level: 4, label: "融会", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.15)" },
];

function DigestBadge({ level }: { level: number }) {
  const cfg = DIGEST_LEVELS[level] ?? DIGEST_LEVELS[0];
  return (
    <span style={{
      fontSize: "11px",
      padding: "3px 10px",
      borderRadius: "9999px",
      fontWeight: 600,
      background: cfg.bg,
      color: cfg.color,
    }}>
      Lv.{level} {cfg.label}
    </span>
  );
}

// ── Import modal ──────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [mode, setMode] = useState<"doi" | "pdf">("doi");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");

  async function handleBrowse() {
    setPicking(true);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (selected) {
        setValue(selected as string);
      }
    } catch (err) {
      console.error("Failed to pick file:", err);
    } finally {
      setPicking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true); setError("");
    try {
      if (mode === "doi") {
        await api.post("/api/literature/import/doi", { doi: value.trim() });
      } else {
        await api.post("/api/literature/import/pdf", { pdf_path: value.trim() });
      }
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally { setLoading(false); }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)"
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: "20px",
          border: "1px solid var(--border-light)",
          boxShadow: "var(--shadow-medium)",
          width: "100%", maxWidth: "420px", margin: "16px",
          padding: "24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-main)" }}>导入文献</h3>
          <button onClick={onClose} aria-label="关闭" style={{ padding: "6px", borderRadius: "8px", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}>
            <X style={{ width: "20px", height: "20px" }} />
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", padding: "4px", background: "var(--bg-hover)", borderRadius: "12px" }}>
          {(["doi", "pdf"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setValue(""); setError(""); }}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                padding: "10px 16px",
                borderRadius: "10px",
                fontSize: "14px", fontWeight: 600,
                background: mode === m ? "var(--bg-card)" : "transparent",
                color: mode === m ? "var(--text-main)" : "var(--text-muted)",
                border: mode === m ? "1px solid var(--border-light)" : "1px solid transparent",
                boxShadow: mode === m ? "var(--shadow-soft)" : "none",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {m === "doi" ? <Link2 style={{ width: "16px", height: "16px" }} /> : <Upload style={{ width: "16px", height: "16px" }} />}
              {m === "doi" ? "DOI" : "PDF 文件"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {mode === "pdf" ? (
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="选择 PDF 文件..."
                readOnly
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-hover)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={picking}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  fontSize: "14px", fontWeight: 500,
                  cursor: picking ? "not-allowed" : "pointer",
                  opacity: picking ? 0.6 : 1,
                  transition: "all 0.2s ease",
                }}
              >
                {picking
                  ? <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
                  : <FolderOpen style={{ width: "16px", height: "16px" }} />
                }
                浏览
              </button>
            </div>
          ) : (
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="10.48550/arXiv.1706.03762"
              style={{
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid var(--border-light)",
                background: "var(--bg-hover)",
                color: "var(--text-main)",
                fontSize: "14px",
                outline: "none",
              }}
            />
          )}
          {error && <p style={{ fontSize: "13px", color: "#EF4444", margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading || !value.trim()}
            style={{
              padding: "14px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
              color: "white",
              fontSize: "15px", fontWeight: 600,
              border: "none",
              cursor: loading || !value.trim() ? "not-allowed" : "pointer",
              opacity: loading || !value.trim() ? 0.6 : 1,
              transition: "all 0.2s ease",
              marginTop: "4px",
            }}
          >
            {loading ? "导入中…" : "导入文献 +5 XP"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Paper detail panel ────────────────────────────────────────────────────────

function PaperDetail({
  paperId,
  onClose,
  onDigestUp,
}: {
  paperId: string;
  onClose: () => void;
  onDigestUp: (id: string, lv: number) => void;
}) {
  const [note, setNote] = useState<PaperNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const config = useStore((s) => s.config);
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    setNote(null);
    api
      .get<PaperNote>(`/api/literature/${paperId}/note`)
      .then(setNote)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [paperId]);

  async function handleUpgrade() {
    if (!note || note.digest_level >= 4) return;
    setUpgrading(true);
    try {
      const r = await api.post<{ xp_awarded?: number }>(
        `/api/literature/${paperId}/digest`,
        { level: note.digest_level + 1 }
      );
      onDigestUp(paperId, note.digest_level + 1);
      setNote((n) => (n ? { ...n, digest_level: n.digest_level + 1 } : n));
      if (r.xp_awarded && r.xp_awarded > 0) {
        toast.success("Digest 升级", `批判性阅读 +${r.xp_awarded} XP`);
      }
    } catch {
      /* ignore */
    } finally {
      setUpgrading(false);
    }
  }

  async function openInObsidian() {
    if (!config?.vault_path) return;
    const vaultName = config.vault_path.split("/").pop() ?? "";
    const filePath = `Literature/${paperId}.md`;
    const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(uri);
    } catch {
      window.open(uri, "_blank");
    }
  }

  return (
    <div style={{ width: "384px", flexShrink: 0, borderLeft: "1px solid var(--border-light)", display: "flex", flexDirection: "column", background: "var(--bg-card)" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderBottom: "1px solid var(--border-light)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {note && (
            <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {note.title}
            </p>
          )}
        </div>
        {note && note.digest_level < 4 && (
          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "12px", fontWeight: 500,
              background: "rgba(99, 102, 241, 0.1)",
              color: "var(--color-primary)",
              border: "none",
              cursor: upgrading ? "not-allowed" : "pointer",
              opacity: upgrading ? 0.5 : 1,
            }}
          >
            {upgrading ? "…" : "升级 Digest"}
          </button>
        )}
        {config?.vault_path && (
          <button
            onClick={openInObsidian}
            aria-label="在 Obsidian 中打开"
            style={{ flexShrink: 0, padding: "6px", borderRadius: "8px", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
          >
            <ExternalLink style={{ width: "16px", height: "16px" }} />
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="关闭详情"
          style={{ flexShrink: 0, padding: "6px", borderRadius: "8px", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
        >
          <X style={{ width: "16px", height: "16px" }} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "128px" }}>
            <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid var(--color-primary)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
          </div>
        )}
        {!loading && !note && (
          <div style={{ padding: "16px", fontSize: "14px", color: "var(--text-muted)" }}>未找到笔记</div>
        )}
        {note && (
          <div style={{ padding: "16px" }}>
            {/* Meta */}
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-main)", lineHeight: 1.4, marginBottom: "4px" }}>
              {note.title}
            </h2>
            <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {note.authors || "Unknown"}
              {note.year ? ` · ${note.year}` : ""}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
              <DigestBadge level={note.digest_level} />
              {note.doi && (
                <a
                  href={`https://doi.org/${note.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: "12px", color: "var(--color-primary)", display: "flex", alignItems: "center", gap: "2px", textDecoration: "none" }}
                >
                  <ExternalLink style={{ width: "12px", height: "12px" }} /> DOI
                </a>
              )}
            </div>

            {/* Note content */}
            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "16px" }}>
              {note.content ? (
                <div style={{ fontSize: "14px", lineHeight: 1.7, color: "var(--text-secondary)" }}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-main)", marginTop: "16px", marginBottom: "8px" }}>{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-main)", marginTop: "16px", marginBottom: "8px" }}>{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", marginTop: "12px", marginBottom: "4px" }}>{children}</h3>
                      ),
                      p: ({ children }) => <p style={{ marginBottom: "12px" }}>{children}</p>,
                      ul: ({ children }) => (
                        <ul style={{ marginBottom: "12px", paddingLeft: "20px" }}>{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol style={{ marginBottom: "12px", paddingLeft: "20px" }}>{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li style={{ color: "var(--text-secondary)" }}>{children}</li>
                      ),
                      code: ({ children, className }) => {
                        const isBlock = className?.startsWith("language-");
                        return isBlock ? (
                          <code style={{ display: "block", background: "var(--bg-hover)", borderRadius: "8px", padding: "12px", fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)", overflowX: "auto" }}>
                            {children}
                          </code>
                        ) : (
                          <code style={{ padding: "2px 6px", borderRadius: "4px", background: "var(--bg-hover)", fontSize: "12px", fontFamily: "monospace", color: "var(--color-primary)" }}>
                            {children}
                          </code>
                        );
                      },
                      blockquote: ({ children }) => (
                        <blockquote style={{ borderLeft: "2px solid var(--color-primary)", paddingLeft: "12px", margin: "12px 0", color: "var(--text-muted)", fontStyle: "italic" }}>
                          {children}
                        </blockquote>
                      ),
                      strong: ({ children }) => (
                        <strong style={{ fontWeight: 600, color: "var(--text-main)" }}>{children}</strong>
                      ),
                    }}
                  >
                    {note.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                  暂无笔记内容，升级 Digest 等级后 Claude 将自动生成结构化笔记
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Paper row ─────────────────────────────────────────────────────────────────

function PaperRow({
  paper,
  selected,
  onDigestUp,
  onSelect,
}: {
  paper: Paper;
  selected: boolean;
  onDigestUp: (id: string, lv: number) => void;
  onSelect: (id: string) => void;
}) {
  const [upgrading, setUpgrading] = useState(false);
  const toast = useToast();
  const config = useStore((s) => s.config);

  async function handleUpgrade(e: React.MouseEvent) {
    e.stopPropagation();
    if (paper.digest_level >= 4) return;
    setUpgrading(true);
    try {
      const r = await api.post<{ xp_awarded?: number }>(
        `/api/literature/${paper.paper_id}/digest`,
        { level: paper.digest_level + 1 }
      );
      onDigestUp(paper.paper_id, paper.digest_level + 1);
      if (r.xp_awarded && r.xp_awarded > 0) {
        toast.success("Digest 升级", `批判性阅读 +${r.xp_awarded} XP`);
      }
    } catch { /* ignore */ }
    finally { setUpgrading(false); }
  }

  async function openInObsidian(e: React.MouseEvent) {
    e.stopPropagation();
    if (!config?.vault_path) {
      toast.error("未设置情报库路径");
      return;
    }
    const vaultName = config.vault_path.split("/").pop() ?? "";
    const filePath = `Literature/${paper.paper_id}.md`;
    const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(uri);
    } catch {
      window.open(uri, "_blank");
    }
  }

  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: "12px", padding: "16px",
        cursor: "pointer",
        background: selected ? "rgba(99, 102, 241, 0.08)" : "transparent",
        transition: "background 0.2s ease",
      }}
      onClick={() => onSelect(paper.paper_id)}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(99, 102, 241, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "2px" }}>
        <FileText style={{ width: "18px", height: "18px", color: "var(--color-primary)" }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{paper.title}</p>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }}>
          {paper.authors || "Unknown"}{paper.year ? ` · ${paper.year}` : ""}
          {paper.doi && (
            <span style={{ marginLeft: "6px", display: "inline-flex", alignItems: "center", gap: "2px", color: "var(--color-primary)" }}>
              <ExternalLink style={{ width: "12px", height: "12px" }} /> DOI
            </span>
          )}
        </p>
        {paper.snippet && (
          <p
            style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            dangerouslySetInnerHTML={{ __html: paper.snippet }}
          />
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
          <DigestBadge level={paper.digest_level} />
          {paper.digest_level < 4 && (
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              style={{
                display: "flex", alignItems: "center", gap: "4px",
                fontSize: "12px", color: "var(--text-muted)", background: "transparent", border: "none", cursor: upgrading ? "not-allowed" : "pointer", opacity: upgrading ? 0.5 : 1
              }}
            >
              {upgrading
                ? <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "1px solid currentColor", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
                : <ChevronUp style={{ width: "12px", height: "12px" }} />
              }
              升级
            </button>
          )}
          {config?.vault_path && (
            <button
              onClick={openInObsidian}
              style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", marginLeft: "auto" }}
            >
              <ExternalLink style={{ width: "12px", height: "12px" }} />
              Obsidian
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Literature() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [searchResults, setSearchResults] = useState<Paper[] | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);

  const fetchPapers = useCallback(() => {
    setLoading(true);
    api.get<{ papers: Paper[] }>("/api/literature")
      .then((r) => setPapers(r.papers))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPapers(); }, [fetchPapers]);

  async function handleSearch(q: string) {
    setQuery(q);
    if (!q.trim()) { setSearchResults(null); return; }
    try {
      const r = await api.get<{ results: Paper[] }>(`/api/literature/search?q=${encodeURIComponent(q)}`);
      setSearchResults(r.results);
    } catch { setSearchResults([]); }
  }

  function handleDigestUp(paperId: string, newLevel: number) {
    setPapers((prev) =>
      prev.map((p) => p.paper_id === paperId ? { ...p, digest_level: newLevel } : p)
    );
  }

  const displayed = searchResults ?? papers;
  const filtered = filterLevel === null ? displayed : displayed.filter((p) => p.digest_level === filterLevel);
  const levelCounts = papers.reduce<Record<number, number>>((acc, p) => {
    acc[p.digest_level] = (acc[p.digest_level] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-app)" }}>
      {/* Header bar - Centered Search */}
      <div
        style={{
          padding: "clamp(16px, 2.5vw, 24px) clamp(20px, 3vw, 32px)",
          background: "var(--bg-panel)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          position: "relative",
        }}
      >
        {/* Left: Title */}
        <div style={{ position: "absolute", left: "clamp(20px, 3vw, 32px)", display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "clamp(40px, 5vw, 48px)",
              height: "clamp(40px, 5vw, 48px)",
              borderRadius: "var(--radius-md)",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(188, 164, 227, 0.35)",
            }}
          >
            <BookOpen style={{ width: "24px", height: "24px", color: "white" }} />
          </div>
          <div>
            <h2 style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontSize: "clamp(1.125rem, 2vw, 1.375rem)", fontWeight: 700, color: "var(--text-main)" }}>文献库</h2>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{papers.length} 篇文献</p>
          </div>
        </div>

        {/* Center: Search */}
        <div style={{ flex: 1, maxWidth: "500px", position: "relative" }}>
          <Search style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", width: "18px", height: "18px", color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            value={query} onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索文献标题、作者、内容..."
            aria-label="搜索文献"
            style={{
              width: "100%",
              padding: "12px 16px 12px 44px",
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              fontSize: "0.9375rem",
              color: "var(--text-main)",
              outline: "none",
              transition: "all 0.3s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-primary)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(188, 164, 227, 0.2)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-color)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {/* Right: Import Button */}
        <div style={{ position: "absolute", right: "clamp(20px, 3vw, 32px)" }}>
          <button
            onClick={() => setShowImport(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "var(--radius-full)",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
              color: "white",
              fontSize: "0.9375rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(188, 164, 227, 0.35)",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 24px rgba(188, 164, 227, 0.45)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(188, 164, 227, 0.35)";
            }}
          >
            <Plus style={{ width: "18px", height: "18px" }} />
            导入文献
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      {!query && papers.length > 0 && (
        <div style={{ padding: "8px 24px", borderBottom: "1px solid var(--border-light)", background: "var(--bg-card)", display: "flex", alignItems: "center", gap: "6px", overflowX: "auto", flexShrink: 0 }}>
          <button
            onClick={() => setFilterLevel(null)}
            style={{
              flexShrink: 0,
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "12px", fontWeight: 600,
              background: filterLevel === null ? "var(--color-primary)" : "transparent",
              color: filterLevel === null ? "white" : "var(--text-muted)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            全部 <span style={{ marginLeft: "4px", opacity: 0.7 }}>{papers.length}</span>
          </button>
          {DIGEST_LEVELS.map(({ level, label, color, bg }) => {
            const count = levelCounts[level] ?? 0;
            if (count === 0 && filterLevel !== level) return null;
            const isActive = filterLevel === level;
            return (
              <button
                key={level}
                onClick={() => setFilterLevel(filterLevel === level ? null : level)}
                style={{
                  flexShrink: 0,
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "12px", fontWeight: 600,
                  background: isActive ? "var(--color-primary)" : bg,
                  color: isActive ? "white" : color,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  opacity: isActive ? 1 : 0.8,
                }}
              >
                Lv.{level} {label}
                <span style={{ opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body: list + optional detail panel */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* Paper list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {loading && (
            <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>加载中…</p>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px", textAlign: "center" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "rgba(99, 102, 241, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <BookOpen style={{ width: "32px", height: "32px", color: "var(--color-primary)", opacity: 0.5 }} />
              </div>
              <div>
                <p style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-main)" }}>
                  {query ? "没有找到相关文献" : filterLevel !== null ? "该等级暂无文献" : "文献库为空"}
                </p>
                <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>
                  {query
                    ? "换个关键词试试"
                    : filterLevel !== null
                    ? "升级文献阅读等级后显示"
                    : '点击"导入文献"添加第一篇'}
                </p>
              </div>
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ background: "var(--bg-card)", borderRadius: "16px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-soft)", overflow: "hidden" }}>
              {filtered.map((p, idx) => (
                <div key={p.paper_id} style={{ borderTop: idx > 0 ? "1px solid var(--border-light)" : "none" }}>
                  <PaperRow
                    paper={p}
                    selected={selectedPaperId === p.paper_id}
                    onDigestUp={handleDigestUp}
                    onSelect={setSelectedPaperId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Paper detail panel */}
        {selectedPaperId && (
          <PaperDetail
            paperId={selectedPaperId}
            onClose={() => setSelectedPaperId(null)}
            onDigestUp={handleDigestUp}
          />
        )}
      </div>

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={fetchPapers} />
      )}
    </div>
  );
}
