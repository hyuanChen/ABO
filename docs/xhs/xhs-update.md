# XHS Update

这份文档记录本轮对 ABO 小红书抓取链路的调整、测试结果和当前结论。

目标只有三个：

1. 主链路尽量改成“真实浏览器优先”。
2. 尽量减少容易触发小红书限制的自动化访问形态。
3. 不同错误界面要给出明确反馈，并在需要时直接停止，不继续执行。

## 1. 本轮改动概览

本轮已经把单帖抓取主链路改成：

`扩展 bridge -> CDP -> 后端 HTML`

其中：

- 扩展 bridge 是默认主路径。
- CDP 仍然保留，但只作为第二层。
- 后端 HTML 解析保留在最后，用于普通失败场景兜底，不再作为默认主路径。

对应改动点：

- 新增 `abo/tools/xhs_extension_bridge.py`
- `abo/tools/xhs_crawler.py` 改为扩展优先
- `scripts/xhs/crawl_note.py` / `scripts/xhs/batch_links.py` 增加扩展参数并输出结构化错误
- 新增 `scripts/xhs/open_browser_with_extension.sh`
- 新增 `scripts/xhs/test_extension_bridge.py`
- 新增 `scripts/xhs/fill_album_target.py`
- 更新 `scripts/xhs/README.md`

## 2. 为什么改成浏览器优先

当前现场判断很明确：

- 浏览器里的人类操作是正常的
- 纯自动化跳详情页更容易触发限制

这意味着问题不在账号本身，也不在“完全不能访问”，而在访问形态。

所以这轮实现不再把“后端直拉详情页 HTML”放在第一位，而是优先利用：

- 当前真实浏览器上下文
- 当前登录态
- 页面已经拿到的前端状态
- 当前用户正在看的 tab

核心原则是：

- 先读当前页
- 少跳转
- 少新开页面
- 少重复请求
- 命中限制就停

## 3. 扩展 bridge 现状

### 3.1 已验证可用

实际测试中，下面这条链路已经跑通：

`Python -> ws://127.0.0.1:9334 -> extension/background.js -> 当前 Edge 小红书页 -> MAIN world evaluate`

已验证结果：

- 可以从 Python 成功连到扩展 bridge
- 可以读取当前页 URL
- 可以在页面主 world 读取 `window.__INITIAL_STATE__`
- 可以从首页 state 中拿到 feed 列表里的 `noteId` / `xsecToken`

### 3.2 当前安装方式

当前不是“真正静默一键安装浏览器扩展”。

原因不是脚本没写，而是 Chromium 系浏览器对已运行实例有安全限制：

- 不能在你当前已经打开的 Edge 上，直接从命令行静默注入 unpacked extension
- 如果要完全自动化加载，只能新起一个带 `--load-extension` 的独立实例

考虑到你明确不希望我再额外拉起一个独立浏览器实例，当前路线调整为：

1. 继续使用你当前打开的 Edge
2. 手动把 `/Users/huanc/Desktop/ABO/extension` 加载为已解压扩展
3. 后续开发与联调都复用这个现有 Edge

所以“最接近一键”的部分是：

- `scripts/xhs/open_browser_with_extension.sh`

但它适合新启动一个专用实例，不适合强行注入你当前在用的 Edge。

## 4. 当前抓取策略

### 4.1 单帖主链路

现在单帖抓取的浏览器策略是：

1. 先连接扩展 bridge
2. 先读取当前活动小红书 tab
3. 如果当前 tab 已经是目标 note 页面，直接读取，不跳转
4. 如果当前不是目标页，先尝试从当前页读取已有状态
5. 只有拿不到目标数据时，才尝试点击/导航
6. 扩展失败后，再尝试一次 CDP
7. CDP 也失败，再报结构化错误并停止

### 4.2 尽量像人类而不是像脚本

本轮已经加上的“降侵入”策略：

- 优先复用当前活动 tab
- 点击前加入随机短暂停顿
- 当前页有数据时优先读取当前页
- 不在命中限制后继续自动重试
- 当前页 state 不完整时，补 DOM 提取
- 专辑详情落盘时回填专辑列表的 seed 元数据

本轮测试表明，直接构造详情 URL 硬跳更容易触发：

- 扫码验证
- 访问频繁
- 404 / 当前笔记不可浏览

因此后续还要继续往“当前页点击进入”和“慢速、小步”方向优化。

### 4.3 当前页 DOM 兜底

详情页现在不再只依赖 `noteDetailMap[note_id].note`。

如果扩展读取到：

- `noteDetailMap` 存在
- 但 `note` 为空对象

当前实现会继续从页面 DOM 里提取基础字段，至少补出：

- 标题
- 正文片段
- 作者
- 互动数
- 图片 / 视频链接
- 标签
- IP 属地文本

然后把这些字段组装成一个基础版 `noteRoot` 继续走落盘链路。

### 4.4 专辑列表 seed 回填

专辑抓取时，详情页现在允许接收来自专辑列表的 seed 数据：

- `title`
- `author`
- `likes`
- `time`

当详情页本身字段不完整时，会优先用 seed 数据回填。  
这已经在样本笔记里验证过，能避免把可识别笔记写成 `无标题`。

### 4.5 专辑页自动进入路径

当前还额外假设了一点：如果小红书 tab 没有真正被激活到前台，专辑页后续加载可能会被浏览器节流。

因此现在扩展在关键步骤会显式执行：

- 聚焦 Edge 窗口
- 激活当前 xhs tab
- 再执行标签点击和滚动

专辑读取现在不再只依赖直接打开 `/board/<id>`。

扩展主链路会优先模拟真实用户路径：

- 发现页
- 点击 `我`
- 点击 `收藏`
- 点击 `专辑`
- 定位并点击目标专辑卡片

只有这条 UI 路径失败时，才回退到直接打开 `board` 页。

这样做的目的，是让页面进入和你手动点击专辑时更接近，从而减少“只加载第一页”的情况。

### 4.5 专辑页滚动状态机

专辑页现在不再只用一种固定滚法。

当前滚动逻辑会在每轮先观察页面状态，再决定动作。观察项包括：

- `boardFeedsMap[board_id].notes` 当前数量
- 当前页面上可见的 note 链接数量
- 页面滚动位置
- 页面总高度
- 是否还存在“加载中”等提示

动作不再固定为单次 `scrollToBottom`，而是交替使用：

- 小步 `scrollBy`
- `wheel`
- 触底
- 回拉后再次触底

停止条件也不再是“几轮没增长就立刻结束”，而是：

- 连续多轮无增长
- 并且页面没有加载提示
- 并且换滚法重试后仍然无增长

这样能减少：

- 还没真正到底就误停
- 页面只是暂时卡住就被判定结束
- 滚动模式过于机械导致前端不继续加载

## 5. 错误反馈与停止逻辑

这是本轮最重要的稳定性改动之一。

现在不是“只要报错就继续乱试”，而是对错误界面做分类。

### 5.1 已识别的错误类型

当前已经能识别这些状态：

- `risk_limited`
  - 访问频繁
  - 安全限制
  - 安全访问
  - 请稍后再试

- `manual_required`
  - 扫码验证

- `auth_invalid`
  - 请先登录
  - 登录后查看更多内容

- `not_found`
  - `300031`
  - 页面不见了
  - 你访问的页面不见了
  - 内容无法展示
  - 笔记不存在
  - 内容已无法查看

### 5.2 停止策略

当前逻辑是：

- 扩展失败后，允许再试一次 CDP
- 如果 CDP 也失败，则直接报错并停止
- 遇到风控 / 扫码 / 登录失效 / 内容不可用，不继续往下刷页面
- 批量任务遇到这些错误时，直接停止后续任务，不再继续跑剩余链接

### 5.3 CLI 输出

`crawl_note.py` 现在会输出结构化错误，而不是 Python traceback。

输出格式类似：

```json
{
  "success": false,
  "url": "<note_url>",
  "error_code": "manual_required",
  "error": "页面要求扫码验证，任务已停止，等待人工处理",
  "stopped": true
}
```

批量模式也会输出：

- `error_code`
- `error`
- `stopped`

并在 `stopped=true` 时直接熔断后续任务。

## 6. 实际测试记录

### 6.1 已通过

已通过的测试：

1. `python3 scripts/xhs/test_extension_bridge.py`
   - 成功
   - 能拿到当前页 URL
   - 能在当前页读取 `window.__INITIAL_STATE__`

2. 从首页 state 读取 feed 项
   - 成功
   - 已拿到 `noteId` / `xsecToken`

3. 单帖 CLI 错误反馈
   - 成功
   - 命中错误界面时已改成结构化输出

4. DOM 兜底 + seed 元数据
   - 成功
   - 样本笔记 `69d25bf7000000001a03325d` 已能通过扩展 + seed 数据落成正确标题，而不是 `无标题`

### 6.2 当前仍然存在的问题

1. 自动进入详情页仍然容易触发限制

实际观察到的页面包括：

- `安全限制`
- `访问频繁`
- `扫码验证`
- `300031 / 当前笔记暂时无法浏览`
- `404 / 你访问的页面不见了`

2. 当前 Edge 实例不一定开了 CDP 端口

因此会出现：

- `CDP 兜底失败: All connection attempts failed`

这不是抓取逻辑本身的问题，而是：

- 当前这份正在使用的 Edge 不是带 `--remote-debugging-port=9222` 启动的

如果要让 CDP 在“不新开独立实例”的前提下可用，需要用户自己用带调试端口的方式启动当前要使用的浏览器实例。

3. 首页 feed 里并不是每个可见卡片都能顺利进详情

有些卡片：

- 当前就是不可浏览
- 或者当前会被平台临时限制

所以“点击当前可见卡片”比“硬跳详情 URL”更接近人类行为，但也不是百分之百成功。

4. 第一张专辑 `sth useful` 在当前环境下仍无法自动扩到 200 条

当前实测结果：

- 专辑标称总数：310
- 本地已落盘：166
- 当前真实浏览器专辑页稳定能拿到：35
- 这 35 条在当前进度里全部已存在

额外做过的尝试包括：

- 扩展读取 `boardFeedsMap`
- 扩展慢速滚动
- 扩展去掉提示弹层后滚动
- headless 读取 `boardFeedsMap`
- headless 监听 `/api/sns/web/v1/board/note` 响应
- 多轮冷却后重试

结果都没有把第一张专辑从 35 条继续推深。

## 7. 当前结论

本轮最重要的结果不是“已经稳定无视小红书限制”，而是：

1. 真实浏览器优先链路已经接通
2. 扩展 bridge 已经能稳定工作
3. 错误界面已能分类反馈
4. 命中限制后会停，不再继续盲撞
5. CDP 仍保留为第二层，但当前运行的浏览器实例不一定具备 CDP 条件

这意味着现在的系统已经比之前更接近“人类优先”的抓取方式，但还没到“全自动稳定抓取所有 note”的阶段。

对这次更具体的用户目标“第一张专辑补到 200 条”，当前结论是：

- 代码侧已经补齐了当前页优先、DOM 兜底、错误停机、专辑目标条数控制
- 但在当前账户 / 页面环境下，`sth useful` 专辑只稳定暴露 35 条当前可读 note
- 本地已有 166 条，所以当前自动化还不能把它补满到 200

