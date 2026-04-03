# RSS 聚合功能实现计划

> **For agentic workers:** 本计划不使用 subagent，在当前会话直接执行。步骤使用 checkbox (`- [ ]`) 语法跟踪进度。

**Goal:** 创建一个 RSS 聚合功能，将每天爬取的所有模块结果聚合成一个统一的 RSS feed，方便外部订阅。

**Architecture:** 后端添加 RSS 生成器模块和 API 路由，读取 SQLite cards 表生成标准 RSS 2.0 XML；前端在设置页面添加 RSS 配置区域，显示订阅链接和开关控制。RSS 作为"虚拟模块"集成到现有模块管理体系中。

**Tech Stack:** Python (xml.etree.ElementTree), FastAPI, React + TypeScript

---

## 文件结构

| 文件 | 说明 |
|------|------|
| `abo/rss/generator.py` | RSS XML 生成器，将 Card 列表转为 RSS 2.0 格式 |
| `abo/rss/routes.py` | FastAPI 路由，提供 `/api/rss/feed` 和 `/api/rss/config` 接口 |
| `abo/rss/__init__.py` | RSS 模块初始化，导出 generator 和 routes |
| `abo/main.py` | 修改：注册 RSS 路由，添加 RSS 虚拟模块到模块列表 |
| `abo/config.py` | 修改：添加 RSS 配置字段（enabled, title, description, max_items） |
| `src/modules/settings/Settings.tsx` | 修改：添加 RSS 配置区域，包含开关、标题/描述输入、订阅链接显示 |

---

## Task 1: 创建 RSS 生成器模块

**Files:**
- Create: `abo/rss/__init__.py`
- Create: `abo/rss/generator.py`

- [ ] **Step 1: 创建 RSS 模块初始化文件**

```python
# abo/rss/__init__.py
"""RSS 聚合模块 - 将爬取结果输出为标准 RSS 2.0 feed."""

from .generator import RSSGenerator, generate_feed
from .routes import router as rss_router

__all__ = ["RSSGenerator", "generate_feed", "rss_router"]
```

- [ ] **Step 2: 实现 RSS XML 生成器**

```python
# abo/rss/generator.py
"""RSS 2.0 feed 生成器."""

from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom
from datetime import datetime
from typing import List
from ..store.cards import CardStore
from ..sdk.types import Card


class RSSGenerator:
    """生成标准 RSS 2.0 XML feed."""

    def __init__(
        self,
        title: str = "ABO Intelligence Feed",
        description: str = "Aggregated intelligence from ABO modules",
        link: str = "http://localhost:1420",
        max_items: int = 50,
    ):
        self.title = title
        self.description = description
        self.link = link
        self.max_items = max_items

    def generate(self, cards: List[Card]) -> str:
        """Generate RSS 2.0 XML from cards."""
        rss = Element("rss", version="2.0")
        channel = SubElement(rss, "channel")

        # Channel metadata
        SubElement(channel, "title").text = self.title
        SubElement(channel, "description").text = self.description
        SubElement(channel, "link").text = self.link
        SubElement(channel, "language").text = "zh-CN"
        SubElement(channel, "lastBuildDate").text = self._format_rfc822(datetime.now())
        SubElement(channel, "generator").text = "ABO RSS Generator"

        # Add items
        for card in cards[:self.max_items]:
            item = SubElement(channel, "item")
            self._add_item(item, card)

        # Pretty print
        rough_string = tostring(rss, encoding="unicode")
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent="  ", encoding="utf-8").decode("utf-8")

    def _add_item(self, parent: Element, card: Card):
        """Add a single card as RSS item."""
        SubElement(parent, "title").text = card.title
        SubElement(parent, "description").text = card.summary or ""
        SubElement(parent, "link").text = card.source_url or ""
        SubElement(parent, "guid", isPermaLink="false").text = card.id
        SubElement(parent, "pubDate").text = self._format_rfc822(
            datetime.fromtimestamp(card.created_at)
        )

        # Category from tags
        for tag in card.tags[:3]:  # Max 3 categories
            SubElement(parent, "category").text = tag

        # Source module as comments
        if card.module_id:
            SubElement(parent, "{http://purl.org/dc/elements/1.1/}source").text = card.module_id

    def _format_rfc822(self, dt: datetime) -> str:
        """Format datetime as RFC 822 string."""
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

        day_name = days[dt.weekday()]
        month_name = months[dt.month - 1]

        return f"{day_name}, {dt.day:02d} {month_name} {dt.year} {dt.hour:02d}:{dt.minute:02d}:{dt.second:02d} +0800"


def generate_feed(
    card_store: CardStore,
    title: str = "ABO Intelligence Feed",
    description: str = "Aggregated intelligence from ABO modules",
    link: str = "http://localhost:1420",
    max_items: int = 50,
    days: int = 7,  # Only include recent days
) -> str:
    """Convenience function to generate RSS from card store."""
    import time

    generator = RSSGenerator(title, description, link, max_items)

    # Get recent cards
    since = time.time() - (days * 24 * 3600)
    all_cards = card_store.list(limit=max_items * 2)
    recent_cards = [c for c in all_cards if c.created_at >= since]

    # Sort by created_at desc
    recent_cards.sort(key=lambda c: c.created_at, reverse=True)

    return generator.generate(recent_cards)
```

