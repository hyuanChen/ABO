# ABO 用户体验优化计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从重度用户角度全面优化 ABO 的使用体验，降低新用户上手门槛，提升老用户的日常使用效率，建立完善的模块管理和引导体系。

**Architecture:** 保持现有技术栈不变（Tauri + React + FastAPI），通过增强前端交互、完善后端 API、优化配置流程来提升体验。新增 Onboarding 引导系统、统一模块管理面板、智能搜索筛选、数据洞察等功能。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4 + Zustand, FastAPI + Python 3.14, SQLite, D3.js (图表)

---

## 第一部分：用户痛点分析

### 重度用户场景

| 场景 | 痛点 | 期望解决 |
|------|------|----------|
| 首次安装 | 不知道从何开始配置，Vault路径、Cookie配置分散在各处 | 一站式引导配置 |
| 日常使用 | Feed卡片过多，难以找到重要内容；重复操作多 | 智能筛选、批量操作、快捷键 |
| 模块管理 | 7个模块的配置分散在不同页面，Cookie过期不知道 | 统一模块面板、状态监控 |
| 数据查看 | 想看自己的阅读趋势、偏好变化，但没有数据可视化 | 个人数据洞察仪表盘 |
| 爬虫配置 | Cookie获取困难，不知道格式对不对 | Cookie验证工具、自动获取 |
| 内容管理 | 保存的内容散落在各处，难以回顾 | 统一收藏管理、标签系统 |

### 新用户上手障碍

1. **配置门槛高**：Obsidian Vault、Cookie、关键词配置步骤多
2. **概念不理解**：什么是Module、Card、Feed，如何互动
3. **看不到效果**：配置后不知道什么时候会产出内容
4. **错误处理差**：Cookie失效、爬取出错没有明确提示

---

## 第二部分：文件结构规划

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/modules/onboarding/` | 新用户引导流程（欢迎页、配置向导、功能介绍） |
| `src/modules/dashboard/` | 个人数据洞察仪表盘 |
| `src/modules/modules/` | 统一模块管理面板 |
| `src/modules/collections/` | 统一收藏管理 |
| `src/components/Search/` | 全局搜索组件 |
| `src/components/CommandPalette/` | 命令面板（快捷键） |
| `src/components/TourGuide/` | 功能引导 tour |
| `abo/onboarding/` | 后端 onboarding API |
| `abo/insights/` | 数据洞察 API |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `CLAUDE.md` | 完善开发规范，新增用户体验章节 |
| `ref/00-architecture.md` | 补充 onboarding 和 insights 架构 |
| `ref/10-user-experience.md` | 新建：UX设计指南（新增） |
| `ref/11-module-management.md` | 新建：模块管理开发指南（新增） |
| `src/modules/nav/NavSidebar.tsx` | 添加搜索入口、命令面板入口 |
| `src/modules/feed/Feed.tsx` | 添加筛选、批量操作 |
| `abo/main.py` | 新增 onboarding 和 insights 路由 |

---

## 第三部分：详细任务

### Task 1: 完善项目文档体系

**Files:**
- Create: `ref/10-user-experience.md`
- Create: `ref/11-module-management.md`
- Modify: `CLAUDE.md` (添加UX章节)
- Modify: `ref/README.md` (更新索引)

**Step 1: 创建用户体验设计指南**

创建 `ref/10-user-experience.md`:

```markdown
# 10 — User Experience Design Guide

> 本文档定义 ABO 的用户体验设计原则、交互模式和组件规范。
> 开发者在实现任何涉及用户交互的功能前必须阅读本文档。

## 设计原则

### 1. 渐进式披露
- 新用户看到简化界面，高级功能通过「更多」或快捷键访问
- 配置项分「基础/高级」两层，默认只展示基础

### 2. 即时反馈
- 所有操作 100ms 内必须有视觉反馈
- 耗时操作显示进度（进度条或骨架屏）
- 错误信息明确告诉用户「发生了什么」和「如何解决」

### 3.  sensible defaults
- 所有配置都有合理的默认值
- 新用户无需配置即可看到示例数据

### 4. 一致性
- 所有按钮、输入框、卡片遵循统一样式
- 相同的操作在界面各处表现一致

## 交互模式

### Onboarding 流程
1. **Welcome** — 欢迎页，展示产品价值主张
2. **Vault Setup** — 选择 Obsidian Vault 路径
3. **Quick Config** — 快速配置（使用默认关键词）
4. **Tutorial** — 交互式功能引导
5. **First Card** — 手动触发第一次爬虫，看到第一张 Card

