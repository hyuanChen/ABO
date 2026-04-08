# 10 — User Experience Design Guide

> 本文档定义 ABO 的用户体验设计原则、交互模式和组件规范。
> 开发者在实现任何涉及用户交互的功能前必须阅读本文档。

---

## 设计原则

### 1. 渐进式披露 (Progressive Disclosure)

- 新用户看到简化界面，高级功能通过「更多」按钮或快捷键访问
- 配置项分「基础/高级」两层，默认只展示基础配置
- 示例：Feed 筛选默认显示「全部/未读/已收藏」，高级筛选通过「更多筛选」展开

```tsx
// 渐进式披露示例：基础/高级配置切换
function ConfigPanel({ module }: { module: ModuleConfig }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div>
      {/* 基础配置始终显示 */}
      <BasicConfig module={module} />

      {/* 高级配置可折叠 */}
      {showAdvanced && <AdvancedConfig module={module} />}

      <button onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? '收起高级选项' : '显示高级选项'}
      </button>
    </div>
  );
}
```

### 2. 即时反馈 (Immediate Feedback)

- 所有操作 100ms 内必须有视觉反馈
- 耗时操作显示进度（进度条或骨架屏）
- 错误信息明确告诉用户「发生了什么」和「如何解决」

```tsx
// 即时反馈示例：按钮点击状态
function ActionButton({ onClick, children }: ActionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true); // 立即显示 loading
    try {
      await onClick();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={isLoading}>
      {isLoading ? <Spinner /> : children}
    </button>
  );
}
```

### 3. 合理默认值 (Sensible Defaults)

- 所有配置都有合理的默认值
- 新用户无需配置即可看到示例数据
- 基于用户行为自动调整默认值

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Vault 路径 | `~/Documents/Obsidian Vault` | 常见 Obsidian 默认路径 |
| 爬虫关键词 | `["machine learning", "AI"]` | 通用技术关键词 |
| Feed 排序 | `time_desc` | 最新内容优先 |
| 每日总结时间 | `11:00` | 上午工作前 |

### 4. 一致性 (Consistency)

- 所有按钮、输入框、卡片遵循统一样式
- 相同的操作在界面各处表现一致
- 使用设计系统变量，避免硬编码样式

```tsx
// 使用统一的样式变量
// tailwind.config.ts 或 CSS 变量定义
const buttonVariants = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
};

const cardStyles = 'bg-white rounded-lg shadow-sm border border-gray-200 p-4';
```

---

## 交互模式

### Onboarding 流程

新用户首次使用时的引导流程：

1. **Welcome** — 欢迎页，展示产品价值主张
2. **Vault Setup** — 选择 Obsidian Vault 路径，验证路径有效性
3. **Quick Config** — 快速配置（使用默认关键词，可跳过）
4. **Tutorial** — 交互式功能引导（高亮关键 UI 元素）
5. **First Card** — 手动触发第一次爬虫，看到第一张 Card

```tsx
// Onboarding 步骤定义
const onboardingSteps = [
  { id: 'welcome', title: '欢迎使用 ABO', component: WelcomeStep },
  { id: 'vault', title: '配置 Vault', component: VaultSetupStep },
  { id: 'config', title: '快速配置', component: QuickConfigStep },
  { id: 'tutorial', title: '功能引导', component: TutorialStep },
  { id: 'first-card', title: '获取第一张卡片', component: FirstCardStep },
];

// 在 store 中跟踪进度
interface OnboardingState {
  completed: boolean;
  currentStep: number; // 0-4
  totalSteps: number;
}
```

### 空状态设计

| 场景 | 设计 | 示例代码 |
|------|------|----------|
| Feed 为空 | 显示引导图 + 「运行模块」按钮 + 示例 Card | 见下方 EmptyFeed |
| 模块未配置 | 显示配置向导入口 + 文档链接 | 见下方 UnconfiguredModule |
| 搜索无结果 | 提示调整关键词 + 示例搜索 | 见下方 NoSearchResults |
| 无收藏内容 | 提示如何收藏 + 跳转到 Feed | 见下方 EmptyCollections |

