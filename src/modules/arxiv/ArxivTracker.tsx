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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-app)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "var(--bg-card)", borderBottom: "1px solid var(--border-light)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "var(--radius-md)", background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen style={{ width: "20px", height: "20px", color: "white" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-main)" }}>
              arXiv 论文追踪
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
              自动爬取 · Claude 评分 · 相关度排序
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setShowConfig(!showConfig)}
            style={{
              display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "var(--radius-lg)",
              background: "var(--bg-hover)", border: "1px solid var(--border-light)", color: "var(--text-secondary)",
              fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", transition: "all 0.2s ease"
            }}
          >
            <Settings style={{ width: "16px", height: "16px" }} />配置
          </button>
          <button
            onClick={runCrawl}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "var(--radius-lg)",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))", color: "white",
              fontSize: "0.875rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1, transition: "all 0.2s ease", border: "none"
            }}
          >
            <RefreshCw style={{ width: "16px", height: "16px", animation: loading ? "spin 1s linear infinite" : "none" }} />
            {loading ? "爬取中..." : "立即爬取"}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div style={{ padding: "16px 24px", background: "var(--bg-hover)", borderBottom: "1px solid var(--border-light)" }}>
          <div style={{ maxWidth: "500px" }}>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>
                追踪关键词（逗号分隔）
              </label>
              <input
                type="text"
                value={config.keywords.join(", ")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                  })
                }
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border-light)", background: "var(--bg-card)",
                  color: "var(--text-main)", fontSize: "0.875rem"
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                最低评分: {config.min_score}
              </label>
              <input
                type="range" min="0" max="1" step="0.1"
                value={config.min_score}
                onChange={(e) => setConfig({ ...config, min_score: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
            </div>
            <button
              onClick={saveConfig}
              style={{
                padding: "8px 16px", borderRadius: "var(--radius-lg)",
                background: "linear-gradient(135deg, #10B981, #059669)", color: "white",
                fontSize: "0.875rem", fontWeight: 600, border: "none", cursor: "pointer"
              }}
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 24px", background: "var(--bg-card)", borderBottom: "1px solid var(--border-light)" }}>
        <Filter style={{ width: "16px", height: "16px", color: "var(--text-muted)" }} />
        <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>评分 ≥</span>
        <input
          type="range" min="0" max="1" step="0.1"
          value={filterScore}
          onChange={(e) => setFilterScore(parseFloat(e.target.value))}
          style={{ width: "120px" }}
        />
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-main)", width: "32px" }}>
          {filterScore.toFixed(1)}
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.875rem", color: "var(--text-muted)" }}>{filtered.length} 篇</span>
      </div>

      {/* Paper list */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "12px" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
              <BookOpen style={{ width: "48px", height: "48px", margin: "0 auto 16px", opacity: 0.4 }} />
              <p>暂无论文数据</p>
              <p style={{ fontSize: "0.875rem", marginTop: "8px" }}>点击"立即爬取"开始追踪</p>
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
    paper.score >= 0.8 ? "#10B981"
    : paper.score >= 0.6 ? "#F59E0B"
    : "var(--text-muted)";
  const meta = paper.metadata || {};
  const authors = meta.authors || [];

  return (
    <div style={{
      background: "var(--bg-card)", borderRadius: "var(--radius-xl)",
      border: "1px solid var(--border-light)", padding: "16px",
      transition: "all 0.2s ease"
    }}>
      <div style={{ display: "flex", gap: "12px" }}>
        <div style={{
          width: "44px", height: "44px", borderRadius: "50%",
          background: scoreColor, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontWeight: 700, fontSize: "0.875rem"
        }}>
          {(paper.score * 10).toFixed(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <a
            href={paper.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontWeight: 600, color: "var(--text-main)",
              display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "6px",
              textDecoration: "none"
            }}
          >
            <span>{paper.title}</span>
            <ExternalLink style={{ width: "14px", height: "14px", marginTop: "4px", flexShrink: 0, opacity: 0.5 }} />
          </a>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" }}>
            {authors.slice(0, 3).join(", ")}
            {authors.length > 3 ? " et al." : ""}
            {meta.published ? ` · ${meta.published}` : ""}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
            {paper.tags?.map((t) => (
              <span
                key={t}
                style={{
                  padding: "3px 10px", borderRadius: "var(--radius-full)",
                  background: "var(--bg-hover)", fontSize: "0.75rem", color: "var(--text-muted)"
                }}
              >
                {t}
              </span>
            ))}
          </div>
          {meta.contribution && (
            <div style={{
              display: "flex", gap: "8px", marginBottom: "10px", padding: "10px 14px",
              background: "rgba(99, 102, 241, 0.08)", borderRadius: "var(--radius-lg)"
            }}>
              <Star style={{ width: "16px", height: "16px", color: "var(--color-primary)", marginTop: "2px", flexShrink: 0 }} />
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {meta.contribution}
              </p>
            </div>
          )}
          <p style={{
            fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6,
            display: expanded ? "block" : "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden"
          }}>
            {paper.summary}
          </p>
          <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ fontSize: "0.8125rem", color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer" }}
            >
              {expanded ? "收起" : "展开"}
            </button>
            {meta["pdf-url"] && (
              <a
                href={meta["pdf-url"]}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "0.8125rem", color: "var(--text-muted)", textDecoration: "none" }}
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
