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
  const [mode, setMode] = useState<"AND" | "OR">("OR");
  const [maxResults, setMaxResults] = useState(50);
  const [daysBack, setDaysBack] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState("submittedDate");

  // Results state
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [searchTimeMs, setSearchTimeMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedPapers, setExpandedPapers] = useState<Set<string>>(new Set());

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

  const togglePaperExpand = (paperId: string) => {
    setExpandedPapers(prev => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
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
              placeholder="输入关键词，用空格或逗号分隔..."
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

        {/* Filters row */}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {/* Max results */}
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
              最大结果数
            </label>
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                cursor: "pointer",
                minWidth: "100px",
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Time range */}
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
              时间范围
            </label>
            <select
              value={daysBack ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setDaysBack(val ? Number(val) : null);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                cursor: "pointer",
                minWidth: "120px",
              }}
            >
              <option value="">全部时间</option>
              <option value={7}>最近7天</option>
              <option value={30}>最近30天</option>
              <option value={90}>最近90天</option>
              <option value={365}>最近1年</option>
            </select>
          </div>

          {/* Sort by */}
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
                minWidth: "140px",
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

              {/* Actions */}
              <div style={{ display: "flex", gap: "12px" }}>
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
