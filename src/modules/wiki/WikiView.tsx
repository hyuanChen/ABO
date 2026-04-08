import { useState, useEffect } from "react";
import { Map as MapIcon, FileText } from "lucide-react";
import { PageContainer, PageHeader, EmptyState } from "../../components/Layout";
import { api } from "../../core/api";
import WikiSidebar from "./WikiSidebar";
import WikiPageView from "./WikiPageView";
import type { WikiType, ViewMode } from "./Wiki";

interface Props {
  wikiType: WikiType;
  activePage: string | null;
  viewMode: ViewMode;
  onBack: () => void;
  onSelectPage: (slug: string) => void;
  onNavigateToPage: (slug: string) => void;
  onSetViewMode: (mode: ViewMode) => void;
}

export default function WikiView({
  wikiType,
  activePage,
  viewMode,
  onBack,
  onSelectPage,
  onNavigateToPage,
  onSetViewMode,
}: Props) {
  const wikiTitle = wikiType === "intel" ? "情报库 Wiki" : "文献库 Wiki";

  return (
    <PageContainer>
      {/* Header with view mode toggle */}
      <PageHeader
        title={wikiTitle}
        subtitle={wikiType === "intel" ? "行业动态 · 竞品 · 趋势" : "论文 · 方法 · 领域"}
        actions={
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={() => onSetViewMode("pages")}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-full)",
                background: viewMode === "pages"
                  ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
                  : "var(--bg-card)",
                color: viewMode === "pages" ? "white" : "var(--text-secondary)",
                border: viewMode === "pages" ? "none" : "1px solid var(--border-light)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                fontSize: "0.8125rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <FileText style={{ width: "14px", height: "14px" }} />
              页面
            </button>
            <button
              onClick={() => onSetViewMode("mindmap")}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-full)",
                background: viewMode === "mindmap"
                  ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
                  : "var(--bg-card)",
                color: viewMode === "mindmap" ? "white" : "var(--text-secondary)",
                border: viewMode === "mindmap" ? "none" : "1px solid var(--border-light)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                fontSize: "0.8125rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <MapIcon style={{ width: "14px", height: "14px" }} />
              脑图
            </button>
          </div>
        }
      />

      {/* Main body: sidebar + content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* Sidebar */}
        <WikiSidebar
          wikiType={wikiType}
          activePage={activePage}
          onSelectPage={onSelectPage}
          onBack={onBack}
        />

        {/* Content area */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {viewMode === "mindmap" ? (
            <WikiMindMapPlaceholder wikiType={wikiType} onSelectPage={onNavigateToPage} />
          ) : activePage ? (
            <WikiPageView
              wikiType={wikiType}
              slug={activePage}
              onNavigateToPage={onNavigateToPage}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="选择一个页面"
              description="从左侧导航树中选择一个页面开始阅读"
            />
          )}
        </div>
      </div>
    </PageContainer>
  );
}

// ── Mindmap placeholder (can be upgraded to full React Flow later) ──────────

interface GraphNode {
  id: string;
  label: string;
  category: string;
  size: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const CATEGORY_COLORS: Record<string, string> = {
  entity: "#BCA4E3",
  concept: "#A8E6CF",
  paper: "#C4B5FD",
  topic: "#FDBA74",
  overview: "#FFB7B2",
};

interface MindMapPlaceholderProps {
  wikiType: WikiType;
  onSelectPage: (slug: string) => void;
}

function WikiMindMapPlaceholder({ wikiType, onSelectPage }: MindMapPlaceholderProps) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchGraph() {
      setLoading(true);
      try {
        const data = await api.get<GraphData>(`/api/wiki/${wikiType}/graph`);
        if (!cancelled) setGraph(data);
      } catch {
        if (!cancelled) setGraph({ nodes: [], edges: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGraph();
    return () => { cancelled = true; };
  }, [wikiType]);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            border: "3px solid var(--border-light)",
            borderTopColor: "var(--color-primary)",
            animation: "spin 1s linear infinite",
          }}
        />
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <EmptyState
        icon={MapIcon}
        title="暂无脑图数据"
        description="添加更多 Wiki 页面和链接后，脑图将自动生成"
      />
    );
  }

  // Simple circle-packing layout
  const nodes = graph.nodes;
  const centerX = 400;
  const centerY = 300;
  const radius = Math.min(250, nodes.length * 20);
  const maxSize = Math.max(...nodes.map((n) => n.size), 1);

  const positionedNodes = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const r = radius * (0.5 + 0.5 * (node.size / maxSize));
    return {
      ...node,
      x: centerX + r * Math.cos(angle),
      y: centerY + r * Math.sin(angle),
    };
  });

  const nodePositionMap = new globalThis.Map(positionedNodes.map((n) => [n.id, n]));

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: "24px",
        position: "relative",
      }}
    >
      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: color,
              }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
              {cat === "entity" ? "实体" : cat === "concept" ? "概念" : cat === "paper" ? "论文" : cat === "topic" ? "主题" : "概览"}
            </span>
          </div>
        ))}
      </div>

      <svg
        width="800"
        height="600"
        viewBox="0 0 800 600"
        style={{ width: "100%", maxWidth: "800px", height: "auto" }}
      >
        {/* Edges */}
        {graph.edges.map((edge, i) => {
          const source = nodePositionMap.get(edge.source);
          const target = nodePositionMap.get(edge.target);
          if (!source || !target) return null;
          return (
            <line
              key={`edge-${i}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="var(--border-color)"
              strokeWidth={1}
              strokeOpacity={0.4}
            />
          );
        })}

        {/* Nodes */}
        {positionedNodes.map((node) => {
          const nodeSize = 10 + node.size * 4;
          const color = CATEGORY_COLORS[node.category] ?? "var(--color-primary)";
          const isHovered = hoveredNode === node.id;

          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={isHovered ? nodeSize + 4 : nodeSize}
                fill={color}
                fillOpacity={isHovered ? 0.9 : 0.6}
                stroke={isHovered ? color : "transparent"}
                strokeWidth={2}
                style={{ cursor: "pointer", transition: "all 0.2s ease" }}
                onClick={() => onSelectPage(node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              />
              <text
                x={node.x}
                y={node.y + nodeSize + 14}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize="11"
                fontWeight={isHovered ? 700 : 500}
                style={{ pointerEvents: "none" }}
              >
                {node.label.length > 8 ? node.label.slice(0, 8) + "..." : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
