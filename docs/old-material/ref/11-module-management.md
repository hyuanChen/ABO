# 11 — Module Management Guide

> 本文档定义统一模块管理面板的开发规范。
> 开发者在创建新模块或修改模块管理功能前必须阅读本文档。

---

## 模块数据结构

### TypeScript 接口定义

```typescript
// src/types/module.ts

export type ModuleStatus = 'active' | 'paused' | 'error' | 'unconfigured';

export interface ModuleSubscription {
  type: 'keyword' | 'author' | 'tag' | 'source';
  value: string;
  label: string;
}

export interface ModuleStats {
  totalCards: number;      // 累计生成卡片数
  thisWeek: number;        // 本周生成卡片数
  successRate: number;     // 成功率 (0-100)
  lastError?: string;      // 最后一次错误信息
  errorCount: number;      // 连续错误次数
}

export interface ModuleConfig {
  id: string;              // 唯一标识，如 "arxiv-tracker"
  name: string;            // 显示名称，如 "arXiv 论文追踪"
  description: string;     // 模块描述
  icon: string;            // Lucide 图标名称
  status: ModuleStatus;    // 当前状态
  schedule: string;        // Cron 表达式，如 "0 8 * * *"
  lastRun: Date | null;    // 上次运行时间
  nextRun: Date | null;    // 下次运行时间
  stats: ModuleStats;      // 统计数据
  config: {
    keywords?: string[];           // 追踪关键词
    cookie?: string;               // 认证 Cookie
    cookieValid?: boolean;         // Cookie 是否有效
    cookieExpiry?: Date;           // Cookie 过期时间
    maxResults?: number;           // 最大结果数
    filters?: Record<string, any>; // 模块特定筛选条件
    [key: string]: any;            // 扩展字段
  };
  subscriptions?: ModuleSubscription[]; // 订阅列表
  metadata?: {
    version: string;       // 模块版本
    author: string;        // 作者
    homepage?: string;     // 项目主页
    docs?: string;         // 文档链接
  };
}

// 模块仪表板数据
export interface ModuleDashboard {
  modules: ModuleConfig[];
  summary: {
    total: number;
    active: number;
    paused: number;
    error: number;
    unconfigured: number;
    totalCardsThisWeek: number;
  };
  alerts: ModuleAlert[];
}

// 模块告警
export interface ModuleAlert {
  id: string;
  moduleId: string;
  type: 'cookie_expired' | 'fetch_failed' | 'config_invalid' | 'rate_limited';
  message: string;
  severity: 'warning' | 'error';
  createdAt: Date;
  acknowledged: boolean;
}
```

### Python 数据模型

```python
# abo/modules/models.py

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel

class ModuleStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"
    UNCONFIGURED = "unconfigured"

class ModuleSubscription(BaseModel):
    type: str  # 'keyword' | 'author' | 'tag' | 'source'
    value: str
    label: str

class ModuleStats(BaseModel):
    total_cards: int = 0
    this_week: int = 0
    success_rate: float = 100.0
    last_error: Optional[str] = None
    error_count: int = 0

class ModuleConfig(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    status: ModuleStatus
    schedule: str
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    stats: ModuleStats
    config: dict
    subscriptions: list[ModuleSubscription] = []

class ModuleDashboard(BaseModel):
    modules: list[ModuleConfig]
    summary: dict
    alerts: list[dict]
```

---

## 模块状态定义

| 状态 | 颜色 | 图标 | 说明 | 可用操作 |
|------|------|------|------|----------|
| `active` | 绿色 (`text-green-600`) | `Play` | 正常运行，按计划执行 | 暂停、运行一次、配置、查看日志 |
| `paused` | 黄色 (`text-yellow-600`) | `Pause` | 用户手动暂停 | 启动、配置 |
| `error` | 红色 (`text-red-600`) | `AlertCircle` | 运行出错（Cookie过期、网络错误等） | 诊断、快速修复、配置、查看错误 |
| `unconfigured` | 灰色 (`text-gray-400`) | `Settings` | 缺少必要配置（关键词、Cookie等） | 配置向导 |

