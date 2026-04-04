import { useEffect, useState } from "react";
import { ArrowLeft, Play, Save, Settings, BookOpen, Info, Clock, CheckCircle } from "lucide-react";
import ToggleSwitch from "../../components/ToggleSwitch";
import SubscriptionManager, { SubType } from "../../components/SubscriptionManager";
import { api } from "../../core/api";
import { useStore, FeedModule } from "../../core/store";
import { PageContainer, PageHeader, PageContent, Card, Grid } from "../../components/Layout";
import { useToast } from "../../components/Toast";

const SCHEDULE_PRESETS: { label: string; value: string }[] = [
  { label: "每天 8:00", value: "0 8 * * *" },
  { label: "每天 10:00", value: "0 10 * * *" },
  { label: "每天 11:00", value: "0 11 * * *" },
  { label: "每天 13:00", value: "0 13 * * *" },
  { label: "每 5 分钟", value: "*/5 * * * *" },
  { label: "自定义", value: "custom" },
];

interface Props {
  module: FeedModule;
  onBack: () => void;
}

interface ModuleConfig {
  keywords?: string[];
  topics?: string[];
  users?: string[];
  podcast_ids?: string[];
  user_ids?: string[];
  folder_path?: string;
  up_uids?: string[];
  follow_feed?: boolean;
  follow_feed_types?: number[];
  fetch_follow_limit?: number;
  keyword_filter?: boolean;
  sessdata?: string;
  subscription_types?: SubType[];
}

interface ModuleGuide {
  title: string;
  description: string;
  tips: string[];
  examples?: { label: string; value: string }[];
}

