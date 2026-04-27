import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart3,
  BookHeart,
  BookOpen,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Compass,
  Database,
  Inbox,
  Loader2,
  MessageSquareText,
  RefreshCcw,
  Send,
  Sparkles,
  Square,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import { PageContainer, PageContent, PageHeader } from "../../components/Layout";
import { api } from "../../core/api";
import { isActionEnterKey, isComposingKeyboardEvent } from "../../core/keyboard";
import { type ActiveTab, useStore } from "../../core/store";
import { useChat } from "../../hooks/useChat";
import type { ChatRunStatus, Message } from "../../types/chat";

interface AssistantOverviewResponse {
  system: {
    provider: "codex" | "claude";
    providerLabel: string;
    vaultReady: boolean;
    literatureReady: boolean;
  };
  inbox: {
    totalUnread: number;
    unreadByModule: Record<string, number>;
    spotlight: AssistantSpotlightCard[];
  };
  wiki: {
    intel: WikiSnapshot;
    lit: WikiSnapshot;
  };
  insights: {
    totalCards: number;
    thisWeek: number;
    readingStreak: number;
    topKeyword: string | null;
    todaySummary: string | null;
    activityCount: number;
    chatCount: number;
    moduleRunCount: number;
  };
  conversations: {
    activeCount: number;
    recent: RecentConversation[];
  };
}

interface AssistantSpotlightCard {
  id: string;
  title: string;
  summary: string;
  moduleId: string;
  score: number;
  tags: string[];
  sourceUrl: string;
  createdAt: number;
}

interface WikiSnapshot {
  ready: boolean;
  total: number;
  byCategory: Record<string, number>;
}

interface RecentConversation {
  id: string;
  title: string;
  cliType: string;
  updatedAt: number;
  rawConversationId: string;
  rawSessionId: string;
  lastMessagePreview: string;
}

interface AssistantSessionsResponse {
  items: RecentConversation[];
  count: number;
}

interface WorkflowRecipe {
  id: string;
  title: string;
  description: string;
  accent: string;
  skill: string;
  skillLabel: string;
  intent: string;
  fields: WorkflowField[];
  outputSpec: string[];
  wikiLinkage: string[];
  defaultExtra?: string;
}

interface WorkflowField {
  id: string;
  label: string;
  placeholder: string;
  helper?: string;
  multiline?: boolean;
  required?: boolean;
  defaultValue?: string;
}

interface JumpShortcut {
  id: string;
  title: string;
  description: string;
  tab: ActiveTab;
  accent: string;
  icon: ReactNode;
}

const MODULE_LABELS: Record<string, string> = {
  "arxiv-tracker": "ArXiv",
  "semantic-scholar-tracker": "Semantic Scholar",
  "xiaohongshu-tracker": "小红书",
  "bilibili-tracker": "哔哩哔哩",
  "xiaoyuzhou-tracker": "小宇宙",
  "zhihu-tracker": "知乎",
  "folder-monitor": "文件监控",
};

const WORKFLOWS_PER_PAGE = 6;

const shellStyle: CSSProperties = {
  borderRadius: "8px",
  border: "1px solid rgba(24, 35, 52, 0.08)",
  background: "rgba(255, 255, 255, 0.9)",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  overflow: "hidden",
};

const sectionTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "#17324d",
};

const badgeBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "7px 12px",
  borderRadius: "8px",
  fontSize: "0.8125rem",
  fontWeight: 700,
  border: "1px solid rgba(23, 50, 77, 0.12)",
};

function panelHeader(title: string, icon: ReactNode, extra?: ReactNode) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "18px 20px 14px",
        borderBottom: "1px solid rgba(24, 35, 52, 0.08)",
      }}
    >
      <div style={sectionTitleStyle}>
        {icon}
        <span>{title}</span>
      </div>
      {extra}
    </div>
  );
}

function CollapseToggle({
  expanded,
  onClick,
  expandLabel = "展开",
  collapseLabel = "收起",
}: {
  expanded: boolean;
  onClick: () => void;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        borderRadius: "8px",
        border: "1px solid rgba(23, 50, 77, 0.08)",
        background: "rgba(255,255,255,0.92)",
        color: "#425466",
        padding: "6px 10px",
        fontSize: "0.78rem",
        fontWeight: 700,
        cursor: "pointer",
      }}
      aria-label={expanded ? collapseLabel : expandLabel}
    >
      {expanded ? (
        <ChevronDown style={{ width: "14px", height: "14px" }} />
      ) : (
        <ChevronRight style={{ width: "14px", height: "14px" }} />
      )}
      <span>{expanded ? collapseLabel : expandLabel}</span>
    </button>
  );
}

function readableModuleName(moduleId: string): string {
  return MODULE_LABELS[moduleId] ?? moduleId;
}

function toMillis(value: number): number {
  return value > 1_000_000_000_000 ? value : value * 1000;
}

function relativeTime(rawValue: number): string {
  const value = toMillis(rawValue);
  const diff = Date.now() - value;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(value).toLocaleDateString("zh-CN");
}

