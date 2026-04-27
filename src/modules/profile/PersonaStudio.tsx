import { ReactNode, useEffect, useMemo, useState } from "react";
import { BrainCircuit, Sparkles, Target, Wand2 } from "lucide-react";
import { Card } from "../../components/Layout";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import { SBTI_INFO, SBTIType } from "./SBTIAvatar";

interface PersonaData {
  source_text: string;
  summary: string;
  homepage: {
    codename: string;
    long_term_goal: string;
    one_liner: string;
    narrative: string;
    strengths: string[];
    working_style: string[];
    preferred_topics: string[];
    next_focus: string[];
  };
  sbti: {
    type: string;
    label?: string;
    confidence: number;
    reasoning: string[];
  };
  generated_at: string;
}

interface Props {
  persona?: PersonaData | null;
  onRefresh: () => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  summary?: ReactNode;
}

function formatTimestamp(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TagList({
  items,
  accent = "var(--color-accent)",
}: {
  items: string[];
  accent?: string;
}) {
  if (items.length === 0) {
    return <span style={{ fontSize: "0.8125rem", color: "var(--text-light)" }}>暂未生成</span>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 10px",
            borderRadius: "999px",
            background: `color-mix(in srgb, ${accent} 16%, var(--bg-card))`,
            border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
            color: "var(--text-secondary)",
            fontSize: "0.75rem",
            fontWeight: 600,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default function PersonaStudio({
  persona,
  onRefresh,
  collapsible = false,
  defaultExpanded = true,
  summary,
}: Props) {
  const [wikiText, setWikiText] = useState(persona?.source_text ?? "");
  const [generating, setGenerating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setWikiText(persona?.source_text ?? "");
  }, [persona?.source_text]);

  const sbtiInfo = useMemo(() => {
    const type = persona?.sbti?.type;
    if (!type || !(type in SBTI_INFO)) return null;
    return SBTI_INFO[type as SBTIType];
  }, [persona?.sbti?.type]);

  async function generatePersona() {
    if (!wikiText.trim()) {
      toast.error("先贴入 Word / Wiki 文本");
      return;
    }

    setGenerating(true);
    try {
      await api.post("/api/profile/persona/generate", { wiki_text: wikiText });
      toast.success("角色画像已更新");
      onRefresh();
    } catch (error) {
      console.error(error);
      toast.error("画像生成失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card
      title="角色建模"
      icon={<BrainCircuit style={{ width: "18px", height: "18px", color: "#62B59A" }} />}
      collapsible={collapsible}
      defaultExpanded={defaultExpanded}
      summary={summary}
      style={{ marginTop: "clamp(20px, 3vw, 28px)" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "20px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
              Word / Wiki 原文
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              贴入你的角色 wiki、自述、研究背景或履历摘要。系统会提炼“我懂什么、我在做什么、我想去哪里”，并同步主页信息与 SBTI 初判。
            </p>
          </div>

          <textarea
            value={wikiText}
            onChange={(e) => setWikiText(e.target.value)}
            placeholder="把 Word 里的 wiki 内容贴进来。建议包含你的研究方向、能力、偏好、经历、目标。"
            style={{
              minHeight: "240px",
              resize: "vertical",
              padding: "14px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border-light)",
              background: "var(--bg-hover)",
              color: "var(--text-main)",
              fontSize: "0.875rem",
              lineHeight: 1.7,
              outline: "none",
            }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>
              角色主页会自动采用生成出的代号、长期目标和 SBTI 建议。
            </span>
            <button
              type="button"
              onClick={generatePersona}
              disabled={generating}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid transparent",
                background: "linear-gradient(135deg, #62B59A, #8CCFBB)",
                color: "#17362A",
                fontSize: "0.8125rem",
                fontWeight: 700,
                cursor: generating ? "default" : "pointer",
                opacity: generating ? 0.7 : 1,
              }}
            >
              <Wand2 style={{ width: "14px", height: "14px" }} />
              {generating ? "生成中..." : "生成角色画像"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              padding: "16px",
              borderRadius: "8px",
              background: "var(--bg-hover)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles style={{ width: "15px", height: "15px", color: "#F39C5A" }} />
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                  当前画像
                </span>
              </div>
              {persona?.generated_at && (
                <span style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>
                  更新于 {formatTimestamp(persona.generated_at)}
                </span>
              )}
            </div>

            {persona?.summary ? (
              <>
                {persona.homepage.one_liner && (
                  <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", lineHeight: 1.5, marginBottom: "8px" }}>
                    {persona.homepage.one_liner}
                  </div>
                )}
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                  {persona.summary}
                </p>
                {persona.homepage.narrative && (
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.7, marginTop: "10px" }}>
                    {persona.homepage.narrative}
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: "0.875rem", color: "var(--text-light)", lineHeight: 1.7 }}>
                画像还没生成。贴入你的 wiki 文本后，这里会出现摘要、人设描述和主页建议。
              </p>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "14px",
            }}
          >
            <section>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Target style={{ width: "14px", height: "14px", color: "#62B59A" }} />
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                  强项与工作方式
                </span>
              </div>
              <TagList items={[...(persona?.homepage?.strengths ?? []), ...(persona?.homepage?.working_style ?? [])]} accent="#62B59A" />
            </section>

            <section>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Sparkles style={{ width: "14px", height: "14px", color: "#6FA8FF" }} />
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                  偏好主题与下一步
                </span>
              </div>
              <TagList items={[...(persona?.homepage?.preferred_topics ?? []), ...(persona?.homepage?.next_focus ?? [])]} accent="#6FA8FF" />
            </section>
          </div>

          <div
            style={{
              padding: "14px 16px",
              borderRadius: "8px",
              background: sbtiInfo ? `color-mix(in srgb, ${sbtiInfo.color} 12%, var(--bg-card))` : "var(--bg-hover)",
              border: sbtiInfo ? `1px solid color-mix(in srgb, ${sbtiInfo.color} 32%, transparent)` : "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>SBTI 初判</span>
                {sbtiInfo ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      background: `color-mix(in srgb, ${sbtiInfo.color} 18%, white)`,
                      border: `1px solid color-mix(in srgb, ${sbtiInfo.color} 36%, transparent)`,
                      color: sbtiInfo.color,
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      fontFamily: "monospace",
                    }}
                  >
                    {sbtiInfo.code} · {sbtiInfo.cn}
                  </span>
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-light)" }}>等待生成</span>
                )}
              </div>

              {typeof persona?.sbti?.confidence === "number" && persona?.sbti?.confidence > 0 && (
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  置信度 {Math.round(persona.sbti.confidence * 100)}%
                </span>
              )}
            </div>

            {sbtiInfo && (
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>
                {sbtiInfo.trait}
              </div>
            )}

            {(persona?.sbti?.reasoning ?? []).length > 0 && (
              <ul style={{ marginTop: "10px", paddingLeft: "18px", color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.7 }}>
                {persona?.sbti?.reasoning?.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