const MODULE_CONFIGS: Record<string, {
  name: string;
  icon: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; type?: "array" | "string" | "boolean"; description?: string }[];
  guide: ModuleGuide;
}> = {
  "arxiv-tracker": {
    name: "arXiv 论文追踪",
    icon: "📄",
    description: "自动追踪 arXiv 上最新的学术论文，支持关键词 AND/OR 搜索模式，可自动下载 PDF 和图片到文献库。",
    fields: [
      {
        key: "keywords",
        label: "关键词",
        placeholder: "robotics, manipulation, grasp",
        type: "array",
        description: "输入你感兴趣的研究领域关键词，多个关键词用逗号分隔"
      },
    ],
    guide: {
      title: "如何使用 arXiv 追踪",
      description: "arXiv 是计算机科学、物理学、数学等领域最重要的预印本论文库。通过设置关键词，系统会自动爬取相关新论文。",
      tips: [
        "关键词建议使用英文，覆盖你研究领域的核心术语",
        "在 ArXiv 追踪器页面可以使用 AND/OR 模式进行高级搜索",
        "系统会自动去重，跳过已在文献库中的论文",
        "喜欢的论文可以一键保存到文献库，自动下载 PDF 和配图",
        "每天自动运行，在情报 Feed 中展示新论文"
      ],
      examples: [
        { label: "机器人操作", value: "robotics manipulation grasp" },
        { label: "深度学习", value: "deep learning neural network" },
        { label: "强化学习", value: "reinforcement learning RL policy" },
      ]
    }
  },
  "semantic-scholar-tracker": {
    name: "Semantic Scholar",
    icon: "🎓",
    description: "追踪 Semantic Scholar 上的最新论文，支持引用和参考文献追踪。",
    fields: [
      {
        key: "keywords",
        label: "关键词",
        placeholder: "machine learning, NLP",
        type: "array",
        description: "输入研究领域的英文关键词"
      },
    ],
    guide: {
      title: "Semantic Scholar 追踪指南",
      description: "Semantic Scholar 是 Allen Institute for AI 推出的学术搜索引擎，提供更精准的论文推荐。",
      tips: [
        "支持通过论文 ID 追踪引用和参考文献",
        "与 arXiv 追踪器互补，覆盖更多期刊和会议论文",
        "提供引用计数等学术影响力指标"
      ]
    }
  },
  "xiaohongshu-tracker": {
    name: "小红书",
    icon: "📕",
    description: "追踪小红书上的科研、读博、留学相关笔记，支持关键词和用户追踪。",
    fields: [
      {
        key: "keywords",
        label: "关键词",
        placeholder: "科研, 读博, 论文, 学术",
        type: "array",
        description: "输入你感兴趣的话题关键词，支持中文"
      },
      {
        key: "user_ids",
        label: "用户ID（可选）",
        placeholder: "输入用户主页链接或用户ID",
        type: "array",
        description: "追踪特定用户的更新，可从用户主页URL中获取ID"
      },
    ],
    guide: {
      title: "小红书科研内容追踪",
      description: "小红书上有大量读博经验、科研技巧、留学申请等实用内容。",
      tips: [
        "建议关键词：科研、读博、论文、学术、科研日常、实验室",
        "可通过 RSSHub 获取小红书内容",
        "注意部分用户内容可能需要登录才能查看"
      ],
      examples: [
        { label: "科研日常", value: "科研, 读博, 实验室" },
        { label: "论文写作", value: "论文, 写作, 投稿" },
      ]
    }
  },
  "bilibili-tracker": {
    name: "Bilibili",
    icon: "📺",
    description: "追踪 B 站关注动态和新视频，支持视频、图文、文字、专栏等多种内容类型。",
    fields: [
      {
        key: "follow_feed",
        label: "启用关注动态流",
        placeholder: "true",
        type: "boolean",
        description: "自动获取你关注的UP主的最新动态和视频"
      },
      {
        key: "sessdata",
        label: "SESSDATA Cookie",
        placeholder: "从你的浏览器Cookie中复制SESSDATA值",
        type: "string",
        description: "B站登录凭证，用于获取关注动态。获取方式：登录bilibili.com → F12 → Application → Cookies → SESSDATA"
      },
      {
        key: "follow_feed_types",
        label: "动态类型",
        placeholder: "8, 2, 4, 64",
        type: "array",
        description: "要追踪的动态类型：8=视频投稿, 2=图文动态, 4=纯文字, 64=专栏文章"
      },
      {
        key: "keywords",
        label: "关键词过滤",
        placeholder: "机器学习, 编程, 教程, 科研",
        type: "array",
        description: "只显示包含这些关键词的动态（留空则显示所有）"
      },
      {
        key: "up_uids",
        label: "指定UP主UID（可选）",
        placeholder: "输入UP主UID，如：1567748478",
        type: "array",
        description: "除关注动态外，额外追踪特定UP主的视频"
      },
    ],
    guide: {
      title: "Bilibili 关注动态追踪",
      description: "自动获取你关注的UP主的最新动态，支持视频、图文、文字、专栏等多种内容类型。",
      tips: [
        "必须配置 SESSDATA 才能获取关注动态（在浏览器开发者工具中获取）",
        "动态类型：8=视频, 2=图文, 4=文字, 64=专栏",
        "可以设置关键词过滤，只关注感兴趣的内容",
        "可以同时追踪指定UP主的视频（即使未关注）",
        "系统会自动去重，不会重复显示已看过的动态"
      ],
      examples: [
        { label: "科研学习", value: "科研, 学术, 读博, 论文, AI" },
        { label: "编程技术", value: "编程, 教程, Python, 机器学习" },
        { label: "全部动态类型", value: "8, 2, 4, 64" },
      ]
    }
  },
  "xiaoyuzhou-tracker": {
    name: "小宇宙",
    icon: "🎙️",
    description: "追踪小宇宙播客，发现科研、学术、科技类播客节目。",
    fields: [
      {
        key: "keywords",
        label: "关键词",
        placeholder: "科研, 学术, AI, 科技",
        type: "array",
        description: "播客标题或shownotes中的关键词"
      },
      {
        key: "podcast_ids",
        label: "播客ID（可选）",
        placeholder: "输入播客链接或ID",
        type: "array",
        description: "追踪特定播客的更新"
      },
    ],
    guide: {
      title: "小宇宙播客追踪",
      description: "小宇宙是国内最受欢迎的播客平台，有大量高质量的知识类播客。",
      tips: [
        "推荐关键词：科研、学术、读博、AI、科技、创投",
        "知名播客：忽左忽右、随机波动、硅谷101等",
        "适合通勤、休息时收听"
      ]
    }
  },
  "zhihu-tracker": {
    name: "知乎",
    icon: "💡",
    description: "追踪知乎上的科研、学术、技术话题和优秀回答者。",
    fields: [
      {
        key: "keywords",
        label: "关键词",
        placeholder: "科研, 读博, 论文, 学术",
        type: "array",
        description: "问题或回答中的关键词"
      },
      {
        key: "topics",
        label: "话题（可选）",
        placeholder: "输入话题ID或链接",
        type: "array",
        description: "追踪特定话题下的新问题"
      },
      {
        key: "users",
        label: "用户（可选）",
        placeholder: "输入用户ID或链接",
        type: "array",
        description: "追踪特定用户的最新回答"
      },
    ],
    guide: {
      title: "知乎学术内容追踪",
      description: "知乎上有大量科研经验分享、学术圈讨论、技术干货。",
      tips: [
        "推荐关注话题：科研、读博、研究生、论文写作",
        "关注优秀的科研领域答主",
        "筛选高赞回答，质量更有保障"
      ]
    }
  },
  "folder-monitor": {
    name: "文件夹监控",
    icon: "📁",
    description: "监控指定文件夹的变化，自动将新文件导入到情报库。",
    fields: [
      {
        key: "folder_path",
        label: "文件夹路径",
        placeholder: "/Users/xxx/Downloads/Papers",
        type: "string",
        description: "输入要监控的文件夹绝对路径"
      },
    ],
    guide: {
      title: "文件夹监控指南",
      description: "自动监控指定文件夹，当有新文件（如 PDF）加入时自动导入并建立索引。",
      tips: [
        "建议使用下载文件夹或专门存放新论文的文件夹",
        "支持 PDF、Markdown、TXT 等格式",
        "导入后会自动提取元数据并建立搜索索引",
        "原文件不会被移动或删除"
      ],
      examples: [
        { label: "下载文件夹", value: "/Users/用户名/Downloads" },
        { label: "文献文件夹", value: "/Users/用户名/Documents/Papers" },
      ]
    }
  },
};

