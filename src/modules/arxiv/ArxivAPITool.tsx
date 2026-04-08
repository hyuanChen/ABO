import { useState, useEffect } from "react";
import {
  Search,
  FileText,
  ExternalLink,
  Filter,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Clock,
  Tag,
  Users,
  Download,
  Image as ImageIcon,
  Save,
  FolderOpen,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState } from "../../components/Layout";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";

interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  categories: string[];
  primary_category: string;
  pdf_url: string;
  arxiv_url: string;
  comment?: string;
  figures?: Array<{
    url: string;
    caption: string;
    is_method: boolean;
    type: string;
  }>;
}

interface Category {
  code: string;
  name: string;
  main: string;
}

interface CategoriesResponse {
  categories: Category[];
}

interface SearchResponse {
  papers: ArxivPaper[];
  total_results: number;
  search_time_ms: number;
}

export function ArxivAPITool() {
  const toast = useToast();

  // Search parameters
  const [keywords, setKeywords] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
  const [mode, setMode] = useState<"AND" | "OR">("AND");
  const [maxResults, setMaxResults] = useState(50);
  const [daysBack, setDaysBack] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState("submittedDate");

  // Results state
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [searchTimeMs, setSearchTimeMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedPapers, setExpandedPapers] = useState<Set<string>>(new Set());
  const [paperFigures, setPaperFigures] = useState<Record<string, ArxivPaper["figures"]>>({});
  const [loadingFigures, setLoadingFigures] = useState<Set<string>>(new Set());
  const [savingPaper, setSavingPaper] = useState<string | null>(null);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const result = await api.get<CategoriesResponse>("/api/tools/arxiv/categories");
      setAvailableCategories(result.categories);
    } catch (e) {
      console.error("Failed to load categories:", e);
      toast.error("加载分类失败");
    }
  };

  const handleSearch = async () => {
    if (!keywords.trim()) {
      toast.error("请输入关键词");
      return;
    }

    setLoading(true);
    try {
      const result = await api.post<SearchResponse>("/api/tools/arxiv/search", {
        keywords: keywords.split(/[\s,]+/).map(k => k.trim()).filter(Boolean),
        categories: categories.length > 0 ? categories : undefined,
        mode,
        max_results: maxResults,
        days_back: daysBack,
        sort_by: sortBy,
      });
      setPapers(result.papers);
      setTotalResults(result.total_results);
      setSearchTimeMs(result.search_time_ms);
      toast.success(`找到 ${result.total_results} 篇论文`);
      // 自动加载图片
      result.papers.forEach(paper => {
        if (!paperFigures[paper.id]) {
          loadPaperFigures(paper);
        }
      });
    } catch (e) {
      console.error("Search failed:", e);
      toast.error("搜索失败", e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category: string) => {
    setCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const togglePaperExpand = async (paperId: string) => {
    const isExpanding = !expandedPapers.has(paperId);
    setExpandedPapers(prev => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
    // 自动获取图片
    if (isExpanding) {
      const paper = papers.find(p => p.id === paperId);
      if (paper && !paperFigures[paperId] && !loadingFigures.has(paperId)) {
        await loadPaperFigures(paper);
      }
    }
  };

  const loadPaperFigures = async (paper: ArxivPaper) => {
    if (paperFigures[paper.id] || loadingFigures.has(paper.id)) return;

    setLoadingFigures(prev => new Set(prev).add(paper.id));
    try {
      const result = await api.post<{ figures: ArxivPaper["figures"] }>("/api/tools/arxiv/figures", {
        arxiv_id: paper.id,
      });
      setPaperFigures(prev => ({ ...prev, [paper.id]: result.figures }));
    } catch (e) {
      console.error("Failed to load figures:", e);
    } finally {
      setLoadingFigures(prev => {
        const next = new Set(prev);
        next.delete(paper.id);
        return next;
      });
    }
  };

  const savePaper = async (paper: ArxivPaper) => {
    setSavingPaper(paper.id);
    try {
      // 确保图片已加载
      let figures = paperFigures[paper.id] || [];
      if (figures.length === 0 && !loadingFigures.has(paper.id)) {
        const result = await api.post<{ figures: ArxivPaper["figures"] }>("/api/tools/arxiv/figures", {
          arxiv_id: paper.id,
        });
        figures = result.figures;
        setPaperFigures(prev => ({ ...prev, [paper.id]: figures }));
      }

      // 调用保存接口，同时保存 Markdown 和 PDF
      const saveResult = await api.post<{
        success: boolean;
        saved_to: string;
        files: string[];
        pdf_path?: string;
      }>("/api/tools/arxiv/save", {
        arxiv_id: paper.id,
        title: paper.title,
        authors: paper.authors,
        summary: paper.summary,
        pdf_url: paper.pdf_url,
        arxiv_url: paper.arxiv_url,
        primary_category: paper.primary_category,
        published: paper.published,
        comment: paper.comment,
        figures: figures,
      });

      if (saveResult.success) {
        toast.success("保存成功", `Markdown 和 PDF 已保存到知识库`);
      }
    } catch (e) {
      console.error("Failed to save paper:", e);
      toast.error("保存失败", String(e));
    } finally {
      setSavingPaper(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const renderSearchPanel = () => (
    <Card title="搜索条件" icon={<Filter style={{ width: "18px", height: "18px" }} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Keywords input */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-main)",
              marginBottom: "8px",
            }}
          >
            关键词
          </label>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={mode === "AND" ? "vision transformer (同时包含所有词)" : "vision,language | robot (分组AND，组间OR)"}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.9375rem",
                outline: "none",
              }}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !keywords.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: loading ? "var(--bg-hover)" : "var(--color-primary)",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: loading || !keywords.trim() ? "not-allowed" : "pointer",
                opacity: loading || !keywords.trim() ? 0.6 : 1,
                transition: "all 0.2s ease",
              }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="animate-spin">⟳</span>
                  搜索中...
                </span>
              ) : (
                <>
                  <Search style={{ width: "16px", height: "16px" }} />
                  搜索
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mode toggle */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-main)",
              marginBottom: "8px",
            }}
          >
            匹配模式
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setMode("OR")}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: mode === "OR" ? "var(--color-primary)" : "var(--bg-card)",
                color: mode === "OR" ? "white" : "var(--text-main)",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              OR (任意匹配)
            </button>
            <button
              onClick={() => setMode("AND")}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: mode === "AND" ? "var(--color-primary)" : "var(--bg-card)",
                color: mode === "AND" ? "white" : "var(--text-main)",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              AND (全部匹配)
            </button>
          </div>
        </div>

        {/* Filters row - 三个对齐 */}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {/* Max results */}
          <div style={{ display: "flex", flexDirection: "column", width: "100px" }}>
            <label
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--text-main)",
                marginBottom: "8px",
                height: "20px",
                lineHeight: "20px",
              }}
            >
              最大结果数
            </label>
            <input
              type="number"
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              placeholder="50"
              min={1}
              max={200}
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                width: "100px",
                height: "42px",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Time range */}
          <div style={{ display: "flex", flexDirection: "column", width: "100px" }}>
            <label
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--text-main)",
                marginBottom: "8px",
                height: "20px",
                lineHeight: "20px",
              }}
            >
              时间范围(天)
            </label>
            <input
              type="number"
              value={daysBack ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setDaysBack(val ? Number(val) : null);
              }}
              placeholder="365"
              min={1}
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                width: "100px",
                height: "42px",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Sort by */}
          <div style={{ display: "flex", flexDirection: "column", width: "140px" }}>
            <label
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--text-main)",
                marginBottom: "8px",
                height: "20px",
                lineHeight: "20px",
              }}
            >
              排序方式
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                cursor: "pointer",
                width: "140px",
                height: "42px",
                boxSizing: "border-box",
              }}
            >
              <option value="submittedDate">提交日期</option>
              <option value="relevance">相关度</option>
              <option value="lastUpdatedDate">最后更新</option>
            </select>
          </div>
        </div>

        {/* Category filter */}
        <div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-main)",
              marginBottom: "12px",
            }}
          >
            <Tag style={{ width: "14px", height: "14px" }} />
            分类筛选
            {categories.length > 0 && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-primary)20",
                  color: "var(--color-primary)",
                  fontSize: "0.75rem",
                }}
              >
                {categories.length}
              </span>
            )}
          </label>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              maxHeight: "120px",
              overflowY: "auto",
              padding: "4px",
            }}
          >
            {availableCategories.map((category) => (
              <button
                key={category.code}
                onClick={() => toggleCategory(category.code)}
                title={category.name}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-full)",
                  border: "1px solid var(--border-light)",
                  background: categories.includes(category.code)
                    ? "var(--color-primary)"
                    : "var(--bg-hover)",
                  color: categories.includes(category.code) ? "white" : "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {category.code}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );

  const renderResults = () => {
    if (papers.length === 0) {
      return (
        <EmptyState
          icon={BookOpen}
          title="开始搜索"
          description="输入关键词搜索 arXiv 论文"
        />
      );
    }

    return (
      <Card
        title={`搜索结果 (${totalResults})`}
        icon={<BookOpen style={{ width: "18px", height: "18px" }} />}
        actions={
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            搜索耗时: {(searchTimeMs / 1000).toFixed(2)}s
          </span>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {papers.map((paper) => (
            <div
              key={paper.id}
              style={{
                padding: "20px",
                borderRadius: "var(--radius-lg)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
              }}
            >
              {/* Title */}
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "var(--text-main)",
                  marginBottom: "12px",
                  lineHeight: 1.4,
                }}
              >
                {paper.title}
              </h3>

              {/* Authors */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "12px",
                  flexWrap: "wrap",
                }}
              >
                <Users style={{ width: "14px", height: "14px", color: "var(--text-muted)" }} />
                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {paper.authors.slice(0, 5).join(", ")}
                  {paper.authors.length > 5 && ` +${paper.authors.length - 5} more`}
                </span>
              </div>

              {/* Meta info */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  marginBottom: "12px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <Clock style={{ width: "14px", height: "14px" }} />
                  {formatDate(paper.published)}
                </span>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--color-primary)20",
                    color: "var(--color-primary)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {paper.primary_category}
                </span>
                {paper.comment && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {paper.comment}
                  </span>
                )}
              </div>

              {/* Abstract */}
              <div style={{ marginBottom: "16px" }}>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.7,
                  }}
                >
                  {expandedPapers.has(paper.id)
                    ? paper.summary
                    : paper.summary.slice(0, 300) + (paper.summary.length > 300 ? "..." : "")}
                </p>
                {paper.summary.length > 300 && (
                  <button
                    onClick={() => togglePaperExpand(paper.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 0",
                      background: "none",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                      marginTop: "8px",
                    }}
                  >
                    {expandedPapers.has(paper.id) ? (
                      <>
                        <ChevronUp style={{ width: "14px", height: "14px" }} />
                        收起摘要
                      </>
                    ) : (
                      <>
                        <ChevronDown style={{ width: "14px", height: "14px" }} />
                        展开摘要
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Categories */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  marginBottom: "16px",
                }}
              >
                {paper.categories.map((cat) => (
                  <span
                    key={cat}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-light)",
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {cat}
                  </span>
                ))}
              </div>

              {/* Figures Preview - 单行横向滚动，大图显示 */}
              {(paperFigures[paper.id]?.length ?? 0) > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{
                    display: "flex",
                    gap: "16px",
                    overflowX: "auto",
                    paddingBottom: "12px",
                    scrollbarWidth: "thin",
                  }}>
                    {paperFigures[paper.id]?.map((fig, idx) => (
                      <div key={idx} style={{
                        flexShrink: 0,
                        width: "480px",
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-card)",
                      }}>
                        <img
                          src={fig.url}
                          alt={fig.caption}
                          style={{
                            width: "100%",
                            height: "280px",
                            objectFit: "contain",
                            background: "var(--bg-hover)",
                            cursor: "pointer",
                          }}
                          onClick={() => window.open(fig.url, "_blank")}
                          loading="lazy"
                        />
                        <div style={{
                          padding: "10px 12px",
                          fontSize: "0.8125rem",
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          background: "var(--bg-card)",
                        }}>
                          {fig.caption}
                          {fig.is_method && (
                            <span style={{
                              marginLeft: "8px",
                              padding: "3px 8px",
                              borderRadius: "4px",
                              background: "var(--color-primary)",
                              color: "white",
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                            }}>
                              架构图
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <a
                  href={paper.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-primary)",
                    color: "white",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    transition: "all 0.2s ease",
                  }}
                >
                  <Download style={{ width: "14px", height: "14px" }} />
                  PDF
                </a>
                <a
                  href={paper.arxiv_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-card)",
                    color: "var(--text-main)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    transition: "all 0.2s ease",
                  }}
                >
                  <ExternalLink style={{ width: "14px", height: "14px" }} />
                  arXiv
                </a>
                <button
                  onClick={() => loadPaperFigures(paper)}
                  disabled={loadingFigures.has(paper.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: (paperFigures[paper.id]?.length ?? 0) > 0 ? "var(--bg-hover)" : "var(--bg-card)",
                    color: (paperFigures[paper.id]?.length ?? 0) > 0 ? "var(--text-muted)" : "var(--text-main)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    cursor: loadingFigures.has(paper.id) ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {loadingFigures.has(paper.id) ? (
                    <>
                      <span className="animate-spin">⟳</span>
                      加载图片...
                    </>
                  ) : (
                    <>
                      <ImageIcon style={{ width: "14px", height: "14px" }} />
                      {(paperFigures[paper.id]?.length ?? 0) > 0 ? `已加载 ${paperFigures[paper.id]?.length} 张图` : "获取图片"}
                    </>
                  )}
                </button>
                <button
                  onClick={() => savePaper(paper)}
                  disabled={savingPaper === paper.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-card)",
                    color: "var(--color-primary)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    cursor: savingPaper === paper.id ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {savingPaper === paper.id ? (
                    <>
                      <span className="animate-spin">⟳</span>
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save style={{ width: "14px", height: "14px" }} />
                      保存到文献库
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title="arXiv 论文搜索"
        subtitle="搜索和浏览 arXiv 学术论文"
        icon={FileText}
      />
      <PageContent maxWidth="1200px">
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {renderSearchPanel()}
          {renderResults()}
        </div>
      </PageContent>
    </PageContainer>
  );
}
