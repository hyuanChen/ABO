import { useState, useEffect, useMemo } from "react";
import { ExternalLink, Link2, Tag, Clock, Loader2, BookOpen } from "lucide-react";
import { api } from "../../core/api";
import type { WikiType } from "./Wiki";

interface WikiPageData {
  slug: string;
  wiki_type: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
  sources: string[];
  backlinks: string[];
  created: string;
  updated: string;
}

interface Props {
  wikiType: WikiType;
  slug: string;
  onNavigateToPage: (slug: string) => void;
}

// ── Simple Markdown to HTML converter ──────────────────────────────────────

function markdownToHtml(md: string): string {
  let html = md;

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre style="background:var(--bg-hover);padding:16px;border-radius:8px;overflow-x:auto;font-size:0.8125rem;line-height:1.6;border:1px solid var(--border-light);margin:12px 0"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-hover);padding:2px 6px;border-radius:4px;font-size:0.85em">$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-family:\'M PLUS Rounded 1c\',sans-serif;font-size:1.125rem;font-weight:700;color:var(--text-main);margin:24px 0 12px;line-height:1.4">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-family:\'M PLUS Rounded 1c\',sans-serif;font-size:1.25rem;font-weight:700;color:var(--text-main);margin:28px 0 14px;line-height:1.4">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-family:\'M PLUS Rounded 1c\',sans-serif;font-size:1.5rem;font-weight:700;color:var(--text-main);margin:32px 0 16px;line-height:1.4">$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:var(--text-main)">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" style="color:var(--color-primary);text-decoration:underline;text-underline-offset:2px">$1</a>'
  );

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li style="margin:4px 0;line-height:1.6">$1</li>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(
    /(<li[^>]*>.*?<\/li>\n?)+/g,
    (match) => `<ul style="padding-left:20px;margin:8px 0;list-style-type:disc">${match}</ul>`
  );

  // Blockquotes
  html = html.replace(
    /^> (.+)$/gm,
    '<blockquote style="border-left:3px solid var(--color-primary);padding:8px 16px;margin:12px 0;color:var(--text-secondary);background:rgba(188,164,227,0.06);border-radius:0 6px 6px 0">$1</blockquote>'
  );

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border-light);margin:24px 0" />');

  // Paragraphs — wrap remaining lines (skip already wrapped HTML)
  html = html.replace(/^(?!<[a-z/])((?:(?!^\s*$).)+)$/gm, '<p style="margin:8px 0;line-height:1.7;color:var(--text-secondary)">$1</p>');

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Component ──────────────────────────────────────────────────────────────

