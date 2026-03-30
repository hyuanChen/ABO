// src/modules/arxiv/ArxivTracker.tsx
import { useEffect, useState } from "react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { BookOpen, RefreshCw, ExternalLink, Star, Filter, Settings } from "lucide-react";

interface ArxivPaper {
  id: string;
  title: string;
  summary: string;
  score: number;
  tags: string[];
  source_url: string;
  metadata: {
    authors?: string[];
    published?: string;
    "pdf-url"?: string;
    contribution?: string;
  };
}

interface ArxivConfig {
  keywords: string[];
  min_score: number;
}

export default function ArxivTracker() {
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [config, setConfig] = useState<ArxivConfig>({
    keywords: ["machine learning"],
    min_score: 0.5,
  });
  const [filterScore, setFilterScore] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  useEffect(() => { loadPapers(); }, []);

  async function loadPapers() {
    try {
      const data = await api.get<{ cards: ArxivPaper[] }>(
        "/api/cards?module_id=arxiv-tracker&limit=50"
      );
      setPapers(data.cards || []);
    } catch { /* silent */ }
  }

  async function runCrawl() {
    setLoading(true);
    try {
      await api.post("/api/modules/arxiv-tracker/run", {});
      toast.success("爬取任务已启动", "论文将在处理完成后出现在 Feed 中");
      setTimeout(loadPapers, 8000);
    } catch (err) {
      toast.error("启动失败", err instanceof Error ? err.message : "");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    try {
      await api.post("/api/preferences", {
        modules: {
          "arxiv-tracker": {
            keywords: config.keywords,
            score_threshold: config.min_score,
          },
        },
      });
      toast.success("配置已保存");
      setShowConfig(false);
    } catch {
      toast.error("保存失败");
    }
  }

  const filtered = papers.filter((p) => p.score >= filterScore);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              arXiv 论文追踪
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              自动爬取 · Claude 评分 · 相关度排序
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-4 h-4" />配置
          </button>
          <button
            onClick={runCrawl}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "爬取中..." : "立即爬取"}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="px-6 py-4 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-xl space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                追踪关键词（逗号分隔）
              </label>
              <input
                type="text"
                value={config.keywords.join(", ")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    keywords: e.target.value
                      .split(",")
                      .map((k) => k.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                最低评分: {config.min_score}
              </label>
              <input
                type="range" min="0" max="1" step="0.1"
                value={config.min_score}
                onChange={(e) =>
                  setConfig({ ...config, min_score: parseFloat(e.target.value) })
                }
                className="flex-1"
              />
            </div>
            <button
              onClick={saveConfig}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <Filter className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-500">评分 ≥</span>
        <input
          type="range" min="0" max="1" step="0.1"
          value={filterScore}
          onChange={(e) => setFilterScore(parseFloat(e.target.value))}
          className="w-28"
        />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-6">
          {filterScore.toFixed(1)}
        </span>
        <span className="ml-auto text-sm text-slate-400">{filtered.length} 篇</span>
      </div>

      {/* Paper list */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>暂无论文数据</p>
              <p className="text-sm mt-1">点击"立即爬取"开始追踪</p>
            </div>
          ) : (
            filtered.map((paper) => <PaperCard key={paper.id} paper={paper} />)
          )}
        </div>
      </div>
    </div>
  );
}

function PaperCard({ paper }: { paper: ArxivPaper }) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor =
    paper.score >= 0.8 ? "bg-emerald-500"
    : paper.score >= 0.6 ? "bg-amber-500"
    : "bg-slate-400";
  const meta = paper.metadata || {};
  const authors = meta.authors || [];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
      <div className="flex gap-3">
        <div
          className={`w-10 h-10 rounded-full ${scoreColor} flex-shrink-0 flex items-center justify-center text-white font-bold text-sm`}
        >
          {(paper.score * 10).toFixed(0)}
        </div>
        <div className="flex-1 min-w-0">
          <a
            href={paper.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-slate-800 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-start gap-1.5 mb-1"
          >
            <span>{paper.title}</span>
            <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
          </a>
          <div className="text-xs text-slate-500 mb-2">
            {authors.slice(0, 3).join(", ")}
            {authors.length > 3 ? " et al." : ""}
            {meta.published ? ` · ${meta.published}` : ""}
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {paper.tags?.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 rounded-full"
              >
                {t}
              </span>
            ))}
          </div>
          {meta.contribution && (
            <div className="flex gap-1.5 mb-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
              <Star className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-700 dark:text-slate-300">
                {meta.contribution}
              </p>
            </div>
          )}
          <p
            className={`text-sm text-slate-600 dark:text-slate-400 ${
              expanded ? "" : "line-clamp-2"
            }`}
          >
            {paper.summary}
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-indigo-500 hover:underline"
            >
              {expanded ? "收起" : "展开"}
            </button>
            {meta["pdf-url"] && (
              <a
                href={meta["pdf-url"]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                PDF
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
