# 02 — Frontend Patterns

> Read this for any React/TypeScript frontend work.

---

## HTTP Client (`src/core/api.ts`)

```typescript
import { api } from "../core/api";

// Typed GET
const data = await api.get<{ cards: FeedCard[] }>("/api/cards?limit=50");

// Typed POST (body is required — use {} for empty body)
await api.post<{ ok: boolean }>("/api/cards/123/feedback", { action: "star" });

// Also available: api.patch, api.put, api.delete
```

**Base URL**: `http://127.0.0.1:8765` (hardcoded in api.ts)

**Error handling**: Throws `Error` with `API ${status}: ${detail}` — catch in component.

---

## Zustand Store (`src/core/store.ts`)

### Shape

```typescript
interface AboStore {
  // Navigation
  activeTab: ActiveTab;  // "profile"|"overview"|"literature"|"arxiv"|"meeting"|"ideas"|"health"|"podcast"|"trends"|"claude"|"settings"
  setActiveTab: (tab: ActiveTab) => void;

  // Config
  config: AppConfig | null;  // { vault_path, version }
  setConfig: (config: AppConfig) => void;

  // Feed
  feedCards: FeedCard[];
  feedModules: FeedModule[];
  activeModuleFilter: string | null;
  unreadCounts: Record<string, number>;
  setFeedCards, prependCard, setFeedModules, setActiveModuleFilter, setUnreadCounts;

  // Profile
  profileEnergy: number;     // 0-100
  profileSan: number;        // 0-100 (stored as 0-100, NOT 0-10)
  profileMotto: string;
  profileStats: ProfileStats | null;
  setProfileEnergy, setProfileSan, setProfileMotto, setProfileStats;

  // Toast
  toasts: Toast[];
  addToast, removeToast;
}
```

### Key Types

```typescript
type ActiveTab = "profile" | "overview" | "literature" | "arxiv" | "meeting"
               | "ideas" | "health" | "podcast" | "trends" | "claude" | "settings";

interface FeedCard {
  id: string; title: string; summary: string; score: number;
  tags: string[]; source_url: string; obsidian_path: string;
  module_id: string; created_at: number; read: boolean;
  metadata: Record<string, unknown>;
}

interface FeedModule {
  id: string; name: string; icon: string; schedule: string;
  enabled: boolean; next_run: string | null;
}

interface DimStat { score: number; grade: "E"|"D"|"C"|"B"|"A"; raw: Record<string, unknown>; }
interface ProfileStats { research: DimStat; output: DimStat; health: DimStat; learning: DimStat; san: DimStat; happiness: DimStat; }
```

### Usage Pattern

```typescript
import { useStore } from "../core/store";

function MyComponent() {
  // Select only what you need (avoids unnecessary re-renders)
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);

  // Or destructure multiple
  const { feedCards, setFeedCards } = useStore();
}
```

---

## Event Bus (`src/core/events.ts`)

Lightweight typed pub/sub for cross-module communication:

```typescript
import { events } from "../core/events";

// Subscribe (returns unsubscribe function)
const off = events.on("energy-change", ({ current, max }) => { ... });

// Emit
events.emit("xp-gain", { skill: "research", xp: 10 });

// Available events:
// "energy-change" → { current: number, max: number }
// "xp-gain"       → { skill: string, xp: number }
// "vault-change"  → { changedPath: string }
```

---

## Toast System (`src/components/Toast.tsx`)

```typescript
import { useToast } from "../components/Toast";

function MyComponent() {
  const toast = useToast();

  toast.success("保存成功", "数据已更新");      // Green
  toast.error("操作失败", err.message);          // Red
  toast.info("提示", "这是一条信息");            // Blue
}
```

Auto-dismiss after 4 seconds. Renders at `fixed bottom-4 right-4`.

---

## Tab Navigation

### Adding a New Tab

1. **Store**: Add tab ID to `ActiveTab` type in `src/core/store.ts`
2. **NavSidebar**: Add to `MAIN` or `AUTO` array in `src/modules/nav/NavSidebar.tsx`
3. **MainContent**: Add `{activeTab === "newtab" && <NewComponent />}` in `src/modules/MainContent.tsx`

