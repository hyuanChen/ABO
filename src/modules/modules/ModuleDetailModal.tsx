import { useState, useEffect } from "react";
import {
  X, Settings, AlertCircle, CheckCircle, XCircle, Loader2, Save,
  Plus, RefreshCw, Clock, ExternalLink, BookOpen, Video, ShoppingBag,
  Headphones, HelpCircle, FolderOpen, FileText, Rss, Search,
} from "lucide-react";
import { api } from "../../core/api";
import { useStore, FeedCard } from "../../core/store";
import type {
  ModuleConfig, DiagnosisResult, QuickFixResponse, ModuleStatus,
  CookieValidationResult,
} from "../../types/module";

type TabType = "overview" | "config" | "history";

interface ModuleDetailModalProps {
  module: ModuleConfig;
  initialTab?: TabType;
  onClose: () => void;
  onUpdate: (updatedModule: ModuleConfig) => void;
}

const STATUS_MAP: Record<ModuleStatus, { label: string; color: string; bg: string }> = {
  active: { label: "运行中", color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  paused: { label: "已暂停", color: "#eab308", bg: "rgba(234,179,8,0.1)" },
  error: { label: "错误", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  unconfigured: { label: "未配置", color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

const MODULE_ICONS: Record<string, React.FC<{ style?: React.CSSProperties }>> = {
  "arxiv-tracker": BookOpen, "semantic-scholar-tracker": FileText,
  "bilibili-tracker": Video, "xiaohongshu-tracker": ShoppingBag,
  "xiaoyuzhou-tracker": Headphones, "zhihu-tracker": HelpCircle,
  "folder-monitor": FolderOpen,
};

const MODULE_GRADIENTS: Record<string, string> = {
  "arxiv-tracker": "linear-gradient(135deg, #BCA4E3, #9D7BDB)",
  "semantic-scholar-tracker": "linear-gradient(135deg, #7BC8F0, #5BA8D0)",
  "bilibili-tracker": "linear-gradient(135deg, #FFB7B2, #E89B96)",
  "xiaohongshu-tracker": "linear-gradient(135deg, #FF6B6B, #E85555)",
  "xiaoyuzhou-tracker": "linear-gradient(135deg, #A8E6CF, #7DD3C0)",
  "zhihu-tracker": "linear-gradient(135deg, #4A9DFF, #3478CC)",
  "folder-monitor": "linear-gradient(135deg, #F5C88C, #D4A574)",
};

const SOURCE_ICONS: Record<string, string> = {
  "arxiv-tracker": "📄", "semantic-scholar-tracker": "🔬",
  "bilibili-tracker": "📺", "xiaohongshu-tracker": "📕",
  "xiaoyuzhou-tracker": "🎧", "zhihu-tracker": "❓",
  "folder-monitor": "📁",
};

export function ModuleDetailModal({ module, initialTab = "overview", onClose, onUpdate }: ModuleDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [fixResult, setFixResult] = useState<QuickFixResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const { addToast } = useStore();

  // Config state
  const [keywords, setKeywords] = useState<string[]>(module.config.keywords || []);
  const [newKeyword, setNewKeyword] = useState("");
  const [cookie, setCookie] = useState(module.config.cookie || "");
  const [cookieValidation, setCookieValidation] = useState<CookieValidationResult | null>(null);
  const [isValidatingCookie, setIsValidatingCookie] = useState(false);
  const [maxResults, setMaxResults] = useState(module.config.maxResults || 50);

  // History state
  const [historyCards, setHistoryCards] = useState<FeedCard[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [historySearch, setHistorySearch] = useState("");

  // Animate in
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  // Close with animation
  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  // Load history when tab switches
  useEffect(() => {
    if (activeTab === "history" && historyCards.length === 0) loadHistory(0);
  }, [activeTab]);

  const loadHistory = async (offset: number) => {
    setHistoryLoading(true);
    try {
      const r = await api.get<{ cards: FeedCard[] }>(
        `/api/cards?module_id=${module.id}&limit=30&offset=${offset}`
      );
      const cards = r.cards || [];
      if (offset === 0) {
        setHistoryCards(cards);
      } else {
        setHistoryCards((prev) => [...prev, ...cards]);
      }
      setHasMore(cards.length === 30);
      setHistoryOffset(offset + cards.length);
    } catch {
      addToast({ kind: "error", title: "加载失败", message: "无法加载历史数据" });
    } finally {
      setHistoryLoading(false);
    }
  };

  const runDiagnosis = async () => {
    setIsDiagnosing(true); setDiagnosisResult(null);
    try {
      const result = await api.post<DiagnosisResult>(`/api/modules/${module.id}/diagnose`, { deep: true });
      setDiagnosisResult(result);
    } catch (err) {
      setDiagnosisResult({
        moduleId: module.id, diagnosedAt: new Date().toISOString(), overallStatus: "fail",
        checks: [{ name: "diagnosis", status: "fail", message: err instanceof Error ? err.message : "诊断失败" }],
        recommendations: [],
      });
    } finally { setIsDiagnosing(false); }
  };

  const runQuickFix = async () => {
    setIsFixing(true); setFixResult(null);
    try {
      const result = await api.post<QuickFixResponse>(`/api/modules/${module.id}/quick-fix`, { fixes: ["all"] });
      setFixResult(result);
      if (result.moduleStatus !== module.status) onUpdate({ ...module, status: result.moduleStatus });
    } catch (err) {
      setFixResult({
        moduleId: module.id, fixedAt: new Date().toISOString(),
        results: [{ fix: "all", status: "failed", message: err instanceof Error ? err.message : "修复失败" }],
        moduleStatus: module.status, nextSteps: ["请手动检查配置"],
      });
    } finally { setIsFixing(false); }
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      await api.post(`/api/modules/${module.id}/config`, {
        keywords, cookie, maxResults,
      });
      addToast({ kind: "success", title: "保存成功", message: "配置已更新" });
      onUpdate({ ...module, config: { ...module.config, keywords, cookie, maxResults } });
    } catch (err) {
      addToast({ kind: "error", title: "保存失败", message: err instanceof Error ? err.message : "无法保存" });
    } finally { setIsSaving(false); }
  };

  const validateCookie = async () => {
    if (!cookie.trim()) return;
    setIsValidatingCookie(true);
    try {
      const result = await api.post<CookieValidationResult>(`/api/modules/${module.id}/validate-cookie`, { cookie: cookie.trim() });
      setCookieValidation(result);
    } catch {
      setCookieValidation({ valid: false, message: "验证失败" });
    } finally { setIsValidatingCookie(false); }
  };

  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (kw && !keywords.includes(kw)) { setKeywords([...keywords, kw]); setNewKeyword(""); }
  };

  const Icon = MODULE_ICONS[module.id] || Rss;
  const gradient = MODULE_GRADIENTS[module.id] || "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))";
  const st = STATUS_MAP[module.status];

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "概览", icon: <FileText style={{ width: "15px", height: "15px" }} /> },
    { id: "config", label: "配置", icon: <Settings style={{ width: "15px", height: "15px" }} /> },
    { id: "history", label: "历史记录", icon: <Clock style={{ width: "15px", height: "15px" }} /> },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Backdrop */}
      <div onClick={handleClose} style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
        opacity: visible ? 1 : 0, transition: "opacity 0.2s ease",
      }} />

      {/* Modal */}
      <div style={{
        position: "relative", width: "90%", maxWidth: "720px", maxHeight: "85vh",
        background: "var(--bg-card)", borderRadius: "var(--radius-xl)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        transform: visible ? "scale(1) translateY(0)" : "scale(0.95) translateY(12px)",
        opacity: visible ? 1 : 0,
        transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        {/* Header */}
        <div style={{
          padding: "24px 28px 0", display: "flex", alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "48px", height: "48px", borderRadius: "var(--radius-lg)",
              background: gradient, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 4px 16px ${st.color}33`,
            }}>
              <Icon style={{ width: "24px", height: "24px", color: "white" }} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-main)", fontFamily: "'M PLUS Rounded 1c', sans-serif" }}>
                {module.name}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "2px 10px", borderRadius: "var(--radius-full)",
                  fontSize: "0.6875rem", fontWeight: 600,
                  background: st.bg, color: st.color,
                }}>
                  {module.status === "active" && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: st.color, animation: "pulse 2s infinite" }} />}
                  {st.label}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{module.id}</span>
              </div>
            </div>
          </div>
          <button onClick={handleClose} style={{
            padding: "8px", borderRadius: "var(--radius-md)", border: "none",
            background: "var(--bg-hover)", cursor: "pointer", display: "flex",
            color: "var(--text-muted)", transition: "all 0.15s",
          }}>
            <X style={{ width: "18px", height: "18px" }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", padding: "16px 28px 0", borderBottom: "1px solid var(--border-light)" }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "10px 18px", border: "none", background: "transparent",
              cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600,
              color: activeTab === tab.id ? "var(--color-primary)" : "var(--text-muted)",
              borderBottom: `2px solid ${activeTab === tab.id ? "var(--color-primary)" : "transparent"}`,
              marginBottom: "-1px", transition: "all 0.2s",
            }}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

          {/* === OVERVIEW === */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>{module.description}</p>

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                {[
                  { label: "累计卡片", value: module.stats.totalCards },
                  { label: "本周", value: module.stats.thisWeek },
                  { label: "成功率", value: `${module.stats.successRate}%` },
                  { label: "错误次数", value: module.stats.errorCount },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "14px", borderRadius: "var(--radius-lg)", background: "var(--bg-hover)", textAlign: "center" }}>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-main)" }}>{s.value}</div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Schedule */}
              <div style={{ borderRadius: "var(--radius-lg)", background: "var(--bg-hover)", padding: "16px" }}>
                <h4 style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "12px" }}>调度信息</h4>
                {[
                  { label: "Cron 表达式", value: module.schedule || "未设置" },
                  { label: "上次运行", value: module.lastRun ? new Date(module.lastRun).toLocaleString("zh-CN") : "从未" },
                  { label: "下次运行", value: module.nextRun ? new Date(module.nextRun).toLocaleString("zh-CN") : "未安排" },
                ].map((row, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: i ? "1px solid var(--border-light)" : "none" }}>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{row.label}</span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-main)", fontFamily: "monospace" }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Diagnosis */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <h4 style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-main)" }}>健康诊断</h4>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <SmallButton onClick={runQuickFix} loading={isFixing} color="#22c55e" icon={<CheckCircle style={{ width: "14px", height: "14px" }} />} label="快速修复" />
                    <SmallButton onClick={runDiagnosis} loading={isDiagnosing} color="var(--color-primary)" icon={<AlertCircle style={{ width: "14px", height: "14px" }} />} label="运行诊断" />
                  </div>
                </div>

                {diagnosisResult && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{
                      padding: "12px 16px", borderRadius: "var(--radius-md)",
                      background: diagnosisResult.overallStatus === "pass" ? "rgba(34,197,94,0.08)" : diagnosisResult.overallStatus === "fail" ? "rgba(239,68,68,0.08)" : "rgba(234,179,8,0.08)",
                      display: "flex", alignItems: "center", gap: "10px",
                    }}>
                      {diagnosisResult.overallStatus === "pass" ? <CheckCircle style={{ width: "18px", height: "18px", color: "#22c55e" }} /> : <XCircle style={{ width: "18px", height: "18px", color: "#ef4444" }} />}
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-main)" }}>
                        {diagnosisResult.overallStatus === "pass" ? "模块运行正常" : "发现问题需要处理"}
                      </span>
                    </div>
                    {diagnosisResult.checks.map((check, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-hover)" }}>
                        {check.status === "pass" ? <CheckCircle style={{ width: "16px", height: "16px", color: "#22c55e", flexShrink: 0, marginTop: "1px" }} /> : <XCircle style={{ width: "16px", height: "16px", color: "#ef4444", flexShrink: 0, marginTop: "1px" }} />}
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{check.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {fixResult && (
                  <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {fixResult.results.map((r, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px",
                        borderRadius: "var(--radius-md)", fontSize: "0.8125rem",
                        background: r.status === "success" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                        color: r.status === "success" ? "#22c55e" : "#ef4444",
                      }}>
                        {r.status === "success" ? <CheckCircle style={{ width: "14px", height: "14px" }} /> : <XCircle style={{ width: "14px", height: "14px" }} />}
                        {r.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* === CONFIG === */}
          {activeTab === "config" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Keywords */}
              <div>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-main)", display: "block", marginBottom: "10px" }}>
                  关键词
                </label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  <input type="text" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                    placeholder="添加关键词..."
                    style={{
                      flex: 1, padding: "8px 14px", borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)", background: "var(--bg-app)",
                      color: "var(--text-main)", fontSize: "0.8125rem", outline: "none",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-light)"; }}
                  />
                  <button onClick={addKeyword} style={{
                    padding: "8px 12px", borderRadius: "var(--radius-md)", border: "none",
                    background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                    color: "white", cursor: "pointer", display: "flex", alignItems: "center",
                  }}>
                    <Plus style={{ width: "16px", height: "16px" }} />
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {keywords.map((kw) => (
                    <span key={kw} style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "4px 12px", borderRadius: "var(--radius-full)",
                      background: "rgba(188,164,227,0.12)", color: "var(--color-primary)",
                      fontSize: "0.8125rem", fontWeight: 500,
                    }}>
                      {kw}
                      <button onClick={() => setKeywords(keywords.filter((k) => k !== kw))} style={{
                        border: "none", background: "transparent", cursor: "pointer",
                        color: "var(--color-primary)", padding: 0, display: "flex",
                      }}>
                        <X style={{ width: "12px", height: "12px" }} />
                      </button>
                    </span>
                  ))}
                  {keywords.length === 0 && <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>暂无关键词</span>}
                </div>
              </div>

              {/* Cookie */}
              {module.config.cookie !== undefined && (
                <div>
                  <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-main)", display: "block", marginBottom: "10px" }}>
                    Cookie
                  </label>
                  <textarea value={cookie} onChange={(e) => { setCookie(e.target.value); setCookieValidation(null); }}
                    placeholder="请输入 Cookie 字符串..."
                    rows={3}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)", background: "var(--bg-app)",
                      color: "var(--text-main)", fontSize: "0.75rem", fontFamily: "monospace",
                      resize: "none", outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-light)"; }}
                  />
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <SmallButton onClick={validateCookie} loading={isValidatingCookie} color="var(--color-primary)" icon={<RefreshCw style={{ width: "14px", height: "14px" }} />} label="验证" />
                  </div>
                  {cookieValidation && (
                    <div style={{
                      marginTop: "10px", padding: "10px 14px", borderRadius: "var(--radius-md)",
                      background: cookieValidation.valid ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                      border: `1px solid ${cookieValidation.valid ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                      display: "flex", alignItems: "center", gap: "8px",
                    }}>
                      {cookieValidation.valid ? <CheckCircle style={{ width: "16px", height: "16px", color: "#22c55e" }} /> : <XCircle style={{ width: "16px", height: "16px", color: "#ef4444" }} />}
                      <span style={{ fontSize: "0.8125rem", color: cookieValidation.valid ? "#22c55e" : "#ef4444" }}>{cookieValidation.message}</span>
                    </div>
                  )}
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "8px" }}>
                    提示: 在目标网站登录后，打开开发者工具 (F12) → Application → Cookies
                  </p>
                </div>
              )}

              {/* Max Results */}
              <div>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-main)", display: "block", marginBottom: "10px" }}>
                  最大结果数
                </label>
                <input type="number" value={maxResults} onChange={(e) => setMaxResults(parseInt(e.target.value) || 50)}
                  min={1} max={200}
                  style={{
                    width: "120px", padding: "8px 14px", borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)", background: "var(--bg-app)",
                    color: "var(--text-main)", fontSize: "0.8125rem", outline: "none",
                  }}
                />
              </div>

              {/* Save */}
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "16px", borderTop: "1px solid var(--border-light)" }}>
                <button onClick={saveConfig} disabled={isSaving} style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "10px 24px", borderRadius: "var(--radius-full)", border: "none",
                  background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
                  color: "white", fontSize: "0.8125rem", fontWeight: 700, cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.6 : 1, transition: "all 0.2s",
                  boxShadow: "0 4px 16px rgba(188,164,227,0.3)",
                }}>
                  {isSaving ? <Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} /> : <Save style={{ width: "16px", height: "16px" }} />}
                  保存配置
                </button>
              </div>
            </div>
          )}

          {/* === HISTORY === */}
          {activeTab === "history" && (() => {
            const q = historySearch.toLowerCase();
            const filtered = q
              ? historyCards.filter((c) =>
                  c.title.toLowerCase().includes(q)
                  || (c.summary || "").toLowerCase().includes(q)
                  || (c.tags || []).some((t) => t.toLowerCase().includes(q))
                )
              : historyCards;

            return (
              <div>
                {/* Search bar */}
                <div style={{ position: "relative", marginBottom: "16px" }}>
                  <Search style={{
                    position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                    width: "15px", height: "15px", color: "var(--text-muted)",
                  }} />
                  <input
                    type="text" value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="搜索标题、摘要、标签..."
                    style={{
                      width: "100%", padding: "9px 12px 9px 36px",
                      borderRadius: "var(--radius-full)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-hover)", color: "var(--text-main)",
                      fontSize: "0.8125rem", outline: "none",
                      transition: "border-color 0.2s", boxSizing: "border-box",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-light)"; }}
                  />
                  {historySearch && (
                    <button onClick={() => setHistorySearch("")} style={{
                      position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                      border: "none", background: "transparent", cursor: "pointer",
                      color: "var(--text-muted)", padding: "2px", display: "flex",
                    }}>
                      <X style={{ width: "14px", height: "14px" }} />
                    </button>
                  )}
                </div>

                {historyCards.length === 0 && !historyLoading ? (
                  <div style={{ textAlign: "center", padding: "48px 0" }}>
                    <Clock style={{ width: "40px", height: "40px", color: "var(--text-muted)", opacity: 0.3, margin: "0 auto 12px" }} />
                    <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>暂无历史记录</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>运行模块后，抓取的内容将显示在此处</p>
                  </div>
                ) : filtered.length === 0 && historySearch ? (
                  <div style={{ textAlign: "center", padding: "48px 0" }}>
                    <Search style={{ width: "40px", height: "40px", color: "var(--text-muted)", opacity: 0.3, margin: "0 auto 12px" }} />
                    <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>没有匹配的记录</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>尝试其他搜索词</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {historySearch && (
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                        找到 {filtered.length} 条匹配记录
                      </p>
                    )}
                    {filtered.map((card) => (
                      <HistoryCard key={card.id} card={card} moduleId={module.id} />
                    ))}

                    {hasMore && !historySearch && (
                      <button onClick={() => loadHistory(historyOffset)} disabled={historyLoading} style={{
                        padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)",
                        background: "transparent", color: "var(--text-secondary)", fontSize: "0.8125rem",
                        cursor: historyLoading ? "not-allowed" : "pointer", textAlign: "center",
                        transition: "all 0.2s",
                      }}>
                        {historyLoading ? "加载中..." : "加载更多"}
                      </button>
                    )}
                  </div>
                )}

                {historyLoading && historyCards.length === 0 && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}>
                    <Loader2 style={{ width: "24px", height: "24px", color: "var(--color-primary)", animation: "spin 1s linear infinite" }} />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* Small action button */
function SmallButton({ onClick, loading, color, icon, label }: {
  onClick: () => void; loading: boolean; color: string;
  icon: React.ReactNode; label: string;
}) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      display: "flex", alignItems: "center", gap: "6px",
      padding: "6px 14px", borderRadius: "var(--radius-full)", border: "none",
      background: color, color: "white", fontSize: "0.75rem", fontWeight: 600,
      cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
      transition: "all 0.2s",
    }}>
      {loading ? <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} /> : icon}
      {label}
    </button>
  );
}