function summarizeCategories(snapshot: WikiSnapshot): string {
  const entries = Object.entries(snapshot.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  if (entries.length === 0) return "尚未沉淀页面";
  return entries.map(([name, count]) => `${name} ${count}`).join(" · ");
}

function buildSpotlightPrompt(card: AssistantSpotlightCard): string {
  const tagLine = card.tags.length > 0 ? `标签：${card.tags.join(" / ")}` : "标签：暂无";
  return [
    "请把这条今日情报处理成可执行结果：",
    "1. 判断它更适合进入 Internet Wiki、Literature Wiki，还是只保留为今日情报。",
    "2. 提炼 3 个关键点和 2 个下一步动作。",
    "3. 如果值得沉淀，请给出建议的 Wiki 页面标题和分类。",
    "",
    `标题：${card.title}`,
    `摘要：${card.summary}`,
    tagLine,
    `来源模块：${readableModuleName(card.moduleId)}`,
  ].join("\n");
}

function buildWorkflowRecipes(data: AssistantOverviewResponse | null): WorkflowRecipe[] {
  const spotlight = data?.inbox.spotlight ?? [];
  const intelCount = data?.wiki.intel.total ?? 0;
  const litCount = data?.wiki.lit.total ?? 0;
  const topKeyword = data?.insights.topKeyword ?? "当前偏好";
  const topTitles =
    spotlight
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${item.title}`)
      .join("\n") || "暂无新的高优先级情报";

  return [
    {
      id: "mentor-followup",
      title: "导师式 Follow-up 论文整理",
      description: "给一组 follow-up 论文笔记目录，用 mentor-zh 做中文研究综述、关系图和 idea 生成。",
      accent: "#0f766e",
      skill: "$mentor-zh",
      skillLabel: "mentor-zh",
      intent: "基于一个论文 markdown 文件夹做导师式 follow-up 调研，识别源论文，分析每篇论文的 challenge、场景、技术路径、insight，并生成可写回 Obsidian/Literature Wiki 的结构化结果。",
      fields: [
        {
          id: "paperFolder",
          label: "论文文件夹路径",
          placeholder: "/Users/huanc/Library/Mobile Documents/iCloud~md~obsidian/Documents/Research/Literature/xxx-followups",
          helper: "目录里放一组论文 markdown，通常包含源论文和 follow-up 论文。",
          required: true,
        },
      ],
      outputSpec: [
        "先运行 mentor-zh 的论文上下文收集流程，再综合分析。",
        "输出源论文识别、逐篇 challenge/场景/技术洞察、follow-up 关系图、Obsidian 双链建议。",
        "生成 10 个足够具体的研究 idea，并标出最值得推进的 3 个。",
        "如果填写了我的 idea，请单独评估它的可行性、缺口和下一步实验。",
      ],
      wikiLinkage: [
        "结果要给出 Literature Wiki 页面结构。",
        "关系图要兼容 Obsidian 双链。",
        "最后列出应该回写到哪些论文 note 的链接块。",
      ],
      defaultExtra: "",
    },
    {
      id: "profile-ops",
      title: "整理个人情报档案",
      description: "把近期信号归并成稳定的人设、项目和兴趣结构。",
      accent: "#0f766e",
      skill: "assistant-profile-intel",
      skillLabel: "个人情报整理",
      intent: "把用户近期的兴趣、项目、习惯、研究状态和待推进事项整理成可长期维护的个人情报档案。",
      fields: [
        {
          id: "profileScope",
          label: "整理范围",
          placeholder: "例如：最近 30 天的研究方向、内容输入、项目推进和精力状态",
          defaultValue: `当前偏好关键词：${topKeyword}`,
        },
        {
          id: "sourceMaterial",
          label: "补充材料或路径",
          placeholder: "可以填 Internet Wiki 路径、Vault 路径、最近对话主题，或直接粘贴一段材料。",
          multiline: true,
        },
        {
          id: "maintenanceGoal",
          label: "维护目标",
          placeholder: "例如：形成个人主题树、更新研究画像、整理接下来两周的优先级",
          multiline: true,
        },
      ],
      outputSpec: [
        "输出推荐的个人档案结构。",
        "列出现在最值得维护的 5 个主题。",
        "把每个主题拆成证据、判断、下一步动作。",
      ],
      wikiLinkage: [
        `结合当前 Internet Wiki 页面数：${intelCount}。`,
        "给出建议新增或更新的 Internet Wiki 页面标题。",
        "标注哪些内容只适合留在今日情报，不应沉淀为长期页面。",
      ],
    },
    {
      id: "intel-wiki",
      title: "维护 Internet Wiki",
      description: "把最近的个人情报和兴趣信号沉淀成稳定知识。",
      accent: "#c2410c",
      skill: "assistant-intel-wiki",
      skillLabel: "Internet Wiki 维护",
      intent: "把最近的个人情报、兴趣信号、创作者信息和行动线索沉淀为 Internet Wiki 页面。",
      fields: [
        {
          id: "intelSource",
          label: "待处理情报",
          placeholder: "粘贴情报标题/摘要，或写明从今日情报、某个模块、某个路径读取。",
          defaultValue: topTitles,
          multiline: true,
        },
        {
          id: "wikiCategory",
          label: "目标分类",
          placeholder: "例如：研究方向 / 创作者 / 工具链 / 长期观察 / 项目线索",
        },
        {
          id: "decisionRule",
          label: "沉淀规则",
          placeholder: "例如：只保留可复用判断，不要把临时新闻写成长期页面。",
          multiline: true,
        },
      ],
      outputSpec: [
        "列出最值得新增或更新的 Internet Wiki 页面。",
        "每页给出分类、标题、核心提纲和需要追加的证据。",
        "给出不值得沉淀的内容及原因。",
      ],
      wikiLinkage: [
        `结合当前 Internet Wiki 页面数：${intelCount}。`,
        "给出页面之间的双链关系。",
        "需要把今日情报转成页面更新任务，而不是只做摘要。",
      ],
    },
    {
      id: "literature-ops",
      title: "组织本周文献",
      description: "按主题聚类、补齐缺口，并决定哪些要写进文献库。",
      accent: "#7c3aed",
      skill: "assistant-literature-organizer",
      skillLabel: "文献组织",
      intent: "把本周论文情报按研究主题聚类，判断哪些需要进入 Literature Wiki，哪些只是待读线索。",
      fields: [
        {
          id: "paperSources",
          label: "论文来源",
          placeholder: "粘贴论文列表，或填 arXiv/Semantic Scholar 追踪结果、文献库路径。",
          defaultValue: topTitles,
          multiline: true,
        },
        {
          id: "researchTheme",
          label: "研究主题",
          placeholder: "例如：3D scene understanding / robot foundation model / long-horizon planning",
        },
        {
          id: "readingConstraint",
          label: "阅读约束",
          placeholder: "例如：只选 5 篇最值得读的；优先找 survey gap；按实验可复现性排序。",
          multiline: true,
        },
      ],
      outputSpec: [
        "按研究主题聚类论文。",
        "指出最值得补看的空缺和为什么。",
        "给出 Literature Wiki 页面标题、页面结构和阅读优先级。",
      ],
      wikiLinkage: [
        `结合当前 Literature Wiki 页面数：${litCount}。`,
        "把论文和已有 Literature Wiki/Internet Wiki 主题建立链接。",
        "输出可以直接转成阅读待办的清单。",
      ],
    },
    {
      id: "today-brief",
      title: "总结今日情报",
      description: "先收束，再给出下一步，不让 Feed 停留在浏览层。",
      accent: "#2563eb",
      skill: "assistant-daily-intel",
      skillLabel: "今日情报收束",
      intent: "把今日情报从浏览状态收束成信号判断、Wiki 更新和下一步动作。",
      fields: [
        {
          id: "todayScope",
          label: "今日范围",
          placeholder: "例如：今天所有未读情报 / 小红书和 arXiv / 我手动挑出的几条",
          defaultValue: `未读情报数：${data?.inbox.totalUnread ?? 0}；今日活动数：${data?.insights.activityCount ?? 0}；模块运行次数：${data?.insights.moduleRunCount ?? 0}`,
        },
        {
          id: "priorityQuestion",
          label: "优先判断",
          placeholder: "例如：哪些能推动我的研究？哪些只是噪声？哪些应该写进 Wiki？",
          multiline: true,
        },
      ],
      outputSpec: [
        "输出今天最重要的 3 条信号。",
        "每条信号给出行动建议和沉淀位置。",
        "拆分成 Wiki 更新、待办、忽略三类。",
      ],
      wikiLinkage: [
        "Internet Wiki 承接个人情报和长期观察。",
        "Literature Wiki 承接论文、方法和研究脉络。",
        "不够稳定的内容只留作今日情报备注。",
      ],
    },
    {
      id: "analytics-review",
      title: "复盘数据洞察",
      description: "根据阅读 streak、活跃度和偏好，调整接下来的关注方向。",
      accent: "#be123c",
      skill: "assistant-research-rhythm",
      skillLabel: "研究节奏复盘",
      intent: "结合阅读 streak、活跃度、偏好关键词和新增卡片，判断用户的信息摄入节奏和下一步研究动作。",
      fields: [
        {
          id: "metrics",
          label: "当前数据",
          placeholder: "累计卡片、本周新增、连续阅读天数、偏好关键词等。",
          defaultValue: `累计卡片：${data?.insights.totalCards ?? 0}；本周新增：${data?.insights.thisWeek ?? 0}；连续阅读：${data?.insights.readingStreak ?? 0} 天；高优先级关键词：${topKeyword}`,
          multiline: true,
        },
        {
          id: "reviewGoal",
          label: "复盘目标",
          placeholder: "例如：减少噪声输入，决定下周主题，找出最该推进的一条研究线。",
          multiline: true,
        },
      ],
      outputSpec: [
        "判断当前信息摄入状态。",
        "指出应该加强和减少的方向。",
        "给出接下来 3 个最值得推进的动作。",
      ],
      wikiLinkage: [
        "把稳定偏好写入个人情报档案。",
        "把研究主题变化同步到 Internet Wiki。",
        "把文献阅读计划同步到 Literature Wiki。",
      ],
    },
  ];
}

function workflowValue(
  values: Record<string, string>,
  field: WorkflowField,
): string {
  return values[field.id] ?? field.defaultValue ?? "";
}

function buildSkillWorkflowPrompt(
  workflow: WorkflowRecipe,
  values: Record<string, string> = {},
  extra = "",
): string {
  const fieldLines = workflow.fields.map((field) => {
    const value = workflowValue(values, field).trim();
    return `- ${field.label}${field.required ? "（必填）" : ""}：${value || "未填写"}`;
  });
  const skillLine = workflow.skill.startsWith("$")
    ? `请使用 ${workflow.skill} 这个 skill 完成任务。`
    : `请按 \`${workflow.skill}\` 工作流完成任务；如果本地存在同名 skill 或工具，请优先调用，否则使用助手工作台上下文执行。`;

  return [
    skillLine,
    "",
    `任务：${workflow.title}`,
    `目标：${workflow.intent}`,
    "",
    "用户填写的模板内容：",
    ...fieldLines,
    "",
    "需要的产出：",
    ...workflow.outputSpec.map((item, index) => `${index + 1}. ${item}`),
    "",
    "与 ABO 知识系统的联动要求：",
    ...workflow.wikiLinkage.map((item) => `- ${item}`),
    "",
    "额外补充：",
    (extra || workflow.defaultExtra || "无").trim(),
    "",
    "执行要求：",
    "- 先判断缺失信息；如果关键信息不足，列出最少需要用户补充的内容，同时尽量基于现有内容推进。",
    "- 输出要能直接转成 Wiki 页面、待办或下一轮对话指令。",
    "- 不要只总结，要给出可执行的整理结果。",
  ].join("\n");
}

function compactProcessText(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function splitToolMessage(message: Message) {
  const metadata = message.metadata ?? {};
  const command = compactProcessText(metadata.command ?? metadata.toolName);
  const rawContent = message.content.trim();
  const output = command && rawContent.startsWith(command)
    ? rawContent.slice(command.length).trim()
    : rawContent;

  return {
    command,
    output: output || "",
  };
}

function ProcessBlock({
  kind,
  title,
  message,
  defaultOpen,
}: {
  kind: "tool" | "thinking";
  title: string;
  message: Message;
  defaultOpen: boolean;
}) {
  const isTool = kind === "tool";
  const { command, output } = isTool ? splitToolMessage(message) : { command: "", output: message.content.trim() };
  const accent = isTool ? "#2563eb" : "#7c3aed";
  const metadataText = safeJson(message.metadata);

  return (
    <details open={defaultOpen}>
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 800,
          color: accent,
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {isTool ? <Database style={{ width: "14px", height: "14px", flexShrink: 0 }} /> : <Brain style={{ width: "14px", height: "14px", flexShrink: 0 }} />}
        <span>{title}</span>
      </summary>

      <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {command && (
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#64748b", marginBottom: "5px" }}>命令</div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "rgba(37, 99, 235, 0.06)",
                border: "1px solid rgba(37, 99, 235, 0.1)",
                borderRadius: "8px",
                padding: "9px 10px",
                fontSize: "0.8rem",
                lineHeight: 1.55,
                color: "#1e3a5f",
              }}
            >
              {command}
            </pre>
          </div>
        )}

        {output ? (
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#64748b", marginBottom: "5px" }}>
              {isTool ? "Output" : "思考"}
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "rgba(15, 23, 42, 0.05)",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                borderRadius: "8px",
                padding: "10px",
                fontSize: "0.82rem",
                lineHeight: 1.55,
                color: "#334155",
              }}
            >
              {output}
            </pre>
          </div>
        ) : (
          <div style={{ fontSize: "0.8rem", color: "#64748b" }}>等待输出...</div>
        )}

        {metadataText !== "{}" && (
          <details>
            <summary style={{ cursor: "pointer", color: "#64748b", fontSize: "0.76rem", fontWeight: 800 }}>
              原始事件
            </summary>
            <pre
              style={{
                margin: "8px 0 0",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "rgba(15, 23, 42, 0.04)",
                border: "1px solid rgba(15, 23, 42, 0.06)",
                borderRadius: "8px",
                padding: "8px",
                fontSize: "0.74rem",
                lineHeight: 1.45,
                color: "#64748b",
              }}
            >
              {metadataText}
            </pre>
          </details>
        )}
      </div>
    </details>
  );
}