### Current Tab Layout

```
NavSidebar (w-48, bg-slate-900)
├── Logo (ABO v1.0)
├── Profile Summary Card (PixelAvatar + energy bar + motto)
├── MAIN: profile, overview, literature, ideas, claude
├── AUTO: arxiv, meeting, health, podcast, trends
├── Status: Vault 已连接 / 请配置 Vault
└── settings
```

### Overview Tab Special Case

The "overview" tab renders differently — it has a `FeedSidebar` + `Feed` side-by-side:

```tsx
if (activeTab === "overview") {
  return (
    <main className="flex-1 min-h-0 flex overflow-hidden h-full">
      <FeedSidebar />
      <div className="flex-1 min-w-0 overflow-hidden"><Feed /></div>
    </main>
  );
}
```

---

## Component Conventions

### Page Structure

Every module page follows this pattern:

```tsx
export default function MyPage() {
  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header bar — sticky */}
      <div className="flex items-center justify-between px-6 py-4
                      bg-white dark:bg-slate-900
                      border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40
                          flex items-center justify-center">
            <SomeIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">标题</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">描述</p>
          </div>
        </div>
        {/* Action buttons */}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Content */}
        </div>
      </div>
    </div>
  );
}
```

### Modal Pattern

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center
                bg-black/40 backdrop-blur-sm" onClick={onClose}>
  <div className="bg-white dark:bg-slate-800 rounded-2xl
                  border border-slate-200 dark:border-slate-700
                  shadow-xl w-full max-w-md mx-4 p-6"
       onClick={(e) => e.stopPropagation()}>
    {/* Modal content */}
  </div>
</div>
```

### Empty State

```tsx
<div className="text-center py-16 text-slate-400">
  <SomeIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
  <p>暂无数据</p>
  <p className="text-sm mt-1">操作提示</p>
</div>
```

### Loading State

```tsx
<div className="h-full flex items-center justify-center text-slate-400">
  加载中...
</div>
```

### Button Styles

```tsx
// Primary action
<button className="flex items-center gap-1.5 px-4 py-2 rounded-lg
                   bg-indigo-500 hover:bg-indigo-600
                   text-white text-sm font-medium
                   transition-colors cursor-pointer disabled:opacity-50">

// Secondary action
<button className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                   text-sm text-slate-600 dark:text-slate-300
                   hover:bg-slate-100 dark:hover:bg-slate-800
                   transition-colors cursor-pointer">

// Danger action
<button className="... border border-red-200 dark:border-red-700/50
                   text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 ...">
```

---

## Data Fetching Pattern

```tsx
// Standard: useEffect + api.get + useState
export default function MyPage() {
  const [data, setData] = useState<DataType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DataType>("/api/my-endpoint")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (!data) return <EmptyState />;
  return <Content data={data} />;
}
```

### WebSocket Pattern

```tsx
const wsRef = useRef<WebSocket | null>(null);

