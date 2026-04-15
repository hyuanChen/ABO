import { Star, ChevronDown, ExternalLink, BookHeart } from "lucide-react";
import { useStore, type FeedCard } from "../../core/store";

interface Props {
  card: FeedCard;
  focused: boolean;
  onClick: () => void;
  onFeedback: (action: string) => void;
  onRating?: (rating: "like" | "neutral" | "dislike") => void;
  userRating?: "like" | "neutral" | "dislike" | null;
}

// Source icons mapping for all crawler types
const SOURCE_ICONS: Record<string, string> = {
  arxiv: "📄",
  "semantic-scholar": "🔬",
  "semantic_scholar": "🔬",
  "semantic_scholar_tracker": "🔬",
  bilibili: "📺",
  xiaohongshu: "📕",
  xiaoyuzhou: "🎧",
  zhihu: "❓",
  rss: "📰",
  "rss-aggregator": "📰",
  podcast: "🎙️",
  folder_monitor: "📁",
  "folder-monitor": "📁",
  folder: "📁",
};

// 三级打分操作
const RATING_ACTIONS = [
  {
    key: "like",
    label: "喜欢",
    emoji: "👍",
    shortcut: "L",
    gradient: "linear-gradient(135deg, #A8E6CF, #7DD3C0)",
    shadow: "rgba(168, 230, 207, 0.4)",
    color: "#5BA88C",
  },
  {
    key: "neutral",
    label: "中立",
    emoji: "😐",
    shortcut: "N",
    gradient: "linear-gradient(135deg, #FFE4B5, #F5C88C)",
    shadow: "rgba(255, 228, 181, 0.4)",
    color: "#D4A574",
  },
  {
    key: "dislike",
    label: "不喜欢",
    emoji: "👎",
    shortcut: "D",
    gradient: "linear-gradient(135deg, #FFB7B2, #FF9E9A)",
    shadow: "rgba(255, 183, 178, 0.4)",
    color: "#D48984",
  },
];

// 扩展操作
const EXT_ACTIONS = [
  {
    key: "save",
    label: "保存",
    shortcut: "S",
    Icon: Star,
    gradient: "linear-gradient(135deg, #BCA4E3, #9D7BDB)",
    shadow: "rgba(188, 164, 227, 0.4)",
  },
  {
    key: "skip",
    label: "跳过",
    shortcut: "X",
    Icon: ChevronDown,
    gradient: "linear-gradient(135deg, #E8E8E8, #D0D0D0)",
    shadow: "rgba(200, 200, 200, 0.3)",
  },
  {
    key: "wiki",
    label: "摘录Wiki",
    shortcut: "W",
    Icon: BookHeart,
    gradient: "linear-gradient(135deg, #C4B5FD, #A78BFA)",
    shadow: "rgba(196, 181, 253, 0.4)",
  },
];

function metadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataStringList(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function proxiedImage(url: string): string {
  if (!url) return "";
  return `http://127.0.0.1:8765/api/proxy/image?url=${encodeURIComponent(url)}`;
}

export default function CardView({ card, focused, onClick, onFeedback, onRating, userRating }: Props) {
  const scorePercent = Math.round(card.score * 100);
  const showcaseMode = useStore((s) => s.showcaseMode);
  const isBilibiliCard = card.module_id === "bilibili-tracker";
  const upName = metadataString(card.metadata, "up_name");
  const dynamicType = metadataString(card.metadata, "dynamic_type");
  const published = metadataString(card.metadata, "published");
  const thumbnail = metadataString(card.metadata, "thumbnail");
  const thumbnailUrl = thumbnail ? proxiedImage(thumbnail) : "";
  const paperTrackingType = metadataString(card.metadata, "paper_tracking_type");
  const paperTrackingLabels = metadataStringList(card.metadata, "paper_tracking_labels");
  const paperTrackingLabel = paperTrackingLabels[0] || metadataString(card.metadata, "paper_tracking_label");
  const sourcePaperTitle = metadataString(card.metadata, "source_paper_title");
  const bilibiliTypeLabel =
    dynamicType === "video"
      ? "视频"
      : dynamicType === "article"
      ? "专栏"
      : dynamicType === "image"
      ? "图文"
      : dynamicType === "text"
      ? "动态"
      : "";

  const focusedShadow = showcaseMode
    ? "0 8px 40px rgba(188, 164, 227, 0.35), 0 0 0 4px rgba(188, 164, 227, 0.15), 0 0 60px rgba(188, 164, 227, 0.08)"
    : "0 8px 32px rgba(188, 164, 227, 0.25), 0 0 0 4px rgba(188, 164, 227, 0.1)";
  const normalShadow = showcaseMode ? "var(--shadow-medium)" : "var(--shadow-soft)";
  const hoverShadow = showcaseMode ? "var(--shadow-float)" : "var(--shadow-medium)";

  return (
    <article
      onClick={onClick}
      style={{
        position: "relative",
        padding: "24px",
        borderRadius: "var(--radius-md)",
        background: focused ? "var(--bg-panel)" : "var(--bg-card)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        border: focused
          ? (showcaseMode ? "2px solid var(--color-primary-light)" : "2px solid var(--color-primary)")
          : (showcaseMode ? "1px solid var(--border-color)" : "1px solid var(--border-light)"),
        boxShadow: focused ? focusedShadow : normalShadow,
        cursor: "pointer",
        transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: focused ? "scale(1.01)" : "scale(1)",
      }}
      onMouseEnter={(e) => {
        if (!focused) {
          e.currentTarget.style.transform = showcaseMode ? "translateY(-6px) scale(1.005)" : "translateY(-4px)";
          e.currentTarget.style.boxShadow = hoverShadow;
          if (showcaseMode) e.currentTarget.style.borderColor = "var(--border-medium)";
        }
      }}
      onMouseLeave={(e) => {
        if (!focused) {
          e.currentTarget.style.transform = "translateY(0) scale(1)";
          e.currentTarget.style.boxShadow = normalShadow;
          if (showcaseMode) e.currentTarget.style.borderColor = "var(--border-color)";
        }
      }}
    >
      {/* Focused indicator - left gradient bar */}
      {focused && (
        <div
          style={{
            position: "absolute",
            left: "-2px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "4px",
            height: "48px",
            background: "linear-gradient(180deg, var(--color-primary), var(--color-secondary))",
            borderRadius: "0 4px 4px 0",
          }}
        />
      )}

      {/* User Rating Badge */}
      {userRating && (
        <div
          style={{
            position: "absolute",
            top: "-8px",
            right: "16px",
            padding: "6px 14px",
            borderRadius: "var(--radius-full)",
            background: userRating === "like"
              ? "linear-gradient(135deg, #A8E6CF, #7DD3C0)"
              : userRating === "neutral"
              ? "linear-gradient(135deg, #FFE4B5, #F5C88C)"
              : "linear-gradient(135deg, #FFB7B2, #FF9E9A)",
            color: "white",
            fontSize: "0.8125rem",
            fontWeight: 700,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 10,
          }}
        >
          {userRating === "like" ? "👍 喜欢" : userRating === "neutral" ? "😐 中立" : "👎 不喜欢"}
        </div>
      )}

      {/* Header: Score bar + Source */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        {/* Score bar */}
        <div
          style={{
            flex: 1,
            height: "8px",
            background: "var(--bg-hover)",
            borderRadius: "var(--radius-full)",
            overflow: "hidden",
            boxShadow: "var(--shadow-inner)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${scorePercent}%`,
              background:
                scorePercent >= 80
                  ? "linear-gradient(90deg, #A8E6CF, #7DD3C0)"
                  : scorePercent >= 60
                  ? "linear-gradient(90deg, #BCA4E3, #9D7BDB)"
                  : "linear-gradient(90deg, #FFE4B5, #F5C88C)",
              borderRadius: "var(--radius-full)",
              transition: "width 0.5s ease",
              boxShadow: showcaseMode
                ? "0 0 16px rgba(188, 164, 227, 0.5), 0 0 32px rgba(188, 164, 227, 0.15)"
                : "0 0 12px rgba(188, 164, 227, 0.3)",
            }}
          />
        </div>

        {/* Score percentage */}
        <span
          style={{
            fontSize: "0.875rem",
            fontWeight: 700,
            color:
              scorePercent >= 80
                ? "#5BA88C"
                : scorePercent >= 60
                ? "var(--color-primary-dark)"
                : "#D4A574",
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          {scorePercent}%
        </span>

        {/* Source icon + Module tag */}
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: "var(--radius-full)",
            background: "rgba(188, 164, 227, 0.12)",
            color: "var(--color-primary-dark)",
            border: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
          title={card.module_id}
        >
          <span>{SOURCE_ICONS[card.module_id] || "📎"}</span>
          <span>{card.module_id}</span>
        </span>

        {/* External link */}
        {card.source_url && (
          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="在浏览器打开"
            style={{
              padding: "8px",
              borderRadius: "50%",
              color: "var(--text-muted)",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-primary)";
              e.currentTarget.style.background = "rgba(188, 164, 227, 0.1)";
              e.currentTarget.style.transform = "scale(1.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <ExternalLink style={{ width: "16px", height: "16px" }} aria-hidden />
          </a>
        )}
      </div>

      {isBilibiliCard && (upName || dynamicType || published) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "12px",
          }}
        >
          {upName && (
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "var(--text-main)",
              }}
            >
              @{upName}
            </span>
          )}
          {bilibiliTypeLabel && (
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
                background: "rgba(0, 174, 236, 0.12)",
                color: "#0087B8",
                border: "1px solid rgba(0, 174, 236, 0.18)",
              }}
            >
              {bilibiliTypeLabel}
            </span>
          )}
          {published && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {published.replace("T", " ").slice(0, 16)}
            </span>
          )}
        </div>
      )}

      {thumbnailUrl && (
        <div
          style={{
            marginBottom: "14px",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            border: "1px solid var(--border-light)",
            background: "var(--bg-hover)",
          }}
        >
          <img
            src={thumbnailUrl}
            alt={card.title}
            style={{
              width: "100%",
              maxHeight: "220px",
              objectFit: "cover",
              display: "block",
            }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      )}

      {/* Title */}
      <h3
        style={{
          fontFamily: "'M PLUS Rounded 1c', sans-serif",
          fontSize: "1rem",
          fontWeight: 700,
          color: focused ? "var(--text-main)" : "var(--text-secondary)",
          lineHeight: 1.5,
          marginBottom: "12px",
          transition: "color 0.2s ease",
        }}
      >
        {card.title}
      </h3>

      {(paperTrackingLabel || sourcePaperTitle) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "12px",
          }}
        >
          {paperTrackingLabel && (
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: "999px",
                background: "rgba(188, 164, 227, 0.12)",
                color: "var(--color-primary)",
                border: "1px solid rgba(188, 164, 227, 0.16)",
              }}
            >
              {paperTrackingType === "followup" ? "Follow Up" : "关键词"} · {paperTrackingLabel}
            </span>
          )}
          {paperTrackingType === "followup" && sourcePaperTitle && (
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: "999px",
                background: "rgba(123, 200, 240, 0.14)",
                color: "#2C7FB8",
                border: "1px solid rgba(123, 200, 240, 0.18)",
              }}
            >
              Source · {sourcePaperTitle}
            </span>
          )}
        </div>
      )}

      {/* Rating Section - 三级打分 (横排，移到摘要上方) */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          {RATING_ACTIONS.map(({ key, label, emoji, shortcut, gradient, shadow, color }) => {
            const isActive = userRating === key;
            return (
              <button
                key={key}
                onClick={(e) => {
                  e.stopPropagation();
                  onRating?.(key as "like" | "neutral" | "dislike");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "var(--radius-full)",
                  background: isActive ? gradient : "var(--bg-hover)",
                  border: isActive ? "1px solid transparent" : "1px solid var(--border-light)",
                  color: isActive ? "white" : color,
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  flex: 1,
                  justifyContent: "center",
                  boxShadow: isActive ? `0 4px 16px ${shadow}` : "none",
                  transform: isActive ? "scale(1.02)" : "scale(1)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = gradient;
                    e.currentTarget.style.color = "white";
                    e.currentTarget.style.borderColor = "transparent";
                    e.currentTarget.style.boxShadow = `0 4px 16px ${shadow}`;
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = color;
                    e.currentTarget.style.borderColor = "var(--border-light)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
              >
                <span style={{ fontSize: "1rem" }}>{emoji}</span>
                <span>{label}</span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    opacity: 0.7,
                    marginLeft: "2px",
                  }}
                >
                  {shortcut}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <p
        style={{
          fontSize: "0.9375rem",
          color: "var(--text-muted)",
          lineHeight: 1.7,
          marginBottom: "16px",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {card.summary}
      </p>

      {/* Tags */}
      {card.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
          {card.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: "var(--radius-full)",
                background: "linear-gradient(135deg, rgba(188, 164, 227, 0.12), rgba(255, 183, 178, 0.08))",
                color: "var(--color-primary-dark)",
                border: "1px solid var(--border-light)",
                transition: "all 0.2s ease",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(188, 164, 227, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Extended Actions */}
      <div style={{ display: "flex", gap: "10px" }}>
        {EXT_ACTIONS.map(({ key, label, shortcut, Icon, gradient, shadow }) => (
          <button
            key={key}
            onClick={(e) => {
              e.stopPropagation();
              onFeedback(key);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "var(--radius-full)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
              color: "var(--text-muted)",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
              flex: 1,
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = gradient;
              e.currentTarget.style.color = "white";
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.boxShadow = `0 4px 16px ${shadow}`;
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-card)";
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "var(--border-light)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <Icon style={{ width: "14px", height: "14px" }} aria-hidden />
            <span>{label}</span>
            <span style={{ fontSize: "0.625rem", opacity: 0.7, marginLeft: "2px" }}>
              {shortcut}
            </span>
          </button>
        ))}
      </div>
    </article>
  );
}
