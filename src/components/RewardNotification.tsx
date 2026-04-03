// src/components/RewardNotification.tsx
// Phase 4: Real-time reward notifications with animation

import { useEffect } from "react";
import { X, Sparkles, Heart, Brain } from "lucide-react";
import { useStore } from "../core/store";

interface RewardToastProps {
  id: string;
  action: string;
  xp: number;
  happiness_delta: number;
  san_delta: number;
  message?: string;
}

function RewardToast({
  id,
  action,
  xp,
  happiness_delta,
  san_delta,
  message,
}: RewardToastProps) {
  const { dismissReward, addXP } = useStore();

  useEffect(() => {
    // Add XP to global counter
    if (xp > 0) {
      addXP(xp);
    }

    // Auto dismiss after 5 seconds
    const timer = setTimeout(() => {
      dismissReward(id);
    }, 5000);

    return () => clearTimeout(timer);
  }, [id, xp, addXP, dismissReward]);

  const actionNames: Record<string, string> = {
    card_like: "点赞内容",
    card_save: "保存内容",
    card_dislike: "标记不喜欢",
    star_paper: "收藏论文",
    save_paper: "保存论文",
    read_paper: "阅读论文",
    daily_checkin: "每日签到",
    like_content: "喜欢内容",
  };

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl p-4 shadow-2xl border border-indigo-400/30 animate-in slide-in-from-right-full">
      {/* Sparkle background effect */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full blur-3xl" />
      </div>

      <div className="relative flex items-start gap-3">
        <div className="p-2 bg-white/20 rounded-lg">
          <Sparkles className="w-6 h-6 text-yellow-300" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold">{actionNames[action] || action}</span>
            <span className="px-2 py-0.5 bg-yellow-400/20 rounded text-yellow-300 text-sm font-bold">
              +{xp} XP
            </span>
          </div>

          {message && (
            <p className="text-sm text-indigo-100 mt-1 truncate">{message}</p>
          )}

          {/* Stats deltas */}
          <div className="flex items-center gap-3 mt-2 text-xs">
            {happiness_delta > 0 && (
              <span className="flex items-center gap-1 text-rose-300">
                <Heart className="w-3 h-3" />+{happiness_delta} 幸福
              </span>
            )}
            {happiness_delta < 0 && (
              <span className="flex items-center gap-1 text-slate-400">
                <Heart className="w-3 h-3" />
                {happiness_delta} 幸福
              </span>
            )}
            {san_delta > 0 && (
              <span className="flex items-center gap-1 text-cyan-300">
                <Brain className="w-3 h-3" />+{san_delta} SAN
              </span>
            )}
            {san_delta < 0 && (
              <span className="flex items-center gap-1 text-slate-400">
                <Brain className="w-3 h-3" />
                {san_delta} SAN
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => dismissReward(id)}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function RewardNotificationContainer() {
  const { rewardQueue } = useStore();

  if (rewardQueue.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] w-80 space-y-2 pointer-events-auto">
      {rewardQueue.map((reward) => (
        <RewardToast key={reward.id} {...reward} />
      ))}
    </div>
  );
}
