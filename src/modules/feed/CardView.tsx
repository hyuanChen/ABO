import { Star, ChevronDown, ExternalLink } from "lucide-react";
import type { FeedCard } from "../../core/store";

interface Props {
  card: FeedCard;
  focused: boolean;
  onClick: () => void;
  onFeedback: (action: string) => void;
  onRating?: (rating: "like" | "neutral" | "dislike") => void;
  userRating?: "like" | "neutral" | "dislike" | null;
}

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
];

export default function CardView({ card, focused, onClick, onFeedback, onRating, userRating }: Props) {
  const scorePercent = Math.round(card.score * 100);

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
          ? "2px solid var(--color-primary)"
          : "1px solid var(--border-light)",
        boxShadow: focused
          ? "0 8px 32px rgba(188, 164, 227, 0.25), 0 0 0 4px rgba(188, 164, 227, 0.1)"
          : "var(--shadow-soft)",
        cursor: "pointer",
        transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: focused ? "scale(1.01)" : "scale(1)",
      }}
      onMouseEnter={(e) => {
        if (!focused) {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = "var(--shadow-medium)";
        }
      }}
      onMouseLeave={(e) => {
        if (!focused) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "var(--shadow-soft)";
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
              boxShadow: "0 0 12px rgba(188, 164, 227, 0.3)",
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

        {/* Module tag */}
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: "var(--radius-full)",
            background: "rgba(188, 164, 227, 0.12)",
            color: "var(--color-primary-dark)",
            border: "1px solid var(--border-light)",
          }}
        >
          {card.module_id}
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

      {/* Rating Section - 三级打分 */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 600 }}>
          内容评分
        </div>
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
                  padding: "10px 16px",
                  borderRadius: "var(--radius-full)",
                  background: isActive ? gradient : "var(--bg-card)",
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
                    e.currentTarget.style.background = "var(--bg-card)";
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