也就是说，当前的瓶颈已经不只是实现缺口，而是平台在当前上下文里没有继续吐出更多专辑数据。

## 8. 下一步建议

后续迭代建议按下面顺序继续：

1. 当前页优先读取再增强
   - 如果用户手动打开目标 note，就直接从当前页读，不做跳转
   - 这是最接近“人类操作完全 OK”这个现场条件的方式

2. 点击进入详情的等待逻辑继续细化
   - 不能只等 `load`
   - 要等 URL 变化、页面 modal 打开、或 `noteDetailMap` 真正填充

3. 把“当前可见卡片池”做成低速尝试队列
   - 每次只试很少几条
   - 每次之间做冷却
   - 命中风控立刻停

4. CDP 环境单独规范
   - 如果需要 CDP 兜底，就明确要求启动带调试端口的浏览器
   - 不再假设当前任意 Edge 都天然可用

5. 对当前页 DOM 做第二提取层
   - 当 `__INITIAL_STATE__` 不完整时，补一层 DOM 提取基础字段
   - 至少保证标题、作者、正文片段、链接、错误状态能落盘

6. 对专辑补抓单独做 cursor 实验链路
   - 不替换当前主链路
   - 只针对“页面自然滚动永远卡在 35 条”这种专辑
   - 在同一个页面上下文中尝试记录和复用真实 cursor 请求

## 9. 一句话总结

当前 ABO 小红书抓取已经从“后端请求优先”切到了“真实浏览器优先”；扩展 bridge 已经可用；错误页识别和停止逻辑已经补上；但想真正做到“像人类一样稳定地抓”，接下来还要继续围绕“当前页优先、慢速点击、少跳转、命中限制即停”这条路线迭代。

## 10. 2026-04-14 新验证：专辑页必须真的激活 XHS 标签的问题已打通

这一轮确认了前一版专辑抓取不稳定的真正原因不是“滚动策略不够慢”，而是两层 tab 激活都不够强：

1. 扩展层虽然有 `activate_tab` / `pulse_tab` 设计，但旧版实际运行的 service worker 没有这两个命令。
2. 扩展在多 XHS tab 场景下可能挑错 tab，导致“切 tab”动作打在别的页面上。
3. 仅靠扩展 `tabs.update(..., active: true)` 还不够，当前环境里确实需要浏览器前台窗口发生一次真实的“切到别的 tab 再切回当前 XHS tab”。

### 10.1 这次补了什么

本次代码补丁主要分两层：

1. 扩展后台固定目标 XHS tab
   - 文件：`extension/background.js`
   - 新增 `preferredXhsTabId / preferredXhsWindowId`
   - 每次 `navigate / activate_tab / pulse_tab / evaluate` 都会记住当前目标 XHS tab
   - `getOrOpenXhsTab()` 优先返回这个已锁定 tab，而不是随便挑一个现存 XHS 页面
   - 新增 `get_tab_state` 方便调试确认当前激活的究竟是不是目标专辑页

2. 爬虫侧追加系统级真实 tab pulse
   - 文件：`abo/tools/xhs_crawler.py`
   - 新增 `_macos_real_browser_tab_pulse()`
   - 在扩展 `pulse_tab` 之后，再用 AppleScript 直接驱动 `Microsoft Edge` 前台窗口切到相邻 tab，再切回当前 tab
   - 这样即使页面只有在“真实被激活一次”后才继续懒加载，也能把条件补齐

另外，这次还顺手把 Edge 里已加载的 unpacked `XHS Bridge` 扩展直接 reload 到了新版本，避免浏览器继续跑旧 worker。

### 10.2 真实验证结果

针对第一张专辑 `sth useful`：

- `board_id`: `6543e6ef000000002802ad53`
- URL: `https://www.xiaohongshu.com/board/6543e6ef000000002802ad53?source=web_user_page`

验证步骤里已经明确看到：

1. `activate_tab` 命中了正确的专辑 tab
2. `pulse_tab` 返回 `pulsed: true`
3. macOS/Edge 侧真实 tab pulse 返回：
   - `{"ok": true, "app": "Microsoft Edge", "mode": "existing_tab"}`
4. `get_tab_state` 返回的 `preferredUrl` 和 `activeFocusedUrl` 都是目标专辑 URL

最关键的是，专辑列表不再稳定卡死在 35 条，而是实际增长到了：

- 35
- 70
- 102
- 136
- 166
- 197
- 229

也就是说，之前“必须手动点一下 XHS 标签页才能继续翻”的问题，在当前环境已经被自动化补上了，而且不只是翻过一页，而是能持续把专辑往后推。

### 10.3 当前结论需要修正

前面文档里“第一张专辑当前环境下仍无法自动扩到 200 条”的结论，已经不再成立。

在 2026-04-14 这一轮实测中，单纯专辑列表加载已经能自动拉到 `229` 条，说明：

1. 专辑翻页的关键阻塞点已经从“平台只暴露 35 条”变成“后续 note 详情抓取如何继续保守执行”
2. “进入专辑后要主动激活 XHS tab，再切换出去再切回来” 这个动作现在已经进入代码主链路
3. 当前主链路仍然保持：
   - 真实浏览器优先
   - 命中风险 / 登录 / 不可浏览页立即停
   - CDP 只做兜底

### 10.4 下一步

接下来优先做两件事：

1. 用当前已经打通的专辑翻页链路，继续把 `fill_album_target.py` 跑到真实落盘 200 条
2. 保持当前“命中异常立即停”的策略，把详情抓取里的错误反馈继续细化，避免在详情阶段把风控重新撞出来

## 11. 关键需求与阶段成果维护

这一节只记录后续开发必须持续满足的关键需求，以及到目前为止已经验证过什么、又在哪些改动后出现了回归。

### 11.1 不可丢的关键需求

1. 真实浏览器优先
   - 优先复用用户当前真实登录态的浏览器
   - 扩展 bridge 是主链路
   - CDP 只做兜底

2. 专辑列表页尽量后台
   - `发现 -> 我 -> 收藏 -> 专辑列表` 这段尽量不要抢当前前台 tab
   - 用户明确要求：点击具体专辑前，不要把 XHS tab 拉到前台

3. 具体专辑页只激活一次
   - 真正需要前台激活的时机，是从专辑列表点击进入具体专辑新页之后
   - 该页 URL 形态一般是：
     - `https://www.xiaohongshu.com/board/<board_id>?source=web_user_page`
   - 进入这个新页后，允许做一次真实 tab 激活 / 切换
   - 之后不要继续频繁切换

4. 命中异常立即停
   - 扫码验证
   - 访问频繁 / 安全限制
   - 300031 / 页面不可访问
   - 登录失效
   - 以上都应该给明确错误反馈并停止，不要继续撞

5. 后续详情抓取要保守
   - 即使专辑列表翻页通了，详情抓取仍要保持低速、少跳转、命中异常即停

### 11.2 已经验证过的阶段成果

下面这些不是猜测，是已经在本机真实验证过的结果：

1. 扩展 bridge 可用
   - Python 可以连到本地扩展 WS bridge
   - 可以读取当前 URL
   - 可以执行主 world JS
   - 可以读到 `window.__INITIAL_STATE__`

2. 单帖抓取主链路可用
   - 当前页 state 读取可用
   - DOM 兜底可用
   - seed metadata merge 可用

3. 专辑翻页曾经真实跑通到 200+
   - 第一张专辑 `sth useful`
   - 实测增长轨迹：
     - 35
     - 70
     - 102
     - 136
     - 166
     - 197
     - 229
   - 说明“自动激活一次后，专辑列表继续加载”这件事在某个稳定版本里确实成立过

### 11.3 当前阶段暴露出的回归

最近几轮改动里，出现过两类回归，后续开发需要明确避免：

1. 前台切换过多
   - 虽然用户只要求“进入具体专辑后切一次”
   - 但某些版本里，前置导航阶段仍然会通过：
     - `activate_tab`
     - `navigate(active: true)`
     - `wait_for_load` 配套前台恢复失败
   - 导致 XHS tab 在进入具体专辑前就抢到前台

2. 进入具体专辑后的可滚动状态被破坏
   - 某些版本里，虽然加入了更复杂的切换策略
   - 但反而让原来“自动切一次后，后面可以后台继续滚”的状态失效
   - 目前最可疑的回归点包括：
     - `background navigate + restorePreviousActiveTab`
     - 新加的 `bounce_xhs_tab`
   - 也就是说，问题不一定是“必须全程前台”，更可能是“第一次进入具体专辑页时的可见性时序被改坏了”

### 11.4 当前最核心的代码入口

后续如果继续迭代，不要到处找逻辑，优先看下面几处：

1. 专辑列表主流程
   - 文件：`abo/tools/xhs_crawler.py`
   - 函数：`_fetch_board_notes_via_extension`
   - 关键位置：
     - `pulse_tab()`：专辑页切换辅助
     - `activate_board_tab_once()`：具体专辑页进入后的单次激活
     - `open_board_via_ui()`：发现 -> 我 -> 收藏 -> 专辑 -> 具体专辑

2. 扩展导航与 tab 管理
   - 文件：`extension/background.js`
   - 关键位置：
     - `cmdNavigate()`：导航时是否抢前台
     - `cmdWaitForLoad()`：等待加载时是否恢复原前台 tab
     - `cmdActivateTab()`：强制把 XHS tab 拉到前台
     - `cmdPulseTab()`：在浏览器内部做一次切走再切回
     - `getOrOpenXhsTab()`：当前命令到底落到哪个 XHS tab

3. 当前最核心的简短代码

当前专辑页“进入后激活一次”的核心代码在 `abo/tools/xhs_crawler.py`：

```python
async def activate_board_tab_once() -> None:
    nonlocal tab_pulse_used
    if tab_pulse_used:
        return

    board_page_pattern = re.compile(r"/board/[^/?#]+\\?source=web_user_page(?:[&#].*)?$")
    matched_url = ""
    for _ in range(30):
        current_url = _safe_str(await bridge.call("get_url", {}, timeout=10.0))
        if board_page_pattern.search(current_url):
            matched_url = current_url
            break
        await asyncio.sleep(0.35)

    await bridge.call("activate_tab", {}, timeout=10.0)
    await asyncio.sleep(random.uniform(0.6, 1.0))
    await pulse_tab()
    tab_pulse_used = True
```

扩展里“是否后台导航”的核心代码在 `extension/background.js`：

```javascript
async function cmdNavigate({ url, background = false }) {
  const tab = await getOrOpenXhsTab();
  const previousActiveTab = background ? await getCurrentFocusedActiveTab() : null;
  if (!background) {
    await ensureTabVisible(tab);
  }
  await chrome.tabs.update(tab.id, { url, active: !background });
  await waitForTabComplete(tab.id, url, 60000);
  if (background) {
    await restorePreviousActiveTab(previousActiveTab, tab.id);
  }
}
```

### 11.5 当前开发判断

截至这次记录，最重要的判断有两条：

1. “专辑列表之前全部后台、进入具体专辑后自动切一次、后面继续后台滚动”这条路线，历史上大概率是成立过的，不是伪需求。
2. 当前版本之所以又出现“要人工点标签”或“切换后仍不滚”，更像是最近改动把时序破坏了，而不是插件能力本身不支持。