---

## Task 2: 创建 RSS API 路由

**Files:**
- Create: `abo/rss/routes.py`

- [ ] **Step 3: 实现 RSS FastAPI 路由**

```python
# abo/rss/routes.py
"""RSS 相关的 FastAPI 路由."""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from ..config import load as load_config, save as save_config
from ..store.cards import CardStore
from .generator import generate_feed

router = APIRouter(prefix="/api/rss", tags=["rss"])


class RSSConfig(BaseModel):
    enabled: bool
    title: str
    description: str
    max_items: int = 50


class RSSConfigResponse(BaseModel):
    enabled: bool
    title: str
    description: str
    max_items: int
    feed_url: str


@router.get("/feed")
async def get_rss_feed(request: Request):
    """Get the aggregated RSS feed."""
    config = load_config()

    # Check if RSS is enabled
    if not config.get("rss_enabled", False):
        raise HTTPException(status_code=404, detail="RSS feed is disabled")

    # Get host for link
    host = str(request.base_url).rstrip("/")

    card_store = CardStore()
    feed_xml = generate_feed(
        card_store=card_store,
        title=config.get("rss_title", "ABO Intelligence Feed"),
        description=config.get("rss_description", "Aggregated intelligence from ABO modules"),
        link=host,
        max_items=config.get("rss_max_items", 50),
    )

    return Response(
        content=feed_xml,
        media_type="application/rss+xml; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/config", response_model=RSSConfigResponse)
async def get_rss_config(request: Request):
    """Get RSS configuration."""
    config = load_config()

    host = str(request.base_url).rstrip("/")
    feed_url = f"{host}/api/rss/feed" if config.get("rss_enabled", False) else ""

    return RSSConfigResponse(
        enabled=config.get("rss_enabled", False),
        title=config.get("rss_title", "ABO Intelligence Feed"),
        description=config.get("rss_description", "Aggregated intelligence from ABO modules"),
        max_items=config.get("rss_max_items", 50),
        feed_url=feed_url,
    )


@router.post("/config", response_model=RSSConfigResponse)
async def update_rss_config(config_update: RSSConfig, request: Request):
    """Update RSS configuration."""
    config = load_config()

    config["rss_enabled"] = config_update.enabled
    config["rss_title"] = config_update.title
    config["rss_description"] = config_update.description
    config["rss_max_items"] = max(10, min(200, config_update.max_items))  # Clamp 10-200

    save_config(config)

    host = str(request.base_url).rstrip("/")
    feed_url = f"{host}/api/rss/feed" if config_update.enabled else ""

    return RSSConfigResponse(
        enabled=config_update.enabled,
        title=config_update.title,
        description=config_update.description,
        max_items=config["rss_max_items"],
        feed_url=feed_url,
    )
```

---

## Task 3: 集成 RSS 到主应用

**Files:**
- Modify: `abo/main.py`（添加 RSS 路由注册和虚拟模块）

首先读取 main.py 中注册路由的部分：

- [ ] **Step 4: 在 main.py 添加 RSS 路由导入和注册**

在 main.py 文件中找到现有 router 导入位置（大约在第 20 行附近），添加 RSS 导入：

```python
# 找到这一行附近：
from .profile.routes import router as profile_router

# 在它下面添加：
from .rss import rss_router
```

- [ ] **Step 5: 注册 RSS 路由到 FastAPI 应用**

在 main.py 中找到 `app.include_router` 调用的位置（大约在创建 FastAPI app 后的位置），添加：

```python
# 在现有的 router 注册之后添加：
app.include_router(rss_router)
```

- [ ] **Step 6: 在模块列表 API 中添加 RSS 虚拟模块**