useEffect(() => {
  const ws = new WebSocket("ws://127.0.0.1:8765/ws/feed");
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "new_card") {
      prependCard(data.card);
    }
  };
  wsRef.current = ws;
  return () => ws.close();
}, []);
```

---

## Tailwind CSS v4 Notes

- Uses `@tailwindcss/vite` plugin (not PostCSS)
- Import: `@import "tailwindcss";` in index.css
- Custom animations defined in `tailwind.config.ts` (e.g. `wiggle` for anxious avatar)
- Dark mode: class-based (`document.documentElement.classList`)
- No `tailwind.config.ts` `content` array needed in v4 — auto-detection



# (Anime-Style Glassmorphism)

## 1. 设计愿景与总体风格 (Design Vision & Aesthetic)

本项目旨在开发一款桌面端 AI 助手应用。UI 风格参考了柔和的毛玻璃质感（Glassmorphism），并在此基础上融入了**微动漫风格（Subtle Anime Style）**。

- **核心关键词**：柔和 (Soft)、通透 (Translucent)、圆润 (Rounded)、治愈系 (Healing/Cozy)、毛玻璃 (Glassmorphism)。
- **与传统 UI 的区别**：拒绝生硬的直角和高饱和度的纯色。采用大圆角（Pill-shape）、低饱和度马卡龙/莫兰迪色系、以及具有弹簧物理反馈的微交互。允许用户设置动漫壁纸作为全局底层背景，UI 组件通过半透明和高斯模糊透出背景。

- **图标库**：Lucide Icons 或 Phosphor Icons (选择具有圆润线框风格的变体)。

## 3. 全局设计令牌 (Design Tokens & CSS Variables)

### 3.1 色彩系统 (Color Palette)

使用 CSS 变量以支持浅色/深色及自定义 CSS 主题切换。

:root {
  /* 基础背景 (Base Backgrounds) */
  --bg-app: #FFFDF8; /* 极浅的奶油黄/米色，带来温暖感 */
  --bg-sidebar: rgba(255, 253, 248, 0.6); /* 侧边栏，半透明用于毛玻璃 */
  --bg-panel: rgba(255, 255, 255, 0.8); /* 面板背景 */

  /* 强调色 (Accents) - 偏向香芋紫、樱花粉、天空蓝 */
  --color-primary: #BCA4E3; /* 香芋紫，主按钮和激活状态 */
  --color-primary-hover: #A58BCC;
  --color-secondary: #FFB7B2; /* 樱花粉，次要强调 */

  /* 文本颜色 (Text) - 避免纯黑，使用深紫灰或深蓝灰 */
  --text-main: #4A4A5A; 
  --text-muted: #8E8E9F;

  /* 边框与阴影 (Borders & Shadows) */
  --border-color: rgba(188, 164, 227, 0.2); /* 极淡的主题色边框 */
  --shadow-soft: 0 8px 32px rgba(133, 114, 166, 0.08); /* 柔和的发散阴影 */
  --shadow-float: 0 12px 48px rgba(133, 114, 166, 0.15); /* 悬浮层阴影 */
}

/* 深色模式 / 赛博朋克动漫风 */
.dark-theme {
  --bg-app: #1A1A24;
  --bg-sidebar: rgba(26, 26, 36, 0.6);
  --bg-panel: rgba(40, 40, 55, 0.8);
  --text-main: #EAEAEA;
  --text-muted: #A0A0B0;
  --color-primary: #9D7BDB;
  --border-color: rgba(255, 255, 255, 0.08);
}

### 3.2 形状与布局 (Shapes & Geometry)

- **大圆角 (Border Radius)**：
  - 卡片、面板：`border-radius: 20px` 到 `24px`。
  - 按钮、输入框、小标签：药丸形状 `border-radius: 9999px` (Tailwind: `rounded-full`)。
- **毛玻璃效果 (Glassmorphism)**：
  - 所有的浮动面板、侧边栏均需应用：`backdrop-filter: blur(16px); background: var(--bg-panel); border: 1px solid var(--border-color);`

## 4. 核心布局结构 (Layout Structure)

应用采用经典的三分/左右结构，但组件之间需要有视觉上的“呼吸感”（留白）。

### 4.1 侧边栏 (Sidebar - Left)

- **宽度**：约 `240px` - `260px`。
- **样式**：贯穿上下，右侧有一条极细的、带有微渐变的分割线（或者完全依靠阴影和背景色区分）。
- **内容**：
  - 顶部：应用 Logo 和名称（带有一点卡通感或特殊字体）。
  - 中部导航：圆角矩形或药丸形状的导航项。选中状态要有明显的背景色填充（如浅紫色）和图标变色。
  - 底部：设置按钮、头像等。

### 4.2 主内容区 (Main Content - Right)

- 包含顶部控制栏（Window Controls，针对 Tauri 需要做 custom titlebar）。
- **对话界面**：
  - 巨大的居中欢迎语（例如："Hi, 今天有什么安排？"）。
  - **输入框容器 (Input Area)**：这是视觉焦点。需要做成一个巨大的圆角矩形（`rounded-3xl`），内部包含输入框、模型切换标签（小药丸形状）、附件按钮、以及一个明显的圆形发送按钮（悬浮在输入框右下角）。
  - **快捷指令 (Prompt Suggestions)**：输入框下方的一排小药丸按钮，带有 Emoji 或小图标。

### 4.3 设置/插件页面 (Settings/Skills View)

- 采用“卡片堆叠”设计。
- **主题卡片 (CSS 预设卡片)**：如参考图所示，卡片比例约为 16:9，上方是预览图（支持动漫背景），下方是带毛玻璃效果的标题栏。右上角有选中状态的 Checkbox（如绿色小勾）。

## 5. 组件级详细规范 (Component Specs)

### 5.1 按钮 (Buttons)

- **Primary Button (发送/确认)**：圆形或短药丸形，背景为 `--color-primary`，带有 `--shadow-soft`。Hover 时亮度微增，并且有向上微小位移 (`transform: translateY(-2px)`)。
- **Tag/Pill Button (快捷指令/模型切换)**：背景为非常浅的透明主色 (`rgba(188,164,227,0.15)`)，边框 1px solid 极浅的颜色，文字颜色较深。

### 5.2 输入框 (Textarea/Input)

- 无边框线（去除默认 `outline` 和 `border`），依靠父容器的背景色和内阴影区分。
- 聚焦 (Focus) 时，父级容器的边框颜色平滑过渡到 `--color-primary`，并伴随外发光阴影。

### 5.3 滚动条 (Scrollbar)

- 必须自定义滚动条。隐藏原生丑陋的滚动条，使用极细的圆角滚动条，只有在 Hover 时才变粗加深。

## 6. 微动漫交互与动效 (Anime-Inspired Micro-interactions)

为了体现“动漫/治愈”感，动效极其重要（Agent 请使用 CSS Transitions 或动画库实现）：

1. **弹簧物理反馈 (Spring Physics)**：所有的点击、Hover 展开，不使用线性的 `ease-in-out`，而是使用带有一点弹性的 cubic-bezier，如 `transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);`（产生轻微的果冻 Q 弹感）。
2. **渐显与位移 (Fade & Slide)**：页面切换或消息气泡出现时，从下往上伴随透明度变化滑入（`translateY(10px) -> 0`, `opacity: 0 -> 1`）。
3. **悬浮呼吸效 (Breathing Effect)**：核心的 AI Logo 或等待状态的指示器，可以加入极缓的放大缩小动画（Scale 1 to 1.05 over 3 seconds）。

在生成组件时，请严格遵守以下规则：

1. 全局大量使用 `rounded-2xl` 到 `rounded-full` 的圆角。
2. 任何面板、卡片必须包含 `backdrop-blur` 和带透明度的背景色，以支持底层透出动漫壁纸。
3. 颜色切忌过饱和，使用定义的柔和色彩变量。
4. 所有的 Hover 状态必须带有轻微的位移（Scale 或 Translate）和透明度变化。
5. 阴影要大、散、淡，不要硬阴影。



为了进一步提升应用的“二次元”浓度，可以在基础规范上加入以下设计要求：

1. **全局动态壁纸支持 (Global Wallpaper)**：允许用户在设置中上传一张插画/动漫壁纸，并将其置于 `<body>` 的最底层。配合上述规范中半透明的毛玻璃 UI 面板，壁纸会非常漂亮地透出来。
2. **看板娘 / 动态小组件 (Live2D / Mascot)**：在侧边栏的角落，或空状态下的聊天界面中央，预留一个容器用于放置小型的 Live2D 模型或循环播放的像素风/动漫风 GIF，增加陪伴感。
3. **自定义字体 (Custom Typography)**：在全局 CSS 中引入一种略带手写感或圆润感的字体（如 `TsukuGo` 筑紫黑体，或开源的 `M PLUS Rounded 1c`），替代传统的系统无衬线字体，使整体视觉更加可爱、柔和。