```tsx
// 状态显示组件
import { Play, Pause, AlertCircle, Settings } from 'lucide-react';

const statusConfig = {
  active: {
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: Play,
    label: '运行中',
    description: '模块正常运行中',
  },
  paused: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: Pause,
    label: '已暂停',
    description: '用户手动暂停',
  },
  error: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: AlertCircle,
    label: '错误',
    description: '运行出错，需要处理',
  },
  unconfigured: {
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    icon: Settings,
    label: '未配置',
    description: '缺少必要配置',
  },
};

function ModuleStatusBadge({ status }: { status: ModuleStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${config.bgColor} ${config.color} border ${config.borderColor}`}>
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}
```

---

## API 规范

### GET /api/modules/dashboard

返回所有模块的完整状态，用于模块管理面板。

**Response:**

```json
{
  "modules": [
    {
      "id": "arxiv-tracker",
      "name": "arXiv 论文追踪",
      "description": "追踪 arXiv 上符合关键词的最新论文",
      "icon": "file-text",
      "status": "active",
      "schedule": "0 8 * * *",
      "last_run": "2024-04-09T08:00:00Z",
      "next_run": "2024-04-10T08:00:00Z",
      "stats": {
        "total_cards": 156,
        "this_week": 12,
        "success_rate": 98.5,
        "last_error": null,
        "error_count": 0
      },
      "config": {
        "keywords": ["machine learning", "NLP"],
        "max_results": 50
      },
      "subscriptions": [
        { "type": "keyword", "value": "machine learning", "label": "机器学习" }
      ]
    }
  ],
  "summary": {
    "total": 7,
    "active": 5,
    "paused": 1,
    "error": 0,
    "unconfigured": 1,
    "total_cards_this_week": 45
  },
  "alerts": [
    {
      "id": "alert-1",
      "module_id": "zhihu-tracker",
      "type": "cookie_expired",
      "message": "知乎 Cookie 已过期，请重新配置",
      "severity": "error",
      "created_at": "2024-04-09T10:00:00Z",
      "acknowledged": false
    }
  ]
}
```

**Python 实现:**

```python
# abo/modules/routes.py

from fastapi import APIRouter
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/modules")

@router.get("/dashboard")
async def get_module_dashboard() -> ModuleDashboard:
    """返回模块仪表板数据。"""
    modules = await get_all_modules_with_status()

    summary = {
        "total": len(modules),
        "active": sum(1 for m in modules if m.status == ModuleStatus.ACTIVE),
        "paused": sum(1 for m in modules if m.status == ModuleStatus.PAUSED),
        "error": sum(1 for m in modules if m.status == ModuleStatus.ERROR),
        "unconfigured": sum(1 for m in modules if m.status == ModuleStatus.UNCONFIGURED),
        "total_cards_this_week": sum(m.stats.this_week for m in modules),
    }

    alerts = await get_unacknowledged_alerts()

    return ModuleDashboard(
        modules=modules,
        summary=summary,
        alerts=alerts
    )
```

### POST /api/modules/{id}/diagnose

诊断模块问题（检查 Cookie 有效性、网络连接、配置完整性等）。

**Request:**

```json
{
  "deep": false  // 是否进行深度诊断（耗时更长）
}
```

**Response:**

```json
{
  "module_id": "zhihu-tracker",
  "diagnosed_at": "2024-04-09T12:00:00Z",
  "overall_status": "error",
  "checks": [
    {
      "name": "config_complete",
      "status": "pass",
      "message": "配置完整"
    },
    {
      "name": "cookie_valid",
      "status": "fail",
      "message": "Cookie 已过期",
      "details": {
        "expired_at": "2024-04-08T00:00:00Z",
        "suggestion": "请重新获取 Cookie"
      }
    },
    {
      "name": "network_connectivity",
      "status": "pass",
      "message": "网络连接正常"
    },
    {
      "name": "api_accessible",
      "status": "unknown",
      "message": "未检查（依赖 Cookie）"
    }
  ],
  "recommendations": [
    {
      "priority": "high",
      "action": "update_cookie",
      "description": "更新知乎 Cookie",
      "auto_fixable": false
    }
  ]
}
```

**Python 实现:**

```python
# abo/modules/diagnosis.py

from enum import Enum
from typing import Optional
from pydantic import BaseModel

class CheckStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    WARNING = "warning"
    UNKNOWN = "unknown"