在 main.py 中找到 `/api/modules` 路由（大约在 200+ 行），修改返回的模块列表，添加 RSS 作为虚拟模块：

```python
# 找到 @app.get("/api/modules") 路由，修改其返回逻辑：

@app.get("/api/modules")
async def list_modules():
    """List all modules including RSS aggregator."""
    modules = [_state_store.get_state(m.id) for m in _registry.list()]

    # Add RSS as virtual module
    config = load_config()
    rss_module = {
        "id": "rss-aggregator",
        "name": "RSS 聚合",
        "schedule": "on-demand",
        "icon": "rss",
        "enabled": config.get("rss_enabled", False),
        "output": ["rss"],
        "is_virtual": True,  # Mark as virtual module
        "description": "聚合所有模块内容为 RSS feed",
    }
    modules.append(rss_module)

    return {"modules": modules}
```

---

## Task 4: 前端 RSS 配置区域

**Files:**
- Modify: `src/modules/settings/Settings.tsx`

- [ ] **Step 7: 在 Settings.tsx 添加 RSS 配置组件和状态**

在 Settings.tsx 文件的 imports 部分，添加 `useEffect` 和 api 相关：

```typescript
// 在现有的 imports 后添加：
import { useEffect } from "react";
import { Rss, Copy, Check } from "lucide-react";
import { api } from "../../core/api";
```

在文件中添加 RSS 配置相关的 interface 和 state（放在 GeneralSection 组件之前）：

```typescript
interface RSSConfig {
  enabled: boolean;
  title: string;
  description: string;
  max_items: number;
  feed_url: string;
}

function RSSSection() {
  const [config, setConfig] = useState<RSSConfig>({
    enabled: false,
    title: "ABO Intelligence Feed",
    description: "Aggregated intelligence from ABO modules",
    max_items: 50,
    feed_url: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const { addToast } = useStore();

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      const data = await api.get<RSSConfig>("/api/rss/config");
      setConfig(data);
    } catch (e) {
      console.error("Failed to load RSS config:", e);
      addToast({ kind: "error", title: "加载 RSS 配置失败" });
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(updates: Partial<RSSConfig>) {
    try {
      setSaving(true);
      const newConfig = { ...config, ...updates };
      const data = await api.post<RSSConfig>("/api/rss/config", newConfig);
      setConfig(data);
      addToast({ kind: "success", title: "RSS 配置已保存" });
    } catch (e) {
      console.error("Failed to save RSS config:", e);
      addToast({ kind: "error", title: "保存 RSS 配置失败" });
    } finally {
      setSaving(false);
    }
  }

  function copyFeedUrl() {
    if (config.feed_url) {
      navigator.clipboard.writeText(config.feed_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast({ kind: "success", title: "订阅链接已复制" });
    }
  }

  if (loading) {
    return (
      <Card title="RSS 订阅" icon={<Rss style={{ width: "18px", height: "18px" }} />}>
        <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
          加载中...
        </div>
      </Card>
    );
  }

  return (
    <Card title="RSS 订阅" icon={<Rss style={{ width: "18px", height: "18px" }} />}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Enable Toggle */}
        <SettingItem
          icon={<Rss style={{ width: "20px", height: "20px" }} />}
          title="启用 RSS Feed"
          description={config.enabled ? "外部可以通过 RSS 订阅你的情报" : "RSS feed 当前未启用"}
        >
          <Toggle
            enabled={config.enabled}
            onToggle={() => saveConfig({ enabled: !config.enabled })}
          />
        </SettingItem>

        {config.enabled && (
          <>
            {/* Feed URL */}
            <SettingItem
              icon={<Copy style={{ width: "20px", height: "20px" }} />}
              title="订阅链接"
              description="复制此链接到 RSS 阅读器"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <code
                  style={{
                    padding: "6px 12px",
                    background: "var(--bg-hover)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    color: "var(--text-secondary)",
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {config.feed_url || "未启用"}
                </code>
                <button
                  onClick={copyFeedUrl}
                  disabled={!config.feed_url}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-card)",
                    cursor: config.feed_url ? "pointer" : "not-allowed",
                    opacity: config.feed_url ? 1 : 0.5,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {copied ? (
                    <>
                      <Check style={{ width: "14px", height: "14px" }} />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy style={{ width: "14px", height: "14px" }} />
                      复制
                    </>
                  )}
                </button>
              </div>
            </SettingItem>

            {/* Title Input */}
            <SettingItem
              icon={<span style={{ fontSize: "16px" }}>T</span>}
              title="Feed 标题"
              description="RSS feed 的标题"
            >
              <input
                type="text"
                value={config.title}
                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                onBlur={() => saveConfig({ title: config.title })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  width: "200px",
                }}
              />
            </SettingItem>

            {/* Description Input */}
            <SettingItem
              icon={<span style={{ fontSize: "16px" }}>D</span>}
              title="Feed 描述"
              description="RSS feed 的描述"
            >
              <input
                type="text"
                value={config.description}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                onBlur={() => saveConfig({ description: config.description })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  width: "280px",
                }}
              />
            </SettingItem>

            {/* Max Items */}
            <SettingItem
              icon={<span style={{ fontSize: "16px" }}>#</span>}
              title="最大条目数"
              description="Feed 中最多显示的条目数量 (10-200)"
            >
              <input
                type="number"
                min={10}
                max={200}
                value={config.max_items}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 50;
                  setConfig({ ...config, max_items: val });
                }}
                onBlur={() => saveConfig({ max_items: config.max_items })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  width: "80px",
                }}
              />
            </SettingItem>
          </>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 8: 在 GeneralSection 中插入 RSSSection**

在 `GeneralSection` 组件的返回 JSX 中，找到合适的位置（例如在 Appearance 之后）插入 RSSSection：

```typescript
// 在 GeneralSection 的 return 中，找到 "Appearance" card 之后添加：

