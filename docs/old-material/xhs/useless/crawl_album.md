# 小红书收藏专辑爬取逻辑

## 目标

把当前账号的收藏专辑按专辑维度读取出来，允许用户多选专辑后增量或全量抓取笔记，并把 Markdown 与资源保存到情报库的 `xhs` 文件夹。

## 入口

前端入口在小红书工具的 `收藏整理` 标签：

- `后台获取收藏专辑`：读取当前账号收藏页里的专辑列表。
- `增量抓取选中专辑`：只抓本地进度里没记录过的笔记。
- `全量抓取选中专辑`：重新处理专辑内全部已读取笔记。

后端接口：

- `POST /api/tools/xiaohongshu/albums/start`
- `GET /api/tools/xiaohongshu/albums/{task_id}`
- `POST /api/tools/xiaohongshu/albums/crawl`
- `GET /api/tools/xiaohongshu/albums/crawl/{task_id}`

## Part 1：Cookie 准备

小红书 Cookie 由工具右上角 `Cookie 配置` 弹窗一键获取。

后端会优先使用请求里传入的 Cookie，如果前端没有传 Cookie，就从 ABO 全局配置里读取 `xiaohongshu_cookie`。

专辑读取和专辑抓取都依赖 Cookie。没有 Cookie 时，前端会先弹出 Cookie 配置，不会直接启动任务。

## Part 2：读取收藏专辑列表

点击 `后台获取收藏专辑` 后，前端创建后台任务：

```text
XiaohongshuTool.handleFetchAlbums
-> POST /api/tools/xiaohongshu/albums/start
-> 后端创建 task_id
-> 前端轮询 /albums/{task_id}
```

后端实际执行：

```text
list_xhs_album_previews
-> _list_albums_headless
-> Playwright headless Chromium
-> 打开 explore
-> 点击 我
-> 点击 收藏
-> 点击 专辑
-> 执行 ALBUM_EXTRACT_JS 抽取专辑卡片
```

返回的每个专辑包含：

- `board_id`
- `name`
- `count`
- `url`
- `preview_image`
- `latest_title`
- `seen_count`
- `new_estimate`

其中 `seen_count` 和 `new_estimate` 来自本地进度文件。

专辑列表会额外持久化一份缓存：

```text
<vault>/xhs/.xhs-albums-cache.json
```

用途：

- 前端刷新或抓取结束后，已获取过的专辑不会消失。
- 无界面浏览器临时读取失败时，接口会先恢复本地缓存，而不是返回空列表。
- 前端也会把最近一次专辑列表写入 `localStorage.xiaohongshu_album_cache`，避免页面切换后丢失选择。

## Part 3：专辑抓取任务

点击抓取按钮后，前端发送选中的专辑：

```text
XiaohongshuTool.handleCrawlSelectedAlbums
-> POST /api/tools/xiaohongshu/albums/crawl
-> 后端创建 task_id
-> 前端轮询 /albums/crawl/{task_id}
```

后端执行：

```text
crawl_xhs_albums_incremental
-> 遍历选中的 albums
-> 对每个 board_id 读取专辑内笔记列表
-> 逐条拼出详情页 URL
-> crawl_xhs_note_to_vault 保存 Markdown 和资源
-> 更新 .xhs-albums-progress.json
```

默认保存策略：

- 前端按“最近 N 天”筛选收藏笔记，默认 `180` 天；输入为空或非法时会回退到 `180`。
- 后端会跳过发布时间早于最近范围的笔记。
- 默认只保存 Markdown、远程图片链接、视频链接和 live 图元数据。
- `include_images=true` 时才把图片下载到本地资源目录。
- `include_video=true` 时才下载视频文件。
- `include_live_photo=true` 时才下载 live 图动态视频片段。
- 评论仍然是可选项，只有勾选评论时才进入评论抓取流程。

限速策略：

- 专辑抓取默认每条详情页随机间隔 `8-15` 秒，默认上限是 `12` 秒。
- 前端可调整 `crawl_delay_seconds` 作为随机上限，后端会限制在 `8-15` 秒范围内。
- 成功和失败都会进入等待阶段，避免失败时连续高频请求。
- 如果小红书返回 `300012`、`300013`、安全限制、访问频繁、重新登录等风控状态，任务会直接中断，避免继续压测。

专辑内笔记列表现在优先使用无界面 Playwright 抓取：

```text
crawl_xhs_albums_incremental
-> 一次任务内复用同一个 headless browser/context/page
-> 按专辑顺序逐个切换 board 页面
-> _fetch_board_notes
-> _fetch_board_notes_headless
-> 打开 https://www.xiaohongshu.com/board/<board_id>
-> 读取 window.__INITIAL_STATE__.board.boardFeedsMap[board_id].notes
```

如果无界面抓取失败，才兜底尝试 CDP 端口 `9222`。

## Part 4：增量进度文件

进度文件位置：

```text
<vault>/xhs/.xhs-albums-progress.json
```

结构：

```json
{
  "last_run_at": "",
  "albums": {
    "<board_id>": {
      "name": "专辑名",
      "count": 123,
      "seen_note_ids": ["note_id"],
      "last_cursor": "",
      "done": false
    }
  },
  "notes": {
    "<note_id>": {
      "file": "/path/to/note.md",
      "albums": ["专辑名"],
      "last_seen_at": "2026-04-12T12:00:00+08:00"
    }
  }
}
```

增量模式会跳过 `seen_note_ids` 中已有的笔记。全量模式会重新处理专辑内全部已读取笔记，但仍会更新同一份进度文件。

## 当前修复点

之前的问题是：读取专辑列表已经是无界面浏览器，但真正抓取选中专辑时，专辑内笔记列表仍然依赖 CDP `9222`。如果本机没有开启调试浏览器，任务会刚开始就失败，看起来像“没有执行”。

现在已改成：

```text
优先无界面 Playwright 读取专辑笔记
失败后才兜底 CDP 9222
```

这样收藏专辑抓取不再要求用户手动开调试浏览器。

## 关注反推博主

收藏反推博主来自本地 `xhs` Markdown 和专辑进度文件：

```text
analyze_saved_xhs_authors
-> 读取 <vault>/xhs/*.md
-> 聚合作者、互动数、样本标题
-> 根据 .xhs-albums-progress.json 反查来自哪个收藏专辑
-> 读取 Markdown 标签，补充方向标签
-> 生成 source_summary / sample_albums / sample_tags
```

前端 `关注监控` 里每个博主会显示：

- 作者名或 user_id。
- 来源备注，例如 `来自收藏专辑：计算机行业`。
- 专辑名和标签 chip。
- 单个博主开关：点一下关闭，再点一下开启。
- 单个博主删除：点击条目右侧的 `x` 移除。

后端模块执行时会读取 `disabled_creator_ids`，关闭的博主不会进入关注抓取。