export default function ModuleDetail({ module, onBack }: Props) {
  const toast = useToast();
  const { setFeedModules } = useStore();
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig>({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState(module.enabled);
  const [scheduleMode, setScheduleMode] = useState(
    SCHEDULE_PRESETS.some((p) => p.value === module.schedule) ? module.schedule : "custom"
  );
  const [customSchedule, setCustomSchedule] = useState(
    SCHEDULE_PRESETS.some((p) => p.value === module.schedule) ? "" : module.schedule
  );
  const [updatingRuntime, setUpdatingRuntime] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Record<string, string[]>>({});
  const [subTypes, setSubTypes] = useState<SubType[]>([]);
  const [savingSubscriptions, setSavingSubscriptions] = useState(false);

  const configSchema = MODULE_CONFIGS[module.id];

  useEffect(() => {
    api.get<ModuleConfig>(`/api/modules/${module.id}/config`)
      .then((config) => {
        setModuleConfig(config);
        setSubTypes(config.subscription_types || []);
        setSubscriptions({
          up_uids: config.up_uids || [],
          user_ids: config.user_ids || [],
          users: config.users || [],
          topics: config.topics || [],
          podcast_ids: config.podcast_ids || [],
        });
      })
      .catch(() => setModuleConfig({}));
  }, [module.id]);

  async function saveConfig() {
    setSaving(true);
    try {
      await api.post("/api/preferences", {
        modules: {
          [module.id]: moduleConfig,
        },
      });
      toast.success("保存成功", "配置已更新");
    } catch (err) {
      toast.error("保存失败", "请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  async function saveRuntimeSettings() {
    const scheduleToSave = scheduleMode === "custom" ? customSchedule.trim() : scheduleMode;
    if (!scheduleToSave) {
      toast.error("请输入定时表达式");
      return;
    }
    setUpdatingRuntime(true);
    try {
      await api.patch(`/api/modules/${module.id}`, {
        enabled: moduleEnabled,
        schedule: scheduleToSave,
      });
      toast.success("保存成功", "模块运行设置已更新");
      // Refresh feed modules list in store so parent views stay consistent
      const modulesRes = await api.get<{ modules: FeedModule[] }>("/api/modules");
      if (modulesRes && modulesRes.modules) {
        setFeedModules(modulesRes.modules);
      }
    } catch (err) {
      toast.error("保存失败", "请检查定时表达式是否正确");
    } finally {
      setUpdatingRuntime(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      await api.post(`/api/modules/${module.id}/run`, {});
      toast.success("已开始运行", "模块正在执行中...");
    } catch (err) {
      toast.error("运行失败", "请稍后重试");
    } finally {
      setRunning(false);
    }
  }

  async function saveSubscriptions(next: Record<string, string[]>) {
    setSavingSubscriptions(true);
    try {
      const body: Record<string, any> = {};
      if ("up_uids" in next) body.up_uids = next.up_uids;
      if ("user_ids" in next) body.user_ids = next.user_ids;
      if ("users" in next) body.users = next.users;
      if ("topics" in next) body.topics = next.topics;
      if ("podcast_ids" in next) body.podcast_ids = next.podcast_ids;
      await api.post(`/api/modules/${module.id}/config`, body);
      setModuleConfig((prev) => ({ ...prev, ...body }));
      setSubscriptions(next);
      toast.success("订阅已更新");
    } catch {
      toast.error("订阅保存失败", "");
    } finally {
      setSavingSubscriptions(false);
    }
  }

  function updateConfigField(key: string, value: string, type?: string) {
    if (type === "array") {
      const arrayValue = value.split(",").map((s) => s.trim()).filter(Boolean);
      // Convert numeric strings to numbers for follow_feed_types
      if (key === "follow_feed_types") {
        setModuleConfig((prev) => ({ ...prev, [key]: arrayValue.map(v => parseInt(v) || 0) as number[] }));
      } else {
        setModuleConfig((prev) => ({ ...prev, [key]: arrayValue }));
      }
    } else if (type === "boolean") {
      setModuleConfig((prev) => ({ ...prev, [key]: value === "true" }));
    } else {
      setModuleConfig((prev) => ({ ...prev, [key]: value }));
    }
  }

  function getConfigFieldValue(key: string, type?: string): string {
    const value = moduleConfig[key as keyof ModuleConfig];
    if (type === "array" && Array.isArray(value)) {
      return value.join(", ");
    }
    if (type === "boolean") {
      return value === true ? "true" : "false";
    }
    return (value as string) || "";
  }

  if (!configSchema) {
    return (
      <PageContainer>
        <PageHeader title={module.name} subtitle="该模块暂无配置选项" icon={Settings} />
        <PageContent>
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
            <p>该模块暂无配置选项</p>
            <button onClick={onBack} style={{ marginTop: "20px" }}>返回</button>
          </div>
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={configSchema.name}
        subtitle={configSchema.description}
        icon={Settings}
        actions={
          <>
            <button
              onClick={onBack}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-hover)",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              <ArrowLeft style={{ width: "16px", height: "16px" }} />
              返回
            </button>
            <button
              onClick={runNow}
              disabled={running}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "var(--radius-full)",
                background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(188, 164, 227, 0.35)",
              }}
            >
              <Play style={{ width: "16px", height: "16px" }} />
              {running ? "运行中..." : "立即运行"}
            </button>
          </>
        }
      />

      <PageContent maxWidth="1200px">
        <Grid columns={2} gap="lg">
          {/* Left: Configuration */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <Card title="运行设置" icon={<Clock style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Enabled Toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)" }}>启用模块</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>关闭后该模块将停止定时运行</div>
                  </div>
                  <ToggleSwitch enabled={moduleEnabled} onChange={() => setModuleEnabled((v) => !v)} />
                </div>

                {module.next_run && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    <Info style={{ width: "14px", height: "14px" }} />
                    预计下次运行：{new Date(module.next_run).toLocaleString("zh-CN")}
                  </div>
                )}

                {/* Schedule Selector */}
                <div>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "8px" }}>运行计划</div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "12px" }}>选择模块自动执行的时间</div>
                  <select
                    value={scheduleMode}
                    onChange={(e) => setScheduleMode(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: "var(--radius-full)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-app)",
                      color: "var(--text-main)",
                      fontSize: "0.9375rem",
                      outline: "none",
                    }}
                  >
                    {SCHEDULE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  {scheduleMode === "custom" && (
                    <>
                      <input
                        type="text"
                        value={customSchedule}
                        onChange={(e) => setCustomSchedule(e.target.value)}
                        placeholder="例如：0 8 * * *"
                        style={{
                          width: "100%",
                          marginTop: "12px",
                          padding: "12px 16px",
                          borderRadius: "var(--radius-full)",
                          border: "1px solid var(--border-light)",
                          background: "var(--bg-app)",
                          color: "var(--text-main)",
                          fontSize: "0.9375rem",
                          outline: "none",
                        }}
                      />
                      <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        格式：分 时 日 月 周（如 0 8 * * 1 表示每周一 8:00）
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={saveRuntimeSettings}
                  disabled={updatingRuntime}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "12px 24px",
                    borderRadius: "var(--radius-full)",
                    background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                    color: "white",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Save style={{ width: "18px", height: "18px" }} />
                  {updatingRuntime ? "保存中..." : "保存运行设置"}
                </button>
              </div>
            </Card>

            <Card title="订阅管理" icon={<BookOpen style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />}>
              <SubscriptionManager
                types={subTypes}
                subscriptions={subscriptions}
                onChange={saveSubscriptions}
                disabled={savingSubscriptions}
              />
            </Card>

            <Card title="配置参数" icon={<Settings style={{ width: "20px", height: "20px", color: "var(--color-primary)" }} />}>
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {configSchema.fields.map((field) => (
                  <div key={field.key}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.9375rem",
                        fontWeight: 600,
                        color: "var(--text-main)",
                        marginBottom: "8px",
                      }}
                    >
                      {field.label}
                    </label>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
                      {field.description}
                    </p>
                    {field.type === "boolean" ? (
                      <div style={{ display: "flex", gap: "12px" }}>
                        <button
                          onClick={() => updateConfigField(field.key, "true", field.type)}
                          style={{
                            padding: "10px 20px",
                            borderRadius: "var(--radius-full)",
                            border: "1px solid var(--border-light)",
                            background: getConfigFieldValue(field.key, field.type) === "true" ? "var(--color-primary)" : "var(--bg-app)",
                            color: getConfigFieldValue(field.key, field.type) === "true" ? "white" : "var(--text-main)",
                            fontSize: "0.875rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                        >
                          启用
                        </button>
                        <button
                          onClick={() => updateConfigField(field.key, "false", field.type)}
                          style={{
                            padding: "10px 20px",
                            borderRadius: "var(--radius-full)",
                            border: "1px solid var(--border-light)",
                            background: getConfigFieldValue(field.key, field.type) === "false" ? "var(--color-error)" : "var(--bg-app)",
                            color: getConfigFieldValue(field.key, field.type) === "false" ? "white" : "var(--text-main)",
                            fontSize: "0.875rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                        >
                          禁用
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={getConfigFieldValue(field.key, field.type)}
                          onChange={(e) => updateConfigField(field.key, e.target.value, field.type)}
                          placeholder={field.placeholder}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "var(--radius-full)",
                            border: "1px solid var(--border-light)",
                            background: "var(--bg-app)",
                            color: "var(--text-main)",
                            fontSize: "0.9375rem",
                            outline: "none",
                          }}
                        />
                        {field.type === "array" && (
                          <p style={{ marginTop: "8px", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                            多个值用逗号分隔
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}

                <button
                  onClick={saveConfig}
                  disabled={saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "12px 24px",
                    borderRadius: "var(--radius-full)",
                    background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
                    color: "white",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    marginTop: "8px",
                  }}
                >
                  <Save style={{ width: "18px", height: "18px" }} />
                  {saving ? "保存中..." : "保存配置"}
                </button>
              </div>
            </Card>

            {/* Examples */}
            {configSchema.guide.examples && (
              <Card title="配置示例" icon={<BookOpen style={{ width: "20px", height: "20px", color: "var(--color-secondary)" }} />}>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {configSchema.guide.examples.map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const field = configSchema.fields.find(f => f.key === "keywords");
                        if (field) {
                          updateConfigField("keywords", example.value, "array");
                          toast.success("已填充", `使用示例：${example.label}`);
                        }
                      }}
                      style={{
                        textAlign: "left",
                        padding: "16px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-hover)",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border-light)";
                      }}
                    >
                      <p style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>{example.label}</p>
                      <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{example.value}</p>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Right: Guide */}
          <Card title="使用指南" icon={<Info style={{ width: "20px", height: "20px", color: "var(--color-warning)" }} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "8px" }}>
                  {configSchema.guide.title}
                </h3>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {configSchema.guide.description}
                </p>
              </div>

              <div>
                <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckCircle style={{ width: "16px", height: "16px", color: "#10B981" }} />
                  使用技巧
                </h4>
                <ul style={{ display: "flex", flexDirection: "column", gap: "12px", padding: 0, margin: 0, listStyle: "none" }}>
                  {configSchema.guide.tips.map((tip, idx) => (
                    <li key={idx} style={{ display: "flex", gap: "12px", fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      <span style={{ color: "var(--color-primary)", fontWeight: 700, flexShrink: 0 }}>{idx + 1}.</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ padding: "16px", borderRadius: "var(--radius-md)", background: "rgba(188, 164, 227, 0.1)", border: "1px solid rgba(188, 164, 227, 0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "var(--color-primary)" }}>
                  <Clock style={{ width: "16px", height: "16px" }} />
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>运行计划</span>
                </div>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{module.schedule}</p>
              </div>
            </div>
          </Card>
        </Grid>
      </PageContent>
    </PageContainer>
  );
}