function MessageBubble({ message, streaming }: { message: Message; streaming: boolean }) {
  const isUser = message.role === "user";
  const isError = message.contentType === "error";
  const isToolCall = message.contentType === "tool_call";
  const isThinking = message.contentType === "thinking";
  const toolLabel = compactProcessText(message.metadata?.label, message.status === "completed" ? "命令完成" : "命令执行中");
  const thinkingLabel = message.status === "completed" ? "思考过程" : "正在思考";

  if (!isUser && !isError && !isToolCall && !isThinking && !message.content.trim()) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          display: "flex",
          flexDirection: isUser ? "row-reverse" : "row",
          gap: "10px",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: isUser ? "#17324d" : isError ? "#fecaca" : "rgba(15, 118, 110, 0.12)",
            color: isUser ? "white" : isError ? "#7f1d1d" : "#0f766e",
          }}
        >
          {isUser ? (
            <Sparkles style={{ width: "16px", height: "16px" }} />
          ) : (
            <Bot style={{ width: "16px", height: "16px" }} />
          )}
        </div>

        <div
          style={{
            borderRadius: "8px",
            padding: "12px 14px",
            background: isUser ? "#17324d" : isError ? "rgba(254, 226, 226, 0.92)" : "rgba(255, 255, 255, 0.96)",
            color: isUser ? "white" : isError ? "#991b1b" : "#163047",
            border: isUser ? "none" : "1px solid rgba(23, 50, 77, 0.1)",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
            fontSize: "0.925rem",
            lineHeight: 1.7,
          }}
        >
          {isUser ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
          ) : (
            <div className="prose prose-sm max-w-none" style={{ color: "inherit" }}>
              {isToolCall ? (
                <ProcessBlock kind="tool" title={toolLabel} message={message} defaultOpen={message.status !== "completed"} />
              ) : isThinking ? (
                <ProcessBlock kind="thinking" title={thinkingLabel} message={message} defaultOpen={message.status !== "completed"} />
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p style={{ margin: "0 0 8px", lineHeight: 1.75 }}>{children}</p>,
                    ul: ({ children }) => <ul style={{ margin: "0 0 8px 18px" }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ margin: "0 0 8px 18px" }}>{children}</ol>,
                    code: ({ children }) => (
                      <code
                        style={{
                          background: "rgba(15, 23, 42, 0.06)",
                          padding: "2px 6px",
                          borderRadius: "6px",
                          fontSize: "0.85em",
                        }}
                      >
                        {children}
                      </code>
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
              {!isToolCall && !isThinking && streaming && (
                <span
                  style={{
                    display: "inline-block",
                    width: "9px",
                    height: "16px",
                    borderRadius: "3px",
                    background: "#0f766e",
                    marginLeft: "4px",
                    animation: "pulse 1s ease-in-out infinite",
                  }}
                />
              )}
              {(isToolCall || isThinking) && message.status !== "completed" && (
                <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite", marginTop: "8px" }} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRunSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} 分 ${rest} 秒`;
}

function RunStatusBar({ status }: { status: ChatRunStatus }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "720px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          borderRadius: "8px",
          border: "1px solid rgba(37, 99, 235, 0.14)",
          background: "rgba(239, 246, 255, 0.82)",
          color: "#1e3a5f",
          padding: "9px 12px",
          fontSize: "0.82rem",
          lineHeight: 1.5,
          boxShadow: "0 8px 18px rgba(37, 99, 235, 0.06)",
        }}
      >
        <Loader2 style={{ width: "15px", height: "15px", animation: "spin 1s linear infinite", flexShrink: 0 }} />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px",
              fontWeight: 700,
            }}
          >
            <span>工作机 {formatRunSeconds(status.elapsedSeconds)}</span>
            <span style={{ color: "#2563eb" }}>{status.label}</span>
          </div>
          {status.detail && (
            <div
              style={{
                color: "#64748b",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "640px",
              }}
              title={status.detail}
            >
              {status.detail}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AssistantWorkspace() {
  const setActiveTab = useStore((state) => state.setActiveTab);
  const {
    availableClis,
    selectedCli,
    selectCli,
    activeConversation,
    createNewConversation,
    switchConversation,
    closeConversation,
    refreshConversations,
    messages,
    sendMessage,
    stopGeneration,
    isConnected,
    isStreaming,
    streamStatus,
    error: chatError,
  } = useChat();

  const [overview, setOverview] = useState<AssistantOverviewResponse | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentConversation[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [recentConversationsCollapsed, setRecentConversationsCollapsed] = useState(false);
  const [hoveredConversationId, setHoveredConversationId] = useState<string | null>(null);
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string | null>(null);
  const [workflowPage, setWorkflowPage] = useState(0);
  const [jumpSectionExpanded, setJumpSectionExpanded] = useState(false);
  const [contextOverviewExpanded, setContextOverviewExpanded] = useState(false);
  const [workflowInputs, setWorkflowInputs] = useState<Record<string, Record<string, string>>>({});
  const [workflowExtras, setWorkflowExtras] = useState<Record<string, string>>({});
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingAutoScrollRef = useRef(false);
  const streamingRef = useRef(false);

  const workflows = useMemo(() => buildWorkflowRecipes(overview), [overview]);
  const workflowPageCount = Math.max(1, Math.ceil(workflows.length / WORKFLOWS_PER_PAGE));
  const safeWorkflowPage = Math.min(workflowPage, workflowPageCount - 1);
  const visibleWorkflows = useMemo(
    () => workflows.slice(safeWorkflowPage * WORKFLOWS_PER_PAGE, (safeWorkflowPage + 1) * WORKFLOWS_PER_PAGE),
    [safeWorkflowPage, workflows],
  );
  const recentConversations = recentSessions;
  const workflowColumns =
    viewportWidth >= 960 ? "repeat(3, minmax(0, 1fr))" : viewportWidth >= 700 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)";
  const jumpColumns =
    viewportWidth >= 1180 ? "repeat(4, minmax(0, 1fr))" : viewportWidth >= 760 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)";
  const contextColumns =
    viewportWidth >= 1120 ? "repeat(3, minmax(0, 1fr))" : viewportWidth >= 760 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)";
  const composerColumns = viewportWidth >= 760 ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)";
  const contextPending = loading && !overview;
  const recentConversationColumns =
    viewportWidth >= 1180
      ? "repeat(auto-fill, minmax(138px, 1fr))"
      : viewportWidth >= 760
      ? "repeat(auto-fill, minmax(128px, 1fr))"
      : "repeat(2, minmax(0, 1fr))";

  const shortcuts = useMemo<JumpShortcut[]>(
    () => [
      {
        id: "overview",
        title: "回到情报流",
        description: overview ? `未读 ${overview.inbox.totalUnread} 条，继续筛选今天的输入。` : "继续处理今日输入与信号。",
        tab: "overview",
        accent: "#2563eb",
        icon: <Inbox style={{ width: "18px", height: "18px" }} />,
      },
      {
        id: "wiki",
        title: "打开 Wiki",
        description: overview
          ? `Internet Wiki ${overview.wiki.intel.total} 页，Literature Wiki ${overview.wiki.lit.total} 页。`
          : "查看已沉淀的知识页面。",
        tab: "wiki",
        accent: "#c2410c",
        icon: <BookHeart style={{ width: "18px", height: "18px" }} />,
      },
      {
        id: "literature",
        title: "查看文献库",
        description: overview ? `当前 Literature Wiki ${overview.wiki.lit.total} 页。` : "继续整理论文和阅读记录。",
        tab: "literature",
        accent: "#7c3aed",
        icon: <BookOpen style={{ width: "18px", height: "18px" }} />,
      },
      {
        id: "dashboard",
        title: "看数据总览",
        description: overview?.insights.topKeyword
          ? `当前关注 ${overview.insights.topKeyword}，适合做一次复盘。`
          : "回到总览页看整体状态。",
        tab: "dashboard",
        accent: "#be123c",
        icon: <BarChart3 style={{ width: "18px", height: "18px" }} />,
      },
    ],
    [overview],
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.get<AssistantOverviewResponse>("/api/assistant/overview");
      setOverview(response);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载助手数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const response = await api.get<AssistantSessionsResponse>("/api/assistant/sessions?limit=12");
      setRecentSessions(response.items ?? []);
      setSessionCount(response.count ?? 0);
    } catch (error) {
      setLoadError((current) => current ?? (error instanceof Error ? error.message : "加载最近对话失败"));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const updateWorkflowInput = useCallback((workflowId: string, fieldId: string, value: string) => {
    setWorkflowInputs((current) => ({
      ...current,
      [workflowId]: {
        ...(current[workflowId] ?? {}),
        [fieldId]: value,
      },
    }));
  }, []);

  const updateWorkflowExtra = useCallback((workflowId: string, value: string) => {
    setWorkflowExtras((current) => ({
      ...current,
      [workflowId]: value,
    }));
  }, []);

  const buildWorkflowDraft = useCallback(
    (workflow: WorkflowRecipe) => buildSkillWorkflowPrompt(
      workflow,
      workflowInputs[workflow.id] ?? {},
      workflowExtras[workflow.id] ?? workflow.defaultExtra ?? "",
    ),
    [workflowExtras, workflowInputs],
  );

  const isNearBottom = useCallback((element: HTMLDivElement | null) => {
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
  }, []);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = messageListRef.current;
    if (!element) return;
    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadOverview();
      void loadRecentSessions();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadOverview, loadRecentSessions]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setWorkflowPage((current) => Math.min(current, workflowPageCount - 1));
  }, [workflowPageCount]);

  useEffect(() => {
    if (expandedWorkflowId && !visibleWorkflows.some((workflow) => workflow.id === expandedWorkflowId)) {
      setExpandedWorkflowId(null);
    }
  }, [expandedWorkflowId, visibleWorkflows]);

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }

    if (pendingAutoScrollRef.current || shouldStickToBottomRef.current) {
      const frame = window.requestAnimationFrame(() => {
        scrollMessagesToBottom(pendingAutoScrollRef.current ? "smooth" : "auto");
        pendingAutoScrollRef.current = false;
        shouldStickToBottomRef.current = true;
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [activeConversation?.id, isStreaming, messages, scrollMessagesToBottom]);

  useEffect(() => {
    if (streamingRef.current && !isStreaming) {
      void loadOverview();
      void loadRecentSessions();
    }
    streamingRef.current = isStreaming;
  }, [isStreaming, loadOverview, loadRecentSessions]);

  useEffect(() => {
    pendingAutoScrollRef.current = true;
  }, [activeConversation?.id]);

  const handleMessageListScroll = useCallback(() => {
    shouldStickToBottomRef.current = isNearBottom(messageListRef.current);
  }, [isNearBottom]);

  const handleSendDraft = useCallback(async () => {
    const content = draft.trim();
    if (!content || isLaunching) return;

    setIsLaunching(true);
    pendingAutoScrollRef.current = true;
    try {
      if (!activeConversation) {
        const conversation = await createNewConversation(selectedCli?.id, content.slice(0, 24), undefined, "assistant");
        if (!conversation) return;
        await sendMessage(content, conversation, "assistant");
      } else {
        await sendMessage(content, undefined, "assistant");
      }
      setDraft("");
      void loadRecentSessions();
      void loadOverview();
    } finally {
      setIsLaunching(false);
    }
  }, [activeConversation, createNewConversation, draft, isLaunching, loadOverview, loadRecentSessions, selectedCli, sendMessage]);

  const handleRunWorkflow = useCallback(
    async (workflow: WorkflowRecipe) => {
      const prompt = buildWorkflowDraft(workflow);
      setIsLaunching(true);
      pendingAutoScrollRef.current = true;
      try {
        const conversation = await createNewConversation(selectedCli?.id, workflow.title, undefined, "assistant");
        if (!conversation) return;
        await sendMessage(prompt, conversation, "assistant");
        void loadRecentSessions();
        void loadOverview();
      } finally {
        setIsLaunching(false);
      }
    },
    [buildWorkflowDraft, createNewConversation, loadOverview, loadRecentSessions, selectedCli, sendMessage],
  );

  const handleStopCurrentTurn = useCallback(async () => {
    pendingAutoScrollRef.current = false;
    await stopGeneration(activeConversation?.id);
    void loadRecentSessions();
    void loadOverview();
  }, [activeConversation?.id, loadOverview, loadRecentSessions, stopGeneration]);

  const handleDeleteConversation = useCallback(
    async (session: RecentConversation) => {
      setRecentSessions((current) => current.filter((item) => item.id !== session.id));
      setSessionCount((current) => Math.max(0, current - 1));
      await api.delete<{ success: boolean }>(`/api/assistant/sessions/${session.id}`, {
        rawConversationId: session.rawConversationId,
        rawSessionId: session.rawSessionId,
      });
      await closeConversation(session.rawConversationId, {
        activateFallback: false,
        deleteRemote: true,
      });
      await refreshConversations();
      await loadRecentSessions();
      void loadOverview();
    },
    [closeConversation, loadOverview, loadRecentSessions, refreshConversations],
  );

  const handleOpenConversation = useCallback(
    async (rawConversationId: string) => {
      pendingAutoScrollRef.current = true;
      await switchConversation(rawConversationId);
    },
    [switchConversation],
  );

  const handleJump = useCallback(
    (tab: ActiveTab) => {
      setActiveTab(tab);
    },
    [setActiveTab],
  );

  const providerBadge = (
    <div
      style={{
        ...badgeBaseStyle,
        background: "rgba(15, 118, 110, 0.08)",
        color: "#0f766e",
      }}
    >
      <Bot style={{ width: "14px", height: "14px" }} />
      <span>{overview?.system.providerLabel ?? selectedCli?.name ?? "AI 助手"}</span>
    </div>
  );

  const connectionBadge = (
    <div
      style={{
        ...badgeBaseStyle,
        background: isConnected ? "rgba(22, 163, 74, 0.08)" : "rgba(225, 29, 72, 0.08)",
        color: isConnected ? "#15803d" : "#be123c",
      }}
    >
      {isConnected ? <Wifi style={{ width: "14px", height: "14px" }} /> : <WifiOff style={{ width: "14px", height: "14px" }} />}
      <span>{isConnected ? "已连接" : "未连接"}</span>
    </div>
  );

  const loadingBadge = loading ? (
    <div
      style={{
        ...badgeBaseStyle,
        background: "rgba(37, 99, 235, 0.08)",
        color: "#1d4ed8",
      }}
    >
      <Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
      <span>{overview ? "刷新中" : "载入上下文"}</span>
    </div>
  ) : null;

  return (
    <PageContainer>
      <PageHeader
        title="助手"
        subtitle="让 Codex 帮你整理信息、维护 Wiki，并把今日情报推进成行动"
        icon={Bot}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "10px" }}>
            {providerBadge}
            {connectionBadge}
            {loadingBadge}
            <button
              onClick={() => {
                void loadOverview();
              }}
              style={{
                ...badgeBaseStyle,
                background: "rgba(15, 23, 42, 0.06)",
                color: "#17324d",
                cursor: "pointer",
              }}
            >
              <RefreshCcw style={{ width: "14px", height: "14px" }} />
              <span>刷新</span>
            </button>
          </div>
        }
      />

      <PageContent centered={false}>
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <section style={shellStyle}>
            {panelHeader(
              "常用助手",
              <Compass style={{ width: "18px", height: "18px", color: "#0f766e" }} />,
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "flex-end" }}>
                <StatusPill
                  label="Internet Wiki"
                  value={
                    contextPending ? "载入中" : overview?.system.vaultReady ? "已就绪" : "待配置"
                  }
                  accent="#c2410c"
                />
                <StatusPill
                  label="Literature Wiki"
                  value={
                    contextPending ? "载入中" : overview?.system.literatureReady ? "已就绪" : "待配置"
                  }
                  accent="#7c3aed"
                />
                <StatusPill
                  label="今日情报"
                  value={contextPending ? "补充中" : `${overview?.inbox.totalUnread ?? 0} 条未读`}
                  accent="#2563eb"
                />
              </div>,
            )}

            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {workflowPageCount > 1 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    color: "#64748b",
                    fontSize: "0.78rem",
                  }}
                >
                  <span>
                    每页 {WORKFLOWS_PER_PAGE} 个 · 第 {safeWorkflowPage + 1} / {workflowPageCount} 页
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedWorkflowId(null);
                        setWorkflowPage((current) => Math.max(0, current - 1));
                      }}
                      disabled={safeWorkflowPage === 0}
                      style={{
                        borderRadius: "8px",
                        border: "1px solid rgba(23, 50, 77, 0.08)",
                        background: "rgba(255,255,255,0.92)",
                        color: safeWorkflowPage === 0 ? "#94a3b8" : "#425466",
                        padding: "6px 9px",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: safeWorkflowPage === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      上一页
                    </button>
                    {Array.from({ length: workflowPageCount }).map((_, index) => {
                      const active = index === safeWorkflowPage;
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setExpandedWorkflowId(null);
                            setWorkflowPage(index);
                          }}
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "8px",
                            border: active ? "1px solid rgba(15, 118, 110, 0.24)" : "1px solid rgba(23, 50, 77, 0.08)",
                            background: active ? "rgba(15, 118, 110, 0.1)" : "rgba(255,255,255,0.92)",
                            color: active ? "#0f766e" : "#425466",
                            fontSize: "0.76rem",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                          aria-label={`切换到第 ${index + 1} 页`}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedWorkflowId(null);
                        setWorkflowPage((current) => Math.min(workflowPageCount - 1, current + 1));
                      }}
                      disabled={safeWorkflowPage >= workflowPageCount - 1}
                      style={{
                        borderRadius: "8px",
                        border: "1px solid rgba(23, 50, 77, 0.08)",
                        background: "rgba(255,255,255,0.92)",
                        color: safeWorkflowPage >= workflowPageCount - 1 ? "#94a3b8" : "#425466",
                        padding: "6px 9px",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: safeWorkflowPage >= workflowPageCount - 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: workflowColumns,
                  gap: "12px",
                  alignItems: "start",
                }}
              >
                {visibleWorkflows.map((workflow) => {
                  const expanded = expandedWorkflowId === workflow.id;
                  const values = workflowInputs[workflow.id] ?? {};
                  const extra = workflowExtras[workflow.id] ?? workflow.defaultExtra ?? "";
                  const missingRequired = workflow.fields.some((field) => field.required && !workflowValue(values, field).trim());
                  const prompt = buildWorkflowDraft(workflow);

                  return (
                    <div
                      key={workflow.id}
                      style={{
                        borderRadius: "8px",
                        border: expanded ? `1px solid ${workflow.accent}33` : "1px solid rgba(23, 50, 77, 0.08)",
                        background: `linear-gradient(180deg, ${workflow.accent}12 0%, rgba(255,255,255,0.98) 100%)`,
                        padding: expanded ? "14px" : 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: expanded ? "12px" : 0,
                        minHeight: expanded ? "auto" : "92px",
                        boxShadow: expanded ? `0 12px 28px ${workflow.accent}14` : "0 8px 18px rgba(15, 23, 42, 0.035)",
                        overflow: "hidden",
                        transition: "box-shadow 160ms ease, border-color 160ms ease",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedWorkflowId((current) => (current === workflow.id ? null : workflow.id))}
                        style={{
                          width: "100%",
                          border: "none",
                          background: "transparent",
                          padding: expanded ? 0 : "15px 14px",
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                          alignItems: "center",
                          gap: "12px",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        aria-expanded={expanded}
                        aria-label={expanded ? "收起模板" : "展开模板"}
                        title={expanded ? "收起模板" : "展开模板"}
                      >
                        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "7px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                            <span
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "999px",
                                background: workflow.accent,
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                minWidth: 0,
                                color: "#17324d",
                                fontSize: "0.96rem",
                                fontWeight: 800,
                                lineHeight: 1.25,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {workflow.title}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "#64748b",
                              lineHeight: 1.45,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {workflow.description}
                          </div>
                        </div>
                        <div
                          style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "8px",
                            border: "1px solid rgba(23, 50, 77, 0.08)",
                            background: "rgba(255,255,255,0.92)",
                            color: workflow.accent,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {expanded ? <ChevronDown style={{ width: "16px", height: "16px" }} /> : <ChevronRight style={{ width: "16px", height: "16px" }} />}
                        </div>
                      </button>

                      {expanded && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                alignSelf: "flex-start",
                                gap: "6px",
                                borderRadius: "8px",
                                border: `1px solid ${workflow.accent}24`,
                                background: "rgba(255,255,255,0.78)",
                                color: workflow.accent,
                                padding: "5px 8px",
                                fontSize: "0.72rem",
                                fontWeight: 800,
                              }}
                            >
                              <Sparkles style={{ width: "12px", height: "12px" }} />
                              <span>{workflow.skillLabel}</span>
                            </div>
                          </div>

                          {workflow.fields.map((field) => {
                            const value = workflowValue(values, field);
                            const fieldStyle: CSSProperties = {
                              width: "100%",
                              boxSizing: "border-box",
                              borderRadius: "8px",
                              border: "1px solid rgba(23, 50, 77, 0.12)",
                              background: "rgba(255,255,255,0.94)",
                              color: "#17324d",
                              outline: "none",
                              fontSize: "0.84rem",
                              lineHeight: 1.55,
                              padding: "9px 10px",
                            };

                            return (
                              <label key={field.id} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "#334155" }}>
                                  {field.label}
                                  {field.required && <span style={{ color: "#be123c" }}> *</span>}
                                </span>
                                {field.multiline ? (
                                  <textarea
                                    value={value}
                                    onChange={(event) => updateWorkflowInput(workflow.id, field.id, event.target.value)}
                                    placeholder={field.placeholder}
                                    rows={field.id === "paperFolder" ? 2 : 3}
                                    style={{ ...fieldStyle, resize: "vertical", minHeight: "82px", maxHeight: "180px" }}
                                  />
                                ) : (
                                  <input
                                    value={value}
                                    onChange={(event) => updateWorkflowInput(workflow.id, field.id, event.target.value)}
                                    placeholder={field.placeholder}
                                    style={fieldStyle}
                                  />
                                )}
                                {field.helper && (
                                  <span style={{ color: "#64748b", fontSize: "0.72rem", lineHeight: 1.5 }}>{field.helper}</span>
                                )}
                              </label>
                            );
                          })}

                          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "#334155" }}>额外补充</span>
                            <textarea
                              value={extra}
                              onChange={(event) => updateWorkflowExtra(workflow.id, event.target.value)}
                              placeholder="可以写输出格式、侧重点、排除项，或让它进一步调用 Wiki/文献库上下文。"
                              rows={3}
                              style={{
                                width: "100%",
                                boxSizing: "border-box",
                                borderRadius: "8px",
                                border: "1px solid rgba(23, 50, 77, 0.12)",
                                background: "rgba(255,255,255,0.94)",
                                color: "#17324d",
                                outline: "none",
                                resize: "vertical",
                                minHeight: "82px",
                                maxHeight: "180px",
                                fontSize: "0.84rem",
                                lineHeight: 1.55,
                                padding: "9px 10px",
                              }}
                            />
                          </label>
                        </div>
                      )}

                      {expanded && (
                        <div style={{ marginTop: "auto", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setDraft(prompt)}
                            style={{
                              borderRadius: "8px",
                              border: "1px solid rgba(23, 50, 77, 0.1)",
                              background: "rgba(255,255,255,0.92)",
                              color: "#17324d",
                              padding: "8px 10px",
                              fontSize: "0.82rem",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            写入对话框
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleRunWorkflow(workflow);
                            }}
                            disabled={isLaunching || availableClis.length === 0 || missingRequired}
                            style={{
                              borderRadius: "8px",
                              border: "none",
                              background: workflow.accent,
                              color: "white",
                              padding: "8px 12px",
                              fontSize: "0.82rem",
                              fontWeight: 800,
                              cursor: isLaunching || availableClis.length === 0 || missingRequired ? "not-allowed" : "pointer",
                              opacity: isLaunching || availableClis.length === 0 || missingRequired ? 0.5 : 1,
                            }}
                            title={missingRequired ? "先填写必填项" : "执行模板"}
                          >
                            执行模板
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section style={{ ...shellStyle, minHeight: "72vh", display: "flex", flexDirection: "column" }}>
            {panelHeader(
              "对话推进",
              <MessageSquareText style={{ width: "18px", height: "18px", color: "#2563eb" }} />,
                <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>
                {sessionCount
                  ? `${sessionCount} 个活动会话`
                  : "新开一条就能开始"}
              </div>,
            )}

            <div
              style={{
                padding: "16px 18px",
                borderBottom: "1px solid rgba(24, 35, 52, 0.08)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b" }}>最近对话</div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>点卡片直接进入，悬停即删</div>
                </div>
                <button
                  onClick={() => setRecentConversationsCollapsed((current) => !current)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    borderRadius: "8px",
                    border: "1px solid rgba(23, 50, 77, 0.08)",
                    background: "rgba(255,255,255,0.92)",
                    color: "#425466",
                    padding: "6px 10px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  aria-label={recentConversationsCollapsed ? "展开最近对话" : "收起最近对话"}
                >
                  {recentConversationsCollapsed ? (
                    <ChevronRight style={{ width: "14px", height: "14px" }} />
                  ) : (
                    <ChevronDown style={{ width: "14px", height: "14px" }} />
                  )}
                  <span>{recentConversationsCollapsed ? "展开" : "收起"}</span>
                </button>
              </div>

              {!recentConversationsCollapsed && recentConversations.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: recentConversationColumns,
                    gap: "8px",
                  }}
                >
                  {recentConversations.slice(0, 12).map((conversation) => {
                    const active = activeConversation?.id === conversation.rawConversationId;
                    const deleteVisible = hoveredConversationId === conversation.id;
                    return (
                      <div
                        key={conversation.id}
                        onClick={() => {
                          void handleOpenConversation(conversation.rawConversationId);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void handleOpenConversation(conversation.rawConversationId);
                          }
                        }}
                        onMouseEnter={() => setHoveredConversationId(conversation.id)}
                        onMouseLeave={() => setHoveredConversationId((current) => (current === conversation.id ? null : current))}
                        onFocus={() => setHoveredConversationId(conversation.id)}
                        onBlur={() => setHoveredConversationId((current) => (current === conversation.id ? null : current))}
                        title={conversation.lastMessagePreview || conversation.title}
                        role="button"
                        tabIndex={0}
                        style={{
                          position: "relative",
                          minWidth: 0,
                          borderRadius: "8px",
                          border: active ? "1px solid rgba(15, 118, 110, 0.24)" : "1px solid rgba(23, 50, 77, 0.08)",
                          background: active ? "rgba(15, 118, 110, 0.08)" : "rgba(255,255,255,0.92)",
                          color: active ? "#0f766e" : "#425466",
                          padding: "10px 34px 10px 12px",
                          minHeight: "72px",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: "8px",
                          cursor: "pointer",
                          textAlign: "left",
                          boxShadow: active ? "0 8px 18px rgba(15, 118, 110, 0.08)" : "0 8px 16px rgba(15, 23, 42, 0.04)",
                        }}
                      >
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteConversation(conversation);
                          }}
                          onMouseEnter={() => setHoveredConversationId(conversation.id)}
                          style={{
                            position: "absolute",
                            top: "8px",
                            right: "8px",
                            width: "22px",
                            height: "22px",
                            border: "none",
                            borderRadius: "999px",
                            background: active ? "rgba(255,255,255,0.82)" : "rgba(248, 250, 252, 0.96)",
                            color: "#b91c1c",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            opacity: deleteVisible ? 1 : 0,
                            pointerEvents: deleteVisible ? "auto" : "none",
                            transition: "opacity 140ms ease",
                            boxShadow: "0 4px 10px rgba(15, 23, 42, 0.08)",
                          }}
                          aria-label="删除对话"
                          title="删除对话"
                        >
                          <X style={{ width: "12px", height: "12px" }} />
                        </button>

                        <div
                          style={{
                            minWidth: 0,
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            lineHeight: 1.4,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {conversation.title}
                        </div>

                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: active ? "rgba(15, 118, 110, 0.82)" : "#64748b",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {relativeTime(conversation.updatedAt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: "0.84rem", color: "#64748b", lineHeight: 1.6 }}>
                  {recentConversationsCollapsed
                    ? "最近对话已收起。"
                    : sessionsLoading
                    ? "正在读取本地最近对话..."
                    : sessionCount
                    ? `正在同步 ${sessionCount} 条最近对话...`
                    : "还没有历史对话。上面的任一助手动作都能直接开一条。"}
                </div>
              )}
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                ref={messageListRef}
                onScroll={handleMessageListScroll}
                style={{
                  flex: 1,
                  minHeight: "360px",
                  overflowY: "auto",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  background: "linear-gradient(180deg, rgba(248,250,252,0.88) 0%, rgba(241,245,249,0.78) 100%)",
                }}
              >
                {!activeConversation && messages.length === 0 && (
                  <div
                    style={{
                      minHeight: "44vh",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "left",
                      color: "#516579",
                    }}
                  >
                    <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "linear-gradient(135deg, rgba(15,118,110,0.18), rgba(37,99,235,0.16))",
                          color: "#0f766e",
                        }}
                      >
                        <Bot style={{ width: "28px", height: "28px" }} />
                      </div>
                      <div style={{ fontSize: "1.24rem", fontWeight: 800, color: "#17324d", lineHeight: 1.35 }}>
                        先挑一项任务，或者直接告诉 Codex 你想整理什么。
                      </div>
                      <div style={{ fontSize: "0.95rem", lineHeight: 1.7 }}>
                        {contextPending
                          ? "你可以直接发起对话。"
                          : "上下文已经就位。你可以从常用助手起步，也可以直接发一条更具体的操作指令。"}
                      </div>
                    </div>
                  </div>
                )}

                {messages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    streaming={isStreaming && index === messages.length - 1 && message.role === "assistant"}
                  />
                ))}
                {streamStatus && <RunStatusBar status={streamStatus} />}
              </div>

              <div
                style={{
                  borderTop: "1px solid rgba(24, 35, 52, 0.08)",
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {availableClis.length > 0 ? (
                    availableClis.map((cli) => {
                      const active = selectedCli?.id === cli.id;
                      return (
                        <button
                          key={cli.id}
                          onClick={() => selectCli(cli)}
                          style={{
                            borderRadius: "8px",
                            border: active ? "1px solid rgba(15,118,110,0.18)" : "1px solid rgba(23, 50, 77, 0.08)",
                            background: active ? "rgba(15,118,110,0.08)" : "rgba(255,255,255,0.92)",
                            color: active ? "#0f766e" : "#425466",
                            padding: "7px 11px",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {cli.name}
                        </button>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: "0.84rem", color: "#be123c", fontWeight: 700 }}>未检测到可用的 AI 助手</div>
                  )}
                </div>

                {chatError && (
                  <div
                    style={{
                      borderRadius: "8px",
                      background: "rgba(254, 226, 226, 0.86)",
                      border: "1px solid rgba(239, 68, 68, 0.18)",
                      color: "#991b1b",
                      padding: "10px 12px",
                      fontSize: "0.86rem",
                    }}
                  >
                    {chatError}
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: composerColumns,
                    gap: "10px",
                    alignItems: "end",
                  }}
                >
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (isComposingKeyboardEvent(event)) return;

                      if (isActionEnterKey(event) && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendDraft();
                      }
                    }}
                    placeholder="例如：帮我把今天的高价值情报整理成 Wiki 计划，再给出下一步动作。"
                    rows={4}
                    style={{
                      resize: "vertical",
                      minHeight: "108px",
                      maxHeight: "240px",
                      borderRadius: "8px",
                      border: "1px solid rgba(23, 50, 77, 0.12)",
                      background: "rgba(255,255,255,0.96)",
                      padding: "14px 16px",
                      outline: "none",
                      fontSize: "0.93rem",
                      lineHeight: 1.7,
                      color: "#17324d",
                    }}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }}>
                    {isStreaming && (
                      <button
                        onClick={() => {
                          void handleStopCurrentTurn();
                        }}
                        style={{
                          height: "46px",
                          borderRadius: "8px",
                          border: "1px solid rgba(185, 28, 28, 0.18)",
                          background: "rgba(254, 226, 226, 0.92)",
                          color: "#991b1b",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          cursor: "pointer",
                          padding: "0 14px",
                          minWidth: "96px",
                          fontWeight: 800,
                        }}
                        title="终止当前回复"
                      >
                        <Square style={{ width: "15px", height: "15px", fill: "currentColor" }} />
                        <span>终止</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        void handleSendDraft();
                      }}
                      disabled={!draft.trim() || availableClis.length === 0 || isLaunching}
                      style={{
                        height: "46px",
                        borderRadius: "8px",
                        border: "none",
                        background:
                          !draft.trim() || availableClis.length === 0 || isLaunching ? "rgba(148, 163, 184, 0.5)" : "#17324d",
                        color: "white",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        cursor: !draft.trim() || availableClis.length === 0 || isLaunching ? "not-allowed" : "pointer",
                        padding: "0 16px",
                        minWidth: "96px",
                        fontWeight: 800,
                      }}
                    >
                      {isLaunching ? (
                        <Loader2 style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Send style={{ width: "18px", height: "18px" }} />
                      )}
                      <span>{isLaunching ? "处理中" : "发送"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section style={shellStyle}>
            {panelHeader(
              "直接转跳",
              <BookOpen style={{ width: "18px", height: "18px", color: "#c2410c" }} />,
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                {loadError && (
                  <div
                    style={{
                      ...badgeBaseStyle,
                      padding: "6px 10px",
                      background: "rgba(254, 226, 226, 0.9)",
                      color: "#b91c1c",
                      borderColor: "rgba(239, 68, 68, 0.2)",
                    }}
                  >
                    {loadError}
                  </div>
                )}
                <CollapseToggle
                  expanded={jumpSectionExpanded}
                  onClick={() => setJumpSectionExpanded((current) => !current)}
                />
              </div>,
            )}

            {jumpSectionExpanded && (
              <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ maxWidth: "760px", color: "#516579", fontSize: "0.86rem", lineHeight: 1.65 }}>
                  直接跳到对应工作面板继续处理，回到助手时保留当前对话草稿。
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: jumpColumns,
                    gap: "10px",
                  }}
                >
                  {shortcuts.map((shortcut) => (
                    <button
                      key={shortcut.id}
                      onClick={() => handleJump(shortcut.tab)}
                      style={{
                        borderRadius: "8px",
                        border: "1px solid rgba(23, 50, 77, 0.08)",
                        background: "rgba(255,255,255,0.96)",
                        padding: "11px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          background: `${shortcut.accent}12`,
                          color: shortcut.accent,
                        }}
                      >
                        {shortcut.icon}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#17324d", marginBottom: "3px" }}>
                          {shortcut.title}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#516579", lineHeight: 1.5 }}>{shortcut.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section style={shellStyle}>
            {panelHeader(
              "上下文概览",
              <Database style={{ width: "18px", height: "18px", color: "#17324d" }} />,
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                  {contextPending ? "后台补充中" : "可送进对话"}
                </div>
                <CollapseToggle
                  expanded={contextOverviewExpanded}
                  onClick={() => setContextOverviewExpanded((current) => !current)}
                />
              </div>,
            )}

            {contextOverviewExpanded && (
              <div
                style={{
                  padding: "14px",
                  display: "grid",
                  gridTemplateColumns: contextColumns,
                  gap: "12px",
                }}
              >
                <ContextCard title="今日情报" accent="#2563eb" icon={<Inbox style={{ width: "18px", height: "18px" }} />}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                    <MetricTile label="未读" value={overview?.inbox.totalUnread ?? 0} color="#2563eb" loading={contextPending} />
                    <MetricTile
                      label="活跃模块"
                      value={Object.keys(overview?.inbox.unreadByModule ?? {}).length}
                      color="#0f766e"
                      loading={contextPending}
                    />
                  </div>

                  {contextPending ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <SkeletonBlock height="72px" />
                      <SkeletonBlock height="72px" />
                    </div>
                  ) : (overview?.inbox.spotlight ?? []).length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {(overview?.inbox.spotlight ?? []).slice(0, 3).map((card) => (
                        <button
                          key={card.id}
                          onClick={() => setDraft(buildSpotlightPrompt(card))}
                          style={{
                            textAlign: "left",
                            borderRadius: "8px",
                            border: "1px solid rgba(23, 50, 77, 0.08)",
                            background: "rgba(248,250,252,0.96)",
                            padding: "12px",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                            <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#2563eb" }}>
                              {readableModuleName(card.moduleId)}
                            </span>
                            <span style={{ fontSize: "0.74rem", color: "#64748b" }}>{relativeTime(card.createdAt)}</span>
                          </div>
                          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#17324d", lineHeight: 1.45 }}>
                            {card.title}
                          </div>
                          <div style={{ fontSize: "0.82rem", lineHeight: 1.6, color: "#516579" }}>{card.summary}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.84rem", color: "#64748b", lineHeight: 1.6 }}>
                      还没有新的高优先级情报。回到情报流继续整理后，这里会自动补齐。
                    </div>
                  )}
                </ContextCard>

                <ContextCard title="知识库状态" accent="#c2410c" icon={<BookHeart style={{ width: "18px", height: "18px" }} />}>
                  <WikiBlock
                    title="Internet Wiki"
                    snapshot={overview?.wiki.intel ?? { ready: false, total: 0, byCategory: {} }}
                    color="#c2410c"
                    loading={contextPending}
                    onDraft={() => {
                      const workflow = workflows.find((item) => item.id === "intel-wiki");
                      if (workflow) setDraft(buildWorkflowDraft(workflow));
                    }}
                  />
                  <WikiBlock
                    title="Literature Wiki"
                    snapshot={overview?.wiki.lit ?? { ready: false, total: 0, byCategory: {} }}
                    color="#7c3aed"
                    loading={contextPending}
                    onDraft={() => {
                      const workflow = workflows.find((item) => item.id === "literature-ops");
                      if (workflow) setDraft(buildWorkflowDraft(workflow));
                    }}
                  />
                </ContextCard>

                <ContextCard title="数据洞察" accent="#be123c" icon={<Brain style={{ width: "18px", height: "18px" }} />}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                    <MetricTile label="累计卡片" value={overview?.insights.totalCards ?? 0} color="#be123c" loading={contextPending} />
                    <MetricTile label="连续天数" value={overview?.insights.readingStreak ?? 0} color="#0f766e" loading={contextPending} />
                    <MetricTile label="本周新增" value={overview?.insights.thisWeek ?? 0} color="#2563eb" loading={contextPending} />
                    <MetricTile label="对话次数" value={overview?.insights.chatCount ?? 0} color="#c2410c" loading={contextPending} />
                  </div>

                  {contextPending ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <SkeletonBlock height="14px" width="72px" />
                      <SkeletonBlock height="24px" width="58%" />
                      <SkeletonBlock height="56px" />
                    </div>
                  ) : (
                    <div
                      style={{
                        borderRadius: "8px",
                        border: "1px solid rgba(23, 50, 77, 0.08)",
                        background: "rgba(248,250,252,0.94)",
                        padding: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b" }}>偏好焦点</div>
                      <div style={{ fontSize: "1rem", fontWeight: 800, color: "#17324d" }}>
                        {overview?.insights.topKeyword ?? "还没有稳定偏好"}
                      </div>
                      <div style={{ fontSize: "0.84rem", lineHeight: 1.65, color: "#516579" }}>
                        {overview?.insights.todaySummary ??
                          "今天还没有自动总结。现在发起一次对话，助手会结合今日情报和你的工作流一起推进。"}
                      </div>
                    </div>
                  )}
                </ContextCard>
              </div>
            )}
          </section>

          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.35; }
            }

            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }

            @keyframes assistant-skeleton {
              0% { opacity: 0.55; }
              50% { opacity: 1; }
              100% { opacity: 0.55; }
            }
          `}</style>
        </div>
      </PageContent>
    </PageContainer>
  );
}

function StatusPill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 8px",
        borderRadius: "8px",
        background: `${accent}12`,
        color: accent,
        fontSize: "0.74rem",
        fontWeight: 700,
      }}
    >
      <span>{label}</span>
      <span style={{ color: "#17324d" }}>{value}</span>
    </div>
  );
}

function ContextCard({
  title,
  icon,
  accent,
  children,
}: {
  title: string;
  icon: ReactNode;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: "8px",
        border: "1px solid rgba(23, 50, 77, 0.08)",
        background: "rgba(255,255,255,0.96)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${accent}12`,
            color: accent,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#17324d" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function SkeletonBlock({
  width = "100%",
  height = "16px",
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: "6px",
        background: "linear-gradient(90deg, rgba(226,232,240,0.7) 0%, rgba(241,245,249,1) 50%, rgba(226,232,240,0.7) 100%)",
        animation: "assistant-skeleton 1.4s ease-in-out infinite",
      }}
    />
  );
}

function MetricTile({
  label,
  value,
  color,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  color: string;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: "8px",
        border: "1px solid rgba(23, 50, 77, 0.08)",
        background: "rgba(248,250,252,0.94)",
        padding: "12px",
      }}
    >
      <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#64748b", marginBottom: "8px" }}>{label}</div>
      {loading ? <SkeletonBlock height="24px" width="60%" /> : <div style={{ fontSize: "1.2rem", fontWeight: 800, color }}>{value}</div>}
    </div>
  );
}