所以后续正确方向不是继续发散加更多切换策略，而是：

1. 保留文档里的这组关键需求不变
2. 从已经验证过的可用版本时序回退/比对
3. 逐项确认是哪一个改动破坏了“自动切一次后继续后台滚动”的状态

### 11.6 当前代码注释对齐

为了避免后续继续在错误分支上叠补丁，代码里已经把下面两段“共享当前浏览器标签页实验”逻辑显式注释并标记了版本来源：

1. `extension/background.js`
   - `bounce_xhs_tab` 的命令入口和实现已注释
   - 对齐本节文档的：
     - §11.3 当前阶段暴露出的回归
     - §11.4 当前最核心的代码入口

2. `abo/tools/xhs_crawler.py`
   - 旧的泛化 helper `settle_active_xhs_tab()` 已注释
   - 现在主链路保留的是更聚焦的 `activate_board_tab_once()`

这样做的目的不是彻底删除历史，而是：

- 保留阶段性实现痕迹，方便和文档结论逐条对照
- 明确告诉后续开发者：这些逻辑属于 2026-04-14 的共享标签页实验分支
- 当前不建议继续在这条分支上叠加复杂切换策略

## 12. 专用浏览器窗口模式

基于最近几轮共享标签页实验的回归，当前新增一条更简单的实现路线：

1. 单独启动一个专用浏览器窗口 / 专用 profile
2. 这个窗口只用于 XHS 自动化
3. 不再和用户当前工作用浏览器标签共享前台/后台状态

### 12.1 当前实现

已经补上的代码入口：

1. `scripts/xhs/open_browser_with_extension.sh`
   - 新增环境变量 `ABO_XHS_WINDOW_MODE=dedicated`
   - dedicated 模式会带 `--new-window`

2. `scripts/xhs/fill_album_target.py`
   - 新增参数 `--dedicated-window`

3. `abo/tools/xhs_crawler.py`
   - `_fetch_board_notes_via_extension(..., dedicated_window_mode=True)`
   - 在专用窗口模式下：
     - 前置导航不再走共享标签页补偿思路
     - 进入具体专辑后不再额外做共享标签页切换补偿
     - 假设整个专用窗口本身就是自动化窗口

4. `scripts/xhs/open_current_edge_window.sh`
   - 在当前已打开的 Microsoft Edge 中直接新开一个独立窗口
   - 不再新起浏览器实例
   - 适合“插件已经手动加载，且不想再开多实例”的使用方式

### 12.2 当前判断

这条路线的目标不是“再做一套更复杂的切换”，而是尽量消灭“为什么还要补切 tab”这个问题本身。

如果专用浏览器窗口始终就是 XHS 自动化窗口，那么理论上：

1. 进入具体专辑前不需要与用户当前浏览器标签争前台
2. 第一次进入具体专辑时也不应再依赖共享标签页模式下的复杂切换补偿
3. 后续滚动是否还能继续加载，将更容易区分到底是平台限制，还是浏览器可见性问题

### 12.3 2026-04-14 实测结果

这轮已经做了真实验证，不只是代码改造：

测试条件：

1. 当前已有 Edge，不再新起浏览器实例
2. 在当前 Edge 中新开一个独立窗口
3. 扩展 bridge 改走 `9334`
4. `_fetch_board_notes(..., dedicated_window_mode=True, extension_port=9334)`

针对专辑：

- `board_id = 6543e6ef000000002802ad53`
- URL = `https://www.xiaohongshu.com/board/6543e6ef000000002802ad53?source=web_user_page`

实测增长轨迹：

- 35
- 70
- 102
- 136

这说明至少在当前这一轮里：

1. 专用窗口模式下，不依赖共享标签页补偿，也能继续往后滚
2. 当前 Edge 独立窗口方案明显比共享标签页模式稳定
3. 下一步应该优先把这条链路正式接入 ABO 调用，而不是继续在共享标签页模式上迭代

### 12.4 ABO 项目入口验证

这轮还额外验证了 ABO 项目里的实际入口，而不是只测底层函数：

测试命令：

```bash
python scripts/xhs/fill_album_target.py \
  --board-id 6543e6ef000000002802ad53 \
  --target-total 120 \
  --extension-port 9334 \
  --dedicated-window \
  --max-loaded-notes 20
```

当前结果分成两层：

1. 已解决的部分
   - `fill_album_target.py` 已经能把：
     - `--dedicated-window`
     - `--extension-port`
   - 传到：
     - `crawl_xhs_albums_incremental(...)`
     - `_fetch_board_notes_via_extension(...)`
     - `list_xhs_album_previews(...)`

2. 仍未打通的部分
   - ABO 项目入口当前仍可能卡住
   - 本轮测试里进程持续 3 分钟以上、CPU 基本为 0，属于等待/挂住而不是正常抓取
   - 这说明：
     - 底层 dedicated window 滚动链路已验证
     - 但 ABO 项目级入口仍有额外的等待点需要继续排查

因此当前阶段结论应更新为：

1. “当前 Edge 新窗口 + dedicated window 模式”已经在底层验证通过
2. “ABO 完整入口”还没有完全打通
3. 下一轮排查重点不再是专辑页切 tab，而是 ABO 入口里哪一个等待点挂住了

## 13. 当前 Edge 独立窗口整合更新

本轮按“迁移旧 tab 操作能力到新窗口”的方向继续收敛，没有继续扩展共享标签页实验分支。

### 13.1 已落到代码里的调整

1. `abo/tools/xhs_crawler.py`
   - `dedicated_window_mode=True` 时会通过 `scripts/xhs/open_current_edge_window.sh` 在当前 Edge 中打开独立 XHS 窗口。
   - 专辑列表读取继续走真实页面路径：发现页 -> 我 -> 收藏 -> 专辑。
   - 打开“我”主页时恢复为旧实现思路，优先点击真实 `a[href*="/user/profile/"]`，不再优先走新写的 profile URL 跳转分支。
   - 专辑抓取阶段在 dedicated 模式下优先直接进入 `board_url`，不再从专辑列表页点卡片，避免把共享 tab 的首次激活时序带进独立窗口。
   - `_fetch_board_notes(...)` 在 dedicated 模式下不再回退到 headless Playwright，避免 `net::ERR_CONNECTION_CLOSED`；扩展失败后只交给 CDP 兜底，CDP 也失败则返回明确错误。
   - `target_total_notes_per_album` 会传入专辑列表加载阶段，避免专辑总数很大时过度滚动。

2. `extension/background.js`
   - `cmdNavigate()` / `cmdWaitForLoad()` 改用 `waitForTabReady()`，不只等 Chrome tab status complete，也接受页面 `document.readyState` 已经可交互的情况。
   - `get_url` 改为直接从 `chrome.tabs.get()` 读取 tab URL，避免后台窗口还没完成注入时卡死。
   - 仍保留原来的 `activate_tab`、`pulse_tab`、`get_tab_state`、`getOrOpenXhsTab` 作为 tab/window 操作核心。

3. 前台辅助逻辑
   - 默认仍然后台优先。
   - 如果独立窗口后台滚动连续无增长，会复用旧的 `activate_tab` / `pulse_tab` 做一次“前台辅助”。
   - 前台辅助后如果仍然不能加载，会抛出 `[browser_visibility]`，由上层进入 CDP 兜底或返回错误，不再无限等待。

### 13.2 本轮真实测试结果

1. 扩展 bridge 基础能力：

```bash
python3 scripts/xhs/test_extension_bridge.py --port 9334 --url https://www.xiaohongshu.com/explore
```

结果：成功读取 `window.__INITIAL_STATE__` 和页面文本。

2. 专辑列表读取：

```python
await list_xhs_album_previews(
    use_extension=True,
    extension_port=9334,
    dedicated_window_mode=True,
    allow_cdp_fallback=False,
)
```

结果：成功读取 27 个专辑。

3. 大专辑滚动读取：

```python
await _fetch_board_notes_via_extension(
    "6543e6ef000000002802ad53",
    "https://www.xiaohongshu.com/board/6543e6ef000000002802ad53?source=web_user_page",
    expected_total=200,
    extension_port=9334,
    dedicated_window_mode=True,
)
```

结果：在 Edge 可见/前台状态下成功从 35 增长到 229，超过 200 条目标。

4. ABO 脚本入口：

```bash
python3 scripts/xhs/fill_album_target.py \
  --board-id 6543e6ef000000002802ad53 \
  --target-total 200 \
  --extension-port 9334 \
  --dedicated-window \
  --max-loaded-notes 3 \
  --crawl-delay-seconds 0 \
  --batch-size 0 \
  --batch-pause-seconds 0
```

结果：

- 专辑列表阶段成功，识别到 `sth useful` 专辑和本地进度。
- 旧问题“进程无输出挂住”已消除。
- 当 Edge 独立窗口不在前台时，页面可能只加载首屏 35 条且 `scroll_height` 只有约 776；前台辅助后仍可能被浏览器可见性限制卡住。
- 代码现在会识别这种情况并停止扩展链路，而不是无限滚动。

### 13.3 当前结论

1. 插件和真实浏览器路线是可用的，已验证能稳定读专辑列表，也能在窗口可见时把大专辑加载到 200+。
2. “完全后台且不让 Edge 独立窗口可见”不是稳定前提；Edge/Chromium 会对后台窗口滚动和页面渲染做节流。
3. 当前主流程因此调整为：
   - 后台优先
   - 卡住后只做一次前台辅助
   - 仍不行就停止扩展链路并交给 CDP 兜底
   - CDP 也不行就返回明确错误，不继续撞风控

## 14. 取消分页期自动抢前台

本轮根据实际使用反馈继续收敛：分页过程中 Edge 独立窗口时不时跳到前台，会影响其他应用；同时失败后又重新获取专辑、重新打开浏览器，造成流程看起来像“从头再来”。

### 14.1 原因

1. 分页时跳前台的直接原因
   - `abo/tools/xhs_crawler.py` 里之前加入了 `enable_foreground_assist()`。
   - 当后台滚动连续无增长时，它会调用扩展的：
     - `activate_tab`
     - `pulse_tab`
   - 这两个命令本质上就是把 XHS tab / Edge window 激活到前台，再做一次切走切回。
   - 所以它能提高加载概率，但代价就是会抢用户当前应用前台。

2. 中断后又重新获取专辑/打开浏览器的直接原因
   - `scripts/xhs/fill_album_target.py` 即使传了 `--board-id`，也会先调用 `list_xhs_album_previews(...)`。
   - 这个函数会走“发现 -> 我 -> 收藏 -> 专辑”的专辑列表读取流程，并会触发 `open_current_edge_window.sh`。
   - 所以重跑一个已知 board_id 的任务时，也会重新获取专辑并重新开/定位浏览器窗口。

3. 爬取不完整的核心原因
   - Edge/Chromium 对完全后台窗口有可见性/渲染节流。
   - 实测同一个专辑：
     - Edge 可见时可从 35 继续增长到 229。
     - Edge 完全后台时可能只停在首屏 35，`scroll_height` 约 776，后续滚动不会触发真实加载。
   - 这不是专辑解析器只能读 35 条，而是浏览器后台状态下页面没有继续渲染/加载瀑布流。