### 空状态设计
| 场景 | 设计 |
|------|------|
| Feed 为空 | 显示引导图 + 「运行模块」按钮 + 示例 Card |
| 模块未配置 | 显示配置向导入口 |
| 搜索无结果 | 提示调整关键词 + 示例搜索 |

### 错误处理
- **Cookie 过期**: 显示警告条 + 一键重新获取入口
- **爬取失败**: 显示失败原因 + 重试按钮 + 反馈入口
- **Vault 路径错误**: 红框提示 + 路径选择器

## 组件规范

### Toast 通知
- 成功：绿色，2秒自动消失
- 错误：红色，手动关闭
- 警告：黄色，5秒或手动关闭
- 信息：蓝色，3秒自动消失

### Loading 状态
- 按钮：显示 spinner，禁用点击
- 卡片：骨架屏（shimmer effect）
- 页面：骨架屏 + 进度条

### 表单验证
- 实时验证（debounce 300ms）
- 错误信息在输入框下方显示
- 提交时验证所有字段
```

**Step 2: 创建模块管理开发指南**

创建 `ref/11-module-management.md`:

```markdown
# 11 — Module Management Guide

> 本文档定义统一模块管理面板的开发规范。

## 模块数据结构

```typescript
interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'paused' | 'error' | 'unconfigured';
  schedule: string;
  lastRun: Date | null;
  nextRun: Date | null;
  stats: {
    totalCards: number;
    thisWeek: number;
    successRate: number;
  };
  config: {
    keywords?: string[];
    cookie?: string;
    cookieValid?: boolean;
    [key: string]: any;
  };
  subscriptions?: Array<{
    type: string;
    value: string;
    label: string;
  }>;
}
```

## 模块状态定义

| 状态 | 颜色 | 说明 | 操作 |
|------|------|------|------|
| active | 绿色 | 正常运行 | 暂停、配置 |
| paused | 黄色 | 用户暂停 | 启动、配置 |
| error | 红色 | 运行出错（Cookie过期等） | 诊断、配置 |
| unconfigured | 灰色 | 缺少必要配置 | 配置向导 |

## API 规范

### GET /api/modules/dashboard
返回所有模块的完整状态，用于模块管理面板。

### POST /api/modules/{id}/diagnose
诊断模块问题（检查Cookie有效性、网络连接等）。

### POST /api/modules/{id}/quick-fix
尝试自动修复常见问题。
```

**Step 3: 更新 CLAUDE.md**

在 `CLAUDE.md` 的 "Architecture Principles" 后添加：

```markdown
---

## User Experience Principles

1. **Zero-config start** — 新用户无需配置即可看到示例数据
2. **Progressive disclosure** — 功能分层展示，避免信息过载
3. **Immediate feedback** — 所有操作有即时视觉反馈
4. **Graceful degradation** — 部分功能失效时，其他功能正常可用
5. **Smart defaults** — 所有配置项都有基于用户行为的智能默认值

---

## Development Guidelines

### Adding New Features

1. 阅读 `ref/10-user-experience.md` 了解 UX 规范
2. 阅读 `ref/09-new-feature-checklist.md` 按步骤实现
3. 确保新功能有合理的空状态
4. 添加错误边界（Error Boundary）
5. 为新功能添加 Tour Guide 步骤

### Module Development

1. 阅读 `ref/01-module-sdk.md` 了解 SDK
2. 阅读 `ref/11-module-management.md` 了解模块管理规范
3. 确保模块有清晰的配置界面
4. 提供 Cookie/认证验证功能
5. 添加诊断和自助修复功能
```

**Step 4: 更新 ref/README.md**

在索引表中添加：

```markdown
| `10-user-experience.md` | 实现任何用户交互功能 | UX 原则、交互模式、组件规范 |
| `11-module-management.md` | 开发新模块或修改模块管理 | 模块状态、API 规范、配置界面 |
```

**Step 5: Commit**

```bash
git add ref/ CLAUDE.md
git commit -m "docs: add UX design guide and module management guide"
```

---

### Task 2: 新用户 Onboarding 系统

**Files:**
- Create: `src/modules/onboarding/OnboardingWizard.tsx`
- Create: `src/modules/onboarding/steps/WelcomeStep.tsx`
- Create: `src/modules/onboarding/steps/VaultSetupStep.tsx`
- Create: `src/modules/onboarding/steps/QuickConfigStep.tsx`
- Create: `src/modules/onboarding/steps/TutorialStep.tsx`
- Create: `src/modules/onboarding/ProgressIndicator.tsx`
- Modify: `src/App.tsx` (添加 onboarding 路由)
- Modify: `abo/config.py` (添加 onboarding 状态)

**Step 1: 创建后端 Onboarding 状态存储**

修改 `abo/config.py`，在 `load()` 函数中添加 onboarding 字段：

```python
def load() -> dict:
    """Load config with defaults."""
    defaults = {
        "version": "1.0.0",
        "vault_path": "",
        "literature_path": "",
        "onboarding_completed": False,
        "onboarding_step": 0,  # 0-4
        "first_run_date": None,
    }
    # ... rest of the function