/* History card item */
function HistoryCard({ card, moduleId }: { card: FeedCard; moduleId: string }) {
  const [hovered, setHovered] = useState(false);
  const emoji = SOURCE_ICONS[moduleId] || "📋";
  const date = new Date(card.created_at);
  const timeStr = date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "14px 16px", borderRadius: "var(--radius-lg)",
        background: hovered ? "var(--bg-hover)" : "transparent",
        border: "1px solid var(--border-light)",
        transition: "all 0.15s", cursor: card.source_url ? "pointer" : "default",
      }}
      onClick={() => card.source_url && window.open(card.source_url, "_blank")}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <span style={{ fontSize: "1.25rem", lineHeight: 1, marginTop: "2px" }}>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <h4 style={{
              fontSize: "0.875rem", fontWeight: 600, color: "var(--text-main)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {card.title}
            </h4>
            {card.source_url && hovered && (
              <ExternalLink style={{ width: "14px", height: "14px", color: "var(--text-muted)", flexShrink: 0 }} />
            )}
          </div>
          {card.summary && (
            <p style={{
              fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px",
              lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              {card.summary}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{timeStr}</span>
            {card.tags && card.tags.slice(0, 3).map((tag, i) => (
              <span key={i} style={{
                padding: "1px 8px", borderRadius: "var(--radius-full)",
                fontSize: "0.625rem", background: "rgba(188,164,227,0.1)",
                color: "var(--color-primary)",
              }}>
                {tag}
              </span>
            ))}
            {card.read && <span style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>已读</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