### 14.2 本轮代码调整

1. 默认取消分页期前台辅助
   - `_fetch_board_notes_via_extension(...)` 新增 `allow_foreground_assist: bool = False`。
   - `_fetch_board_notes(...)` 调用时固定传 `allow_foreground_assist=False`。
   - 后台滚动连续无增长时，现在直接抛出：
     - `[browser_visibility] 独立窗口后台滚动连续无增长...`
   - 上层随后走 CDP 兜底或返回明确错误，不再偷偷激活 Edge。

2. 抓具体专辑时不再自动重开独立窗口
   - `_fetch_board_notes_via_extension(...)` 中移除了 `_maybe_open_dedicated_edge_window(...)`。
   - 独立窗口只在专辑列表读取阶段需要时打开。
   - 已经进入抓取阶段后，默认复用扩展当前绑定的 XHS 窗口/标签。

3. `fill_album_target.py` 传 `--board-id` 时跳过专辑列表读取
   - 现在会直接构造：
     - `board_id`
     - `url`
     - `name`
     - `count`
   - 不再先进入收藏页重新获取全部专辑。
   - 新增参数：
     - `--board-url`
     - `--album-name`

### 14.3 当前行为

现在的策略是：

1. 第一次需要专辑列表时，可以打开当前 Edge 的独立窗口。
2. 已知 `board_id` 的补抓任务，不再重新获取专辑列表。
3. 分页过程中不会再主动把 Edge 拉到前台。
4. 如果浏览器后台节流导致无法继续加载，会返回明确的 `[browser_visibility]` 错误。
5. 如果 CDP 兜底也不行，则停止任务，不继续重复打开浏览器或撞风控。

## 15. 专用窗口绑定，避免切到其他 Edge 窗口后错乱

继续根据实际使用反馈修正：用户在爬取时切换到其他 Edge 窗口后，后台 XHS 窗口有时会被切出来，或者任务重新打开一个新窗口继续爬。

### 15.1 原因

1. 扩展原来的 `getOrOpenXhsTab()` 是“找一个当前可用 XHS tab”
   - 它会优先看当前聚焦窗口里的 XHS tab。
   - 如果用户切换到另一个 Edge 窗口，扩展可能把“用户正在看的 Edge 窗口”误当成自动化目标。
   - 这会造成爬虫目标漂移，看起来像后台窗口突然被切出来。

2. 原来的独立窗口是 Python 通过 AppleScript 打开的
   - `open_current_edge_window.sh` 需要 `tell application "Microsoft Edge" activate` 才能新建窗口。
   - 这个动作天然会短暂抢前台。
   - 如果专辑阶段再次调用开窗逻辑，就会出现“重新打开新窗口爬取”的感觉。

3. 浏览器后台节流仍然存在
   - 完全后台窗口滚动不一定持续触发瀑布流加载。
   - 但为了解决这个问题而自动 `activate_tab/pulse_tab` 会影响用户工作。
   - 因此默认不能用“自动切前台”作为隐藏补救。

### 15.2 本轮修正

1. `extension/background.js`
   - 新增 `dedicatedXhsTabId` / `dedicatedXhsWindowId`。
   - 新增命令 `ensure_dedicated_xhs_tab`。
   - 该命令由扩展自己创建或复用 XHS 专用 tab/window，并用 `focused: false` 尽量避免抢前台。
   - `getOrOpenXhsTab()` 现在优先使用 dedicated tab。
   - `tabs.onActivated` 在 dedicated tab 已存在时，不再因为用户点击其他 Edge/XHS tab 而覆盖自动化目标。

2. `abo/tools/xhs_crawler.py`
   - 专辑列表阶段和专辑抓取阶段优先调用 `ensure_dedicated_xhs_tab`。
   - 移除了 Python 对 `open_current_edge_window.sh` 的自动调用。
   - `open_current_edge_window.sh` 仍保留为人工/调试辅助脚本，但不再是主抓取链路默认开窗方式。
   - 分页阶段仍默认关闭 `allow_foreground_assist`，不会主动 `activate_tab/pulse_tab`。

### 15.3 当前注意事项

这次改了扩展 service worker 文件，所以需要让 Edge 里的开发者扩展重新加载一次：

1. 打开 `edge://extensions`
2. 找到 `/Users/huanc/Desktop/ABO/extension`
3. 点刷新/重新加载

如果不重新加载，当前浏览器里的旧扩展不会认识 `ensure_dedicated_xhs_tab`，测试会返回：

```text
未知 DOM 命令: ensure_dedicated_xhs_tab
```

重新加载后，后端会通过扩展绑定固定的 XHS 专用窗口，用户再切换到其他 Edge 窗口时，不应再把爬虫目标漂移到当前窗口，也不应反复重新打开新窗口。

### 15.4 重新加载后的补强

用户重新加载扩展后，已验证新命令生效：

```json
{
  "ensure": {
    "tabId": 845056699,
    "windowId": 845056698,
    "url": "https://www.xiaohongshu.com/explore",
    "reused": true
  },
  "tab_state": {
    "dedicatedTabId": 845056699,
    "dedicatedWindowId": 845056698
  }
}
```

随后继续补强一层：

1. `extension/manifest.json`
   - 新增 `storage` 权限。

2. `extension/background.js`
   - 新增 `DEDICATED_STORAGE_KEY = "xhsBridgeDedicatedTarget"`。
   - `rememberDedicatedXhsTab(tab)` 会把 `tabId/windowId/url/updatedAt` 写入 `chrome.storage.local`。
   - `getDedicatedXhsTab()` 会先 `restoreDedicatedTargetFromStorage()`，service worker 重启后也能恢复原专用 tab。
   - 如果原 tab 被关闭或跳出 XHS 域名，会清理 storage。
   - `ensure_dedicated_xhs_tab` 寻找可复用 XHS tab 时会避开当前 focused window，降低误绑定用户当前 Edge 窗口的概率。

因为这次改了 `manifest.json` 权限，仍需要再重新加载一次 Edge 扩展，新的 `storage` 权限和持久化逻辑才会生效。

## 16. 抓取失败后不再自动重新读取专辑

本轮继续修正一个前端入口问题：专辑抓取失败或部分失败时，不应该重新读取专辑列表。

### 16.1 原因

前端 `src/modules/xiaohongshu/XiaohongshuTool.tsx` 原逻辑是：

```ts
if (progress.status === "completed") {
  ...
  await handleFetchAlbums();
}
```

后端的专辑抓取任务即使某个专辑失败，也可能返回 `status: "completed"`，并在 `result.failed` 里记录失败数量。于是前端会在“完成但包含失败”的情况下继续调用 `handleFetchAlbums()`，重新进入专辑列表读取流程。

这个行为会造成：

1. 抓取失败后又进入“发现 -> 我 -> 收藏 -> 专辑”
2. 重新触发扩展窗口/专辑页导航
3. 用户看起来像任务失败后又重新打开浏览器重新爬

### 16.2 当前修正

已修改 `src/modules/xiaohongshu/XiaohongshuTool.tsx`：

1. 专辑抓取 `completed` 后不再自动调用 `handleFetchAlbums()`。
2. 如果 `progress.result.failed > 0`，toast 显示“抓取结束，失败 N 条；已保留当前专辑列表”。
3. 如果全部成功，toast 显示“抓取完成；已保留当前专辑列表”。

验证：

```bash
npm run build
```

结果通过。

当前行为：

- 获取专辑只在用户点击“获取收藏专辑”时发生。
- 抓取专辑失败、部分失败、完成后，都不会自动重新读取专辑。
- 当前 UI 中已经加载的专辑列表会保留。

## 17. 后台窗口连续 6 次无新增后停止翻页

本轮按实际观察调整翻页策略：如果 XHS 页面只露出一点点可见区域就能继续加载，完全后台就不加载，这是 macOS + Edge/Chromium 的页面可见性和后台节流共同造成的现象。

### 17.1 为什么像是必须前台

这不是小红书爬虫代码“只能前台操作”，而是浏览器本身会对后台窗口做优化：

1. 完全不可见的窗口可能降低渲染帧率、暂停部分滚动触发逻辑。
2. 瀑布流列表依赖可视区域、IntersectionObserver、滚动事件和布局计算。
3. 当窗口完全在后台或被其他窗口完全遮挡时，页面有时不会继续触发“接近底部 -> 加载下一页”。
4. 露出一点页面后，浏览器认为页面仍在可见/可渲染状态，滚动和瀑布流加载更容易继续触发。

所以现象上会表现为：

- 页面露出一点：能继续翻页加载。
- 完全后台：可能停在首屏或某一页，不再新增笔记。

### 17.2 当前策略

为了不影响用户使用其他应用，当前不再自动把 Edge 拉到前台。

代码位置：

- `abo/tools/xhs_crawler.py`
- `_fetch_board_notes_via_extension(...)`

当前逻辑：

1. 后台优先滚动。
2. 每轮滚动后读取当前已加载笔记。
3. 只要有新增，`no_growth_rounds` 清零。
4. 如果连续 6 轮翻页都没有新增笔记：
   - 停止继续翻页。
   - 不报错。
   - 不重新读取专辑。
   - 不重新打开浏览器窗口。
   - 直接用当前已经加载到的笔记列表进入详情抓取。

核心行为：

```python
if no_growth_rounds >= 6 or hard_stall_rounds >= 6:
    report(
        "连续翻页无新增，停止翻页并开始抓取已加载笔记",
        pages_loaded=round_index,
        total_notes=len(seen),
        expected_total=expected_total,
        no_growth_rounds=no_growth_rounds,
        hard_stall_rounds=hard_stall_rounds,
    )
    break
```

### 17.3 结果

这会牺牲“完全后台时一定加载完整”的目标，但换来更稳定的用户体验：

1. 不抢前台。
2. 不无限滚动。
3. 不重新获取专辑。
4. 不重新开窗口。
5. 当前加载了多少笔记，就先抓取多少笔记。

如果需要尽量加载完整，当前最稳的人工辅助方式是让 XHS 独立窗口露出一点可见区域，而不是让程序自动切前台。

## 18. 修正无新增不停止与增量全跳过

本轮继续修正两个实际问题：

1. 翻页 20 多次新笔记数不增加，但没有停下来。
2. 开始抓取笔记后全部显示跳过。

### 18.1 无新增不停止的原因

旧逻辑里只有一个 `no_growth_rounds` 计数。页面上如果出现“加载中 / 查看更多 / 展开更多”等文案，代码会把 `no_growth_rounds` 往回减：

```python
if (after_retry_status.get("loading_texts") or []) and no_growth_rounds > 0:
    no_growth_rounds -= 1
```

这会导致实际已经连续很多轮没有新增，但计数一直被加载文案抵消，达不到 6，所以不会停。

### 18.2 当前修正

新增独立计数：

```python
consecutive_no_new_pages
```

这个计数只看“本轮是否新增笔记”，不再被页面加载文案抵消。

当前行为：

1. 有新笔记：`consecutive_no_new_pages = 0`
2. 无新笔记：`consecutive_no_new_pages += 1`
3. 连续 6 次无新增：停止翻页，开始抓取已加载笔记