class HealthCheck(BaseModel):
    name: str
    status: CheckStatus
    message: str
    details: Optional[dict] = None

class DiagnosisResult(BaseModel):
    module_id: str
    diagnosed_at: datetime
    overall_status: CheckStatus
    checks: list[HealthCheck]
    recommendations: list[dict]

async def diagnose_module(module_id: str, deep: bool = False) -> DiagnosisResult:
    """诊断模块健康状态。"""
    module = await get_module(module_id)
    checks: list[HealthCheck] = []

    # 检查 1: 配置完整性
    config_check = await check_config_complete(module)
    checks.append(config_check)

    # 检查 2: Cookie 有效性（如果需要）
    if module.config.get("cookie"):
        cookie_check = await check_cookie_valid(module)
        checks.append(cookie_check)

    # 检查 3: 网络连接
    network_check = await check_network_connectivity(module)
    checks.append(network_check)

    # 检查 4: API 可访问性（深度诊断）
    if deep and all(c.status != CheckStatus.FAIL for c in checks):
        api_check = await check_api_accessible(module)
        checks.append(api_check)

    # 生成建议
    recommendations = generate_recommendations(checks)

    # 确定总体状态
    overall = CheckStatus.PASS
    if any(c.status == CheckStatus.FAIL for c in checks):
        overall = CheckStatus.FAIL
    elif any(c.status == CheckStatus.WARNING for c in checks):
        overall = CheckStatus.WARNING

    return DiagnosisResult(
        module_id=module_id,
        diagnosed_at=datetime.utcnow(),
        overall_status=overall,
        checks=checks,
        recommendations=recommendations
    )

@router.post("/{module_id}/diagnose")
async def diagnose_module_endpoint(
    module_id: str,
    request: DiagnoseRequest = Body(default_factory=DiagnoseRequest)
) -> DiagnosisResult:
    """诊断模块问题。"""
    return await diagnose_module(module_id, deep=request.deep)
```

### POST /api/modules/{id}/quick-fix

尝试自动修复常见问题。

**Request:**

```json
{
  "fixes": ["all"]  // 或指定 ["cookie", "config", "cache"]
}
```

**Response:**

```json
{
  "module_id": "zhihu-tracker",
  "fixed_at": "2024-04-09T12:05:00Z",
  "results": [
    {
      "fix": "clear_cache",
      "status": "success",
      "message": "已清除 3MB 缓存"
    },
    {
      "fix": "reset_schedule",
      "status": "success",
      "message": "已重置调度器"
    },
    {
      "fix": "refresh_cookie",
      "status": "failed",
      "message": "无法自动刷新 Cookie，请手动更新",
      "manual_action_required": true
    }
  ],
  "module_status": "paused",
  "next_steps": [
    "请手动更新 Cookie 后重新启动模块"
  ]
}
```

**Python 实现:**

```python
# abo/modules/quick_fix.py

from enum import Enum
from typing import Optional

class FixStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    NOT_APPLICABLE = "not_applicable"

class FixResult(BaseModel):
    fix: str
    status: FixStatus
    message: str
    manual_action_required: bool = False

class QuickFixResponse(BaseModel):
    module_id: str
    fixed_at: datetime
    results: list[FixResult]
    module_status: ModuleStatus
    next_steps: list[str]

async def apply_quick_fixes(module_id: str, fixes: list[str]) -> QuickFixResponse:
    """应用快速修复。"""
    module = await get_module(module_id)
    results: list[FixResult] = []

    available_fixes = {
        "clear_cache": clear_module_cache,
        "reset_schedule": reset_module_schedule,
        "refresh_cookie": refresh_module_cookie,
        "validate_config": validate_and_fix_config,
        "reset_error_count": reset_error_count,
    }

    fixes_to_apply = fixes if fixes != ["all"] else list(available_fixes.keys())

    for fix_name in fixes_to_apply:
        if fix_name not in available_fixes:
            results.append(FixResult(
                fix=fix_name,
                status=FixStatus.NOT_APPLICABLE,
                message=f"未知修复类型: {fix_name}"
            ))
            continue

        try:
            fix_result = await available_fixes[fix_name](module)
            results.append(fix_result)
        except Exception as e:
            results.append(FixResult(
                fix=fix_name,
                status=FixStatus.FAILED,
                message=str(e)
            ))

    # 更新模块状态
    new_status = await recalculate_module_status(module_id)

    # 生成下一步建议
    next_steps = generate_next_steps(results, new_status)

    return QuickFixResponse(
        module_id=module_id,
        fixed_at=datetime.utcnow(),
        results=results,
        module_status=new_status,
        next_steps=next_steps
    )

