# Chat 模块 UI 统一与功能完善实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重构 Chat 模块 UI 使其与 Profile/Feed 等其他模块风格一致，并修复初始页面自动检测后端功能

**Architecture:** 统一使用 components/Layout.tsx 中的 PageContainer, PageHeader, PageContent 等标准布局组件，替换现有的自定义布局。保留 WebSocket 连接逻辑不变。

**Tech Stack:** React + TypeScript + Tailwind CSS, 使用项目内 Layout 组件系统

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/modules/chat/ChatPanel.tsx` | 主容器，管理标签页和布局 |
| `src/modules/chat/ChatHome.tsx` | 初始页面，检测后端并创建对话 |
| `src/modules/chat/ChatSession.tsx` | 对话界面，使用统一布局组件 |
| `src/components/Layout.tsx` | 统一布局组件库 |

---

## Task 1: 重构 ChatSession 使用统一 Layout 组件

**Files:**
- Modify: `src/modules/chat/ChatSession.tsx`

**Current State:** 使用自定义 flex 布局和样式
**Target State:** 使用 PageContainer, PageHeader, PageContent 组件

- [ ] **Step 1: 分析现有 Layout 组件使用模式**

参考 `src/modules/profile/Profile.tsx` 第 6, 74-92 行:
```typescript
import { PageContainer, PageHeader, PageContent, Card, Grid } from "../../components/Layout";

// 使用方式
<PageContainer>
  <PageHeader
    title="角色档案"
    subtitle="管理你的研究者身份"
    icon={User}
  />
  <PageContent>
    {/* 内容 */}
  </PageContent>
</PageContainer>
```

- [ ] **Step 2: 修改 ChatSession 导入和结构**

```typescript
import { PageContainer, PageHeader, PageContent } from "../../components/Layout";
import { MessageSquare, Wifi, WifiOff, ArrowLeft, Trash2 } from "lucide-react";

// 替换现有的 div 结构为:
<PageContainer>
  <PageHeader
    title={cli.name}
    subtitle={isConnected ? "已连接" : "未连接"}
    icon={MessageSquare}
    actions={
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={onClear} style={{ /* 清除按钮样式 */ }}>
          <Trash2 size={18} />
        </button>
        <button onClick={onBack} style={{ /* 返回按钮样式 */ }}>
          <ArrowLeft size={18} />
        </button>
      </div>
    }
  />
  <PageContent maxWidth="900px">
    {/* 消息列表和输入框 */}
  </PageContent>
</PageContainer>
```

- [ ] **Step 3: 调整消息列表样式**

使用 Card 组件包裹消息列表区域:
```typescript
import { Card } from "../../components/Layout";

<Card noPadding style={{ height: "100%", display: "flex", flexDirection: "column" }}>
  {/* 消息列表 */}
  <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
    {messages.map(...)}
  </div>
  {/* 输入框 */}
  <div style={{ borderTop: "1px solid var(--border-light)", padding: "16px 20px" }}>
    {/* 输入框组件 */}
  </div>
</Card>
```

- [ ] **Step 4: 运行构建测试**

```bash
npx tsc --noEmit
npx vite build
```

Expected: 无错误，构建成功

- [ ] **Step 5: Commit**

```bash
git add src/modules/chat/ChatSession.tsx
git commit -m "refactor(chat): use unified Layout components in ChatSession"
```

---

## Task 2: 重构 ChatHome 初始页面

**Files:**
- Modify: `src/modules/chat/ChatHome.tsx`
- Modify: `src/modules/chat/ChatPanel.tsx` (props 接口)

- [ ] **Step 1: 分析现有 ChatHome 结构**

当前问题:
1. 使用自定义居中 flex 布局
2. 没有检测后端状态的 loading 状态
3. 选择 CLI 后才显示输入框

- [ ] **Step 2: 添加后端检测 loading 状态**

```typescript
import { useEffect, useState } from "react";
import { detectClis } from "../../api/chat";
import { LoadingState, EmptyState } from "../../components/Layout";