### 18.3 全部跳过的原因

增量模式下，旧逻辑是：

1. 先取前 N 条：
   ```python
   notes_to_process = notes[:max_notes_per_album]
   ```
2. 再判断这些笔记是否已经在本地 `seen_note_ids` 中。

如果前 N 条刚好都是以前抓过的，就会全部跳过；即使后面还有未抓的新笔记，也因为已经被截断而不会处理。

### 18.4 当前修正

增量模式现在改为：

1. 先从全部已加载笔记中过滤掉 `seen_note_ids`
2. 再按 `max_notes_per_album` 截取

核心逻辑：

```python
if mode == "incremental":
    candidate_notes = [
        item
        for item in notes
        if note_id and note_id not in seen_ids
    ]

notes_to_process = candidate_notes[:max_notes_per_album]
```

并新增进度：

```text
已过滤已抓笔记
```

会显示：

- `loaded_notes`
- `skipped_existing`
- `remaining_notes`

这样增量模式不会因为前面几条已抓过而把后面的新笔记全部漏掉。

## 19. 扩展 bridge 作为统一优先数据通道

本轮把小红书数据获取进一步统一到插件优先路线，参考
`/Users/huanc/Desktop/local_viz/开源项目/xiaohongshu-skills` 的实现方法：

```text
ABO 后端/CLI -> 本地 WebSocket bridge server -> Edge 扩展 -> 真实浏览器 tab -> MAIN world 读页面状态 / 必要时交互
```

核心原则：

1. 复用真实 Edge 登录态和真实页面运行环境。
2. Python 不直接模拟浏览器窗口，不直接抢前台。
3. 扩展通过 `chrome.scripting.executeScript(..., world: "MAIN")` 在页面主 world 执行脚本。
4. 优先读取页面已经渲染出的状态对象，而不是直接打小红书接口。
5. 交互循环采用“观察状态 -> 决定动作 -> 执行动作 -> 再观察”。

### 19.1 扩展侧新增状态能力

文件：

- `extension/background.js`

新增命令：

```js
case "get_xhs_page_snapshot":
case "wait_for_xhs_state":
```

这两个命令都走 MAIN world，能够读取页面内状态路径：

```js
window.__INITIAL_STATE__.feed.feeds
window.__INITIAL_STATE__.search.feeds
window.__INITIAL_STATE__.note.noteDetailMap
window.__INITIAL_STATE__.board.boardFeedsMap[boardId].notes
```

同时会识别常见异常页面：

- 扫码验证
- 未登录
- 访问频繁
- 安全限制
- 300031 / 页面不可浏览
- 笔记不存在或已删除

识别后返回 `risk`，后端会停止任务，不继续硬爬。

### 19.2 后端统一等待页面状态

文件：

- `abo/tools/xhs_crawler.py`

新增统一 helper：

```python
async def _wait_xhs_state_via_bridge(
    bridge,
    *,
    kind: str,
    note_id: str = "",
    board_id: str = "",
    timeout_ms: int = 15000,
    interval_ms: int = 500,
):
    snapshot = await bridge.call(
        "wait_for_xhs_state",
        {
            "kind": kind,
            "noteId": note_id,
            "boardId": board_id,
            "timeout": timeout_ms,
            "interval": interval_ms,
        },
    )
    _raise_for_xhs_snapshot(snapshot)
    return snapshot
```

使用点：

1. 单条详情：进入 note 页后先等 `note.noteDetailMap`。
2. 专辑页：进入 board 页后先等 `board.boardFeedsMap[boardId].notes`。
3. 页面滚动：每次滚动后再次读取当前页面状态，确认新增数量。

### 19.3 单条/批量详情也改为专用窗口扩展路径

文件：

- `abo/tools/xhs_crawler.py`
- `abo/routes/tools.py`
- `src/api/xiaohongshu.ts`
- `src/modules/xiaohongshu/XiaohongshuTool.tsx`

之前专辑列表加载使用扩展，但详情抓取仍可能走旧路径或普通导航。现在：

```python
state = await _fetch_state_via_extension(
    normalized_url,
    extension_port,
    dedicated_window_mode=dedicated_window_mode,
)
```

专辑抓取进入每条笔记详情时也继续传递：

```python
dedicated_window_mode=dedicated_window_mode
```

因此专辑列表、笔记详情、单条入库、批量入库都可以复用同一个“真实 Edge + 扩展 bridge + 专用窗口”路径。

### 19.4 搜索与关注流改为扩展优先

文件：

- `abo/tools/xiaohongshu.py`

新增：

```python
async def _extract_cards_via_extension(...):
    async with XHSExtensionBridge(port=extension_port) as bridge:
        await bridge.wait_until_ready()
        await bridge.call("ensure_dedicated_xhs_tab", {"url": url})
        await bridge.call("wait_for_xhs_state", {"kind": "search"})
        page_cards = await bridge.call("evaluate", {"expression": js})
        await bridge.call("scroll_by", {"x": 0, "y": 850})
```

搜索和关注流现在优先走：

```python
notes = await self._extract_cards_via_extension(...)
```

如果扩展不可用，再回退旧的 Playwright/headless 方案。

但如果扩展已经识别到风控、扫码、登录失效、页面不可访问等停止类错误，则不回退，不继续请求，直接停止任务。

### 19.5 评论读取改为详情页状态优先

文件：

- `abo/tools/xiaohongshu.py`

评论入口现在先通过扩展打开详情页并读取 MAIN world 状态：

```python
state = await _fetch_state_via_extension(
    target_url,
    port=extension_port,
    dedicated_window_mode=dedicated_window_mode,
)
comments = api._extract_comments_from_state(state)
```

如果页面状态里没有评论，再回退旧的 HTML 请求方案。

同样，如果扩展返回的是风控/扫码/登录失效类错误，则不会回退旧请求，避免在异常状态下继续撞平台限制。

注意：评论区完整展开仍属于后续可迭代项。当前先把“详情页可见状态中的评论”接入 bridge，不再优先直接打接口。

### 19.6 前端调用参数

现在这些入口都会传：

```ts
use_extension: true,
extension_port: albumExtensionPort,
dedicated_window_mode: albumDedicatedWindowMode,
```

覆盖范围：

- 搜索
- 关注流
- 评论
- 单条入库
- 批量入库
- 获取收藏专辑
- 抓取收藏专辑

### 19.7 当前不可完全规避的限制

macOS + Edge/Chromium 对完全后台或完全遮挡窗口会做渲染与事件节流。小红书瀑布流依赖可视区域、滚动事件、布局计算和 `IntersectionObserver`，所以：

```text
因系统限制，小红书窗口不能被完全遮挡，须漏出一点才可滚动爬取。
```

当前代码避免主动把窗口切到前台，但无法强制 Chromium 在完全不可见窗口里稳定触发页面懒加载。

### 19.8 需要重新加载扩展

本轮修改了 `extension/background.js`，并新增/使用了 `chrome.storage.local` 持久化专用 XHS tab 绑定。

测试前需要在 Edge 扩展页重新加载：

```text
edge://extensions
```

重新加载 `/Users/huanc/Desktop/ABO/extension` 后，再从 ABO 发起小红书任务。

## 20. 当前“具体内容抓取”是否通过插件

结论先写清楚：

```text
是，当前小红书“具体内容抓取”主链路已经是插件优先。
```

但不是“只剩插件一种实现”。当前实际策略是：

```text
扩展 bridge 优先 -> CDP 兜底 -> 后端 HTML / 旧请求兜底
```

其中：

1. 单条笔记详情：扩展优先
2. 专辑内每条详情：扩展优先
3. 搜索结果卡片：扩展优先
4. 关注流卡片：扩展优先
5. 评论读取：详情页扩展状态优先

只有在扩展不可用、页面状态缺失、且错误不属于“必须停止”的情况下，才会回退。

### 20.1 单条/专辑详情的真实链路

文件：

- `abo/tools/xhs_crawler.py`
- `extension/background.js`

入口：

```python
async def crawl_xhs_note_to_vault(...)
```

当前实际执行顺序：

1. 后端进入 `crawl_xhs_note_to_vault(...)`
2. 若 `use_extension=True`，先调用：

```python
state = await _fetch_state_via_extension(
    normalized_url,
    extension_port,
    dedicated_window_mode=dedicated_window_mode,
)
```

3. `_fetch_state_via_extension(...)` 内部会：
   - 启动本地 `XHSExtensionBridge`
   - 等浏览器扩展连回本地 WebSocket
   - 若是独立窗口模式，则先执行：

```python
bridge.call("ensure_dedicated_xhs_tab", {"url": url})
```

4. 页面准备阶段会依次做：

```python
bridge.call("wait_dom_stable", ...)
_wait_xhs_state_via_bridge(kind="note", note_id=note_id)
```

5. 然后在页面主 world 读取：

```python
window.__INITIAL_STATE__.note.noteDetailMap
```

对应代码：

```python
bridge.call("evaluate", {"expression": _build_extension_note_expression(note_id)})
```

6. 如果 `noteDetailMap` 不完整，再补一层 DOM 提取：

```python
bridge.call("evaluate", {"expression": _build_extension_dom_note_expression(note_id)})
```

这层会从当前详情页 DOM 里补：

- 标题
- 正文
- 作者
- 点赞/收藏/评论/分享
- 标签
- 图片
- 视频
- IP 属地

7. 如果扩展链路失败，再按顺序兜底：

```text
CDP -> 后端 HTML Initial State
```

### 20.2 专辑列表到专辑详情的链路

文件：

- `abo/tools/xhs_crawler.py`

专辑抓取分两段：

1. 先抓专辑页里的 note 列表
2. 再逐条抓详情

专辑列表页当前主链路也是扩展：

```python
notes = await _fetch_board_notes_via_extension(...)
```

内部关键步骤：

1. 独立窗口模式先绑定/创建专用窗口：

```python
ensure_dedicated_xhs_tab
```

2. 导航到：

```text
https://www.xiaohongshu.com/board/{board_id}?source=web_user_page
```

3. 等待页面主 world 中的专辑状态：

```python
_wait_xhs_state_via_bridge(kind="board", board_id=board_id)
```

对应状态路径：

```js
window.__INITIAL_STATE__.board.boardFeedsMap[boardId].notes
```

4. 进入滚动循环：
   - 观察当前已加载笔记数
   - 执行滚动
   - 再读页面状态
   - 若无新增则累计无增长计数

5. 当前停止条件已调整为：

```text
连续 3 次无新增，就停止翻页并开始抓已加载详情
```

这里不再依赖 `expected_total` 决定何时停。

### 20.3 搜索/关注流/评论的链路

文件：

- `abo/tools/xiaohongshu.py`

#### 搜索与关注流

搜索和关注流现在优先走：

```python
async def _extract_cards_via_extension(...)
```

步骤：

1. 扩展打开真实页面
2. 等待 `search.feeds` / `feed.feeds` 状态就绪
3. 在 MAIN world 里同时遍历状态树和 DOM 卡片
4. 从状态里拿：
   - `noteId`
   - `xsec_token`
5. 从 DOM 卡片拿：
   - 标题
   - 文本
   - 图片
   - 链接
