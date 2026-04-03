// src/components/FeedSortControl.tsx
// Phase 2: Feed sorting mode control - default / prioritized / mixed

import { Sparkles, Clock, GitCommit } from "lucide-react";
import { useStore, FeedSortMode } from "../core/store";

type SortOption = {
  value: FeedSortMode;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const sortOptions: SortOption[] = [
  {
    value: "default",
    label: "最新",
    description: "按时间排序",
    icon: <Clock className="w-4 h-4" />,
  },
  {
    value: "prioritized",
    label: "智能",
    description: "按偏好排序",
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    value: "mixed",
    label: "混合",
    description: "AI+偏好混合",
    icon: <GitCommit className="w-4 h-4" />,
  },
];

export default function FeedSortControl() {
  const { feedSortMode, setFeedSortMode } = useStore();

  return (
    <div
      className="flex items-center gap-1 rounded-lg p-1"
      style={{ background: "var(--bg-hover)" }}
    >
      {sortOptions.map((option) => {
        const isActive = feedSortMode === option.value;
        return (
          <button
            key={option.value}
            onClick={() => setFeedSortMode(option.value)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all"
            style={{
              background: isActive ? "var(--color-primary)" : "transparent",
              color: isActive ? "white" : "var(--text-muted)",
              boxShadow: isActive ? "var(--shadow-soft)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "var(--bg-card)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
            title={option.description}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
