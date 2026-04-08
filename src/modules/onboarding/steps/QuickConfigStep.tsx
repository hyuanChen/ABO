import { useState } from "react";
import {
  Settings,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Video,
  ShoppingBag,
  Headphones,
  HelpCircle,
  FileText,
  Rss,
  Check,
  Cookie,
  Loader2,
} from "lucide-react";
import { api } from "../../../core/api";
import { useStore } from "../../../core/store";

interface QuickConfigStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface ModuleConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  enabled: boolean;
  keywords: string[];
  requiresCookie: boolean;
  description: string;
}

const DEFAULT_KEYWORDS: Record<string, string[]> = {
  "arxiv-tracker": ["machine learning", "artificial intelligence", "neural networks"],
  "bilibili-tracker": ["机器学习", "AI技术", "编程教程"],
  "xiaohongshu-tracker": ["数码评测", "学习笔记", "效率工具"],
  "xiaoyuzhou-tracker": ["科技播客", "商业思维", "个人成长"],
  "zhihu-tracker": ["人工智能", "深度学习", "科研方法"],
  "semantic-scholar-tracker": ["computer vision", "NLP", "reinforcement learning"],
  "folder-monitor": ["research", "notes", "ideas"],
};

export default function QuickConfigStep({ onNext, onBack }: QuickConfigStepProps) {
  const { addToast } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const [showCookieHint, setShowCookieHint] = useState(false);

  const [modules, setModules] = useState<ModuleConfig[]>([
    {
      id: "arxiv-tracker",
      name: "ArXiv 追踪器",
      icon: <BookOpen style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["arxiv-tracker"],
      requiresCookie: false,
      description: "追踪最新学术论文",
    },
    {
      id: "semantic-scholar-tracker",
      name: "Semantic Scholar",
      icon: <FileText style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["semantic-scholar-tracker"],
      requiresCookie: false,
      description: "学术搜索引擎",
    },
    {
      id: "bilibili-tracker",
      name: "B站追踪器",
      icon: <Video style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["bilibili-tracker"],
      requiresCookie: true,
      description: "技术视频和教程",
    },
    {
      id: "xiaohongshu-tracker",
      name: "小红书追踪器",
      icon: <ShoppingBag style={{ width: "20px", height: "20px" }} />,
      enabled: false,
      keywords: DEFAULT_KEYWORDS["xiaohongshu-tracker"],
      requiresCookie: true,
      description: "学习笔记和评测",
    },
    {
      id: "xiaoyuzhou-tracker",
      name: "小宇宙追踪器",
      icon: <Headphones style={{ width: "20px", height: "20px" }} />,
      enabled: false,
      keywords: DEFAULT_KEYWORDS["xiaoyuzhou-tracker"],
      requiresCookie: false,
      description: "播客内容追踪",
    },
    {
      id: "zhihu-tracker",
      name: "知乎追踪器",
      icon: <HelpCircle style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["zhihu-tracker"],
      requiresCookie: true,
      description: "问答和深度文章",
    },
    {
      id: "folder-monitor",
      name: "文件夹监控",
      icon: <Rss style={{ width: "20px", height: "20px" }} />,
      enabled: true,
      keywords: DEFAULT_KEYWORDS["folder-monitor"],
      requiresCookie: false,
      description: "监控本地文件变化",
    },
  ]);

  const toggleModule = (id: string) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
  };

  const updateKeywords = (id: string, keywordsStr: string) => {
    const keywords = keywordsStr
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k);
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, keywords } : m))
    );
  };

  const handleContinue = async () => {
    setIsSaving(true);
    try {
      // Save module configurations
      const enabledModules = modules.filter((m) => m.enabled);

      for (const module of enabledModules) {
        await api.post(`/api/modules/${module.id}/config`, {
          keywords: module.keywords,
          enabled: module.enabled,
        });
      }

      addToast({
        kind: "success",
        title: "配置已保存",
        message: `已启用 ${enabledModules.length} 个模块`,
      });

      onNext();
    } catch (error) {
      console.error("Failed to save config:", error);
      addToast({
        kind: "error",
        title: "保存失败",
        message: "请检查网络连接后重试",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const enabledCount = modules.filter((m) => m.enabled).length;
  const cookieRequiredCount = modules.filter((m) => m.enabled && m.requiresCookie).length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        padding: "48px 32px",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "var(--radius-xl)",
            background: "linear-gradient(135deg, #BCA4E3, #9D7BDB)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 32px rgba(188, 164, 227, 0.4)",
          }}
        >
          <Settings style={{ width: "36px", height: "36px", color: "white" }} />
        </div>

        <h2
          style={{
            fontFamily: "'M PLUS Rounded 1c', sans-serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--text-main)",
            marginBottom: "8px",
          }}
        >
          快速配置
        </h2>

        <p
          style={{
            fontSize: "0.9375rem",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          选择要启用的模块并配置关键词
          <br />
          已启用 {enabledCount} 个模块，其中 {cookieRequiredCount} 个需要 Cookie
        </p>
      </div>

      {/* Cookie Hint Toggle */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: "var(--radius-lg)",
          background: "rgba(255, 183, 178, 0.08)",
          border: "1px solid rgba(255, 183, 178, 0.2)",
          marginBottom: "24px",
        }}
      >
        <button
          onClick={() => setShowCookieHint(!showCookieHint)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            width: "100%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Cookie style={{ width: "20px", height: "20px", color: "#E89B96" }} />
          <span style={{ flex: 1, fontSize: "0.9375rem", color: "var(--text-main)", fontWeight: 600 }}>
            关于 Cookie 配置
          </span>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {showCookieHint ? "收起" : "展开"}
          </span>
        </button>

        {showCookieHint && (
          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(255, 183, 178, 0.2)" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "12px" }}>
              部分模块（B站、小红书、知乎）需要 Cookie 才能正常工作。你可以：
            </p>
            <ul style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.8, marginLeft: "20px" }}>
              <li>现在跳过，稍后到「模块管理」页面配置</li>
              <li>现在启用模块，ABO 会提示你如何获取 Cookie</li>
            </ul>
            <div style={{ marginTop: "12px", display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowCookieHint(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  fontSize: "0.875rem",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                稍后再说
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Module List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px" }}>
        {modules.map((module) => (
          <div
            key={module.id}
            style={{
              padding: "20px",
              borderRadius: "var(--radius-lg)",
              background: module.enabled ? "var(--bg-card)" : "var(--bg-hover)",
              border: `1px solid ${module.enabled ? "var(--color-primary-light)" : "var(--border-light)"}`,
              opacity: module.enabled ? 1 : 0.7,
              transition: "all 0.3s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: module.enabled ? "16px" : 0 }}>
              {/* Toggle */}
              <button
                onClick={() => toggleModule(module.id)}
                style={{
                  width: "48px",
                  height: "26px",
                  borderRadius: "var(--radius-full)",
                  background: module.enabled
                    ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
                    : "var(--bg-hover)",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  position: "relative",
                  boxShadow: module.enabled ? "0 2px 8px rgba(188, 164, 227, 0.4)" : "inset 0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "3px",
                    left: module.enabled ? "25px" : "3px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "white",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                    transition: "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                />
              </button>

              {/* Icon */}
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "var(--radius-md)",
                  background: module.enabled
                    ? "linear-gradient(135deg, var(--color-primary-light), var(--color-primary))"
                    : "var(--bg-hover)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: module.enabled ? "white" : "var(--text-muted)",
                }}
              >
                {module.icon}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>
                    {module.name}
                  </h3>
                  {module.requiresCookie && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(255, 183, 178, 0.2)",
                        fontSize: "0.6875rem",
                        color: "#D48984",
                        fontWeight: 600,
                      }}
                    >
                      Cookie
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{module.description}</p>
              </div>

              {/* Status */}
              {module.enabled && (
                <Check style={{ width: "20px", height: "20px", color: "#22c55e" }} />
              )}
            </div>

            {/* Keywords Input */}
            {module.enabled && (
              <div style={{ marginLeft: "64px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                    fontWeight: 500,
                  }}
                >
                  关键词（用逗号分隔）
                </label>
                <input
                  type="text"
                  value={module.keywords.join(", ")}
                  onChange={(e) => updateKeywords(module.id, e.target.value)}
                  placeholder="输入关键词..."
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                    color: "var(--text-main)",
                    fontSize: "0.875rem",
                    transition: "all 0.2s ease",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-light)";
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "auto" }}>
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "14px 28px",
            borderRadius: "var(--radius-full)",
            background: "var(--bg-hover)",
            border: "1px solid var(--border-light)",
            color: "var(--text-secondary)",
            fontSize: "0.9375rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-card)";
            e.currentTarget.style.borderColor = "var(--color-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.borderColor = "var(--border-light)";
          }}
        >
          <ArrowLeft style={{ width: "18px", height: "18px" }} />
          返回
        </button>

        <button
          onClick={handleContinue}
          disabled={isSaving || enabledCount === 0}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "14px 32px",
            borderRadius: "var(--radius-full)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
            border: "none",
            color: "white",
            fontSize: "0.9375rem",
            fontWeight: 700,
            cursor: isSaving || enabledCount === 0 ? "not-allowed" : "pointer",
            opacity: isSaving || enabledCount === 0 ? 0.6 : 1,
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: "0 4px 16px rgba(188, 164, 227, 0.3)",
          }}
          onMouseEnter={(e) => {
            if (!isSaving && enabledCount > 0) {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 6px 24px rgba(188, 164, 227, 0.4)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0) scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(188, 164, 227, 0.3)";
          }}
        >
          {isSaving ? (
            <>
              <Loader2 style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
              保存中...
            </>
          ) : (
            <>
              继续
              <ArrowRight style={{ width: "18px", height: "18px" }} />
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