```tsx
// Feed 空状态
function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-48 h-48 bg-gray-100 rounded-full flex items-center justify-center mb-6">
        <Inbox className="w-24 h-24 text-gray-400" />
      </div>
      <h3 className="text-xl font-semibold text-gray-800 mb-2">
        还没有内容
      </h3>
      <p className="text-gray-600 mb-6 max-w-md">
        运行模块获取你的第一张情报卡片，或查看示例卡片了解 ABO 如何工作
      </p>
      <div className="flex gap-4">
        <Button variant="primary" onClick={runModules}>
          <Play className="w-4 h-4 mr-2" />
          运行模块
        </Button>
        <Button variant="secondary" onClick={showDemo}>
          查看示例
        </Button>
      </div>
    </div>
  );
}

// 模块未配置状态
function UnconfiguredModule({ module }: { module: ModuleConfig }) {
  return (
    <div className="p-8 text-center border-2 border-dashed border-gray-300 rounded-lg">
      <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-800 mb-2">
        {module.name} 需要配置
      </h3>
      <p className="text-gray-600 mb-4">
        添加关键词或 Cookie 以开始使用此模块
      </p>
      <Button variant="primary" onClick={openConfig}>
        开始配置
      </Button>
    </div>
  );
}
```

### 错误处理

- **Cookie 过期**: 显示警告条 + 一键重新获取入口
- **爬取失败**: 显示失败原因 + 重试按钮 + 反馈入口
- **Vault 路径错误**: 红框提示 + 路径选择器
- **网络错误**: 自动重试 3 次，仍失败则显示手动重试

```tsx
// 错误状态组件
interface ErrorStateProps {
  type: 'cookie' | 'fetch' | 'vault' | 'network';
  message: string;
  onRetry?: () => void;
  onFix?: () => void;
}

function ErrorState({ type, message, onRetry, onFix }: ErrorStateProps) {
  const configs = {
    cookie: {
      icon: <AlertTriangle className="text-yellow-500" />,
      title: 'Cookie 已过期',
      action: { label: '更新 Cookie', handler: onFix },
    },
    fetch: {
      icon: <XCircle className="text-red-500" />,
      title: '获取失败',
      action: { label: '重试', handler: onRetry },
    },
    vault: {
      icon: <FolderOpen className="text-red-500" />,
      title: 'Vault 路径错误',
      action: { label: '选择路径', handler: onFix },
    },
    network: {
      icon: <WifiOff className="text-gray-500" />,
      title: '网络连接失败',
      action: { label: '重试', handler: onRetry },
    },
  };

  const config = configs[type];

  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start gap-3">
        {config.icon}
        <div className="flex-1">
          <h4 className="font-medium text-red-800">{config.title}</h4>
          <p className="text-red-600 text-sm mt-1">{message}</p>
        </div>
        {config.action && (
          <Button variant="danger" size="sm" onClick={config.action.handler}>
            {config.action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
```

---

## 组件规范

### Toast 通知

使用 `useToast` hook 和 `ToastContainer` 组件统一管理通知。

```tsx
// Toast 类型定义
interface ToastOptions {
  id?: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number; // ms, undefined = 手动关闭
  action?: {
    label: string;
    onClick: () => void;
  };
}

// 使用示例
function MyComponent() {
  const { showToast } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      showToast({
        type: 'success',
        message: '保存成功',
        duration: 2000, // 2秒后自动消失
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: '保存失败：' + err.message,
        duration: 0, // 手动关闭
        action: {
          label: '重试',
          onClick: handleSave,
        },
      });
    }
  };
}
```

**Toast 显示规则：**

| 类型 | 颜色 | 持续时间 | 使用场景 |
|------|------|----------|----------|
| success | 绿色 | 2秒自动消失 | 操作成功完成 |
| error | 红色 | 手动关闭 | 操作失败，需要用户处理 |
| warning | 黄色 | 5秒或手动关闭 | 需要注意但非错误 |
| info | 蓝色 | 3秒自动消失 | 一般性通知 |

### Loading 状态

不同场景使用不同的 loading 样式：

```tsx
// 1. 按钮 Loading — 显示 spinner，禁用点击
<Button loading={isLoading} onClick={handleClick}>
  保存
</Button>

// 2. 卡片 Loading — 骨架屏 shimmer effect
function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
      <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-5/6"></div>
    </div>
  );
}

// 3. 页面 Loading — 骨架屏 + 进度条
function PageLoading() {
  return (
    <div>
      {/* 顶部进度条 */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-blue-600 animate-progress"></div>

      {/* 内容骨架屏 */}
      <div className="space-y-4 p-4">
        <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

// 4. 局部 Loading — 半透明遮罩 + spinner
function SectionLoading({ children, isLoading }: SectionLoadingProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      )}
    </div>
  );
}
```

### 表单验证

