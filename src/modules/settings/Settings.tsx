import { useState } from "react";
import { Settings as SettingsIcon, HardDrive, Info } from "lucide-react";
import { useStore } from "../../core/store";

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "general",  label: "通用",  Icon: SettingsIcon },
  { id: "vault",    label: "Vault", Icon: HardDrive },
  { id: "about",    label: "关于",  Icon: Info },
] as const;

type SettingsTab = (typeof TABS)[number]["id"];

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  enabled,
  onToggle,
  label,
}: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        enabled ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── Setting row ───────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 dark:text-slate-200">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <h3 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider pt-6 pb-1">
        {title}
      </h3>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">{children}</div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { darkMode, toggleDarkMode, config } = useStore();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Page header */}
      <div className="shrink-0 flex items-center gap-3 px-6 h-14 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">设置</h1>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-slate-200 dark:border-slate-800 px-6 overflow-x-auto">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none ${
              activeTab === id
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 max-w-2xl">
        {activeTab === "general" && (
          <>
            <Section title="外观">
              <SettingRow label="深色模式" description="切换深色 / 浅色界面主题">
                <Toggle enabled={darkMode} onToggle={toggleDarkMode} label="切换深色模式" />
              </SettingRow>
            </Section>

            <Section title="键盘快捷键">
              <div className="py-4 grid grid-cols-1 gap-2.5">
                {[
                  { label: "今日",     shortcut: "⌘1" },
                  { label: "文献库",   shortcut: "⌘2" },
                  { label: "Idea工坊", shortcut: "⌘3" },
                  { label: "Claude",   shortcut: "⌘4" },
                ].map(({ label, shortcut }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{label}</span>
                    <kbd className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-mono border border-slate-200 dark:border-slate-700">
                      {shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {activeTab === "vault" && (
          <Section title="Vault 路径">
            <div className="py-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">当前 Vault</p>
              <code className="block w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 break-all font-mono">
                {config?.vault_path ?? "未配置"}
              </code>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
                Vault 包含所有文献笔记、日记、Idea 画布以及 ABO 元数据（<code className="font-mono text-xs">.abo/</code> 目录）。
                重置 Vault 路径需重启应用。
              </p>
            </div>
          </Section>
        )}

        {activeTab === "about" && (
          <div className="py-12 flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <span className="font-heading text-2xl font-bold text-indigo-400">A</span>
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-slate-800 dark:text-slate-100">ABO</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Academic Buddy OS</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Version 0.5.0 · Phase 5
              </p>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              Obsidian 驱动的研究自动化伴侣。本地 Mac 程序，基于 Tauri + React + FastAPI 构建。
            </p>
            <div className="flex flex-col gap-2 text-xs text-slate-400 dark:text-slate-500">
              <p>Tauri 2.x · React 19 · FastAPI · APScheduler · Tailwind CSS v4</p>
              <p>LLM: Claude Code CLI (subprocess)</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
