import { useEffect, useState, useCallback } from "react";
import {
  BookOpen, Search, Plus, X, Upload, Link2, ChevronUp,
  FileText, ExternalLink,
} from "lucide-react";
import { api } from "../../core/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Paper {
  paper_id: string;
  title: string;
  authors: string;
  year: number | null;
  doi: string | null;
  digest_level: number;
  created_at: string;
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
  const [error, setError] = useState("");

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
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading text-lg text-slate-800 dark:text-slate-100">导入文献</h3>
          <button onClick={onClose} aria-label="关闭" className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-4 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl">
          {(["doi", "pdf"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                mode === m
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              }`}>
              {m === "doi" ? <Link2 className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              {m === "doi" ? "DOI" : "PDF 路径"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            autoFocus value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={mode === "doi" ? "10.48550/arXiv.1706.03762" : "/path/to/paper.pdf"}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 text-sm"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading || !value.trim()}
            className="py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-sm transition-colors cursor-pointer disabled:opacity-50">
            {loading ? "导入中…" : "导入文献 +5 XP"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Paper row ─────────────────────────────────────────────────────────────────

function PaperRow({ paper, onDigestUp }: { paper: Paper; onDigestUp: (id: string, lv: number) => void }) {
  const [upgrading, setUpgrading] = useState(false);

  async function handleUpgrade() {
    if (paper.digest_level >= 4) return;
    setUpgrading(true);
    try {
      await api.post(`/api/literature/${paper.paper_id}/digest`, { level: paper.digest_level + 1 });
      onDigestUp(paper.paper_id, paper.digest_level + 1);
    } catch { /* ignore */ }
    finally { setUpgrading(false); }
  }

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
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
        <div className="flex items-center gap-2 mt-2">
          <DigestBadge level={paper.digest_level} />
          {paper.digest_level < 4 && (
            <button onClick={handleUpgrade} disabled={upgrading}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 transition-colors cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">
              {upgrading
                ? <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                : <ChevronUp className="w-3 h-3" aria-hidden />
              }
              升级
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
    setPapers((prev) => prev.map((p) => p.paper_id === paperId ? { ...p, digest_level: newLevel } : p));
  }

  const displayed = searchResults ?? papers;

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3">
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

        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0">
          <Plus className="w-4 h-4" aria-hidden />
          导入文献
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && <p className="text-sm text-slate-400 dark:text-slate-500">加载中…</p>}

        {!loading && displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-indigo-400" aria-hidden />
            </div>
            <div>
              <p className="font-heading text-lg text-slate-700 dark:text-slate-200">
                {query ? "没有找到相关文献" : "文献库为空"}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {query ? "换个关键词试试" : '点击"导入文献"添加第一篇'}
              </p>
            </div>
          </div>
        )}

        {displayed.length > 0 && (
          <div className="bg-white dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm divide-y divide-slate-100 dark:divide-slate-700/50">
            {displayed.map((p) => (
              <PaperRow key={p.paper_id} paper={p} onDigestUp={handleDigestUp} />
            ))}
          </div>
        )}
      </div>

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={fetchPapers} />
      )}
    </div>
  );
}