```tsx
// 表单验证 hook
function useFormValidation<T>(
  initialValues: T,
  validators: Record<keyof T, (value: any) => string | undefined>
) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  // 实时验证（debounce 300ms）
  const validateField = useCallback(
    debounce((field: keyof T, value: any) => {
      const error = validators[field]?.(value);
      setErrors(prev => ({ ...prev, [field]: error }));
    }, 300),
    [validators]
  );

  const handleChange = (field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleBlur = (field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validators[field]?.(values[field]);
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  // 提交时验证所有字段
  const validateAll = (): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    for (const field in validators) {
      const error = validators[field]?.(values[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    }

    setErrors(newErrors);
    setTouched(Object.keys(validators).reduce((acc, key) => {
      acc[key as keyof T] = true;
      return acc;
    }, {} as Record<keyof T, boolean>));

    return isValid;
  };

  return { values, errors, touched, handleChange, handleBlur, validateAll };
}

// 使用示例
function ModuleConfigForm({ module }: { module: ModuleConfig }) {
  const { values, errors, touched, handleChange, handleBlur, validateAll } =
    useFormValidation(
      { keywords: module.config.keywords?.join(', ') || '', cookie: module.config.cookie || '' },
      {
        keywords: (v) => v.trim() ? undefined : '至少输入一个关键词',
        cookie: (v) => v.trim() ? undefined : 'Cookie 不能为空',
      }
    );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validateAll()) {
      saveConfig(values);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">关键词</label>
        <input
          value={values.keywords}
          onChange={(e) => handleChange('keywords', e.target.value)}
          onBlur={() => handleBlur('keywords')}
          className={`w-full px-3 py-2 border rounded ${
            touched.keywords && errors.keywords ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {touched.keywords && errors.keywords && (
          <p className="text-red-500 text-sm mt-1">{errors.keywords}</p>
        )}
      </div>
      {/* ... */}
    </form>
  );
}
```

---

## 快捷键规范

| 快捷键 | 功能 | 场景 |
|--------|------|------|
| `Cmd/Ctrl + K` | 打开命令面板 | 全局 |
| `Cmd/Ctrl + /` | 显示快捷键帮助 | 全局 |
| `Cmd/Ctrl + F` | 聚焦搜索框 | Feed 页面 |
| `J/K` | 下/上一个卡片 | Feed 页面 |
| `S` | 收藏当前卡片 | Feed 页面 |
| `R` | 标记已读 | Feed 页面 |
| `Esc` | 关闭弹窗/取消操作 | 全局 |

```tsx
// 快捷键 hook
function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options?: { ctrl?: boolean; shift?: boolean; alt?: boolean }
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== key) return;
      if (options?.ctrl && !e.ctrlKey && !e.metaKey) return;
      if (options?.shift && !e.shiftKey) return;
      if (options?.alt && !e.altKey) return;

      e.preventDefault();
      callback();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback, options]);
}

// 使用示例
function FeedPage() {
  useKeyboardShortcut('k', selectNextCard, { ctrl: true });
  useKeyboardShortcut('j', selectPrevCard, { ctrl: true });
  useKeyboardShortcut('s', toggleStarCurrentCard);
}
```

---

## 响应式设计

ABO 主要面向桌面端（Tauri 应用），但组件应支持基本响应式：

```tsx
// 断点定义
const breakpoints = {
  sm: '640px',   // 小屏幕
  md: '768px',   // 平板
  lg: '1024px',  // 小桌面
  xl: '1280px',  // 标准桌面
  '2xl': '1536px', // 大桌面
};

// 布局响应式
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {modules.map(module => <ModuleCard key={module.id} module={module} />)}
</div>

// 侧边栏响应式
<aside className="w-64 hidden lg:block">{/* 桌面端显示 */}</aside>
<MobileNav className="lg:hidden" /> {/* 移动端显示 */}
```

---

## 无障碍 (Accessibility)

- 所有交互元素可通过键盘访问
- 图片提供 alt 文本
- 颜色对比度符合 WCAG AA 标准
- 使用语义化 HTML 标签

```tsx
// 好的示例：语义化 + 键盘可访问
<button
  onClick={handleClick}
  aria-label="保存配置"
  disabled={isLoading}
  className="..."
>
  {isLoading ? '保存中...' : '保存'}
</button>

// 好的示例：表单关联标签
<label htmlFor="vault-path">Vault 路径</label>
<input id="vault-path" type="text" aria-describedby="vault-help" />
<p id="vault-help">选择你的 Obsidian Vault 根目录</p>
```
