import { useState, useEffect } from "react";
import {
  Search,
  MessageCircle,
  TrendingUp,
  Heart,
  ExternalLink,
  Filter,
  Hash,
  Lightbulb,
  Users,
  Zap,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Cookie,
  AlertCircle,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState, LoadingState } from "../../components/Layout";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";

interface XHSNote {
  id: string;
  title: string;
  content: string;
  author: string;
  likes: number;
  collects: number;
  comments_count: number;
  url: string;
  published_at: string | null;
}

interface XHSComment {
  id: string;
  author: string;
  content: string;
  likes: number;
  is_top: boolean;
}

interface XHSTrendsAnalysis {
  hot_topics: string[];
  trending_tags: { tag: string; frequency: number }[];
  content_patterns: string[];
  audience_insights: string[];
  engagement_factors: string[];
  summary: string;
}

interface SearchResponse {
  keyword: string;
  total_found: number;
  notes: XHSNote[];
}

interface CommentsResponse {
  note_id: string;
  total_comments: number;
  sort_by: string;
  comments: XHSComment[];
}

interface TrendsResponse {
  keyword: string;
  analysis: XHSTrendsAnalysis;
  based_on_notes: number;
}

type TabType = "search" | "trends" | "comments";

interface ConfigResponse {
  cookie_configured: boolean;
  cookie_preview: string | null;
}

