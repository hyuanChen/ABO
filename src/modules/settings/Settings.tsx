import { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  HardDrive,
  Info,
  Moon,
  Sun,
  Keyboard,
  Palette,
  FolderOpen,
  Zap,
  ChevronRight,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { useStore } from "../../core/store";
import { PageContainer, PageHeader, PageContent, Card } from "../../components/Layout";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../../core/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type SettingsTab = "general" | "vault" | "about";

interface SettingItemProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

// ── Components ────────────────────────────────────────────────────────────────

function SettingItem({ icon, title, description, children, onClick }: SettingItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "16px 20px",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-card)",
        border: "1px solid var(--border-light)",
        transition: "all 0.3s ease",
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translateX(4px)";
          e.currentTarget.style.borderColor = "var(--color-primary-light)";
          e.currentTarget.style.boxShadow = "var(--shadow-soft)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateX(0)";
        e.currentTarget.style.borderColor = "var(--border-light)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "var(--radius-md)",
          background: "linear-gradient(135deg, rgba(188, 164, 227, 0.15), rgba(255, 183, 178, 0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-primary)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-main)", marginBottom: description ? "4px" : 0 }}>
          {title}
        </h4>
        {description && (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{description}</p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        position: "relative",
        width: "48px",
        height: "26px",
        borderRadius: "var(--radius-full)",
        background: enabled
          ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
          : "var(--bg-hover)",
        border: "none",
        cursor: "pointer",
        transition: "all 0.3s ease",
        boxShadow: enabled ? "0 2px 8px rgba(188, 164, 227, 0.4)" : "inset 0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "3px",
          left: enabled ? "25px" : "3px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          transition: "left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
    </button>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "14px 18px",
        borderRadius: "var(--radius-lg)",
        background: active ? "var(--bg-card)" : "transparent",
        border: active ? "1px solid var(--border-light)" : "1px solid transparent",
        color: active ? "var(--color-primary)" : "var(--text-secondary)",
        fontSize: "0.9375rem",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        boxShadow: active ? "var(--shadow-soft)" : "none",
        transform: active ? "scale(1.02)" : "scale(1)",
      }}
    >
      {icon}
      {label}
      {active && (
        <ChevronRight
          style={{ width: "16px", height: "16px", marginLeft: "auto", opacity: 0.6 }}
        />
      )}
    </button>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