6. 组合成卡片结果

这一步不是纯 DOM，也不是纯状态，而是“状态补 token，DOM 补卡片可见信息”。

#### 评论

评论目前不是直接打评论接口优先，而是：

1. 先用扩展进入真实详情页
2. 用详情页状态和页面可见内容提取评论
3. 如果没拿到，再回退旧 HTML 请求

注意：评论区“展开回复 / 无限加载 / 状态机控制循环”还没有完全迁移到 skill 的那套强状态机版本。当前只做了“详情页已有状态优先”。

## 21. 和 xhs skill 的 bridge 逻辑相比

参考对象：

- `/Users/huanc/Desktop/local_viz/开源项目/xiaohongshu-skills/scripts/xhs/bridge.py`
- `/Users/huanc/Desktop/local_viz/开源项目/xiaohongshu-skills/extension/background.js`

### 21.1 已经对齐的部分

当前 ABO 的主方法论已经和你给的 xhs skill 很接近，核心一致点有这些：

1. 都是这条链路：

```text
Python -> 本地 bridge -> 浏览器扩展 -> 当前真实浏览器页面 -> MAIN world 读状态 / 必要时交互
```

2. 都强调：

```text
优先读页面已经渲染好的状态对象，而不是优先打接口
```

3. 都在扩展里使用：

```js
chrome.scripting.executeScript(..., world: "MAIN")
```

4. 都把“导航、等待、点击、滚动、输入、再读取状态”作为通用能力，而不是把抓取写死成单一步骤。

5. 都能在真实浏览器和真实登录态上运行，不要求额外伪装一个新浏览器。

### 21.2 ABO 相比 skill 现在多做的部分

ABO 现在在工程化上比那份 skill 多了一些集成层：

1. 集成到 ABO 路由和前端 UI，而不是独立 CLI。
2. 增加了专用 Edge 独立窗口模式。
3. 增加了专用窗口持久绑定和恢复逻辑。
4. 增加了风险页识别后停止任务，而不是继续试。
5. 增加了多级兜底：

```text
extension -> CDP -> 后端 HTML
```

6. 专辑抓取有独立的“滚动加载 -> 列表入库 -> 逐条详情”流程。

### 21.3 还没有完全对齐的地方

虽然主框架已经很像，但还没有 100% 完全等同于你给的那份 skill，主要差异在这里：

1. `xiaohongshu-skills` 里 bridge/page 抽象更纯，很多脚本是围绕一个 `BridgePage` 接口来写的。
   ABO 现在是把这层能力直接散落集成到：
   - `xhs_crawler.py`
   - `xiaohongshu.py`
   - `extension/background.js`

2. `xiaohongshu-skills` 对评论区更强调：

```text
观察状态 -> 决定动作 -> 执行动作 -> 再观察
```

这套状态机式的评论展开逻辑，ABO 目前只对专辑滚动和详情等待做了类似思路，评论区本身还没完全迁移到同等强度。

3. `xiaohongshu-skills` 里 `bridge_server.py`、`bridge.py`、业务脚本分层更明确。
   ABO 现在是应用内集成版，结构上更偏“业务直接调用本地 bridge server 类”，不完全照搬原项目的模块边界。

4. 当前 ABO 仍保留较多历史兜底分支，这让兼容性更强，但也比 skill 那份“bridge-first”实现更复杂。

### 21.4 当前准确结论

所以现在最准确的描述是：

```text
ABO 当前的小红书抓取主链路，已经是“和 xhs skill bridge 方案高度一致的插件优先实现”；
但在评论状态机、模块边界、以及兜底层数量上，还没有做到与 skill 完全同构。
```

## 22. 最近两条行为修正

### 22.1 专辑翻页停止阈值

当前专辑页已改为：

```text
连续 3 次无新增，停止翻页
```

而不是继续按照更长阈值等待。

### 22.2 从未抓过的专辑，增量自动转全量

当前逻辑：

```text
如果全局模式是 incremental，但该专辑本地 seen_note_ids 为空，
则这个专辑自动切换为 full。
```

原因：

```text
“从没抓过”的专辑如果还走增量过滤，容易出现已抓 0 条却整张专辑都没处理的异常体验。
```

## 23. 评论状态机已迁入 ABO

这轮已经把之前文档里提到的缺口补上：

```text
评论区那种“观察 -> 动作 -> 再观察”的状态机，现在已经真正迁到 ABO 里了。
```

文件：

- `abo/tools/xiaohongshu.py`
- `abo/tools/xhs_crawler.py`
- `abo/routes/tools.py`
- `src/api/xiaohongshu.ts`
- `src/modules/xiaohongshu/XiaohongshuTool.tsx`

### 23.1 当前评论抓取主链路

当前评论接口优先走：

```text
真实 Edge 页面 -> 插件 bridge -> 评论状态机 -> 状态/DOM 混合提取
```

入口：

```python
xiaohongshu_fetch_comments(...)
```

内部优先调用：

```python
api._fetch_comments_via_extension(...)
```

### 23.2 状态机逻辑

评论状态机不是一次性 evaluate，而是循环：

```text
观察当前评论区状态
-> 决定是否展开更多回复
-> 决定是否滚动到最后一条评论
-> 执行人类化滚动
-> 再观察评论数量和滚动位置
```

当前会观察这些状态：

- 是否存在评论容器 `.comments-container`
- 当前 DOM 已加载评论数
- “共 N 条评论”总数
- 是否无评论
- 是否出现 `THE END`
- 是否在底部
- 当前滚动位置
- 当前可见“展开 N 条回复”按钮数

对应实现：

```python
_build_extension_comment_status_expression()
_fetch_comment_status_via_extension(...)
```

### 23.3 当前动作集合

状态机会执行这些动作：

1. 滚动到评论区：

```python
_scroll_to_comments_area_via_extension(...)
```

2. 点击“展开 N 条回复”：

```python
_click_show_more_buttons_via_extension(...)
```

并支持：

- 每轮点击上限
- 回复数阈值过滤

3. 滚动到最后一条评论：

```python
_scroll_to_last_comment_via_extension(...)
```

4. 人类化滚动：

```python
_human_scroll_comments_via_extension(...)
```

### 23.4 当前终止条件

评论状态机当前会在这些条件下停止：

1. 检测到 `THE END`
2. 达到请求的 `max_comments`
3. 连续 3 次无新增评论
4. 检测到无评论
5. 页面进入风控 / 扫码 / 登录失效 / 不可访问页

### 23.5 评论提取方式

最终评论结果不是只信一种来源，而是：

```text
页面状态提取 + DOM 评论提取 -> 去重合并
```

状态来源：

```python
_build_extension_comment_state_expression(note_id)
_extract_comments_from_state(...)
```

DOM 来源：

```python
_build_extension_comment_dom_extract_expression(limit)
_extract_comments_from_dom_records(...)
```

然后统一：

```python
_dedupe_comments(...)
```

### 23.6 入库链路也接上评论状态机

之前 `crawl_xhs_note_to_vault(...)` 即使勾选了评论，也只是写占位文案，没有真正抓评论正文。

这一轮已经改成：

```python
if include_comments:
    comments_result = await xiaohongshu_fetch_comments(...)
    note.comments = comments_result["comments"]
```

也就是说：

- 单条入库
- 批量入库
- 专辑内逐条详情入库

只要开启评论抓取，都会走插件评论状态机优先。

Markdown 里的评论区也不再固定写“当前未抓到评论正文”，而是会写实际评论内容。

### 23.7 和 xhs skill 的对齐程度更新

之前文档里说：

```text
评论区完整“观察 -> 动作 -> 再观察”状态机还没完全迁过去
```

现在这条可以更新为：

```text
评论抓取主链路已经迁成插件状态机版本，并且入库链路已经复用这套状态机。
```

当前仍然保留的差异只剩这些：

1. ABO 还保留 HTML / CDP fallback，而 skill 更纯 bridge-first。
2. ABO 的评论状态机是应用内集成版，不是完全复刻 skill 的 `BridgePage` 分层。
3. 一些发评论 / 回复评论的交互接口，ABO 还没完整迁进来。

### 23.8 当前准确结论

所以现在更准确的说法是：

```text
ABO 当前的小红书抓取，在“详情、搜索、关注流、评论、专辑列表、专辑详情入库”这些主链路上，已经全面实现了插件优先；
未命中插件的分支只作为兜底，不再是主实现。
```

## 24. 插件抓取间隔与默认策略调整

### 24.1 90s 是什么，为什么偏长

之前界面里的 `90s` 不是“插件每一步操作都等 90 秒”，而是：

```text
专辑抓取低频模式下，每抓完一批笔记后的 batch pause
```

也就是批次冷却，不是页面内滚动 / 点击 / 读取状态的动作间隔。

参考 `xiaohongshu-skills` 的 bridge 实现后，可以更明确地分成两层节奏：

1. 页面内动作：
   - `wait_for_load`
   - `wait_dom_stable`
   - 小步滚动 / wheel / 点击展开
   - 观察 state 是否增长

这一层应保持秒级，通常是：

```text
0.3s - 2.5s
```

2. 跨笔记冷却：
   - 抓完一条详情后再抓下一条
   - 每抓完一小批后再进入下一批

这一层才需要更保守，但默认也不应该长到 `90s`。

### 24.2 这轮改动后的默认值

这轮已经把 ABO 默认节奏调整为更接近真实浏览器 + bridge 的用法：

1. 插件 bridge 默认端口统一为：

```text
9334
```

这样前端、后端、脚本默认值终于和 `extension/background.js` 一致，不会因为默认端口还停在 `9333` 而悄悄退回 CDP / HTML 兜底。

2. 专辑低频模式默认批间等待从：

```text
90s -> 30s
```

3. 低频模式默认单条间隔从偏慢的保守配置收紧为：

```text
14 - 24s 区间，默认目标值 18s
```

4. 实际执行时，单条间隔不再是“到 15s 就硬锁死最小值”的旧规则，而是按目标值生成更自然的随机窗口。

### 24.3 当前主链路是否已经是插件优先

现在答案是：

```text
是，当前主链路已经是插件优先。
```

具体顺序是：

1. 详情页：

```text
extension bridge -> CDP -> 后端 HTML/INITIAL_STATE
```

对应：

```python
crawl_xhs_note_to_vault(...)
  -> _fetch_state_via_extension(...)
  -> _fetch_state_via_cdp(...)
  -> _fetch_state_backend(...)
```

2. 评论：

```text
extension 评论状态机 -> 后端 comments fallback
```

3. 搜索 / 关注流：

```text
extension 读取 MAIN world state + DOM 卡片 -> playwright fallback
```

4. 专辑列表 / 专辑翻页：

```text
extension 真实浏览器读取 -> headless / CDP 兜底
```

所以现在不是“能不用插件就不用插件”，而是：

```text
优先插件，失败后才兜底。
```

## 25. 插件抓取具体内容与旧抓取方式对比

### 25.1 现在插件是怎么抓“具体内容”的

当前单条笔记详情的主链路是：

```text
ABO Python
-> XHSExtensionBridge
-> 本地 ws bridge（9334）
-> extension/background.js
-> chrome.scripting.executeScript(world: "MAIN")
-> 当前真实浏览器页面 window.__INITIAL_STATE__
```