export function XiaohongshuTool() {
  const [activeTab, setActiveTab] = useState<TabType>("search");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  // Cookie config state
  const [cookie, setCookie] = useState<string>("");
  const [cookieConfigured, setCookieConfigured] = useState(false);
  const [showCookieInput, setShowCookieInput] = useState(false);
  const [cookiePreview, setCookiePreview] = useState<string | null>(null);

  // Search state
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"likes" | "time">("likes");
  const [minLikes, setMinLikes] = useState(100);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Trends state
  const [trendsKeyword, setTrendsKeyword] = useState("");
  const [trendsResult, setTrendsResult] = useState<TrendsResponse | null>(null);

  // Comments state
  const [noteId, setNoteId] = useState("");
  const [commentsResult, setCommentsResult] = useState<CommentsResponse | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const config = await api.get<ConfigResponse>("/api/tools/xiaohongshu/config");
      setCookieConfigured(config.cookie_configured);
      setCookiePreview(config.cookie_preview);
      if (config.cookie_configured) {
        // Load cookie from localStorage as fallback
        const savedCookie = localStorage.getItem("xiaohongshu_cookie");
        if (savedCookie) {
          setCookie(savedCookie);
        }
      }
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }

  async function saveCookie() {
    if (!cookie.trim()) {
      toast.error("请输入 Cookie");
      return;
    }
    try {
      await api.post("/api/tools/xiaohongshu/config", { cookie: cookie.trim() });
      localStorage.setItem("xiaohongshu_cookie", cookie.trim());
      setCookieConfigured(true);
      setCookiePreview(cookie.trim().slice(0, 50) + "...");
      setShowCookieInput(false);
      toast.success("Cookie 已保存");
    } catch (e) {
      toast.error("保存 Cookie 失败");
    }
  }

  const handleSearch = async () => {
    if (!searchKeyword.trim()) {
      toast.error("请输入关键词");
      return;
    }
    setLoading(true);
    try {
      const result = await api.post<SearchResponse>("/api/tools/xiaohongshu/search", {
        keyword: searchKeyword.trim(),
        max_results: 20,
        min_likes: minLikes,
        sort_by: sortBy,
        cookie: cookie || undefined,
      });
      setSearchResult(result);
      toast.success(`找到 ${result.total_found} 条结果`);
    } catch (e) {
      console.error("Search failed:", e);
      toast.error("搜索失败");
    } finally {
      setLoading(false);
    }
  };

  const handleTrends = async () => {
    if (!trendsKeyword.trim()) {
      toast.error("请输入关键词");
      return;
    }
    setLoading(true);
    try {
      const result = await api.post<TrendsResponse>("/api/tools/xiaohongshu/trends", {
        keyword: trendsKeyword.trim(),
      });
      setTrendsResult(result);
      toast.success("趋势分析完成");
    } catch (e) {
      console.error("Trends analysis failed:", e);
      toast.error("分析失败");
    } finally {
      setLoading(false);
    }
  };

  const handleComments = async () => {
    if (!noteId.trim()) {
      toast.error("请输入笔记 ID");
      return;
    }
    setLoading(true);
    try {
      const result = await api.post<CommentsResponse>("/api/tools/xiaohongshu/comments", {
        note_id: noteId.trim(),
        max_comments: 50,
        sort_by: "likes",
      });
      setCommentsResult(result);
      toast.success(`获取 ${result.total_comments} 条评论`);
    } catch (e) {
      console.error("Fetch comments failed:", e);
      toast.error("获取评论失败");
    } finally {
      setLoading(false);
    }
  };

  const toggleNoteExpand = (noteId: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const renderTabs = () => (
    <div
      style={{
        display: "flex",
        gap: "8px",
        padding: "4px",
        background: "var(--bg-hover)",
        borderRadius: "var(--radius-lg)",
        width: "fit-content",
      }}
    >
      {[
        { id: "search" as const, label: "搜索笔记", icon: Search },
        { id: "trends" as const, label: "趋势分析", icon: TrendingUp },
        { id: "comments" as const, label: "评论获取", icon: MessageCircle },
      ].map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: activeTab === id ? "var(--bg-card)" : "transparent",
            color: activeTab === id ? "var(--color-primary)" : "var(--text-muted)",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: activeTab === id ? "var(--shadow-soft)" : "none",
          }}
        >
          <Icon style={{ width: "16px", height: "16px" }} />
          {label}
        </button>
      ))}
    </div>
  );

  const renderCookieConfig = () => (
    <Card
      title={`Cookie 配置 ${cookieConfigured ? "✓" : ""}`}
      icon={<Cookie style={{ width: "18px", height: "18px" }} />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
          配置小红书登录 Cookie 后可获取真实搜索结果。
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              toast.info("请在小红书网页版登录后，从浏览器开发者工具复制 Cookie");
            }}
            style={{ color: "var(--color-primary)", marginLeft: "8px" }}
          >
            如何获取？
          </a>
        </p>

        {cookiePreview && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-hover)",
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              fontFamily: "monospace",
            }}
          >
            当前: {cookiePreview}
          </div>
        )}

        {!showCookieInput ? (
          <button
            onClick={() => setShowCookieInput(true)}
            style={{
              padding: "10px 20px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-light)",
              background: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: "0.875rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "fit-content",
            }}
          >
            <Cookie style={{ width: "16px", height: "16px" }} />
            {cookieConfigured ? "更新 Cookie" : "配置 Cookie"}
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <textarea
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="请粘贴小红书 Cookie..."
              style={{
                width: "100%",
                minHeight: "100px",
                padding: "12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.8125rem",
                fontFamily: "monospace",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={saveCookie}
                style={{
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--color-primary)",
                  color: "white",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                保存
              </button>
              <button
                onClick={() => setShowCookieInput(false)}
                style={{
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-hover)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {!cookieConfigured && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-warning)10",
              border: "1px solid var(--color-warning)30",
            }}
          >
            <AlertCircle style={{ width: "16px", height: "16px", color: "var(--color-warning)" }} />
            <span style={{ fontSize: "0.8125rem", color: "var(--color-warning)" }}>
              未配置 Cookie，将使用模拟数据或搜索引擎结果
            </span>
          </div>
        )}
      </div>
    </Card>
  );

  const renderSearchTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Search Input Area */}
      <Card title="搜索条件" icon={<Filter style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", gap: "12px" }}>
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="输入关键词搜索小红书笔记..."
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
              disabled={loading || !searchKeyword.trim()}
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
                cursor: loading || !searchKeyword.trim() ? "not-allowed" : "pointer",
                opacity: loading || !searchKeyword.trim() ? 0.6 : 1,
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

          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>排序：</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "likes" | "time")}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                <option value="likes">按点赞数</option>
                <option value="time">按发布时间</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Heart style={{ width: "14px", height: "14px", color: "var(--color-danger)" }} />
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>最低点赞：</span>
              <input
                type="number"
                value={minLikes}
                onChange={(e) => setMinLikes(Number(e.target.value))}
                min={0}
                style={{
                  width: "80px",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Search Results */}
      {searchResult && (
        <Card
          title={`搜索结果 (${searchResult.total_found})`}
          icon={<BookOpen style={{ width: "18px", height: "18px" }} />}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {searchResult.notes.map((note) => (
              <div
                key={note.id}
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h4
                    style={{
                      fontSize: "0.9375rem",
                      fontWeight: 600,
                      color: "var(--text-main)",
                      marginBottom: "8px",
                      flex: 1,
                    }}
                  >
                    {note.title}
                  </h4>
                  <a
                    href={note.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 8px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--color-primary)20",
                      color: "var(--color-primary)",
                      fontSize: "0.75rem",
                      textDecoration: "none",
                      marginLeft: "8px",
                    }}
                  >
                    <ExternalLink style={{ width: "12px", height: "12px" }} />
                    查看
                  </a>
                </div>

                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    marginBottom: "12px",
                  }}
                >
                  {expandedNotes.has(note.id)
                    ? note.content
                    : note.content.slice(0, 150) + (note.content.length > 150 ? "..." : "")}
                </p>

                {note.content.length > 150 && (
                  <button
                    onClick={() => toggleNoteExpand(note.id)}
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
                      marginBottom: "12px",
                    }}
                  >
                    {expandedNotes.has(note.id) ? (
                      <>
                        <ChevronUp style={{ width: "14px", height: "14px" }} />
                        收起
                      </>
                    ) : (
                      <>
                        <ChevronDown style={{ width: "14px", height: "14px" }} />
                        展开
                      </>
                    )}
                  </button>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    作者：{note.author}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "0.8125rem",
                      color: "var(--color-danger)",
                    }}
                  >
                    <Heart style={{ width: "14px", height: "14px" }} />
                    {note.likes.toLocaleString()}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    收藏：{note.collects.toLocaleString()}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    评论：{note.comments_count.toLocaleString()}
                  </span>
                  {note.published_at && (
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      {new Date(note.published_at).toLocaleDateString("zh-CN")}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setNoteId(note.id);
                      setActiveTab("comments");
                      toast.info("已切换到评论获取标签");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: "var(--color-primary)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      marginLeft: "auto",
                    }}
                  >
                    <MessageCircle style={{ width: "12px", height: "12px" }} />
                    获取评论
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!searchResult && !loading && (
        <EmptyState
          icon={Search}
          title="开始搜索"
          description="输入关键词搜索小红书高赞笔记"
        />
      )}
    </div>
  );

  const renderTrendsTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Trends Input */}
      <Card title="趋势分析" icon={<TrendingUp style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", gap: "12px" }}>
          <input
            type="text"
            value={trendsKeyword}
            onChange={(e) => setTrendsKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTrends()}
            placeholder="输入关键词分析小红书趋势..."
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
            onClick={handleTrends}
            disabled={loading || !trendsKeyword.trim()}
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
              cursor: loading || !trendsKeyword.trim() ? "not-allowed" : "pointer",
              opacity: loading || !trendsKeyword.trim() ? 0.6 : 1,
            }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="animate-spin">⟳</span>
                分析中...
              </span>
            ) : (
              <>
                <TrendingUp style={{ width: "16px", height: "16px" }} />
                分析趋势
              </>
            )}
          </button>
        </div>
      </Card>

      {/* Trends Results */}
      {trendsResult && (
        <>
          <Card
            title="分析总结"
            icon={<Lightbulb style={{ width: "18px", height: "18px" }} />}
          >
            <p
              style={{
                fontSize: "0.9375rem",
                color: "var(--text-main)",
                lineHeight: 1.8,
                padding: "8px",
              }}
            >
              {trendsResult.analysis.summary}
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "12px" }}>
              基于 {trendsResult.based_on_notes} 条笔记分析
            </p>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
            <Card title="热门话题" icon={<Zap style={{ width: "18px", height: "18px" }} />}>
              <ul style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {trendsResult.analysis.hot_topics.map((topic, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-hover)",
                      fontSize: "0.875rem",
                      color: "var(--text-main)",
                    }}
                  >
                    <span
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: i < 3 ? "var(--color-primary)" : "var(--border-light)",
                        color: "white",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {i + 1}
                    </span>
                    {topic}
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="热门标签" icon={<Hash style={{ width: "18px", height: "18px" }} />}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {trendsResult.analysis.trending_tags.map((tag, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-full)",
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border-light)",
                      fontSize: "0.8125rem",
                      color: "var(--color-primary)",
                    }}
                  >
                    {tag.tag}
                    <span style={{ color: "var(--text-muted)", marginLeft: "4px" }}>({tag.frequency})</span>
                  </span>
                ))}
              </div>
            </Card>

            <Card title="内容模式" icon={<BookOpen style={{ width: "18px", height: "18px" }} />}>
              <ul style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {trendsResult.analysis.content_patterns.map((pattern, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-hover)",
                      fontSize: "0.875rem",
                      color: "var(--text-main)",
                    }}
                  >
                    {pattern}
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="高互动因素" icon={<Heart style={{ width: "18px", height: "18px" }} />}>
              <ul style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {trendsResult.analysis.engagement_factors.map((factor, i) => (
                  <li
                    key={i}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-hover)",
                      fontSize: "0.875rem",
                      color: "var(--text-main)",
                    }}
                  >
                    {factor}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      {!trendsResult && !loading && (
        <EmptyState
          icon={TrendingUp}
          title="趋势分析"
          description="输入关键词分析小红书热门趋势和内容模式"
        />
      )}
    </div>
  );

  const renderCommentsTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Comments Input */}
      <Card title="获取评论" icon={<MessageCircle style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", gap: "12px" }}>
          <input
            type="text"
            value={noteId}
            onChange={(e) => setNoteId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleComments()}
            placeholder="输入小红书笔记 ID..."
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
            onClick={handleComments}
            disabled={loading || !noteId.trim()}
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
              cursor: loading || !noteId.trim() ? "not-allowed" : "pointer",
              opacity: loading || !noteId.trim() ? 0.6 : 1,
            }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="animate-spin">⟳</span>
                获取中...
              </span>
            ) : (
              <>
                <MessageCircle style={{ width: "16px", height: "16px" }} />
                获取评论
              </>
            )}
          </button>
        </div>
      </Card>

      {/* Comments Results */}
      {commentsResult && (
        <Card
          title={`评论列表 (${commentsResult.total_comments})`}
          icon={<Users style={{ width: "18px", height: "18px" }} />}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {commentsResult.comments.map((comment) => (
              <div
                key={comment.id}
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--color-primary)",
                    }}
                  >
                    {comment.author}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {comment.is_top && (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--color-warning)20",
                          color: "var(--color-warning)",
                          fontSize: "0.75rem",
                        }}
                      >
                        置顶
                      </span>
                    )}
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "0.8125rem",
                        color: "var(--color-danger)",
                      }}
                    >
                      <Heart style={{ width: "14px", height: "14px" }} />
                      {comment.likes.toLocaleString()}
                    </span>
                  </div>
                </div>

                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--text-main)",
                    lineHeight: 1.6,
                  }}
                >
                  {expandedComments.has(comment.id)
                    ? comment.content
                    : comment.content.slice(0, 200) + (comment.content.length > 200 ? "..." : "")}
                </p>

                {comment.content.length > 200 && (
                  <button
                    onClick={() => {
                      setExpandedComments((prev) => {
                        const next = new Set(prev);
                        if (next.has(comment.id)) next.delete(comment.id);
                        else next.add(comment.id);
                        return next;
                      });
                    }}
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
                    {expandedComments.has(comment.id) ? (
                      <>
                        <ChevronUp style={{ width: "14px", height: "14px" }} />
                        收起
                      </>
                    ) : (
                      <>
                        <ChevronDown style={{ width: "14px", height: "14px" }} />
                        展开
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!commentsResult && !loading && (
        <EmptyState
          icon={MessageCircle}
          title="获取评论"
          description="输入笔记 ID 获取小红书评论（按点赞排序）"
        />
      )}
    </div>
  );

  return (
    <PageContainer>
      <PageHeader
        title="小红书分析工具"
        subtitle="搜索高赞内容、分析趋势、获取评论"
        icon={Search}
      />
      <PageContent maxWidth="1200px">
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {renderTabs()}
          {renderCookieConfig()}

          {loading && !searchResult && !trendsResult && !commentsResult ? (
            <LoadingState message="加载中..." />
          ) : (
            <>
              {activeTab === "search" && renderSearchTab()}
              {activeTab === "trends" && renderTrendsTab()}
              {activeTab === "comments" && renderCommentsTab()}
            </>
          )}
        </div>
      </PageContent>
    </PageContainer>
  );
}
