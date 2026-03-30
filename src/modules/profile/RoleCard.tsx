// src/modules/profile/RoleCard.tsx
import { useState } from "react";
import { Edit3, RefreshCw } from "lucide-react";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import PixelAvatar from "./PixelAvatar";

interface Props {
  codename: string;
  longTermGoal: string;
  motto: string;
  description: string;
  energy: number;
  san: number;
  onUpdated: () => void;
}

export default function RoleCard({
  codename, longTermGoal, motto, description, energy, san, onUpdated,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(codename);
  const [editGoal, setEditGoal] = useState(longTermGoal);
  const [generatingMotto, setGeneratingMotto] = useState(false);
  const toast = useToast();

  async function saveName() {
    try {
      await api.post("/api/profile/identity", {
        codename: editName,
        long_term_goal: editGoal,
      });
      toast.success("身份信息已保存");
      setEditing(false);
      onUpdated();
    } catch {
      toast.error("保存失败");
    }
  }

  async function refreshMotto() {
    setGeneratingMotto(true);
    try {
      const r = await api.post<{ motto: string }>("/api/profile/generate-motto", {});
      toast.success("座右铭已更新", r.motto);
      onUpdated();
    } catch {
      toast.error("生成失败，Claude 可能未运行");
    } finally {
      setGeneratingMotto(false);
    }
  }

  return (
    <div className="bg-slate-800 rounded-2xl p-5 flex gap-5 items-start">
      {/* Pixel avatar + energy */}
      <div className="flex-shrink-0 flex flex-col items-center gap-2">
        <PixelAvatar san={san} energy={energy} size={5} />
        <div className="w-12">
          <div className="text-xs text-slate-400 text-center mb-0.5">{energy}%</div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${energy}%`,
                backgroundColor:
                  energy >= 70 ? "#10B981" : energy >= 40 ? "#F59E0B" : "#EF4444",
              }}
            />
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="研究员代号"
              className="w-full px-2 py-1 rounded bg-slate-700 text-white text-sm border border-slate-600"
            />
            <textarea
              value={editGoal}
              onChange={(e) => setEditGoal(e.target.value)}
              placeholder="预期目标..."
              rows={2}
              className="w-full px-2 py-1 rounded bg-slate-700 text-white text-sm border border-slate-600 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={saveName}
                className="text-sm px-3 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-white"
              >
                保存
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-sm px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-white">
                {codename || "未设置代号"}
              </h2>
              <button
                onClick={() => {
                  setEditing(true);
                  setEditName(codename);
                  setEditGoal(longTermGoal);
                }}
                className="text-slate-500 hover:text-slate-300"
                aria-label="编辑身份信息"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
            {longTermGoal && (
              <p className="text-sm text-slate-300 mb-2">{longTermGoal}</p>
            )}
            {description && (
              <p className="text-xs text-slate-500 mb-3 italic">{description}</p>
            )}
            <div className="flex items-start gap-2 p-2.5 bg-slate-700/60 rounded-lg">
              <span className="text-amber-400 text-xs mt-0.5">💡</span>
              <p className="text-sm text-amber-100 flex-1">
                {motto || "点击刷新生成今日座右铭"}
              </p>
              <button
                onClick={refreshMotto}
                disabled={generatingMotto}
                className="text-slate-500 hover:text-slate-300 ml-1 shrink-0"
                aria-label="重新生成座右铭"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${generatingMotto ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
