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
  { level: 0, label: "收录",  color: "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400" },
  { level: 1, label: "扫读",  color: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" },
  { level: 2, label: "精读",  color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" },
  { level: 3, label: "内化",  color: "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" },
  { level: 4, label: "融会",  color: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
];

function DigestBadge({ level }: { level: number }) {
  const cfg = DIGEST_LEVELS[level] ?? DIGEST_LEVELS[0];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
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
      const result = await api.get<{ path: string | null; cancelled: boolean }>("/api/fs/pick-pdf");
      if (!result.cancelled && result.path) {
        setValue(result.path);
      }
    } catch {
      // silently ignore
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading text-lg text-slate-800 dark:text-slate-100">导入文献</h3>
          <button onClick={onClose} aria-label="关闭" className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-4 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl">
          {(["doi", "pdf"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setValue(""); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                mode === m
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              }`}
            >
              {m === "doi" ? <Link2 className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              {m === "doi" ? "DOI" : "PDF 文件"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "pdf" ? (
            <div className="flex gap-2">
              <input
                autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                placeholder="/path/to/paper.pdf"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 text-sm"
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={picking}
                aria-label="浏览文件"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-colors cursor-pointer disabled:opacity-50 shrink-0 text-sm"
              >
                {picking
                  ? <span className="w-4 h-4 rounded-full border border-current border-t-transparent animate-spin" />
                  : <FolderOpen className="w-4 h-4" aria-hidden />
                }
                浏览
              </button>
            </div>
          ) : (
            <input
              autoFocus value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="10.48550/arXiv.1706.03762"
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 text-sm"
            />
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-sm transition-colors cursor-pointer disabled:opacity-50"
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
    <div className="w-96 shrink-0 border-l border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex-1 min-w-0">
          {note && (
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
              {note.title}
            </p>
          )}
        </div>
        {note && note.digest_level < 4 && (
          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            className="shrink-0 px-2 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer disabled:opacity-50"
          >
            {upgrading ? "…" : "升级 Digest"}
          </button>
        )}
        {config?.vault_path && (
          <button
            onClick={openInObsidian}
            aria-label="在 Obsidian 中打开"
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" aria-hidden />
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="关闭详情"
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        )}
        {!loading && !note && (
          <div className="p-4 text-sm text-slate-400 dark:text-slate-500">未找到笔记</div>
        )}
        {note && (
          <div className="p-4">
            {/* Meta */}
            <h2 className="font-heading text-base font-semibold text-slate-800 dark:text-slate-100 leading-snug mb-1">
              {note.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {note.authors || "Unknown"}
              {note.year ? ` · ${note.year}` : ""}
            </p>
            <div className="flex items-center gap-2 mt-2 mb-4 flex-wrap">
              <DigestBadge level={note.digest_level} />
              {note.doi && (
                <a
                  href={`https://doi.org/${note.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-600 flex items-center gap-0.5"
                >
                  <ExternalLink className="w-3 h-3" aria-hidden /> DOI
                </a>
              )}
            </div>

            {/* Note content */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              {note.content ? (
                <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-4 mb-2 first:mt-0">{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-4 mb-2 first:mt-0">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-3 mb-1 first:mt-0">{children}</h3>
                      ),
                      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                      ul: ({ children }) => (
                        <ul className="mb-3 pl-4 space-y-1 list-disc list-outside">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-3 pl-4 space-y-1 list-decimal list-outside">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="text-slate-700 dark:text-slate-300">{children}</li>
                      ),
                      code: ({ children, className }) => {
                        const isBlock = className?.startsWith("language-");
                        return isBlock ? (
                          <code className="block bg-slate-100 dark:bg-slate-800 rounded-lg p-3 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                            {children}
                          </code>
                        ) : (
                          <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono text-indigo-600 dark:text-indigo-300">
                            {children}
                          </code>
                        );
                      },
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-indigo-300 dark:border-indigo-600 pl-3 my-3 text-slate-600 dark:text-slate-400 italic">
                          {children}
                        </blockquote>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-slate-800 dark:text-slate-100">{children}</strong>
                      ),
                    }}
                  >
                    {note.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500">
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
      toast.error("未设置 Vault 路径");
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
      className={`flex items-start gap-3 p-4 transition-colors group cursor-pointer ${
        selected
          ? "bg-indigo-50 dark:bg-indigo-900/20"
          : "hover:bg-slate-50 dark:hover:bg-slate-700/30"
      }`}
      onClick={() => onSelect(paper.paper_id)}
    >
      <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 mt-0.5">
        <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400" aria-hidden />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{paper.title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
          {paper.authors || "Unknown"}{paper.year ? ` · ${paper.year}` : ""}
          {paper.doi && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 text-indigo-400">
              <ExternalLink className="w-3 h-3" aria-hidden /> DOI
            </span>
          )}
        </p>
        {paper.snippet && (
          <p
            className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: paper.snippet }}
          />
        )}
        <div className="flex items-center gap-2 mt-2">
          <DigestBadge level={paper.digest_level} />
          {paper.digest_level < 4 && (
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 transition-colors cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
            >
              {upgrading
                ? <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                : <ChevronUp className="w-3 h-3" aria-hidden />
              }
              升级
            </button>
          )}
          {config?.vault_path && (
            <button
              onClick={openInObsidian}
              aria-label="在 Obsidian 中打开"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-500 transition-colors cursor-pointer ml-auto focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
            >
              <ExternalLink className="w-3 h-3" aria-hidden />
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
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3 shrink-0">
        <h2 className="font-heading text-xl text-slate-800 dark:text-slate-100 shrink-0">文献库</h2>

        {/* Search */}
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
          <input
            value={query} onChange={(e) => handleSearch(e.target.value)}
            placeholder="全文搜索…"
            aria-label="搜索文献"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
        </div>

        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden />
          导入文献
        </button>
      </div>

      {/* Filter tabs */}
      {!query && papers.length > 0 && (
        <div className="px-6 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1 overflow-x-auto shrink-0">
          <button
            onClick={() => setFilterLevel(null)}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              filterLevel === null
                ? "bg-indigo-500 text-white"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            全部 <span className="ml-1 opacity-70">{papers.length}</span>
          </button>
          {DIGEST_LEVELS.map(({ level, label, color }) => {
            const count = levelCounts[level] ?? 0;
            if (count === 0 && filterLevel !== level) return null;
            return (
              <button
                key={level}
                onClick={() => setFilterLevel(filterLevel === level ? null : level)}
                className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filterLevel === level
                    ? "bg-indigo-500 text-white"
                    : `${color} hover:opacity-80`
                }`}
              >
                Lv.{level} {label}
                <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body: list + optional detail panel */}
      <div className="flex-1 min-h-0 flex">
        {/* Paper list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <p className="text-sm text-slate-400 dark:text-slate-500">加载中…</p>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-indigo-400" aria-hidden />
              </div>
              <div>
                <p className="font-heading text-lg text-slate-700 dark:text-slate-200">
                  {query ? "没有找到相关文献" : filterLevel !== null ? "该等级暂无文献" : "文献库为空"}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
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
            <div className="bg-white dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm divide-y divide-slate-100 dark:divide-slate-700/50">
              {filtered.map((p) => (
                <PaperRow
                  key={p.paper_id}
                  paper={p}
                  selected={selectedPaperId === p.paper_id}
                  onDigestUp={handleDigestUp}
                  onSelect={setSelectedPaperId}
                />
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