@router.post("/{module_id}/quick-fix")
async def quick_fix_endpoint(
    module_id: str,
    request: QuickFixRequest
) -> QuickFixResponse:
    """尝试自动修复模块问题。"""
    return await apply_quick_fixes(module_id, request.fixes)
```

---

## 模块管理面板组件

### 面板布局

```tsx
// src/modules/modules/ModuleManagementPanel.tsx

import { useState, useEffect } from 'react';
import { ModuleDashboard, ModuleConfig } from '@/types/module';
import { ModuleCard } from './ModuleCard';
import { ModuleStatsSummary } from './ModuleStatsSummary';
import { AlertList } from './AlertList';
import { useToast } from '@/hooks/useToast';

export function ModuleManagementPanel() {
  const [dashboard, setDashboard] = useState<ModuleDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<ModuleConfig | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/modules/dashboard');
      const data = await response.json();
      setDashboard(data);
    } catch (err) {
      showToast({ type: 'error', message: '加载模块数据失败' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ModuleDashboardSkeleton />;
  if (!dashboard) return <ErrorState onRetry={loadDashboard} />;

  return (
    <div className="p-6 space-y-6">
      {/* 统计摘要 */}
      <ModuleStatsSummary summary={dashboard.summary} />

      {/* 告警列表 */}
      {dashboard.alerts.length > 0 && (
        <AlertList alerts={dashboard.alerts} onAcknowledge={handleAcknowledge} />
      )}

      {/* 模块网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {dashboard.modules.map(module => (
          <ModuleCard
            key={module.id}
            module={module}
            onClick={() => setSelectedModule(module)}
            onRun={() => handleRunModule(module.id)}
            onToggle={() => handleToggleModule(module.id)}
            onDiagnose={() => handleDiagnose(module.id)}
          />
        ))}
      </div>

      {/* 模块详情抽屉 */}
      {selectedModule && (
        <ModuleDetailDrawer
          module={selectedModule}
          onClose={() => setSelectedModule(null)}
          onUpdate={handleModuleUpdate}
        />
      )}
    </div>
  );
}
```

### 模块卡片组件

```tsx
// src/modules/modules/ModuleCard.tsx

import { Play, Pause, Settings, AlertCircle, MoreVertical } from 'lucide-react';
import { ModuleConfig, ModuleStatus } from '@/types/module';
import { ModuleStatusBadge } from './ModuleStatusBadge';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface ModuleCardProps {
  module: ModuleConfig;
  onClick: () => void;
  onRun: () => void;
  onToggle: () => void;
  onDiagnose: () => void;
}

export function ModuleCard({ module, onClick, onRun, onToggle, onDiagnose }: ModuleCardProps) {
  const Icon = getLucideIcon(module.icon);

  const getActionButton = () => {
    switch (module.status) {
      case 'active':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg"
            title="暂停"
          >
            <Pause className="w-5 h-5" />
          </button>
        );
      case 'paused':
      case 'error':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
            title="启动"
          >
            <Play className="w-5 h-5" />
          </button>
        );
      case 'unconfigured':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            title="配置"
          >
            <Settings className="w-5 h-5" />
          </button>
        );
    }
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{module.name}</h3>
            <ModuleStatusBadge status={module.status} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {getActionButton()}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]">
              <DropdownMenu.Item
                onClick={onRun}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
              >
                <Play className="w-4 h-4" /> 立即运行
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onClick={onDiagnose}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4" /> 诊断问题
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
              <DropdownMenu.Item
                onClick={onClick}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
              >
                <Settings className="w-4 h-4" /> 配置
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
        {module.description}
      </p>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-500 text-xs">累计卡片</div>
          <div className="font-medium">{module.stats.totalCards}</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-500 text-xs">本周</div>
          <div className="font-medium">{module.stats.thisWeek}</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-500 text-xs">成功率</div>
          <div className="font-medium">{module.stats.successRate}%</div>
        </div>
      </div>

      {module.nextRun && module.status === 'active' && (
        <div className="mt-3 text-xs text-gray-500">
          下次运行: {formatRelativeTime(module.nextRun)}
        </div>
      )}
    </div>
  );
}
```

---

## 诊断对话框

```tsx
// src/modules/modules/DiagnoseDialog.tsx

