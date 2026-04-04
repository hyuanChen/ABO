import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";

interface ConfigHelpProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function ConfigHelp({ title, children, defaultExpanded = false }: ConfigHelpProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      style={{
        borderRadius: "var(--radius-md)",
        background: "var(--bg-hover)",
        border: "1px solid var(--border-light)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--text-secondary)",
          fontSize: "0.875rem",
          fontWeight: 500,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <HelpCircle style={{ width: "16px", height: "16px" }} />
          {title}
        </span>
        {expanded ? (
          <ChevronUp style={{ width: "16px", height: "16px" }} />
        ) : (
          <ChevronDown style={{ width: "16px", height: "16px" }} />
        )}
      </button>
      {expanded && (
        <div
          style={{
            padding: "0 16px 16px 16px",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
            lineHeight: 1.7,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// 预定义的 Cookie 获取指南组件
interface CookieGuideProps {
  platform: "bilibili" | "xiaohongshu" | "zhihu";
  cookieName: string;
}

export function CookieGuide({ platform, cookieName }: CookieGuideProps) {
  const guides = {
    bilibili: {
      steps: [
        "打开浏览器，访问 bilibili.com 并登录账号",
        "按 F12 打开开发者工具（或右键→检查）",
        "切换到 Application（应用）或 Storage（存储）标签",
        "在左侧菜单选择 Cookies → https://bilibili.com",
        "在列表中找到 SESSDATA 字段",
        "双击 SESSDATA 的值，复制完整内容（通常以数字开头）",
        "粘贴到上方的输入框中",
      ],
      tips: [
        "SESSDATA 有效期约 1-2 周，过期后需要重新获取",
        "请勿分享你的 SESSDATA 给他人，相当于账号密码",
        "如果验证失败，尝试刷新页面或重新登录后再获取",
      ],
    },
    xiaohongshu: {
      steps: [
        "打开浏览器，访问 xiaohongshu.com 并登录账号",
        "按 F12 打开开发者工具（或右键→检查）",
        "切换到 Application（应用）或 Storage（存储）标签",
        "在左侧菜单选择 Cookies → https://xiaohongshu.com",
        "在列表中找到 web_session 或 session 字段",
        "复制该 Cookie 的完整值",
        "粘贴到上方的输入框中",
      ],
      tips: [
        "小红书 Cookie 有效期较短，建议每次使用前检查",
        "如果遇到验证码，需要先手动在浏览器中完成验证",
        "请勿分享你的 Cookie 给他人",
      ],
    },
    zhihu: {
      steps: [
        "打开浏览器，访问 zhihu.com 并登录账号",
        "按 F12 打开开发者工具（或右键→检查）",
        "切换到 Application（应用）或 Storage（存储）标签",
        "在左侧菜单选择 Cookies → https://zhihu.com",
        "在列表中找到 z_c0 或 _xsrf 字段",
        "复制该 Cookie 的完整值",
        "粘贴到上方的输入框中",
      ],
      tips: [
        "知乎 Cookie 有效期较长，但如果遇到验证需要重新获取",
        "某些功能需要额外的 Authorization token",
        "请勿分享你的 Cookie 给他人",
      ],
    },
  };

  const guide = guides[platform];

  return (
    <ConfigHelp title={`如何获取 ${cookieName}？`}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <strong style={{ color: "var(--text-main)" }}>步骤：</strong>
          <ol style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
            {guide.steps.map((step, idx) => (
              <li key={idx} style={{ marginBottom: "4px" }}>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <div
          style={{
            padding: "12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-warning)10",
            border: "1px solid var(--color-warning)30",
          }}
        >
          <strong style={{ color: "var(--color-warning)" }}>💡 小贴士：</strong>
          <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
            {guide.tips.map((tip, idx) => (
              <li key={idx} style={{ marginBottom: "4px" }}>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ConfigHelp>
  );
}