export default function WikiPageView({ wikiType, slug, onNavigateToPage }: Props) {
  const [page, setPage] = useState<WikiPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchPage() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get<WikiPageData>(`/api/wiki/${wikiType}/page/${slug}`);
        if (!cancelled) setPage(data);
      } catch (err) {
        if (!cancelled) {
          setError("加载页面失败");
          setPage(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPage();
    return () => { cancelled = true; };
  }, [wikiType, slug]);

  // Parse wikilinks in rendered HTML and replace with clickable spans
  const renderedContent = useMemo(() => {
    if (!page?.content) return "";
    let html = markdownToHtml(page.content);

    // Replace [[wikilinks]] with clickable elements
    // Using a data attribute so we can handle clicks via delegation
    html = html.replace(
      /\[\[([^\]]+)\]\]/g,
      (_match, linkText) => {
        const linkSlug = linkText.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
        return `<span class="wiki-link" data-slug="${linkSlug}" style="color:var(--color-primary);cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;font-weight:600">${linkText}</span>`;
      }
    );

    return html;
  }, [page?.content]);

  // Handle clicks on wikilinks
  function handleContentClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("wiki-link")) {
      const linkSlug = target.getAttribute("data-slug");
      if (linkSlug) {
        onNavigateToPage(linkSlug);
      }
    }
  }

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          color: "var(--text-muted)",
        }}
      >
        <Loader2
          style={{
            width: "32px",
            height: "32px",
            animation: "spin 1s linear infinite",
          }}
        />
        <span style={{ fontSize: "0.9375rem" }}>加载页面...</span>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          color: "var(--text-muted)",
          padding: "40px",
        }}
      >
        <p style={{ fontSize: "1rem", fontWeight: 600 }}>
          {error || "页面未找到"}
        </p>
        <p style={{ fontSize: "0.875rem", opacity: 0.7 }}>
          请检查页面链接是否正确
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "clamp(24px, 3vw, 40px)",
      }}
    >
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        {/* Title */}
        <h1
          style={{
            fontFamily: "'M PLUS Rounded 1c', sans-serif",
            fontSize: "clamp(1.5rem, 3vw, 2rem)",
            fontWeight: 700,
            color: "var(--text-main)",
            marginBottom: "16px",
            lineHeight: 1.3,
          }}
        >
          {page.title}
        </h1>

        {/* Meta row: tags + date */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "24px",
          }}
        >
          {/* Category badge */}
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "var(--radius-full)",
              background: getCategoryColor(page.category, 0.15),
              color: getCategoryTextColor(page.category),
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            {getCategoryLabel(page.category)}
          </span>

          {/* Tags */}
          {page.tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 10px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-hover)",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                fontWeight: 500,
              }}
            >
              <Tag style={{ width: "10px", height: "10px" }} />
              {tag}
            </span>
          ))}

          {/* Updated date + Open in Obsidian */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}
            >
              <Clock style={{ width: "12px", height: "12px" }} />
              更新于 {page.updated}
            </span>
            <button
              onClick={() => {
                const vaultName = "obsidian";
                const wikiDir = wikiType === "intel" ? "Wiki-Intel" : "Wiki-Lit";
                const filePath = `${wikiDir}/${slug}.md`;
                window.location.href = `obsidian://open?vault=${vaultName}&file=${encodeURIComponent(filePath)}`;
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
                background: "rgba(188, 164, 227, 0.1)",
                border: "1px solid rgba(188, 164, 227, 0.2)",
                color: "var(--color-primary-dark)",
                cursor: "pointer",
                fontSize: "0.6875rem",
                fontWeight: 600,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(188, 164, 227, 0.2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(188, 164, 227, 0.1)"; }}
            >
              <BookOpen style={{ width: "11px", height: "11px" }} />
              Obsidian
            </button>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            height: "1px",
            background: "var(--border-light)",
            marginBottom: "24px",
          }}
        />

        {/* Markdown content */}
        <div
          onClick={handleContentClick}
          dangerouslySetInnerHTML={{ __html: renderedContent }}
          style={{
            fontSize: "0.9375rem",
            lineHeight: 1.8,
            color: "var(--text-secondary)",
            wordBreak: "break-word",
          }}
        />

        {/* Sources section */}
        {page.sources.length > 0 && (
          <div style={{ marginTop: "40px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <Link2 style={{ width: "16px", height: "16px", color: "var(--text-muted)" }} />
              <h3
                style={{
                  fontFamily: "'M PLUS Rounded 1c', sans-serif",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                }}
              >
                来源
              </h3>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {page.sources.map((source, i) => (
                <SourceItem key={i} source={source} />
              ))}
            </div>
          </div>
        )}

        {/* Backlinks section */}
        {page.backlinks.length > 0 && (
          <div style={{ marginTop: "32px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <Link2
                style={{
                  width: "16px",
                  height: "16px",
                  color: "var(--text-muted)",
                  transform: "rotate(135deg)",
                }}
              />
              <h3
                style={{
                  fontFamily: "'M PLUS Rounded 1c', sans-serif",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                }}
              >
                反向链接
              </h3>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {page.backlinks.map((bl) => (
                <button
                  key={bl}
                  onClick={() => onNavigateToPage(bl)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--radius-full)",
                    background: "rgba(188, 164, 227, 0.1)",
                    border: "1px solid rgba(188, 164, 227, 0.2)",
                    color: "var(--color-primary-dark)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(188, 164, 227, 0.2)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(188, 164, 227, 0.1)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {bl}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────

function SourceItem({ source }: { source: string }) {
  // Parse source: "card:abc123" or "url:https://..." or "paper:xyz"
  if (source.startsWith("card:")) {
    const cardId = source.slice(5);
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-hover)",
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "var(--radius-full)",
            background: "rgba(188, 164, 227, 0.15)",
            color: "var(--color-primary-dark)",
            fontSize: "0.6875rem",
            fontWeight: 600,
          }}
        >
          卡片
        </span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {cardId}
        </span>
      </div>
    );
  }

  if (source.startsWith("url:")) {
    const url = source.slice(4);
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-hover)",
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
          textDecoration: "none",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = "rgba(188, 164, 227, 0.1)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = "var(--bg-hover)";
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "var(--radius-full)",
            background: "rgba(168, 230, 207, 0.15)",
            color: "#5BA88C",
            fontSize: "0.6875rem",
            fontWeight: 600,
          }}
        >
          链接
        </span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {url}
        </span>
        <ExternalLink style={{ width: "12px", height: "12px", flexShrink: 0, opacity: 0.5 }} />
      </a>
    );
  }

  if (source.startsWith("paper:")) {
    const paperId = source.slice(6);
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-hover)",
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "var(--radius-full)",
            background: "rgba(196, 181, 253, 0.15)",
            color: "#8B7BBD",
            fontSize: "0.6875rem",
            fontWeight: 600,
          }}
        >
          论文
        </span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {paperId}
        </span>
      </div>
    );
  }

  // Fallback: raw text
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-hover)",
        fontSize: "0.8125rem",
        color: "var(--text-secondary)",
      }}
    >
      {source}
    </div>
  );
}

// ── Category helpers ───────────────────────────────────────────────────────

function getCategoryColor(category: string, opacity: number): string {
  const colors: Record<string, string> = {
    entity: `rgba(188, 164, 227, ${opacity})`,
    concept: `rgba(168, 230, 207, ${opacity})`,
    paper: `rgba(196, 181, 253, ${opacity})`,
    topic: `rgba(253, 186, 116, ${opacity})`,
    overview: `rgba(255, 183, 178, ${opacity})`,
  };
  return colors[category] ?? `rgba(188, 164, 227, ${opacity})`;
}

function getCategoryTextColor(category: string): string {
  const colors: Record<string, string> = {
    entity: "#8B6DC0",
    concept: "#5BA88C",
    paper: "#7C6BB0",
    topic: "#C78830",
    overview: "#D48984",
  };
  return colors[category] ?? "var(--color-primary-dark)";
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    entity: "实体",
    concept: "概念",
    paper: "论文",
    topic: "主题",
    overview: "概览",
  };
  return labels[category] ?? category;
}
