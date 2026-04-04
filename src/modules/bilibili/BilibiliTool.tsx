import { useState, useEffect } from "react";
import {
  Tv,
  Search,
  Filter,
  Clock,
  Hash,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Play,
  Image as ImageIcon,
  FileText,
  MessageSquare,
  X,
  Plus,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState, LoadingState } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { CookieGuide } from "../../components/ConfigHelp";
import {
  BiliDynamic,
  bilibiliFetchFollowed,
  bilibiliVerifySessdata,
} from "../../api/bilibili";

const DYNAMIC_TYPE_MAP: Record<string, { label: string; icon: typeof Play; color: string }> = {
  video: { label: "视频", icon: Play, color: "#00AEEC" },
  image: { label: "图文", icon: ImageIcon, color: "#FB7299" },
  text: { label: "文字", icon: MessageSquare, color: "#FF7F50" },
  article: { label: "专栏", icon: FileText, color: "#52C41A" },
};

const PRESET_KEYWORDS = [
  "AI",
  "人工智能",
  "AIGC",
  "ChatGPT",
  "大模型",
  "科技",
  "教程",
  "评测",
  "Vlog",
  "游戏",
];

const TIME_RANGE_OPTIONS = [
  { value: 1, label: "1天" },
  { value: 3, label: "3天" },
  { value: 7, label: "7天" },
  { value: 14, label: "14天" },
  { value: 30, label: "30天" },
];

const LIMIT_OPTIONS = [10, 20, 50];

