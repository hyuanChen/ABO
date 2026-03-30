# ABO 角色主页 + 游戏化系统设计规格

**Date:** 2026-03-30
**Phase:** 11
**Status:** Approved — Ready for Implementation

---

## 1. 功能目标

在情报 Feed（效率驱动层）之上，增加"角色成长"的情感反馈层。让研究者看见自己的积累：读过的论文、坚持的健康打卡、生成的想法节点，都转化为可视化的角色数值。不是额外负担，而是已有行为的自然映射。

**核心原则：**
- 行为驱动（A）+ 角色展示（B）双模式
- 精力值是行为的镜子，不是主观输入
- 数据全部本地存储，不依赖后端数据库

---

## 2. 导航结构变更

### NavSidebar 顶部新增缩略卡

```
NavSidebar (bg-slate-900)
├── ── 顶部缩略卡 ─────────────────────
│   │  [像素小人]  精力 ████░░ 68%
│   │  "积累即复利，专注当下这一篇。"     ← 截断一行
│   └──────────────────────────────────  ← 点击进入 profile Tab
│
├── MAIN
│   ├── [profile]      ← 新增，位于 overview 上方
│   ├── overview
│   ├── literature
│   ├── ideas
│   └── claude
│
├── AUTO（arxiv / meeting / health / podcast / trends）
└── settings
```

**缩略卡行为：**
- 每日 08:00 座右铭自动刷新（或首次打开 ABO 时生成）
- 精力值进度条实时计算
- 点击整个缩略卡跳转到 `profile` Tab

### ActiveTab 新增 `"profile"`

```typescript
export type ActiveTab =
  | "profile"    // 新增
  | "overview"
  | "literature"
  | "arxiv"
  | "meeting"
  | "ideas"
  | "health"
  | "podcast"
  | "trends"
  | "claude"
  | "settings";
```

---

## 3. Profile Tab 页面结构

从上到下四个区块：

```
┌───────────────────────────────────────────────┐
│  A. 角色卡（Role Card）                         │
│     像素小人 | 身份信息 | 座右铭                 │
├───────────────────────────────────────────────┤
│  B. 今日待办（DailyTodo）                       │
│     任务列表 → 完成率 → 精力修正分               │
├───────────────────────────────────────────────┤
│  C. 六边形雷达图（HexagonRadar）                 │
│     JoJo 面板风格，E→A 字母评级                  │
├───────────────────────────────────────────────┤
│  D. 技能节点 + 成就徽章                          │
│     六维里程碑进度节点 + 稀有徽章横向滚动           │
└───────────────────────────────────────────────┘
```

---

## 4. 角色卡（Role Card）

### 数据字段

| 字段 | 来源 | 更新频率 |
|------|------|---------|
| 研究员代号 | 手动填写 | 用户编辑 |
| 预期目标 | 手动填写 | 用户编辑 |
| 近期画像小字 | Claude 自动生成 | 每日 08:00 |
| 今日座右铭 | Claude 生成 | 每日 08:00 |

### 座右铭生成逻辑

```python
async def generate_daily_motto(profile, last_7_days_summary, today_todos, energy, san):
    prompt = (
        f"基于以下上下文，生成一句适合今天的座右铭。\n"
        f"风格：简洁有力，适合研究者，带一点鼓励但不鸡汤。\n"
        f"只返回一句话，不要解释。\n\n"
        f"预期目标：{profile['long_term_goal']}\n"
        f"近期行为：{last_7_days_summary}\n"
        f"今日待办：{today_todos}\n"
        f"精力状态：{energy}%\n"
        f"SAN值：{san}/10"
    )
    return await claude(prompt)
```

存储：`~/.abo/daily_motto.json`
```json
{"date": "2026-03-30", "motto": "积累即复利，专注当下这一篇。", "description": "过去7天阅读23篇论文..."}
```

---

## 5. 像素小人状态系统

**CSS box-shadow 像素画，12×12 格子，纯前端无图片。**

### 四种基础状态

| 状态 | 触发条件 | 视觉表现 |
|------|---------|---------|
| **满血** | SAN ≥ 7 且 精力 ≥ 70% | 昂首挺胸，头顶小星星，偶尔眨眼 |
| **疲惫** | SAN ≥ 7 且 精力 < 40% | 打哈欠，眼睛半闭，头顶冒 zzz |
| **焦虑** | SAN < 5 且 精力 ≥ 60% | 身体微抖，头顶问号 |
| **崩溃** | SAN < 5 且 精力 < 40% | 趴地上，冒星星眼 |

**过渡态：** SAN 5-7 或 精力 40-70% 时，用对应状态降 20% 饱和度版本。

**状态切换动画：** 150ms opacity + transform，尊重 prefers-reduced-motion。