import { useState } from 'react';
import { DiagnosisResult, CheckStatus } from '@/types/module';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';

interface DiagnoseDialogProps {
  moduleId: string;
  onClose: () => void;
  onQuickFix: () => void;
}

export function DiagnoseDialog({ moduleId, onClose, onQuickFix }: DiagnoseDialogProps) {
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runDiagnosis();
  }, [moduleId]);

  const runDiagnosis = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/modules/${moduleId}/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deep: true })
      });
      const data = await response.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const getCheckIcon = (status: CheckStatus) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'unknown': return <HelpCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>模块诊断: {moduleId}</DialogTitle>
          <DialogDescription>
            检查模块配置、Cookie 有效性和网络连接状态
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
            <p className="text-gray-600">正在诊断模块...请稍候</p>
          </div>
        ) : result ? (
          <div className="space-y-4">
            {/* 总体状态 */}
            <div className={`p-4 rounded-lg ${
              result.overall_status === 'pass' ? 'bg-green-50 border border-green-200' :
              result.overall_status === 'fail' ? 'bg-red-50 border border-red-200' :
              'bg-yellow-50 border border-yellow-200'
            }`}>
              <div className="flex items-center gap-3">
                {getCheckIcon(result.overall_status)}
                <div>
                  <p className="font-medium">
                    {result.overall_status === 'pass' ? '模块运行正常' :
                     result.overall_status === 'fail' ? '发现问题需要处理' :
                     '存在潜在问题'}
                  </p>
                  <p className="text-sm text-gray-600">
                    诊断时间: {formatDateTime(result.diagnosed_at)}
                  </p>
                </div>
              </div>
            </div>

            {/* 详细检查项 */}
            <div className="space-y-2">
              {result.checks.map(check => (
                <div key={check.name} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  {getCheckIcon(check.status)}
                  <div className="flex-1">
                    <p className="font-medium">{check.message}</p>
                    {check.details && (
                      <div className="mt-2 text-sm text-gray-600">
                        {check.details.suggestion && (
                          <p>建议: {check.details.suggestion}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 修复建议 */}
            {result.recommendations.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">修复建议</h4>
                <div className="space-y-2">
                  {result.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div>
                        <p className="font-medium">{rec.description}</p>
                        {rec.auto_fixable && (
                          <span className="text-xs text-green-600">可自动修复</span>
                        )}
                      </div>
                      {rec.auto_fixable && (
                        <Button size="sm" onClick={onQuickFix}>
                          自动修复
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>关闭</Button>
          <Button onClick={runDiagnosis} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            重新诊断
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 最佳实践

### 1. 状态变更实时同步

```tsx
// 使用 WebSocket 或轮询保持状态同步
function useModuleStatus(moduleId: string) {
  const [status, setStatus] = useState<ModuleStatus | null>(null);

  useEffect(() => {
    // 初始加载
    loadStatus();

    // WebSocket 监听状态变更
    const ws = new WebSocket('ws://127.0.0.1:8765/ws/feed');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'module_status_change' && data.module_id === moduleId) {
        setStatus(data.status);
      }
    };

    return () => ws.close();
  }, [moduleId]);

  return status;
}
```

### 2. 批量操作支持

```tsx
// 批量启动/暂停模块
async function batchToggleModules(moduleIds: string[], enable: boolean) {
  const results = await Promise.allSettled(
    moduleIds.map(id =>
      fetch(`/api/modules/${id}/toggle`, { method: 'POST' })
    )
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  return { succeeded, failed };
}
```

### 3. 错误重试机制

```tsx
// 带重试的 API 调用
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await delay(1000 * Math.pow(2, i)); // 指数退避
    }
  }
  throw new Error('Max retries exceeded');
}
```