在代码里，对应入口是：

```python
crawl_xhs_note_to_vault(...)
  -> _fetch_state_via_extension(...)
```

这条链路做的事情不是“伪造接口请求”，而是：

1. 尽量复用当前真实浏览器页面，或者专用 XHS 窗口；
2. 等页面稳定：

```python
wait_dom_stable(...)
wait_for_xhs_state(kind="note")
```

3. 在页面主 world 读取详情状态：

```javascript
window.__INITIAL_STATE__.note.noteDetailMap
```

4. 把取到的 `note` 对象还原成 ABO 内部结构。

具体字段主要来自：

- 标题：`note.title`
- 正文：`note.desc`
- 作者：`note.user.nickname / userId`
- 互动数据：`note.interactInfo`
- 标签：`note.tagList`
- 图片：`note.imageList`
- 视频：`note.video`
- Live 图动态片段：`imageList[].stream`

最后统一进入：

```python
_note_from_root(...)
```

转换成 ABO 自己的 `XHSCrawledNote`。

### 25.2 详情页 state 不完整时怎么补

插件链路不是只赌 `noteDetailMap` 一定完整。

如果扩展已经打开到详情页，但：

```text
window.__INITIAL_STATE__.note.noteDetailMap 不完整
```

当前实现会继续在页面 DOM 里补抓一次：

```python
_build_extension_dom_note_expression(...)
```

DOM fallback 会补这些内容：

- 标题
- 正文
- 作者
- 点赞 / 收藏 / 评论 / 分享数
- 页面里能看到的图片 URL
- video src
- 标签

也就是说当前插件主链路其实是：

```text
主 world state 优先 -> DOM fallback 补齐
```

而不是单点失败就直接整条失败。

### 25.3 评论具体内容怎么抓

评论正文当前也已经优先走插件，不再主要靠后端静态解析。

链路是：

```text
真实笔记页
-> 插件评论状态机
-> 观察评论区状态
-> 必要时展开回复 / 滚动 / 再观察
-> 最后从 state + DOM 合并评论
```

对应代码：

```python
xiaohongshu_fetch_comments(...)
  -> _fetch_comments_via_extension(...)
```

它不是简单“打开页面读一次 HTML”，而是会执行：

1. 滚到评论区
2. 识别是否无评论 / 是否到底
3. 必要时点击“展开 N 条回复”
4. 人类化滚动
5. 再取评论区状态
6. 最后合并：

```text
页面状态评论 + DOM 评论记录
```

所以评论正文比旧的纯 HTML 方案完整很多。

### 25.4 之前的抓取方式是什么

插件优先之前，或者插件失败后的旧链路，主要是两类：

#### 1. 后端直接请求详情页 HTML

链路：

```text
ABO 后端 httpx.get(detail_url, headers + cookie)
-> 从 HTML 里提取 window.__INITIAL_STATE__
-> extract_initial_state(...)
```

特点：

- 请求是从应用进程直接发出
- 只能拿到服务端返回的 HTML
- 如果页面被重定向、风控、返回异常页，就直接失败
- 评论正文通常拿不全

#### 2. CDP 新建 target 读页面 state

链路：

```text
ABO
-> Chrome DevTools Protocol
-> Target.createTarget(url)
-> Runtime.evaluate(window.__INITIAL_STATE__)
```

特点：

- 仍然是浏览器上下文
- 但往往是新 target / DevTools 控制页
- 对平台来说更像“自动化开新页再读状态”
- 仍然不是当前用户正在看的自然页面上下文

### 25.5 插件方式和旧方式的核心区别

可以直接概括成这四点：

#### 1. 数据来自哪里不同

插件方式：

```text
优先读取当前真实页面已经渲染好的前端状态
```

旧方式：

```text
要么重新请求 HTML，要么新开 CDP target 再 evaluate
```

#### 2. 是否额外制造请求不同

插件方式在“当前页已经打开”的情况下，很多时候只是：

```text
读取页面现成 state
```

不会再额外打一遍后端详情请求。

旧方式则更容易产生：

- 额外 HTML 请求
- 额外详情导航
- 额外 CDP target

#### 3. 页面上下文不同

插件方式运行在：

```text
真实浏览器 tab 的 MAIN world
```

旧方式则运行在：

- **后端 HTTP 请求上下文**
- **或 DevTools / CDP target 上下文**

这两者都比“真实用户正在使用的浏览器页面”更不像正常浏览行为。

#### 4. 评论加载能力不同

插件方式可以对评论区执行：

```text
观察 -> 动作 -> 再观察
```

旧方式大多只能：

```text
请求一次 -> 解析一次
```

对懒加载评论、展开回复这类页面行为支持明显更弱。

### 25.6 哪个更不容易触发反爬

从当前实现和我们这段时间的实测看，更不容易触发风控的顺序大致是：

```text
插件读取当前真实页面 state
< 插件打开真实详情页后读取 state
< CDP 新建 target 读取
< 后端直接请求 HTML
```

***这里“<”表示更不容易触发反爬。***

### 25.7 为什么插件方式更稳

主要原因不是“插件更强”，而是它更接近真实浏览行为：

#### 1. 复用真实浏览器登录态和指纹

插件跑在你已经登录的小红书浏览器里，直接复用：

- 当前 Cookie
- 当前浏览器环境
- 当前页面上下文
- 当前真实标签页

这比后端自己发请求更自然。

#### 2. 能直接读页面已经拿到的数据

很多场景下，小红书前端自己已经把详情数据放进了：

```javascript
window.__INITIAL_STATE__
```

插件只是在页面里读取它，不需要再额外打一遍网络请求。

“少一次请求”本身就更不容易撞到访问频率限制。

#### 3. 能优先读当前页，少跳转

当前插件链路会先看：

```text
当前 tab 是否已经在目标 note
```

如果已经在，就直接读取，不再多做一次 `navigate`。

这比旧方案里“每条都重新开页 / 重新请求”更稳。

#### 4. 能更早识别风险页并停下

插件在页面里会先看：

- 扫码验证
- 访问频繁
- 安全限制
- 登录失效
- 300031 / 不可浏览页

命中后直接停，不继续撞。

旧方式很多时候是“请求失败了再知道出问题”，更容易连续重试把情况变糟。

#### 5. 评论区可以用真实页面动作加载

评论正文不是强行伪造签名接口去拉，而是借助真实页面的滚动、展开、再观察去拿。

这比后端直接碰评论接口更符合平台预期。

### 25.8 需要注意的边界

插件优先并不等于完全不会触发风控。

它仍然会受到这些因素影响：

- 短时间内打开详情过多
- 连续翻页过快
- 页面进入扫码 / 访问频繁 / 安全限制
- macOS + Chromium 后台窗口节流

所以当前正确理解应该是：

```text
插件优先不是“绝对免风控”，而是当前最接近人类真实浏览、也最适合先尝试的主链路。
```

## 26. 2026-04-15 Plugin-First 收尾

这一轮主要收三件事：

1. 把还没完全收敛到插件优先的抓取链路继续往插件侧收。
2. 修掉“增量经常全跳过”的核心问题。
3. 把插件链路在前端返回与结果展示上组织得更清楚。

### 26.1 现在实际的抓取主链路

当前真正用于“抓具体内容”的主链路已经统一成：

```text
前端 / API
-> abo/tools/xhs_crawler.py
-> 本地 WebSocket bridge server
-> extension/background.js
-> 真实浏览器 tab 的 MAIN world
-> 读取页面 state / 必要时做少量页面动作
```

对应到功能上：

- 单帖详情：插件优先
- 批量入库：插件优先
- 专辑内笔记详情：插件优先
- 评论抓取：插件状态机优先
- 图片 / 视频 / Live 图资源定位：插件详情 state 优先

只有这些情况才继续走兜底：

- 插件 bridge 未连接
- 插件已连上，但页面没有返回完整 note state
- 页面进入扫码 / 访问频繁 / 安全限制等错误页后需要停止

兜底顺序仍保留为：

```text
插件 -> CDP -> 后端 HTML
```

但默认主路径已经不再是 CDP 或后端 HTML。

### 26.2 详情、媒体、评论现在分别怎么走

#### 1. 详情

`crawl_xhs_note_to_vault()` 现在先调用：

```python
_fetch_note_payload_via_extension(...)
```

其内部会：

1. 通过 bridge 进入目标 note 页
2. `wait_dom_stable`
3. `wait_for_xhs_state(kind=\"note\")`
4. 在 MAIN world 执行 `_build_extension_note_expression(note_id)`

读取优先级是：

```text
note.noteDetailMap
-> 页面 state tree 补抓
-> DOM 基础补抓
```

所以现在前端会明确拿到：

- `used_extension`
- `used_cdp`
- `detail_strategy`
- `media_strategy`
- `comment_strategy`

#### 2. 媒体

媒体相关现在不是先去后端猜 URL，而是优先从插件拿到的 note state 里解析：

- 图片：`imageList`
- 视频：`video` / `videoInfoV2`
- Live 图：`imageList[].stream`

也就是说：

```text
媒体“定位与提取”走插件
媒体“文件下载与落盘”走后端
```

这里要区分清楚。

后端下载图片 / 视频 / Live 图文件，不代表抓取逻辑退回旧方案。  
真正决定“拿什么资源、拿哪些 URL”的动作，已经改成插件优先。

#### 3. 评论

评论主链路继续向 xhs skill 的 bridge 思路靠拢，现在已经是：

```text
观察评论状态
-> 决定是否滚动 / 是否点“展开更多回复”
-> 执行动作
-> 再观察状态
-> 最后合并 state + DOM 结果
```

对应实现入口是：

```python
xiaohongshu_fetch_comments(...)
-> XiaohongshuAPI._fetch_comments_via_extension(...)
```

这一层现在已经是插件优先状态机，而不是单纯请求一次接口再解析。

另外这轮还修了一个实际问题：

- 评论 state 结果和 DOM 结果可能把同一条评论各带一份
- 之前按 `id` 去重不够，状态评论和 DOM 评论 `id` 不一样会重复

现在改成：

- `id` 去重
- `author + reply_to + content` 签名去重

这样评论列表不会再因为“同内容不同来源”被重复计数。

### 26.3 这次补上的扩展稳定性修复

这轮最关键的插件修复在：

- `extension/background.js`

之前 `waitForTabReady()` / `waitForTabComplete()` 对 URL 的判断过于严格，基本是：

```text
currentUrl.startsWith(expectedUrlPrefix)
```

这在小红书详情页和专辑页上不稳，因为：

- query 参数顺序会变
- `xsec_source` 可能变化
- 页面进入后 URL 可能被重写

结果就是：

- 页面其实已经到了
- 但 bridge 还在等
- 最后超时

现在改成了更宽松、但仍然有边界的匹配：

1. 先比去 hash 后完整 URL
2. 再比 `origin + pathname`
3. 对 note / search_result / board 这几类路径，再比路由身份
4. 最后才回退到字符串前缀匹配

对应 helper：

```javascript
urlMatchesExpectation(current, expected)
```

并且：

- `waitForTabReady()`
- `waitForTabComplete()`
- `cmdEnsureDedicatedXhsTab()`