export function ChatHome({ onStartChat }: ChatHomeProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [availableClis, setAvailableClis] = useState<CliConfig[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    detectClis()
      .then(clis => {
        setAvailableClis(clis.filter(c => c.isAvailable));
        setIsLoading(false);
      })
      .catch(err => {
        setError("无法连接到后端服务");
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <LoadingState message="正在检测可用的 AI 助手..." />;
  }

  if (error || availableClis.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="暂无可用的 AI 助手"
        description={error || "请安装 Claude Code 或其他支持的 CLI 工具"}
      />
    );
  }

  // 正常渲染...
}
```

- [ ] **Step 3: 重构为居中 Card 布局**

```typescript
import { PageContainer, PageContent, Card } from "../../components/Layout";

<PageContainer>
  <PageContent centered maxWidth="600px">
    <Card style={{ textAlign: "center", padding: "48px 32px" }}>
      <div style={{
        width: "80px",
        height: "80px",
        borderRadius: "50%",
        background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto 24px"
      }}>
        <Bot size={40} color="white" />
      </div>

      <h2 style={{
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
        fontSize: "1.5rem",
        fontWeight: 700,
        marginBottom: "8px"
      }}>
        Hi，今天有什么安排？
      </h2>

      <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
        选择 AI 助手开始对话
      </p>

      {/* CLI 选择器 */}
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
        {availableClis.map(cli => (
          <button
            key={cli.id}
            onClick={() => setSelectedCli(cli)}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-sm)",
              border: selectedCli?.id === cli.id
                ? "2px solid var(--color-primary)"
                : "1px solid var(--border-light)",
              background: selectedCli?.id === cli.id
                ? "var(--color-primary-alpha)"
                : "white"
            }}
          >
            {cli.name}
          </button>
        ))}
      </div>

      {/* 输入框 */}
      <div style={{ position: "relative" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="输入消息开始对话..."
          style={{
            width: "100%",
            padding: "12px 48px 12px 16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-light)",
            resize: "none",
            minHeight: "56px"
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim()}
          style={{
            position: "absolute",
            right: "8px",
            bottom: "8px",
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: "var(--color-primary)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Send size={18} />
        </button>
      </div>
    </Card>
  </PageContent>
</PageContainer>
```

- [ ] **Step 4: 更新 ChatPanel 传递 props**

确保 ChatPanel 正确传递 onStartChat 回调

- [ ] **Step 5: 运行测试**

```bash
npx tsc --noEmit
npx vite build
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/chat/ChatHome.tsx src/modules/chat/ChatPanel.tsx
git commit -m "refactor(chat): unify ChatHome layout and add backend detection"
```

---

## Task 3: 统一字体和样式变量

**Files:**
- Modify: `src/modules/chat/ChatSession.tsx`
- Modify: `src/modules/chat/ChatHome.tsx`

- [ ] **Step 1: 确保使用正确的字体**

检查并统一使用:
```typescript
// 标题使用
fontFamily: "'M PLUS Rounded 1c', sans-serif"

// 正文使用（继承默认）
// 不需要额外设置
```

- [ ] **Step 2: 统一颜色变量**

确保使用项目标准变量:
- `--bg-app` - 应用背景
- `--bg-panel` - 面板背景
- `--bg-card` - 卡片背景
- `--bg-hover` - 悬停背景
- `--text-main` - 主要文字
- `--text-secondary` - 次要文字
- `--text-muted` - 弱化文字
- `--color-primary` - 主题色
- `--border-light` - 边框色
- `--radius-sm`, `--radius-md` - 圆角

- [ ] **Step 3: 提交样式统一**

```bash
git add src/modules/chat/
git commit -m "style(chat): unify typography and color variables"
```

---

## Task 4: 功能测试

- [ ] **Step 1: 运行所有测试**

```bash
# 前端构建
npx vite build

# 后端测试
python -m pytest tests/routes/test_chat.py tests/cli/test_runner.py -v

# 类型检查
npx tsc --noEmit
```

- [ ] **Step 2: 手动测试清单**

1. 刷新页面，检查是否显示 "正在检测可用的 AI 助手..."
2. 检测完成后，显示 CLI 选择器和输入框
3. 选择 CLI 并输入消息，点击发送
4. 验证平滑过渡到 ChatSession
5. 验证消息流式显示
6. 验证返回按钮可以回到 ChatHome

- [ ] **Step 3: Commit**

```bash
git commit -m "test(chat): verify unified UI and backend detection"
```

---

## Summary

此计划将:
1. 统一 Chat 模块 UI 与其他模块风格
2. 添加初始页面后端自动检测
3. 统一使用项目的 Layout 组件系统
4. 保持所有 WebSocket 功能不变