### 后续扩展状态（Phase 后续版本）
- **Deadline 模式：** 检测近期 deadline 标记，小人抱头狂奔
- **摸鱼模式：** 长时间未操作且精力高，小人躺平喝饮料

---

## 6. 六边形雷达图

**SVG 绘制，六顶点，填充区带渐变透明度，D3 optional（可纯 SVG 计算）。**

### JoJo 替身面板评级系统

每个维度在雷达图顶点外侧显示字母评级，风格致敬 JoJo 替身能力面板：

| 评级 | 分数范围 | 含义 |
|------|---------|------|
| **E** | 0–19 | 初始状态 |
| **D** | 20–39 | 入门 |
| **C** | 40–59 | 进阶 |
| **B** | 60–79 | 精通 |
| **A** | 80–100 | 卓越 |

**初始空状态：** 新用户六维全为 E，雷达图为一个小六边形居中。视觉效果参考 JoJo 替身卡，字母用等宽黄色字体（如 `font-mono text-amber-400`），给用户"我要把所有 E 推到 A"的驱动感。

### 六维定义与数据源

| 维度 | 计算方式 | 数据源 |
|------|---------|--------|
| **研究力** | `min(100, 近30天文献保存数×2 + ArXiv star数×3)` | CardStore + literature DB |
| **产出力** | `min(100, 组会生成次数×10 + Idea节点新增数×5)` | Vault Ideas/ + Meetings/ 计数 |
| **健康力** | `min(100, 打卡连续天数×10 + 近7天睡眠均分×5)` | health.db（未实现时默认 0） |
| **学习力** | `min(100, 播客完成数×8 + Trend deep_dive数×5)` | CardStore feedback |
| **SAN值** | 近7天手动打分均值 × 10 | `~/.abo/san_log.json` |
| **幸福指数** | `(主观打分×0.6 + 精力均值×0.4) × 10` | 每日弹窗 + energy memory |

**UI 规格：**
- 顶点外侧显示字母评级（E/D/C/B/A）+ 数值
- 悬停显示维度名 + 具体数值 + 达到下一级还差多少
- 每日缓存到 `~/.abo/stats_cache.json`，启动时读取，后台更新

---

## 7. 技能节点系统

### 节点 UI
六边形蜂窝网格，按维度分组。

- **未达成：** 灰色轮廓 + 进度百分比（如 `46%`，对应 23/50 篇）
- **已达成：** 彩色填充 + 微光效果 + 达成日期
- **进度显示：** 节点内显示 `当前值/目标值`，节点下方弧形进度条

**解锁通知：** Toast 弹出（"🎉 技能解锁：文献猎手"）+ profile 页新解锁节点高亮 3 秒后恢复正常彩色。

### 各维度节点（各 3-5 个）

**研究力：**
- 初窥门径 — 累计保存 10 篇文献
- 文献猎手 — 累计保存 50 篇文献
- 深度阅读 — 单篇文献 digest_level 达到 3
- 领域综述 — 创建 Idea canvas 并连接 20+ 节点

**产出力：**
- 初次汇报 — 生成第 1 份组会汇报
- 周会常客 — 累计生成 10 份汇报
- 想法喷涌 — 单周创建 10 个 Idea 节点

**健康力：**
- 早睡早起 — 连续 7 天睡眠 ≥ 7 小时
- 运动达人 — 连续 30 天健康打卡
- 精力管理 — 单日精力值达到 90+

**学习力：**
- 耳听八方 — 完成 10 个播客转录
- 趋势捕手 — 对 Trend 执行 20 次 deep_dive
- 跨界探索 — 连续 7 天阅读 3 个以上不同领域

**SAN 值：**
- 情绪稳定 — 连续 7 天 SAN ≥ 6
- 快速恢复 — 单日 SAN 提升 ≥ 3
- 心如止水 — 连续 30 天 SAN ≥ 7

**幸福指数：**
- 小确幸 — 单日幸福指数 ≥ 80
- 工作平衡 — 研究力与 SAN 值同时 ≥ 60
- 人生赢家 — 六维全部 ≥ 60（稀有成就）

---

## 8. 成就徽章系统

全局跨维度稀有成就，横向滚动展示，悬停显示获取日期。

| 徽章名 | 解锁条件 |
|--------|---------|
| 全能研究者 | 六维同时 ≥ 60 |
| 早起鸟 | 连续 30 天 08:00 前打开 ABO |
| 深夜斗士 | 23:00 后保存文献累计 50 次 |
| 深度阅读 | 单篇文献 digest_level 达到 3 |
| 自动化大师 | 创建 3 个自定义模块 |
| 知识闭环 | ArXiv → Idea → Meeting 完整链路走通 |

---

## 9. 精力值系统

**不手动填写，从行为反推。**