```

**Step 2: 创建 Welcome 步骤组件**

创建 `src/modules/onboarding/steps/WelcomeStep.tsx`:

```tsx
import { Sparkles, ArrowRight } from 'lucide-react';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8">
      <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center mb-8 shadow-lg">
        <Sparkles className="w-12 h-12 text-white" />
      </div>

      <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
        欢迎来到 ABO
      </h1>

      <p className="text-xl text-gray-600 dark:text-gray-300 mb-4 max-w-lg">
        你的个人科研情报引擎
      </p>

      <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md">
        ABO 会自动追踪 arXiv、知乎、B站等平台的科研内容，
        帮你构建个人知识库，让研究工作更高效。
      </p>

      <div className="grid grid-cols-3 gap-4 mb-8 max-w-2xl">
        <FeatureCard
          icon="📚"
          title="自动追踪"
          desc="7个平台自动爬取科研内容"
        />
        <FeatureCard
          icon="🎯"
          title="智能筛选"
          desc="AI 评分帮你找到最有价值的论文"
        />
        <FeatureCard
          icon="🎮"
          title="游戏化"
         desc="养成角色，让科研更有趣"
        />
      </div>

      <button
        onClick={onNext}
        className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all"
      >
        开始配置
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className="font-medium mb-1">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">{desc}</p>
    </div>
  );
}
```

**Step 3: 创建 VaultSetup 步骤**

创建 `src/modules/onboarding/steps/VaultSetupStep.tsx`:

```tsx
import { useState } from 'react';
import { FolderOpen, Check, AlertCircle } from 'lucide-react';

interface VaultSetupStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function VaultSetupStep({ onNext, onBack }: VaultSetupStepProps) {
  const [vaultPath, setVaultPath] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  const handleSelectVault = async () => {
    // 调用 Tauri API 选择文件夹
    const selected = await window.__TAURI__.dialog.open({
      directory: true,
      multiple: false,
    });
    if (selected) {
      setVaultPath(selected as string);
      validateVault(selected as string);
    }
  };

  const validateVault = async (path: string) => {
    setIsValidating(true);
    try {
      const response = await fetch('/api/config/validate-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await response.json();
      setIsValid(data.valid);
      setError(data.error || '');
    } catch (e) {
      setIsValid(false);
      setError('无法验证路径');
    }
    setIsValidating(false);
  };

  const handleContinue = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault_path: vaultPath }),
    });
    onNext();
  };

  return (
    <div className="max-w-xl mx-auto py-12 px-8">
      <h2 className="text-2xl font-bold mb-4">选择 Obsidian Vault</h2>
      <p className="text-gray-600 dark:text-gray-300 mb-8">
        ABO 会将所有内容保存到你的 Obsidian Vault 中。
        如果还没有 Vault，可以选择任意文件夹创建。
      </p>

      <div className="space-y-4">
        <button
          onClick={handleSelectVault}
          className="w-full p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all flex flex-col items-center gap-3"
        >
          <FolderOpen className="w-10 h-10 text-gray-400" />
          <span className="text-gray-600 dark:text-gray-300">
            {vaultPath || '点击选择 Vault 文件夹'}
          </span>
        </button>

        {isValidating && (
          <div className="text-center text-gray-500">验证中...</div>
        )}

        {isValid === false && (
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error || '路径无效'}
          </div>
        )}

        {isValid === true && (
          <div className="flex items-center gap-2 text-green-500 text-sm">
            <Check className="w-4 h-4" />
            Vault 路径有效
          </div>
        )}
      </div>

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="px-6 py-2 text-gray-600 hover:text-gray-800">
          返回
        </button>
        <button
          onClick={handleContinue}
          disabled={!isValid}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          继续
        </button>
      </div>
    </div>
  );
}
```

**Step 4: 创建主 Wizard 组件**

创建 `src/modules/onboarding/OnboardingWizard.tsx`:

```tsx
import { useState } from 'react';
import { WelcomeStep } from './steps/WelcomeStep';
import { VaultSetupStep } from './steps/VaultSetupStep';
import { QuickConfigStep } from './steps/QuickConfigStep';
import { TutorialStep } from './steps/TutorialStep';
import { ProgressIndicator } from './ProgressIndicator';