function WikiBlock({
  title,
  snapshot,
  color,
  onDraft,
  loading = false,
}: {
  title: string;
  snapshot: WikiSnapshot;
  color: string;
  onDraft: () => void;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: "8px",
        border: "1px solid rgba(23, 50, 77, 0.08)",
        background: "rgba(248,250,252,0.94)",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#17324d" }}>{title}</div>
        {loading ? (
          <SkeletonBlock width="72px" height="28px" />
        ) : (
          <div style={{ ...badgeBaseStyle, padding: "5px 10px", background: `${color}12`, color }}>
            <Database style={{ width: "13px", height: "13px" }} />
            <span>{snapshot.ready ? `${snapshot.total} 页` : "未连接"}</span>
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonBlock height="14px" width="82%" />
      ) : (
        <div style={{ fontSize: "0.84rem", lineHeight: 1.6, color: "#516579" }}>
          {snapshot.ready ? summarizeCategories(snapshot) : "先配置本地 Vault，助手才能把结果沉淀成 Wiki。"}
        </div>
      )}

      <button
        onClick={onDraft}
        disabled={loading}
        style={{
          alignSelf: "flex-start",
          borderRadius: "8px",
          border: "1px solid rgba(23, 50, 77, 0.1)",
          background: "rgba(255,255,255,0.96)",
          color: "#17324d",
          padding: "8px 10px",
          fontSize: "0.82rem",
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        生成维护指令
      </button>
    </div>
  );
}