都统一改成用这套判断。

这直接解决了一个已经实测到的真实问题：

```text
ensure_dedicated_xhs_tab 已经打开了目标 note，但后端还因为 URL 不完全相等而一直等待，最终超时。
```

### 26.4 增量抓取“全跳过”的根因与修复

这轮把增量误跳过拆成了两个主要根因：

#### 1. `seen_note_ids` 里有陈旧记录

以前专辑进度里只记：

```text
seen_note_ids
```

但不校验这些 note 对应的 Markdown 文件是否还存在。

结果就是：

- 本地文件已经没了
- 进度里还记得“抓过”
- 下一次增量就把这些 note 错误跳过

现在会先做：

```python
_resolve_album_seen_ids(progress, album_state)
```

只保留：

- 进度里有 note 记录
- 且 `file` 对应的 Markdown 还真实存在

不存在的会被 prune 掉，并发进度事件：

- `专辑进度已修正`

#### 2. 最近天数默认值过于隐蔽

之前前端增量默认把：

```text
recent_days = 180
```

静默带进去了。

如果用户没注意，就会出现：

- 很多旧笔记其实没抓过
- 但因为早于 180 天被直接过滤
- 看起来像“什么都没爬，全跳过了”

现在改成：

- 最近天数输入框默认空字符串
- 留空表示不限

所以：

```text
增量 = 先跳过本地真实仍存在的已抓笔记
而不是默认再加一层 180 天时间裁剪
```

#### 3. 当本地有效已抓数为 0 时，自动切到全量

如果专辑处于 `incremental` 模式，但经过校验后：

```text
valid_seen_ids = 0
```

当前实现会自动切成：

```text
album_mode = full
```

避免出现：

- 用户实际上没抓过
- 但因为脏进度或空进度导致增量逻辑不成立
- 最后整张专辑没有真正处理任何 note

#### 4. 过滤明细现在可见

专辑结果和进度里现在会明确给出：

- `raw_seen_count`
- `valid_seen_count`
- `pruned_seen_count`
- `candidate_notes`
- `processable_notes`
- `skip_breakdown`

所以再看到“跳过很多”时，可以直接分辨是：

- 已抓过
- 被时间范围过滤
- 被 before_date 过滤
- note 本身无效

### 26.5 前端这轮补充的组织方式

为了让“插件到底有没有真的被用上”更容易看，这轮前端又补了一层结果组织：

- 统一的 `xhsBridgeOptions`
- 统一的 `xhsCrawlFallbackOptions`
- `formatStrategyLabel(...)`
- `formatExecutionRoute(...)`

现在结果里会更明确区分：

- 执行路径：插件主链路 / CDP 兜底 / 后端 HTML 兜底
- 详情链路
- 媒体链路
- 评论链路

也就是说，前端不再只是告诉你“成功了/失败了”，还会告诉你：

```text
这次到底是不是插件拿到的
如果不是，掉到了哪一层
```

### 26.6 本轮真实测试结果

这一轮不是只做静态改动，还做了实际验证。

#### 1. bridge 基础连通

命令：

```bash
python3 scripts/xhs/test_extension_bridge.py --port 9334 --url https://www.xiaohongshu.com/explore
```

结果：

- bridge 连通
- MAIN world 可执行
- `window.__INITIAL_STATE__` 可读

#### 2. 专用窗口详情读取

实测 note：

```text
69dcdda800000000220290fa
```

结果：

- `used_extension = true`
- `detail_strategy = extension_note_detail_map`
- `media_strategy = plugin_state_urls`

说明专用窗口链路下，详情 state 已经能稳定拿到。

#### 3. 评论插件状态机

同一条 note 上实测：

- `strategy = extension_state_machine`
- 成功提取 5 条评论

并验证了去重修复后，不再出现“同一条评论 state 一份、DOM 一份”的重复结果。

#### 4. Live 图样本

实测 note：

```text
69d7037e000000001a035376
```

结果：

- `detail_strategy = extension_note_detail_map`
- `media_strategy = plugin_state_urls`
- 成功识别并落盘 1 条 Live 图动态片段

#### 5. 视频样本

实测 note：

```text
69d0026d000000001a0276e0
```

结果：

- `detail_strategy = extension_note_detail_map`
- `media_strategy = plugin_state_urls`
- 成功提取视频 URL 并下载本地文件

#### 6. 增量逻辑 mock 验证

针对增量误跳过，做了两组可控验证：

1. `seen_note_ids` 同时包含有效记录和失效记录
   - 失效记录会被 prune
   - 仍然会继续处理真正未抓的新 note

2. `seen_note_ids` 全部失效
   - 会自动切到 `full`
   - 不会继续出现“0 条已抓但增量全跳过”

### 26.7 当前结论

到这一轮为止，可以明确说：

```text
当前 ABO 里真正的“小红书抓具体内容”链路已经基本收敛为插件优先。
```

更具体一点：

- 详情：插件优先
- 图片 / 视频 / Live 图 URL 提取：插件优先
- 评论正文抓取：插件状态机优先
- 批量入库：插件优先
- 专辑内详情入库：插件优先

CDP 和后端 HTML 现在属于：

- 风控前提下的兜底层
- 不是默认主链路

### 26.8 还要保留的边界说明

虽然现在主链路已经是插件优先，但还有两点要明确写下来：

#### 1. 修改扩展代码后，已加载的 unpacked extension 需要 reload 一次

像这次 `extension/background.js` 的逻辑修复，只有在浏览器扩展被重新加载后才会生效。

也就是说：

```text
代码已改好 != 浏览器里正在跑的新扩展代码已经自动生效
```

#### 2. 媒体落盘仍由后端执行

当前设计不是让插件自己负责下载大文件。

插件负责：

- 在真实页面里拿 state
- 提取图片 / 视频 / Live 图 URL

后端负责：

- 下载媒体
- 写 Markdown
- 写本地资源文件

这不是“插件没接管媒体”，而是更合理的分层。

## 27. 2026-04-15 属性误读修复

这一轮又补了一个明确问题：

有些插件链路落盘出来的笔记属性会明显错误，例如：

- 来源作者变成 `我`
- 作者 ID 变成当前登录用户
- 日期变成 `1970-01-01` 或当前抓取当天
- 互动数混进了页脚备案号，例如 `13030189`
- 标签 / IP 属地 / 正文同时缺失

### 27.1 根因

这里不是“插件读取到的真实详情 state 天生不准”。

真实测试里，插件如果拿到的是：

```text
window.__INITIAL_STATE__.note.noteDetailMap
```

那作者、时间、互动、标签本身是正确的。

真正的问题在于：

```text
插件主链路拿不到完整详情时，之前有机会把一个过弱的 DOM fallback 结果直接当成真详情继续落盘。
```

这个 DOM fallback 如果扫到了：

- 左侧导航
- 当前登录用户入口
- 页脚备案号
- 页面头像 / 装饰图

就会产出一份“看起来结构完整、实际属性错误”的假 note。

这也是为什么旧脚本在“属性正确性”上通常更稳：

- 旧脚本更多是直接解析详情页 HTML 里的 Initial State
- 不会优先接受这么弱的 DOM 补抓结果

所以结论是：

```text
旧脚本在属性正确性上基本是对的；
这次问题来自插件优先改造后，对弱 fallback 放行得太宽。
```

### 27.2 这次修复了什么

#### 1. 时间解析对齐旧脚本

`abo/tools/xhs_crawler.py` 里的 `_extract_datetime()` 现在补齐了：

- 数字字符串时间戳
- 常见日期字符串格式
- 过滤 `0` / 1970 / 2010 之前的异常时间

这可以直接避免：

- `1970-01-01`
- 时间缺失后被误当成有效时间

#### 2. 插件结果先验校验，不再盲信

新增了一层 note root 校验：

```python
_note_root_validation_issues(...)
```

如果插件返回的详情同时出现这些特征，就不再允许直接落盘：

- 缺少可信发布时间
- 标题和正文同时缺失
- 作者异常（例如 `我` / `未知`）
- 互动数字像页脚备案号
- 图片集合明显混入大量头像

也就是说现在的行为变成：

```text
插件先试
-> 如果详情属性可信，直接用插件结果
-> 如果插件结果看起来是页面壳子/弱 DOM fallback，立刻回退到 CDP / HTML Initial State
-> 如果兜底后仍异常，直接报错，不再写错数据
```

#### 3. DOM fallback 本身也收紧了

除了“先验校验”，DOM fallback 里也改了几件事：

- 作者不再优先拿全页第一个 `/user/profile/` 链接
- 会尽量避开左侧 `我`
- 互动数优先在详情区域里找
- 图片只在详情区域里找，并过滤 avatar 图

这会降低把侧栏和页脚带进 note 的概率。

### 27.3 这意味着什么

现在如果插件真的拿到真实 detail state：

- 属性仍然应该和旧脚本一样准

如果插件没拿到真实 detail state：

- 现在更倾向于回退旧的稳妥链路
- 而不是保存一份明显错误的 Markdown

所以新的判断标准应该是：

```text
插件优先负责“先进入真实页面、优先读取真实 state”；
一旦属性可信度不够，就退回旧脚本那套更稳的 Initial State 提取。
```

### 27.4 进一步减少额外请求

这一轮又继续收了一步，目的就是尽量让正常抓取停留在：

```text
插件 -> 当前真实页面 state
```

而不是太早掉到后面的兜底请求。

具体做了两件事：

#### 1. 扩展侧不再把“任意 noteDetailMap”当成详情就绪

之前 `wait_for_xhs_state(kind="note")` 的判断偏宽，只要页面里有：

```text
note.noteDetailMap
```

就可能被视为 ready。

现在会进一步要求：

```text
目标 noteId 对应的 detail 真正出现
```

也就是说，扩展不会因为“页面上有别的 note state”就过早放行。

#### 2. 后端不再盲拿 `noteDetailMap` 第一个值

之前如果 `noteDetailMap[noteId]` 没命中，某些路径会退成：

```text
Object.values(noteDetailMap)[0]
```

这个行为在反爬敏感场景下很危险，因为它可能拿到：

- 不是目标笔记的 detail
- 半加载页面里的旧 detail
- 结果又触发后续补救请求

现在改成：

- 先按 `noteId` 精确匹配
- 再按 detail 内部的 `noteId` 精确匹配
- 还匹配不到，就继续观察当前真实页面
- 不再盲拿第一个值

### 27.5 本轮插件-only 验证

为了确认“插件本身能不能拿全数据”，这轮特意做了不带 CDP 兜底的验证：

```text
use_extension = true
use_cdp = false
```

验证结果：

1. 普通图文样本：插件-only 成功
2. 之前出现属性错误的样本：插件-only 成功，日期/作者/互动恢复正常
3. 视频样本：插件-only 成功，视频 URL 正常提取
4. 评论状态机：插件-only 仍然正常

所以当前更准确的结论是：

```text
插件理论上不仅“能拿到需要的数据”，而且在我们这轮实测里，正常详情/视频/评论都已经可以只靠插件拿到。
```

CDP / HTML 现在更像：

- 插件不可用时的保底
- 或极少数异常页面的兜底

而不是正常抓取时应该频繁触发的主链路。