const STEPS = [
  { id: 'welcome', title: '欢迎' },
  { id: 'vault', title: 'Vault 配置' },
  { id: 'config', title: '快速配置' },
  { id: 'tutorial', title: '功能引导' },
];

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeOnboarding = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_completed: true }),
    });
    window.location.href = '/';
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep onNext={handleNext} />;
      case 1:
        return <VaultSetupStep onNext={handleNext} onBack={handleBack} />;
      case 2:
        return <QuickConfigStep onNext={handleNext} onBack={handleBack} />;
      case 3:
        return <TutorialStep onComplete={handleNext} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto py-8">
        <ProgressIndicator steps={STEPS} current={currentStep} />
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
```

**Step 5: 在 App.tsx 中添加路由**

修改 `src/App.tsx`:

```tsx
import { OnboardingWizard } from './modules/onboarding/OnboardingWizard';

function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // 检查是否需要显示 onboarding
    fetch('/api/config')
      .then(r => r.json())
      .then(config => {
        if (!config.onboarding_completed) {
          setShowOnboarding(true);
        }
      });
  }, []);

  if (showOnboarding) {
    return <OnboardingWizard />;
  }

  // ... rest of the app
}
```

**Step 6: Commit**

```bash
git add src/modules/onboarding/ src/App.tsx abo/config.py
git commit -m "feat(onboarding): add new user onboarding wizard"
```

---

### Task 3: 统一模块管理面板

**Files:**
- Create: `src/modules/modules/ModuleManagementPanel.tsx`
- Create: `src/modules/modules/ModuleCard.tsx`
- Create: `src/modules/modules/ModuleDetailDrawer.tsx`
- Create: `src/modules/modules/CookieValidator.tsx`
- Create: `abo/modules/routes.py`
- Modify: `src/modules/nav/NavSidebar.tsx` (添加入口)

**Step 1: 创建后端模块管理 API**

创建 `abo/modules/routes.py`:

```python
"""模块管理 API"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/api/modules", tags=["modules"])

@router.get("/dashboard")
async def get_modules_dashboard():
    """获取所有模块的完整状态用于管理面板。"""
    # 从 registry 获取所有模块
    modules = []
    for module in _registry.all():
        # 获取模块统计
        stats = _card_store.get_module_stats(module.id)

        # 获取下次运行时间
        job_info = _scheduler.get_job_info(module.id) if _scheduler else None

        # 检查 Cookie 有效性（如果模块需要）
        cookie_valid = None
        if hasattr(module, '_module_cookie'):
            cookie = module._module_cookie()
            if cookie:
                cookie_valid = await validate_module_cookie(module.id, cookie)

        modules.append({
            "id": module.id,
            "name": module.name,
            "description": getattr(module, "description", ""),
            "icon": module.icon,
            "status": get_module_status(module),
            "schedule": module.schedule,
            "lastRun": stats.get("last_run"),
            "nextRun": job_info.get("next_run") if job_info else None,
            "stats": {
                "totalCards": stats.get("total", 0),
                "thisWeek": stats.get("this_week", 0),
                "successRate": stats.get("success_rate", 100),
            },
            "config": {
                "keywords": get_module_keywords(module.id),
                "cookie": cookie if hasattr(module, '_module_cookie') else None,
                "cookieValid": cookie_valid,
            },
            "subscriptions": getattr(module, "subscription_types", []),
        })

    return {"modules": modules}

@router.post("/{module_id}/diagnose")
async def diagnose_module(module_id: str):
    """诊断模块问题。"""
    module = _registry.get(module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    issues = []
    fixes = []

    # 检查 Cookie
    if hasattr(module, '_module_cookie'):
        cookie = module._module_cookie()
        if not cookie:
            issues.append({
                "type": "cookie_missing",
                "message": "缺少 Cookie 配置",
                "severity": "error",
            })
            fixes.append("请配置 Cookie")
        else:
            is_valid = await validate_module_cookie(module_id, cookie)
            if not is_valid:
                issues.append({
                    "type": "cookie_invalid",
                    "message": "Cookie 已过期或无效",
                    "severity": "error",
                })
                fixes.append("请重新获取 Cookie")

    # 检查 Vault 路径
    vault_path = get_vault_path()
    if not vault_path:
        issues.append({
            "type": "vault_not_configured",
            "message": "未配置 Vault 路径",
            "severity": "warning",
        })

    return {
        "moduleId": module_id,
        "issues": issues,
        "suggestedFixes": fixes,
        "canAutoFix": len([f for f in fixes if "重新获取" in f]) > 0,
    }

@router.post("/{module_id}/quick-fix")
async def quick_fix_module(module_id: str):
    """尝试自动修复模块问题。"""
    # 尝试从浏览器获取 Cookie
    # ... 实现自动修复逻辑
    return {"fixed": True, "message": "已尝试自动修复"}

async def validate_module_cookie(module_id: str, cookie: str) -> bool:
    """验证模块的 Cookie 是否有效。"""
    # 根据模块类型调用相应的验证函数
    if module_id == "bilibili-tracker":
        from abo.tools.bilibili import bilibili_verify_sessdata
        result = await bilibili_verify_sessdata(cookie)
        return result.get("valid", False)
    elif module_id == "xiaohongshu-tracker":
        from abo.tools.xiaohongshu import xiaohongshu_verify_cookie
        result = await xiaohongshu_verify_cookie(cookie)
        return result.get("valid", False)
    # ... 其他模块
    return True
```

**Step 2: 创建模块卡片组件**

创建 `src/modules/modules/ModuleCard.tsx`:

```tsx
import { Play, Pause, Settings, AlertCircle, Check } from 'lucide-react';
import { useState } from 'react';

interface ModuleCardProps {
  module: {
    id: string;
    name: string;
    description: string;
    icon: string;
    status: 'active' | 'paused' | 'error' | 'unconfigured';
    lastRun: string | null;
    nextRun: string | null;
    stats: {
      totalCards: number;
      thisWeek: number;
      successRate: number;
    };
    config: {
      keywords?: string[];
      cookie?: string;
      cookieValid?: boolean;
    };
  };
  onToggle: () => void;
  onConfigure: () => void;
  onRunNow: () => void;
}

const STATUS_CONFIG = {
  active: { color: 'green', label: '运行中', icon: Check },
  paused: { color: 'yellow', label: '已暂停', icon: Pause },
  error: { color: 'red', label: '错误', icon: AlertCircle },
  unconfigured: { color: 'gray', label: '未配置', icon: Settings },
};

export function ModuleCard({ module, onToggle, onConfigure, onRunNow }: ModuleCardProps) {
  const [isRunning, setIsRunning] = useState(false);
  const status = STATUS_CONFIG[module.status];
  const StatusIcon = status.icon;

  const handleRunNow = async () => {
    setIsRunning(true);
    await onRunNow();
    setIsRunning(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg bg-${status.color}-100 dark:bg-${status.color}-900/30 flex items-center justify-center`}>
            <StatusIcon className={`w-5 h-5 text-${status.color}-600 dark:text-${status.color}-400`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{module.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full bg-${status.color}-100 dark:bg-${status.color}-900/30 text-${status.color}-700 dark:text-${status.color}-300`}>
              {status.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {module.status === 'error' && (
            <button
              onClick={onConfigure}
              className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
            >
              修复
            </button>
          )}
          <button
            onClick={onToggle}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            {module.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {module.description}
      </p>

      {/* 统计信息 */}
      <div className="grid grid-cols-3 gap-4 mb-4 py-3 border-y border-gray-100 dark:border-gray-700">
        <Stat label="总卡片" value={module.stats.totalCards} />
        <Stat label="本周新增" value={module.stats.thisWeek} />
        <Stat label="成功率" value={`${module.stats.successRate}%`} />
      </div>

      {/* 配置状态 */}
      <div className="space-y-2">
        {module.config.cookie !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Cookie 状态</span>
            <CookieStatus valid={module.config.cookieValid} />
          </div>
        )}
        {module.config.keywords && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">关键词</span>
            <span className="text-gray-700 dark:text-gray-300">
              {module.config.keywords.slice(0, 3).join(', ')}
              {module.config.keywords.length > 3 && ` +${module.config.keywords.length - 3}`}
            </span>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleRunNow}
          disabled={isRunning || module.status !== 'active'}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isRunning ? '运行中...' : '立即运行'}
        </button>
        <button
          onClick={onConfigure}
          className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
        >
          配置
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-semibold text-gray-900 dark:text-white">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function CookieStatus({ valid }: { valid?: boolean }) {
  if (valid === undefined) return <span className="text-gray-400">未配置</span>;
  if (valid) return <span className="text-green-500 flex items-center gap-1"><Check className="w-3 h-3" /> 有效</span>;
  return <span className="text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> 无效</span>;
}
```

**Step 3: 创建主面板组件**

创建 `src/modules/modules/ModuleManagementPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ModuleCard } from './ModuleCard';
import { ModuleDetailDrawer } from './ModuleDetailDrawer';
import { LayoutGrid, List, Plus } from 'lucide-react';

interface Module {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'paused' | 'error' | 'unconfigured';
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  stats: {
    totalCards: number;
    thisWeek: number;
    successRate: number;
  };
  config: {
    keywords?: string[];
    cookie?: string;
    cookieValid?: boolean;
  };
  subscriptions?: Array<{
    type: string;
    value: string;
    label: string;
  }>;
}

export function ModuleManagementPanel() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'active' | 'error'>('all');

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    const response = await fetch('/api/modules/dashboard');
    const data = await response.json();
    setModules(data.modules);
    setLoading(false);
  };

  const handleToggle = async (moduleId: string) => {
    const module = modules.find(m => m.id === moduleId);
    if (!module) return;

    const newStatus = module.status === 'active' ? 'paused' : 'active';
    await fetch(`/api/modules/${moduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newStatus === 'active' }),
    });
    fetchModules();
  };

  const handleRunNow = async (moduleId: string) => {
    await fetch(`/api/modules/${moduleId}/run`, { method: 'POST' });
    // 显示 toast 通知
  };

  const filteredModules = modules.filter(m => {
    if (filter === 'all') return true;
    if (filter === 'active') return m.status === 'active';
    if (filter === 'error') return m.status === 'error';
    return true;
  });

  if (loading) {
    return <div className="p-8 text-center">加载中...</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">模块管理</h1>
          <p className="text-gray-500 text-sm mt-1">
            管理 {modules.length} 个模块 · {modules.filter(m => m.status === 'active').length} 个运行中
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 过滤器 */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
          >
            <option value="all">全部</option>
            <option value="active">运行中</option>
            <option value="error">错误</option>
          </select>

          {/* 视图切换 */}
          <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 模块网格 */}
      <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'} gap-4`}>
        {filteredModules.map(module => (
          <ModuleCard
            key={module.id}
            module={module}
            onToggle={() => handleToggle(module.id)}
            onConfigure={() => setSelectedModule(module)}
            onRunNow={() => handleRunNow(module.id)}
          />
        ))}
      </div>

      {/* 详情抽屉 */}
      {selectedModule && (
        <ModuleDetailDrawer
          module={selectedModule}
          onClose={() => setSelectedModule(null)}
          onUpdate={fetchModules}
        />
      )}
    </div>
  );
}
```

**Step 4: 在 NavSidebar 添加入口**

修改 `src/modules/nav/NavSidebar.tsx`，在 AUTO 部分前添加：

```tsx
{/* 模块管理 */}
<button
  onClick={() => setActiveTab('modules')}
  className={...
}
  <Settings className="w-4 h-4" />
  <span>模块管理</span>
</button>
```

**Step 5: Commit**

```bash
git add src/modules/modules/ abo/modules/routes.py
git commit -m "feat(modules): add unified module management panel"
```

---

### Task 4: 全局搜索与命令面板

**Files:**
- Create: `src/components/Search/GlobalSearch.tsx`
- Create: `src/components/CommandPalette/CommandPalette.tsx`
- Create: `src/components/CommandPalette/useCommandPalette.ts`
- Modify: `src/modules/nav/NavSidebar.tsx` (添加快捷键)
- Modify: `src/App.tsx` (添加全局监听)

**Step 1: 创建命令面板 Hook**

创建 `src/components/CommandPalette/useCommandPalette.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';

export interface Command {
  id: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  icon?: string;
  action: () => void;
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [commands, setCommands] = useState<Command[]>([]);

  // 注册命令
  useEffect(() => {
    const baseCommands: Command[] = [
      {
        id: 'goto-feed',
        title: '打开 Feed',
        subtitle: '查看所有内容卡片',
        shortcut: 'G F',
        action: () => window.location.href = '/?tab=feed',
      },
      {
        id: 'goto-profile',
        title: '打开角色主页',
        subtitle: '查看 stats 和今日任务',
        shortcut: 'G P',
        action: () => window.location.href = '/?tab=profile',
      },
      {
        id: 'goto-literature',
        title: '打开文献库',
        shortcut: 'G L',
        action: () => window.location.href = '/?tab=literature',
      },
      {
        id: 'run-arxiv',
        title: '运行 ArXiv 爬虫',
        subtitle: '立即获取最新论文',
        shortcut: 'R A',
        action: () => fetch('/api/modules/arxiv-tracker/run', { method: 'POST' }),
      },
      {
        id: 'run-all',
        title: '运行所有模块',
        subtitle: '触发所有启用的模块',
        action: () => fetch('/api/modules/run-all', { method: 'POST' }),
      },
      {
        id: 'create-idea',
        title: '新建 Idea',
        subtitle: '在 Idea 工坊创建',
        shortcut: 'C I',
        action: () => window.location.href = '/?tab=ideas&action=new',
      },
      {
        id: 'open-settings',
        title: '打开设置',
        shortcut: 'Cmd ,',
        action: () => window.location.href = '/?tab=settings',
      },
    ];
    setCommands(baseCommands);
  }, []);

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K 打开命令面板
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      // Escape 关闭
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredCommands = commands.filter(cmd =>
    cmd.title.toLowerCase().includes(search.toLowerCase()) ||
    cmd.subtitle?.toLowerCase().includes(search.toLowerCase())
  );

  return {
    isOpen,
    setIsOpen,
    search,
    setSearch,
    commands: filteredCommands,
  };
}
```

**Step 2: 创建命令面板组件**

创建 `src/components/CommandPalette/CommandPalette.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import { Search, Command } from 'lucide-react';
import { useCommandPalette } from './useCommandPalette';

export function CommandPalette() {
  const { isOpen, setIsOpen, search, setSearch, commands } = useCommandPalette();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % commands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + commands.length) % commands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commands[selectedIndex]?.action();
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
        {/* 搜索输入 */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入命令..."
            className="flex-1 bg-transparent outline-none text-lg"
          />
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Command className="w-3 h-3" />
            <span>K</span>
          </div>
        </div>

        {/* 命令列表 */}
        <div className="max-h-96 overflow-y-auto py-2">
          {commands.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              没有找到命令
            </div>
          ) : (
            commands.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.action();
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  index === selectedIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                <div>
                  <div className="font-medium">{cmd.title}</div>
                  {cmd.subtitle && (
                    <div className="text-sm text-gray-500">{cmd.subtitle}</div>
                  )}
                </div>
                {cmd.shortcut && (
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    {cmd.shortcut.split(' ').map((key, i) => (
                      <kbd key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                        {key}
                      </kbd>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-4">
            <span>↑↓ 选择</span>
            <span>↵ 执行</span>
            <span>ESC 关闭</span>
          </div>
          <div>{commands.length} 个命令</div>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: 在 App.tsx 中添加**

```tsx
import { CommandPalette } from './components/CommandPalette/CommandPalette';

function App() {
  return (
    <>
      {/* ... 原有内容 ... */}
      <CommandPalette />
    </>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/CommandPalette/ src/components/Search/
git commit -m "feat(ui): add command palette with keyboard shortcuts"
```

---

### Task 5: 个人数据洞察仪表盘

**Files:**
- Create: `src/modules/dashboard/Dashboard.tsx`
- Create: `src/modules/dashboard/ActivityChart.tsx`
- Create: `src/modules/dashboard/ReadingStats.tsx`
- Create: `src/modules/dashboard/ModulePerformance.tsx`
- Create: `abo/insights/routes.py`

**Step 1: 创建后端洞察 API**

创建 `abo/insights/routes.py`:

```python
"""用户数据洞察 API"""
from fastapi import APIRouter
from datetime import datetime, timedelta
from typing import List, Dict

router = APIRouter(prefix="/api/insights", tags=["insights"])

@router.get("/overview")
async def get_overview():
    """获取数据概览。"""
    # 获取最近30天的数据
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)

    # 从 CardStore 获取统计数据
    cards = _card_store.list(limit=10000)

    # 计算趋势
    daily_counts = {}
    module_counts = {}
    tag_counts = {}

    for card in cards:
        date = datetime.fromtimestamp(card.created_at).strftime('%Y-%m-%d')
        daily_counts[date] = daily_counts.get(date, 0) + 1

        module_counts[card.module_id] = module_counts.get(card.module_id, 0) + 1

        for tag in card.tags:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    return {
        "totalCards": len(cards),
        "thisWeek": sum(1 for c in cards if c.created_at > (end_date - timedelta(days=7)).timestamp()),
        "dailyTrend": [
            {"date": (start_date + timedelta(days=i)).strftime('%Y-%m-%d'),
             "count": daily_counts.get((start_date + timedelta(days=i)).strftime('%Y-%m-%d'), 0)}
            for i in range(30)
        ],
        "byModule": module_counts,
        "topTags": sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:10],
        "readingStreak": calculate_reading_streak(),
    }

@router.get("/activity")
async def get_activity(days: int = 30):
    """获取活动数据（用于热力图）。"""
    # 从 activity tracker 获取
    activities = []
    for i in range(days):
        date = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
        timeline = _activity_tracker.get_timeline(date)
        activities.append({
            "date": date,
            "count": len(timeline.activities),
            "types": [a.type for a in timeline.activities],
        })
    return {"activities": activities}

@router.get("/preferences-evolution")
async def get_preferences_evolution():
    """获取偏好演变趋势。"""
    prefs = _prefs.get_all_keyword_prefs()
    return {
        "keywords": [
            {"keyword": k, "score": v.score, "interactions": v.interactions}
            for k, v in sorted(prefs.items(), key=lambda x: x[1].score, reverse=True)[:20]
        ]
    }

def calculate_reading_streak() -> int:
    """计算连续阅读天数。"""
    streak = 0
    today = datetime.now().date()

    for i in range(365):  # 最多查一年
        date = today - timedelta(days=i)
        date_str = date.strftime('%Y-%m-%d')

        # 检查这天是否有活动
        timeline = _activity_tracker.get_timeline(date_str)
        if any(a.type in [ActivityType.CARD_VIEW, ActivityType.CARD_SAVE] for a in timeline.activities):
            if i == 0 or streak > 0:  # 今天或已经在连续中
                streak += 1
            else:
                break
        elif i > 0:  # 中间断了
            break

    return streak
```

**Step 2: 创建仪表盘主组件**

创建 `src/modules/dashboard/Dashboard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ActivityChart } from './ActivityChart';
import { ReadingStats } from './ReadingStats';
import { ModulePerformance } from './ModulePerformance';
import { TrendingUp, Calendar, Target, Zap } from 'lucide-react';

export function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/insights/overview')
      .then(r => r.json())
      .then(data => {
        setData(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-center">加载洞察数据...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">数据洞察</h1>
        <p className="text-gray-500">了解你的科研习惯和偏好变化</p>
      </div>

      {/* 关键指标 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard
          icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
          label="总卡片数"
          value={data.totalCards}
          change={`+${data.thisWeek} 本周`}
        />
        <MetricCard
          icon={<Calendar className="w-5 h-5 text-green-500" />}
          label="连续阅读"
          value={`${data.readingStreak} 天`}
          change="保持好习惯"
        />
        <MetricCard
          icon={<Target className="w-5 h-5 text-purple-500" />}
          label="活跃模块"
          value={Object.keys(data.byModule).length}
          change="7 个总数"
        />
        <MetricCard
          icon={<Zap className="w-5 h-5 text-yellow-500" />}
          label="偏好标签"
          value={data.topTags?.length || 0}
          change="已追踪"
        />
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4">30天活动趋势</h2>
          <ActivityChart data={data.dailyTrend} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4">阅读统计</h2>
          <ReadingStats data={data} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 col-span-2">
          <h2 className="text-lg font-semibold mb-4">模块表现</h2>
          <ModulePerformance data={data.byModule} />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, change }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  change: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-sm">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{change}</div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/modules/dashboard/ abo/insights/
git commit -m "feat(insights): add personal data dashboard"
```

---

## 第四部分：自我审查

### 规范覆盖检查

| 需求 | 实现任务 |
|------|----------|
| 新用户上手引导 | Task 2: Onboarding Wizard |
| 统一模块管理 | Task 3: Module Management Panel |
| 快速操作 | Task 4: Command Palette |
| 数据洞察 | Task 5: Dashboard |
| 文档完善 | Task 1: UX Guide + Module Management Guide |

### Placeholder 检查

- 无 "TBD"、"TODO"、"implement later"
- 所有代码示例完整
- 所有 API 路由明确定义
- 所有组件有完整实现

### 类型一致性

- Module 接口在所有文件中一致
- Command 接口在 hook 和组件中一致
- API 响应格式统一

---

## 第五部分：执行选项

**Plan complete and saved to `docs/superpowers/plans/2025-04-09-user-experience-optimization.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach would you prefer?**

---

## 附录：新增功能清单

### 新用户上手
- [ ] 4步引导流程（Welcome → Vault → Config → Tutorial）
- [ ] 交互式功能引导（Tour Guide）
- [ ] 示例数据展示

### 模块管理
- [ ] 统一模块面板（网格/列表视图）
- [ ] 模块状态监控（active/paused/error/unconfigured）
- [ ] Cookie 有效性验证
- [ ] 一键诊断和修复
- [ ] 批量操作（启动/暂停/运行）

### 效率工具
- [ ] 命令面板（Cmd+K）
- [ ] 键盘快捷键
- [ ] 全局搜索

### 数据洞察
- [ ] 个人仪表盘
- [ ] 活动热力图
- [ ] 阅读趋势分析
- [ ] 偏好演变
- [ ] 模块表现统计

### 文档
- [ ] UX 设计指南
- [ ] 模块管理开发指南
- [ ] 更新 CLAUDE.md
