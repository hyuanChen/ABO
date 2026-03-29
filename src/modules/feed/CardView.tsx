import { Bookmark, X, Star, ChevronDown, ExternalLink } from "lucide-react";
import type { FeedCard } from "../../core/store";

interface Props {
  card: FeedCard;
  focused: boolean;
  onClick: () => void;
  onFeedback: (action: string) => void;
}

const ACTIONS = [
  { key: "save",      label: "S 保存", Icon: Bookmark,    color: "text-emerald-500 hover:border-emerald-300" },
  { key: "skip",      label: "X 跳过", Icon: X,           color: "text-slate-400 hover:border-slate-300" },
  { key: "star",      label: "F 精华", Icon: Star,        color: "text-amber-500 hover:border-amber-300" },
  { key: "deep_dive", label: "D 深度", Icon: ChevronDown, color: "text-indigo-500 hover:border-indigo-300" },
];

export default function CardView({ card, focused, onClick, onFeedback }: Props) {
  return (
    <article
      onClick={onClick}
      className={`p-4 rounded-2xl bg-white dark:bg-slate-800/60 border transition-all duration-150 cursor-pointer
        ${focused
          ? "border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900/50"
          : "border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600"
        }`}
    >
      {/* 头部：评分条 + 来源 */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all"
            style={{ width: `${Math.round(card.score * 100)}%` }}
          />
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
          {Math.round(card.score * 100)}% · {card.module_id}
        </span>
        {card.source_url && (
          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-slate-400 hover:text-indigo-500 transition-colors"
            aria-label="在浏览器打开"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden />
          </a>
        )}
      </div>

      {/* 标题 */}
      <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug mb-1.5">
        {card.title}
      </h3>

      {/* 摘要 */}
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
        {card.summary}
      </p>

      {/* 标签 */}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {card.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700
                         text-slate-500 dark:text-slate-400"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-1.5">
        {ACTIONS.map(({ key, label, Icon, color }) => (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); onFeedback(key); }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border
              border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${color}`}
          >
            <Icon className="w-3 h-3" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </article>
  );
}