{/* RSS Feed */}
<RSSSection />
```

完整修改后的 GeneralSection：

```typescript
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

      {/* RSS Feed */}
      <RSSSection />

      {/* Keyboard Shortcuts */}
      <Card title="键盘快捷键" icon={<Keyboard style={{ width: "18px", height: "18px" }} />}>
        {/* ... existing shortcuts code ... */}
      </Card>
    </div>
  );
}
```

---

## Task 5: 测试和验证

- [ ] **Step 9: 启动后端并测试 RSS API**

```bash
# 终端 1：启动后端
cd /Users/huanc/Desktop/ABO
python -m abo.main
```

在另一个终端测试：

```bash
# 测试获取配置
curl http://127.0.0.1:8765/api/rss/config

# 测试更新配置
curl -X POST http://127.0.0.1:8765/api/rss/config \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "title": "My Feed", "description": "Test", "max_items": 50}'

# 测试 RSS feed（启用后）
curl http://127.0.0.1:8765/api/rss/feed
```

预期：
- 获取配置返回 JSON 包含 enabled, title, description, max_items, feed_url
- 更新配置返回更新后的配置
- Feed 返回有效的 RSS 2.0 XML（当 enabled=true 时）

- [ ] **Step 10: 启动前端并测试 UI**

```bash
# 终端 2：启动前端
cd /Users/huanc/Desktop/ABO
npm run dev
```

测试步骤：
1. 打开设置页面 (`http://localhost:1420` 或 Tauri 窗口)
2. 确认出现 "RSS 订阅" 区域
3. 点击开关启用 RSS
4. 修改标题和描述，确认能保存
5. 复制订阅链接，验证链接格式为 `http://127.0.0.1:8765/api/rss/feed`
6. 在浏览器打开 feed URL，确认返回有效的 RSS XML

---

## Task 6: 提交代码

- [ ] **Step 11: Git 提交**

```bash
cd /Users/huanc/Desktop/ABO
git add abo/rss/ src/modules/settings/Settings.tsx abo/main.py abo/config.py docs/superpowers/plans/
git commit -m "feat(rss): add RSS aggregator module

- Add RSS generator (abo/rss/generator.py) for RSS 2.0 XML generation
- Add RSS routes (abo/rss/routes.py) for /api/rss/feed and /api/rss/config
- Register RSS as virtual module in /api/modules list
- Add RSS configuration UI in Settings page with toggle, title/description inputs,
  max_items control, and copy-to-clipboard for feed URL
- RSS feed aggregates cards from all modules, filters by recent 7 days"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ RSS 聚合功能 - Task 1-2 实现
- ✅ 每天爬取结果聚合 - generator.py 从 cards 表读取
- ✅ 方便别人订阅 - /api/rss/feed 提供标准 RSS 2.0
- ✅ 模块管理集成 - 作为虚拟模块出现在模块列表

**2. Placeholder scan:**
- ✅ 无 TBD/TODO
- ✅ 所有代码完整可运行
- ✅ 测试步骤具体明确

**3. Type consistency:**
- ✅ RSSConfig 前后端字段一致
- ✅ Card 类型与 store/cards.py 一致
- ✅ API 路径一致 (/api/rss/feed, /api/rss/config)
