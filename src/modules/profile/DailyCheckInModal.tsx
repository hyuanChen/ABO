// src/modules/profile/DailyCheckInModal.tsx
import { useState } from "react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";

interface Props {
  onClose: () => void;
}

export default function DailyCheckInModal({ onClose }: Props) {
  const [san, setSan] = useState(5);
  const [happiness, setHappiness] = useState(5);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit() {
    setSaving(true);
    try {
      await Promise.all([
        api.post("/api/profile/san", { score: san }),
        api.post("/api/profile/happiness", { score: happiness }),
      ]);
      toast.success("每日打卡完成");
      onClose();
    } catch {
      toast.error("打卡失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">每日状态打卡</h2>
        <p className="text-sm text-slate-400 mb-5">
          记录今天的状态，帮助追踪成长曲线。
        </p>

        {/* SAN */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-pink-400 mb-2">
            SAN 值 <span className="text-white">— {san}/10</span>
          </label>
          <input
            type="range" min="1" max="10" value={san}
            onChange={(e) => setSan(Number(e.target.value))}
            className="w-full accent-pink-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>精神崩溃</span><span>心如止水</span>
          </div>
        </div>

        {/* Happiness */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-purple-400 mb-2">
            幸福感 <span className="text-white">— {happiness}/10</span>
          </label>
          <input
            type="range" min="1" max="10" value={happiness}
            onChange={(e) => setHappiness(Number(e.target.value))}
            className="w-full accent-purple-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>很痛苦</span><span>非常幸福</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? "保存中..." : "完成打卡"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm"
          >
            跳过
          </button>
        </div>
      </div>
    </div>
  );
}