export function BilibiliTool() {
  const toast = useToast();

  // SESSDATA state
  const [sessdata, setSessdata] = useState(() => localStorage.getItem("bilibili_sessdata") || "");
  const [sessdataVerified, setSessdataVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Filter state
  const [keywords, setKeywords] = useState<string[]>(() => {
    const saved = localStorage.getItem("bilibili_keywords");
    return saved ? JSON.parse(saved) : [];
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["video", "image", "text", "article"]);
  const [daysBack, setDaysBack] = useState(7);
  const [limit, setLimit] = useState(20);

  // Results state
  const [dynamics, setDynamics] = useState<BiliDynamic[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalFound, setTotalFound] = useState(0);

  // Persist keywords
  useEffect(() => {
    localStorage.setItem("bilibili_keywords", JSON.stringify(keywords));
  }, [keywords]);

  // Persist sessdata
  useEffect(() => {
    if (sessdata) {
      localStorage.setItem("bilibili_sessdata", sessdata);
    } else {
      localStorage.removeItem("bilibili_sessdata");
    }
  }, [sessdata]);

  const handleVerifySessdata = async () => {
    if (!sessdata.trim()) {
      toast.error("请输入 SESSDATA");
      return;
    }
    setVerifying(true);
    try {
      const res = await bilibiliVerifySessdata({ sessdata: sessdata.trim() });
      if (res.valid) {
        setSessdataVerified(true);
        toast.success("SESSDATA 验证成功", res.message);
      } else {
        setSessdataVerified(false);
        toast.error("SESSDATA 验证失败", res.message);
      }
    } catch (err) {
      setSessdataVerified(false);
      toast.error("验证失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setVerifying(false);
    }
  };

  const handleAddKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    if (keywords.includes(kw)) {
      toast.info("关键词已存在");
      return;
    }
    setKeywords([...keywords, kw]);
    setKeywordInput("");
  };

  const handleRemoveKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const handleAddPresetKeyword = (kw: string) => {
    if (keywords.includes(kw)) {
      toast.info(`"${kw}" 已添加`);
      return;
    }
    setKeywords([...keywords, kw]);
  };

  const toggleType = (type: string) => {
    if (selectedTypes.includes(type)) {
      if (selectedTypes.length > 1) {
        setSelectedTypes(selectedTypes.filter((t) => t !== type));
      }
    } else {
      setSelectedTypes([...selectedTypes, type]);
    }
  };

  const getDynamicTypeNumber = (type: string): number => {
    const map: Record<string, number> = {
      video: 8,
      image: 2,
      text: 4,
      article: 64,
    };
    return map[type] || 0;
  };

  const handleFetch = async () => {
    if (!sessdata.trim()) {
      toast.error("请先输入 SESSDATA");
      return;
    }
    setLoading(true);
    try {
      const dynamicTypes = selectedTypes.map(getDynamicTypeNumber);
      const res = await bilibiliFetchFollowed({
        sessdata: sessdata.trim(),
        keywords: keywords.length > 0 ? keywords : undefined,
        dynamic_types: dynamicTypes.length > 0 ? dynamicTypes : undefined,
        days_back: daysBack,
        limit,
      });
      setDynamics(res.dynamics);
      setTotalFound(res.total_found);
      if (res.dynamics.length === 0) {
        toast.info("未找到符合条件的动态");
      } else {
        toast.success(`找到 ${res.total_found} 条动态`);
      }
    } catch (err) {
      toast.error("获取失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "未知时间";
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <PageContainer>
      <PageHeader
        title="哔哩哔哩工具"
        subtitle="关注动态聚合与关键词筛选"
        icon={Tv}
      />
      <PageContent>
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "24px", height: "100%" }}>
          {/* Left sidebar - Configuration */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", overflow: "auto" }}>
            {/* SESSDATA Card */}
            <Card title="SESSDATA 配置" icon={<Tv size={18} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  从浏览器 Cookie 中复制 SESSDATA 值用于身份验证
                </p>
                <textarea
                  value={sessdata}
                  onChange={(e) => {
                    setSessdata(e.target.value);
                    setSessdataVerified(false);
                  }}
                  placeholder="粘贴 SESSDATA..."
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-input)",
                    color: "var(--text-main)",
                    fontSize: "0.8125rem",
                    fontFamily: "monospace",
                    resize: "vertical",
                    minHeight: "80px",
                  }}
                />
                <CookieGuide platform="bilibili" cookieName="SESSDATA" />
                <button
                  onClick={handleVerifySessdata}
                  disabled={verifying || !sessdata.trim()}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: verifying ? "var(--bg-muted)" : "var(--color-primary)",
                    color: "white",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: verifying || !sessdata.trim() ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  {verifying ? (
                    <>
                      <div
                        style={{
                          width: "16px",
                          height: "16px",
                          border: "2px solid rgba(255,255,255,0.3)",
                          borderTopColor: "white",
                          borderRadius: "50%",
                          animation: "spin 1s linear infinite",
                        }}
                      />
                      验证中...
                    </>
                  ) : sessdataVerified ? (
                    <>
                      <CheckCircle size={16} />
                      已验证
                    </>
                  ) : (
                    <>
                      <AlertCircle size={16} />
                      验证 SESSDATA
                    </>
                  )}
                </button>
              </div>
            </Card>

            {/* Keywords Card */}
            <Card title="关键词筛选" icon={<Hash size={18} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                    placeholder="输入关键词..."
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-input)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                    }}
                  />
                  <button
                    onClick={handleAddKeyword}
                    disabled={!keywordInput.trim()}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: "var(--color-secondary)",
                      color: "white",
                      cursor: keywordInput.trim() ? "pointer" : "not-allowed",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Plus size={18} />
                  </button>
                </div>

                {/* Preset keywords */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {PRESET_KEYWORDS.map((kw) => (
                    <button
                      key={kw}
                      onClick={() => handleAddPresetKeyword(kw)}
                      disabled={keywords.includes(kw)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "9999px",
                        border: "1px solid var(--border-light)",
                        background: keywords.includes(kw) ? "var(--bg-muted)" : "var(--bg-hover)",
                        color: keywords.includes(kw) ? "var(--text-muted)" : "var(--text-secondary)",
                        fontSize: "0.75rem",
                        cursor: keywords.includes(kw) ? "not-allowed" : "pointer",
                      }}
                    >
                      + {kw}
                    </button>
                  ))}
                </div>

                {/* Selected keywords */}
                {keywords.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                    {keywords.map((kw) => (
                      <span
                        key={kw}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 10px",
                          borderRadius: "9999px",
                          background: "rgba(188, 164, 227, 0.15)",
                          color: "var(--color-primary)",
                          fontSize: "0.8125rem",
                          fontWeight: 500,
                        }}
                      >
                        {kw}
                        <button
                          onClick={() => handleRemoveKeyword(kw)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "2px",
                            borderRadius: "50%",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            color: "inherit",
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Type Filter Card */}
            <Card title="动态类型" icon={<Filter size={18} />}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {Object.entries(DYNAMIC_TYPE_MAP).map(([type, config]) => {
                  const Icon = config.icon;
                  const selected = selectedTypes.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleType(type)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid",
                        borderColor: selected ? config.color : "var(--border-light)",
                        background: selected ? `${config.color}15` : "var(--bg-hover)",
                        color: selected ? config.color : "var(--text-secondary)",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      <Icon size={14} />
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Time Range Card */}
            <Card title="时间范围" icon={<Clock size={18} />}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDaysBack(opt.value)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid",
                      borderColor: daysBack === opt.value ? "var(--color-primary)" : "var(--border-light)",
                      background: daysBack === opt.value ? "rgba(188, 164, 227, 0.15)" : "var(--bg-hover)",
                      color: daysBack === opt.value ? "var(--color-primary)" : "var(--text-secondary)",
                      fontSize: "0.8125rem",
                      fontWeight: daysBack === opt.value ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Card>

            {/* Limit Card */}
            <Card title="数量限制" icon={<Filter size={18} />}>
              <div style={{ display: "flex", gap: "8px" }}>
                {LIMIT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setLimit(opt)}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid",
                      borderColor: limit === opt ? "var(--color-primary)" : "var(--border-light)",
                      background: limit === opt ? "rgba(188, 164, 227, 0.15)" : "var(--bg-hover)",
                      color: limit === opt ? "var(--color-primary)" : "var(--text-secondary)",
                      fontSize: "0.8125rem",
                      fontWeight: limit === opt ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {opt} 条
                  </button>
                ))}
              </div>
            </Card>

            {/* Fetch Button */}
            <button
              onClick={handleFetch}
              disabled={loading || !sessdata.trim()}
              style={{
                padding: "14px 24px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: loading || !sessdata.trim() ? "var(--bg-muted)" : "linear-gradient(135deg, #00AEEC, #FB7299)",
                color: "white",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: loading || !sessdata.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                boxShadow: "0 4px 16px rgba(0, 174, 236, 0.25)",
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: "18px",
                      height: "18px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "white",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  获取中...
                </>
              ) : (
                <>
                  <Search size={18} />
                  获取关注动态
                </>
              )}
            </button>
          </div>

          {/* Right content - Results */}
          <div style={{ overflow: "auto", height: "100%" }}>
            {loading ? (
              <LoadingState message="正在获取动态..." />
            ) : dynamics.length === 0 ? (
              <EmptyState
                icon={Tv}
                title="暂无动态"
                description={
                  sessdata
                    ? "点击左侧「获取关注动态」开始"
                    : "请先配置 SESSDATA 并验证"
                }
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    共找到 <strong style={{ color: "var(--text-main)" }}>{totalFound}</strong> 条动态
                    {keywords.length > 0 && (
                      <span>，关键词: {keywords.join(", ")}</span>
                    )}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    最近 {daysBack} 天
                  </span>
                </div>

                {dynamics.map((dynamic) => {
                  const typeConfig = DYNAMIC_TYPE_MAP[dynamic.dynamic_type] || DYNAMIC_TYPE_MAP.text;
                  const TypeIcon = typeConfig.icon;

                  return (
                    <Card
                      key={dynamic.id}
                      noPadding
                      style={{
                        borderLeft: `4px solid ${typeConfig.color}`,
                      }}
                    >
                      <div style={{ padding: "16px 20px" }}>
                        {/* Header */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "12px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "4px 10px",
                                borderRadius: "9999px",
                                background: `${typeConfig.color}15`,
                                color: typeConfig.color,
                                fontSize: "0.75rem",
                                fontWeight: 600,
                              }}
                            >
                              <TypeIcon size={12} />
                              {typeConfig.label}
                            </span>
                            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                              {formatDate(dynamic.published_at)}
                            </span>
                          </div>
                          <a
                            href={dynamic.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "6px 12px",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--bg-hover)",
                              color: "var(--color-primary)",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              textDecoration: "none",
                            }}
                          >
                            <ExternalLink size={12} />
                            打开
                          </a>
                        </div>

                        {/* Author */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "10px",
                          }}
                        >
                          <div
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "50%",
                              background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <span style={{ fontSize: "0.75rem", color: "white", fontWeight: 600 }}>
                              {dynamic.author.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-main)" }}>
                            {dynamic.author}
                          </span>
                        </div>

                        {/* Title */}
                        {dynamic.title && (
                          <h3
                            style={{
                              fontSize: "1rem",
                              fontWeight: 700,
                              color: "var(--text-main)",
                              marginBottom: "8px",
                              lineHeight: 1.5,
                            }}
                          >
                            {dynamic.title}
                          </h3>
                        )}

                        {/* Content */}
                        <p
                          style={{
                            fontSize: "0.875rem",
                            color: "var(--text-secondary)",
                            lineHeight: 1.6,
                            marginBottom: dynamic.images.length > 0 ? "12px" : 0,
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {dynamic.content}
                        </p>

                        {/* Images */}
                        {dynamic.images.length > 0 && (
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                            {dynamic.images.slice(0, 4).map((img, idx) => (
                              <div
                                key={idx}
                                style={{
                                  width: "120px",
                                  height: "80px",
                                  borderRadius: "var(--radius-sm)",
                                  overflow: "hidden",
                                  background: "var(--bg-muted)",
                                  position: "relative",
                                }}
                              >
                                <img
                                  src={img}
                                  alt=""
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                                {dynamic.images.length > 4 && idx === 3 && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      inset: 0,
                                      background: "rgba(0,0,0,0.5)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: "white",
                                      fontSize: "0.875rem",
                                      fontWeight: 600,
                                    }}
                                  >
                                    +{dynamic.images.length - 4}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Main thumbnail for video */}
                        {dynamic.dynamic_type === "video" && dynamic.pic && (
                          <div
                            style={{
                              marginTop: "12px",
                              borderRadius: "var(--radius-sm)",
                              overflow: "hidden",
                              background: "var(--bg-muted)",
                              position: "relative",
                            }}
                          >
                            <img
                              src={dynamic.pic}
                              alt=""
                              style={{
                                width: "100%",
                                maxHeight: "200px",
                                objectFit: "cover",
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "rgba(0,0,0,0.2)",
                              }}
                            >
                              <div
                                style={{
                                  width: "48px",
                                  height: "48px",
                                  borderRadius: "50%",
                                  background: "rgba(0, 174, 236, 0.9)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Play size={20} fill="white" color="white" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