```
精力基础分 = f(睡眠时长, 睡眠质量)           # 健康模块提供
精力修正分 = g(今日待办完成率, 推迟次数)       # profile 内嵌 to-do 提供
当前精力   = 基础分 × 0.6 + 修正分 × 0.4
```

**初期降级策略（健康模块未实现时）：**
- 无健康数据 → 精力基础分默认 70
- 无任务数据 → 修正分默认 70
- 用户可手动 override 当日精力

**Profile 内嵌最小化 to-do（`DailyTodo` 组件）：**
- 位置：角色卡下方，六边形上方
- 功能：当日任务列表（添加/勾选/删除），勾选率实时影响精力修正分
- 存储：`~/.abo/daily_todos.json`（按日期分组）
- 交互：勾选一项 → 精力条轻微上升动画，强化正反馈

存储：`~/.abo/energy_memory.json`
```json
{
  "history": [{"date": "2026-03-31", "energy": 68}],
  "today": {"current": 68, "manual_override": null}
}
```

---

## 10. 数据持久化

| 数据 | 路径 | 格式 |
|------|------|------|
| 身份设定 | `~/.abo/profile.json` | JSON |
| 今日座右铭 + 画像描述 | `~/.abo/daily_motto.json` | JSON |
| SAN 值历史 | `~/.abo/san_log.json` | JSON 数组 |
| 幸福指数历史 | `~/.abo/happiness_log.json` | JSON 数组 |
| 精力记忆 | `~/.abo/energy_memory.json` | JSON |
| 技能节点状态 | `~/.abo/skills.json` | JSON，节点ID + 解锁时间戳 |
| 成就徽章 | `~/.abo/achievements.json` | JSON 数组 |
| 六维分数缓存 | `~/.abo/stats_cache.json` | JSON，每日更新 |

---

## 11. 后端新增路由

```
GET  /api/profile           → 完整角色数据（身份+座右铭+六维+技能+成就+精力）
POST /api/profile/identity  → 更新身份设定（代号、预期目标）
POST /api/profile/san       → 记录今日 SAN 值（1-10）
POST /api/profile/happiness → 记录今日幸福指数（1-10）
POST /api/profile/energy    → 手动 override 今日精力
POST /api/profile/generate-motto → 手动触发座右铭生成
GET  /api/profile/stats     → 六维分数实时计算
```

---

## 12. 前端组件结构

```
src/modules/profile/
├── Profile.tsx              # 主页面，组合所有区块
├── PixelAvatar.tsx          # 像素小人，4种状态，CSS box-shadow
├── RoleCard.tsx             # 角色卡：目标 + 描述 + 座右铭
├── DailyTodo.tsx            # 今日待办列表（影响精力修正分）
├── HexagonRadar.tsx         # SVG 六边形雷达图，JoJo E→A 评级
├── SkillGrid.tsx            # 六维技能节点蜂窝网格，带进度百分比
├── AchievementGallery.tsx   # 徽章横向滚动展示
└── DailyCheckInModal.tsx    # 每日 SAN + 幸福度打分弹窗（首次打开自动弹）

src/modules/nav/
└── NavSidebar.tsx           # 修改：顶部新增缩略卡（PixelAvatar + 精力条 + 座右铭）

src/core/store.ts            # 修改：ActiveTab 新增 "profile"
```

---

## 13. 与其他模块的联动

| 操作 | 影响 |
|------|------|
| Feed save/star/deep_dive | 触发六维分数重算，可能解锁技能节点 |
| 文献保存 | 研究力 +，可能解锁"文献猎手" |
| digest_level 提升 | 解锁"深度阅读"成就 |
| Idea 节点创建 | 产出力 + |
| 组会汇报生成 | 产出力 +，可能解锁"初次汇报" |
| 健康打卡 | 健康力 +，精力基础分更新 |
| 播客 deep_dive | 学习力 + |

---

## 14. 实现顺序

1. **后端** `abo/profile/` — 数据模型 + API 路由
2. **store.ts** — 新增 `profile` tab + profile 相关 state
3. **NavSidebar** — 顶部缩略卡（最简版：精力条 + 座右铭文字）
4. **Profile.tsx** — 主页面骨架
5. **PixelAvatar.tsx** — 4 种状态 CSS 像素画
6. **RoleCard.tsx** — 角色卡 + 手动填写 + 座右铭显示
7. **HexagonRadar.tsx** — SVG 六边形 + JoJo E→A 评级
8. **DailyTodo.tsx** — 今日待办列表
9. **SkillGrid.tsx** — 技能节点网格（带进度百分比）
10. **AchievementGallery.tsx** — 徽章展示
11. **DailyCheckInModal.tsx** — SAN + 幸福度打分弹窗（首次打开自动弹）
11. **MainContent.tsx** — 接入 profile Tab