function GeneralSection() {
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("abo-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const shortcuts = [
    { label: "角色主页", shortcut: "⌘1" },
    { label: "今日情报", shortcut: "⌘2" },
    { label: "Vault", shortcut: "⌘3" },
    { label: "文献库", shortcut: "⌘4" },
    { label: "手记", shortcut: "⌘5" },
    { label: "Claude", shortcut: "⌘6" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Appearance */}
      <Card title="外观设置" icon={<Palette style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <SettingItem
            icon={darkMode ? <Moon style={{ width: "20px", height: "20px" }} /> : <Sun style={{ width: "20px", height: "20px" }} />}
            title="深色模式"
            description={darkMode ? "当前使用深色主题" : "当前使用浅色主题"}
          >
            <Toggle enabled={darkMode} onToggle={() => setDarkMode(!darkMode)} />
          </SettingItem>
        </div>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card title="键盘快捷键" icon={<Keyboard style={{ width: "18px", height: "18px" }} />}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {shortcuts.map(({ label, shortcut }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
              }}
            >
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{label}</span>
              <kbd
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  color: "var(--text-muted)",
                  boxShadow: "0 2px 0 var(--border-light)",
                }}
              >
                {shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function VaultSection() {
  const { config, setConfig } = useStore();
  const vaultPath = config?.vault_path ?? "未配置";
  const literaturePath = config?.literature_path ?? "";

  async function openInFinder() {
    if (!vaultPath || vaultPath === "未配置") return;
    try {
      await api.post("/api/vault/open", { path: "" });
    } catch (err) {
      console.error("Failed to open vault:", err);
      alert("打开失败，请检查情报库路径是否正确");
    }
  }

  async function openLiteratureInFinder() {
    if (!literaturePath) return;
    try {
      await api.post("/api/literature/open", { path: "" });
    } catch (err) {
      console.error("Failed to open literature folder:", err);
      alert("打开失败，请检查文献库路径是否正确");
    }
  }

  async function selectNewVault() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择情报库文件夹",
      });
      if (selected && typeof selected === "string") {
        const newConfig = await api.post<{ vault_path: string; literature_path?: string; version: string }>("/api/config", {
          vault_path: selected,
          literature_path: config?.literature_path,
        });
        setConfig(newConfig);
        alert("情报库路径已更新，请重启应用以生效");
      }
    } catch (err) {
      console.error("Failed to select vault:", err);
      alert("选择文件夹失败，请重试");
    }
  }

  async function selectLiteraturePath() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择文献库存储文件夹",
      });
      if (selected && typeof selected === "string") {
        const newConfig = await api.post<{ vault_path: string; literature_path?: string; version: string }>("/api/config", {
          vault_path: config?.vault_path,
          literature_path: selected,
        });
        setConfig(newConfig);
        alert("文献库路径已更新");
      }
    } catch (err) {
      console.error("Failed to select literature path:", err);
      alert("选择文件夹失败，请重试");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Vault Config */}
      <Card title="情报库配置" icon={<HardDrive style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <SettingItem
            icon={<FolderOpen style={{ width: "20px", height: "20px" }} />}
            title="当前情报库路径"
            description="所有文献笔记、日记、Idea 画布以及 ABO 元数据存储位置"
          >
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={openInFinder}
                disabled={!config?.vault_path}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-full)",
                  background: config?.vault_path ? "var(--bg-hover)" : "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  color: config?.vault_path ? "var(--text-secondary)" : "var(--text-muted)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: config?.vault_path ? "pointer" : "not-allowed",
                  opacity: config?.vault_path ? 1 : 0.5,
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => {
                  if (config?.vault_path) {
                    e.currentTarget.style.background = "var(--color-primary)";
                    e.currentTarget.style.color = "white";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = config?.vault_path ? "var(--bg-hover)" : "var(--bg-card)";
                  e.currentTarget.style.color = config?.vault_path ? "var(--text-secondary)" : "var(--text-muted)";
                }}
              >
                <ExternalLink style={{ width: "14px", height: "14px" }} />
                在 Finder 中打开
              </button>
              <button
                onClick={selectNewVault}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-primary)",
                  border: "none",
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 8px rgba(188, 164, 227, 0.4)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-primary-dark)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--color-primary)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <FolderOpen style={{ width: "14px", height: "14px" }} />
                更改路径
              </button>
            </div>
          </SettingItem>

          <div
            style={{
              padding: "16px 20px",
              borderRadius: "var(--radius-lg)",
              background: "var(--bg-hover)",
              border: "1px solid var(--border-light)",
              fontFamily: "monospace",
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
              wordBreak: "break-all",
              lineHeight: 1.6,
            }}
          >
            {vaultPath}
          </div>

          <div
            style={{
              padding: "16px 20px",
              borderRadius: "var(--radius-lg)",
              background: "linear-gradient(135deg, rgba(255, 183, 178, 0.1), rgba(255, 183, 178, 0.05))",
              border: "1px solid rgba(255, 183, 178, 0.3)",
            }}
          >
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <strong style={{ color: "#D48984" }}>提示：</strong>
              修改情报库路径需要重启应用。请确保新路径包含完整的 {" "}
              <code
                style={{
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "rgba(255, 183, 178, 0.2)",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                }}
              >
                .abo/
              </code>{" "}
              目录以保留您的数据。
            </p>
          </div>
        </div>
      </Card>

      {/* Literature Config */}
      <Card title="文献库配置" icon={<BookOpen style={{ width: "18px", height: "18px" }} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <SettingItem
            icon={<BookOpen style={{ width: "20px", height: "20px" }} />}
            title="文献库存储路径"
            description={literaturePath ? "PDF 等文献文件的独立存储位置" : "未配置，将使用情报库下的 Literature/ 目录"}
          >
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={openLiteratureInFinder}
                disabled={!literaturePath}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-full)",
                  background: literaturePath ? "var(--bg-hover)" : "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  color: literaturePath ? "var(--text-secondary)" : "var(--text-muted)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: literaturePath ? "pointer" : "not-allowed",
                  opacity: literaturePath ? 1 : 0.5,
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onMouseEnter={(e) => {
                  if (literaturePath) {
                    e.currentTarget.style.background = "var(--color-primary)";
                    e.currentTarget.style.color = "white";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = literaturePath ? "var(--bg-hover)" : "var(--bg-card)";
                  e.currentTarget.style.color = literaturePath ? "var(--text-secondary)" : "var(--text-muted)";
                }}
              >
                <ExternalLink style={{ width: "14px", height: "14px" }} />
                在 Finder 中打开
              </button>
              <button
                onClick={selectLiteraturePath}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-primary)",
                  border: "none",
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 8px rgba(188, 164, 227, 0.4)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-primary-dark)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--color-primary)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <FolderOpen style={{ width: "14px", height: "14px" }} />
                {literaturePath ? "更改路径" : "设置路径"}
              </button>
            </div>
          </SettingItem>

          <div
            style={{
              padding: "16px 20px",
              borderRadius: "var(--radius-lg)",
              background: "var(--bg-hover)",
              border: "1px solid var(--border-light)",
              fontFamily: "monospace",
              fontSize: "0.875rem",
              color: literaturePath ? "var(--text-secondary)" : "var(--text-muted)",
              wordBreak: "break-all",
              lineHeight: 1.6,
            }}
          >
            {literaturePath || "使用默认路径（情报库/Literature/）"}
          </div>

          <div
            style={{
              padding: "16px 20px",
              borderRadius: "var(--radius-lg)",
              background: "linear-gradient(135deg, rgba(188, 164, 227, 0.1), rgba(188, 164, 227, 0.05))",
              border: "1px solid rgba(188, 164, 227, 0.3)",
            }}
          >
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--color-primary)" }}>说明：</strong>
              文献库可以独立于情报库存储，方便将大型 PDF 文件放在外部硬盘或云同步目录之外。
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AboutSection() {
  const techStack = [
    { name: "Tauri", version: "2.x" },
    { name: "React", version: "19" },
    { name: "FastAPI", version: "latest" },
    { name: "Tailwind", version: "v4" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        {/* Logo */}
        <div
          style={{
            width: "80px",
            height: "80px",
            margin: "0 auto 24px",
            borderRadius: "var(--radius-xl)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 32px rgba(188, 164, 227, 0.4)",
          }}
        >
          <Zap style={{ width: "40px", height: "40px", color: "white" }} />
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
          ABO
        </h2>
        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
          Academic Buddy OS
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Version 0.5.0 · Phase 5</p>
      </div>

      <Card title="关于" icon={<Info style={{ width: "18px", height: "18px" }} />}>
        <p
          style={{
            fontSize: "0.9375rem",
            color: "var(--text-secondary)",
            lineHeight: 1.8,
            textAlign: "center",
            padding: "8px 16px",
          }}
        >
          Obsidian 驱动的研究自动化伴侣。
          <br />
          本地优先，隐私保护，AI 赋能。
        </p>
      </Card>

      <Card title="技术栈" icon={<Zap style={{ width: "18px", height: "18px" }} />}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            justifyContent: "center",
          }}
        >
          {techStack.map(({ name, version }) => (
            <div
              key={name}
              style={{
                padding: "10px 18px",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-hover)",
                border: "1px solid var(--border-light)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                {name}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--bg-card)",
                }}
              >
                {version}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ textAlign: "center", padding: "20px" }}>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Built with ❤️ for researchers
        </p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs = [
    { id: "general" as const, label: "通用", icon: <SettingsIcon style={{ width: "20px", height: "20px" }} /> },
    { id: "vault" as const, label: "情报库", icon: <HardDrive style={{ width: "20px", height: "20px" }} /> },
    { id: "about" as const, label: "关于", icon: <Info style={{ width: "20px", height: "20px" }} /> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="设置"
        subtitle="自定义你的 ABO 体验"
        icon={SettingsIcon}
      />
      <PageContent maxWidth="1200px">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "48px",
            height: "100%",
          }}
        >
          {/* Sidebar Tabs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              height: "fit-content",
            }}
          >
            {tabs.map(({ id, label, icon }) => (
              <TabButton
                key={id}
                active={activeTab === id}
                onClick={() => setActiveTab(id)}
                icon={icon}
                label={label}
              />
            ))}
          </div>

          {/* Content Area */}
          <div style={{ minWidth: 0 }}>
            {activeTab === "general" && <GeneralSection />}
            {activeTab === "vault" && <VaultSection />}
            {activeTab === "about" && <AboutSection />}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}
