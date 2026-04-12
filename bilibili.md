# Bilibili 爬取说明与测试记录

参考 `xhs` skill 的组织方式：先处理 Cookie，再按数据类型调用接口，最后整理为 Markdown 或接入 ABO 卡片流。

## 测试结论

测试时间：2026-04-11

本机 Microsoft Edge 已登录 B 站，能读取到 `SESSDATA` 和 `bili_jct`。

| 能力 | 结果 | 说明 |
| --- | --- | --- |
| 登录态验证 | 通过 | `x/web-interface/nav` 返回 `code=0`，`isLogin=true` |
| 关注动态 | 通过 | 旧动态接口与新版 polymer 动态接口都可返回数据 |
| ABO 现有动态工具 | 通过 | `bilibili_fetch_followed` 返回 16 条，包含 `video` 和 `image` |
| 收藏夹列表 | 通过 | 返回 38 个收藏夹 |
| 收藏夹内容 | 通过 | 首个收藏夹返回 9 条内容 |
| 稍后再看 | 通过 | 返回 509 条内容 |

测试过程中发现并修复了一个图文动态兼容问题：B 站图文动态的 `pictures` 字段可能为 `null`，原解析代码会报 `'NoneType' object is not iterable`。已在 `abo/tools/bilibili.py` 和 `abo/default_modules/bilibili/__init__.py` 中改为 `pictures = ... or []`，并补了测试。

## 常量定义

- Cookie 来源：Microsoft Edge，本机登录态。
- 关键 Cookie：`SESSDATA` 用于登录态，`bili_jct` 可用于需要 CSRF 的写接口。本文只测试读取接口。
- 当前 ABO 已接入：关注动态。
- 当前 ABO 未接入但已验证可用：收藏夹、稍后再看。
- 推荐 User-Agent：

```text
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

## 步骤 0：自动获取 Cookie

可先尝试 `browser_cookie3` 从 Edge 读取，适合当前项目已有依赖：

```python
import browser_cookie3

cj = browser_cookie3.edge(domain_name="bilibili.com")
cookies = {c.name: c.value for c in cj}
cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())

sessdata = cookies.get("SESSDATA")
bili_jct = cookies.get("bili_jct")
```

实际写入 Obsidian 测试时发现：

- `browser_cookie3.edge()` 偶尔会卡在本地 Cookie 库读取。
- `~/.abo-config.json` 里保存的 `bilibili_cookie` 只有 `SESSDATA/bili_jct/DedeUserID__ckMd5` 时，动态接口会返回 `4100000 用户未登录`。
- 稳定方案是参考小红书 skill 的 CDP 方式，读取 Edge 当前会话里的完整 B 站 Cookie。

CDP 获取完整 Cookie：

```python
import asyncio
import json
import urllib.request
import websockets

async def edge_cdp_bilibili_cookies() -> list[dict]:
    version = json.loads(
        urllib.request.urlopen(
            "http://127.0.0.1:9222/json/version",
            timeout=2,
        ).read().decode()
    )

    async with websockets.connect(
        version["webSocketDebuggerUrl"],
        max_size=10_000_000,
    ) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Storage.getCookies"}))
        while True:
            data = json.loads(await ws.recv())
            if data.get("id") == 1:
                cookies = data.get("result", {}).get("cookies", [])
                return [
                    c for c in cookies
                    if "bilibili.com" in c.get("domain", "")
                ]

cookies = asyncio.run(edge_cdp_bilibili_cookies())
cookie_header = "; ".join(
    f"{c['name']}={c['value']}"
    for c in cookies
    if c.get("name") and c.get("value")
)
```

如果 `http://127.0.0.1:9222/json/version` 不可用，先以调试端口启动 Edge：

```bash
osascript -e 'tell application "Microsoft Edge" to quit' || true
sleep 2
open -a "Microsoft Edge" --args --remote-debugging-port=9222
sleep 3
open -a "Microsoft Edge" "https://www.bilibili.com"
```

最小验证：

```http
GET https://api.bilibili.com/x/web-interface/nav
Cookie: <完整 Cookie header>
Referer: https://www.bilibili.com/
```

成功条件：

```json
{
  "code": 0,
  "data": {
    "isLogin": true,
    "mid": 123
  }
}
```

## 步骤 1：抓取关注动态

### 当前 ABO 已接入接口

代码入口：

- `abo.tools.bilibili.bilibili_verify_sessdata`
- `abo.tools.bilibili.bilibili_fetch_followed`
- 前端调用：`src/api/bilibili.ts`

旧动态接口：

```http
GET https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new?type_list=<type>
Cookie: SESSDATA=<SESSDATA>
Referer: https://t.bilibili.com/
```

动态类型：

- `8`：视频投稿
- `2`：图文动态
- `4`：纯文字动态
- `64`：专栏
- `268435455`：全部

本次直连测试结果：

- `type_list=8`：20 cards
- `type_list=2`：10 cards
- `type_list=4`：20 cards
- `type_list=64`：20 cards
- `type_list=268435455`：20 cards

ABO 工具函数测试结果：

```text
verify {'valid': True, 'message': '验证成功'}
Type 8: got 9 dynamics
Type 2: got 9 dynamics
Type 4: got 9 dynamics
Type 64: got 9 dynamics
fetch_total 16
types ['video', 'video', 'video', 'image', ...]
```

### 新版动态接口备用

旧接口目前可用，但建议保留新版接口作为备用：

```http
GET https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?type=all&page=1&features=itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,forwardListHidden,ugcDelete,onlyfansQaCard
Cookie: <完整 Cookie header>
Referer: https://t.bilibili.com/
```

本次返回 `20` items，类型示例：

```text
DYNAMIC_TYPE_DRAW, DYNAMIC_TYPE_AV
```

## 步骤 2：抓取收藏夹

先通过 `nav` 获取当前登录用户 `mid`。

收藏夹列表：

```http
GET https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=<mid>&jsonp=jsonp
Cookie: <完整 Cookie header>
Referer: https://www.bilibili.com/
```

本次测试返回 `38` 个收藏夹。

读取某个收藏夹内容：

```http
GET https://api.bilibili.com/x/v3/fav/resource/list?media_id=<media_id>&pn=1&ps=10&keyword=&order=mtime&type=0&tid=0&platform=web
Cookie: <完整 Cookie header>
Referer: https://space.bilibili.com/<mid>/favlist
```

本次测试首个收藏夹返回 `9` 条内容，条目字段通常包括：

- `id`
- `bvid`
- `title`
- `intro`
- `cover`
- `upper`
- `cnt_info`
- `fav_time`

## 步骤 3：抓取稍后再看

两个端点本次都可用：

```http
GET https://api.bilibili.com/x/v2/history/toview/web?jsonp=jsonp
Cookie: <完整 Cookie header>
Referer: https://www.bilibili.com/watchlater/
```

```http
GET https://api.bilibili.com/x/v2/history/toview?jsonp=jsonp
Cookie: <完整 Cookie header>
Referer: https://www.bilibili.com/watchlater/
```

本次测试两个端点都返回 `509` 条内容，首条有 `bvid`。

常用字段：

- `aid`
- `bvid`
- `cid`
- `title`
- `desc`
- `pic`
- `owner`
- `duration`
- `pubdate`
- `progress`
- `add_at`

## 步骤 4：写入 Obsidian Vault

本次按 xhs 输出习惯写入：

```text
~/Documents/Obsidian Vault/bilibili
```

实际测试写入结果：

```text
bilibili/
├── 2026-04-11 Bilibili 爬取测试汇总.md
├── dynamic/
│   ├── 2026-04-11 动态 <title>.md
├── favorites/
│   └── 默认收藏夹/
│       ├── 2026-04-11 收藏 <title> <bvid>.md
└── watch_later/
    ├── 2026-04-11 稍后再看 <title> <bvid>.md
```

本次测试样本：

- 动态：3 条。
- 默认收藏夹：3 条。
- 稍后再看：3 条。
- 汇总索引：1 条。

### Markdown 格式

动态笔记：

```markdown
# <动态标题>

这是一条 Bilibili 动态爬取测试样本，格式参考 xhs 输出：正文、图片、来源信息放在折叠块里。

> [!tip]- 详情
> 原动态标题：<动态标题>
>
> <正文>
>
> ![图1](<图片URL>)
>
> [!info]- 笔记属性
> - **来源**: Bilibili · <UP主>
> - **动态ID**: <dynamic_id>
> - **链接**: <source_url>
> - **日期**: <published_at>
> - **类型**: video | image | text
```

收藏夹笔记：

```markdown
# <视频标题>

这是一次 Bilibili 收藏夹爬取测试样本，来自收藏夹 `<收藏夹名>`。

> [!tip]- 详情
> 原视频标题：<视频标题>
>
> <简介>
>
> ![封面](<cover>)
>
> [!info]- 笔记属性
> - **来源**: Bilibili 收藏夹 · <收藏夹名>
> - **UP主**: <upper.name>
> - **BV号**: <bvid>
> - **链接**: https://www.bilibili.com/video/<bvid>
> - **收藏时间**: <fav_time>
> - **互动**: <collect>收藏 / <play>播放 / <danmaku>弹幕
```

稍后再看笔记：

```markdown
# <视频标题>

这是一次 Bilibili 稍后再看爬取测试样本。

> [!tip]- 详情
> 原视频标题：<视频标题>
>
> <简介>
>
> ![封面](<pic>)
>
> [!info]- 笔记属性
> - **来源**: Bilibili 稍后再看
> - **UP主**: <owner.name>
> - **BV号**: <bvid>
> - **链接**: https://www.bilibili.com/video/<bvid>
> - **发布时间**: <pubdate>
> - **加入时间**: <add_at>
> - **播放进度**: <progress> 秒
```

### 实现要点

- 文件名必须清洗 `/ \ : * ? " < > |` 和换行，避免 macOS/Obsidian 路径异常。
- 首次测试只写小样本，避免把 500 多条稍后再看一次性灌入 vault。
- 笔记中不要保存 Cookie。
- 动态接口建议分别拉 `type_list=8/2/4`，这样能稳定拿到视频、图文、文字三类可读样本；`type_list=268435455` 可能优先返回转发动态，正文会退化成原始 JSON。
- 图文动态的 `item.pictures` 可能为 `null`，解析时必须使用 `item.get("pictures") or []`。
- 旧动态接口中 `desc.user_profile.uname` 有时为空，必要时从新 polymer 接口补作者信息。

## 步骤 5：一键脚本拆分

项目内已经拆成 `scripts/bilibili/` 下的多个一键脚本，所有脚本都复用 `abo.tools.bilibili_crawler`，不会各自维护一份爬虫逻辑。

### 5a. 验证登录态

```bash
python scripts/bilibili/verify.py
```

默认从 Edge CDP 读取完整 Cookie，然后请求：

```http
GET https://api.bilibili.com/x/web-interface/nav
```

### 5b. 导出完整 Cookie

```bash
python scripts/bilibili/export_cdp_cookies.py
```

默认输出：

```text
~/bilibili_cookies.json
```

### 5c. 只抓动态

```bash
python scripts/bilibili/crawl_dynamics.py --limit 9
```

写入：

```text
<情报库>/bilibili/dynamic/
```

### 5d. 只抓收藏夹

```bash
python scripts/bilibili/crawl_favorites.py --folder-limit 1 --item-limit 5
```

写入：

```text
<情报库>/bilibili/favorites/<收藏夹名>/
```

### 5e. 只抓稍后再看

```bash
python scripts/bilibili/crawl_watch_later.py --limit 5
```

写入：

```text
<情报库>/bilibili/watch_later/
```

### 5f. 一键抓三类内容

```bash
python scripts/bilibili/crawl_all.py
```

默认写小样本：

- 动态：9 条。
- 收藏夹：1 个收藏夹，每个 3 条。
- 稍后再看：3 条。

可调参数：

```bash
python scripts/bilibili/crawl_all.py \
  --dynamic-limit 20 \
  --favorite-folder-limit 2 \
  --favorite-item-limit 10 \
  --watch-later-limit 10
```

指定情报库：

```bash
python scripts/bilibili/crawl_all.py --vault "$HOME/Documents/Obsidian Vault"
```

## 步骤 6：ABO 软件内接入点

后端新增：

- `abo.tools.bilibili_crawler`
- `POST /api/tools/bilibili/crawl-to-vault`

前端新增：

- `src/api/bilibili.ts`：`bilibiliCrawlToVault`
- `src/modules/bilibili/BilibiliTool.tsx`：「一键写入情报库」按钮

入库接口参数：

```json
{
  "include_dynamics": true,
  "include_favorites": true,
  "include_watch_later": true,
  "dynamic_limit": 9,
  "favorite_folder_limit": 1,
  "favorite_item_limit": 3,
  "watch_later_limit": 3,
  "use_cdp": true,
  "cdp_port": 9222
}
```

## 建议接入方式

当前项目已经有动态工具，建议下一步只补两个后端函数和对应 FastAPI 路由：

- `bilibili_fetch_favorites(cookie_header, media_id=None, limit=...)`
- `bilibili_fetch_watch_later(cookie_header, limit=...)`

实现时应优先传完整 Cookie header，而不只是 `SESSDATA`。收藏夹和稍后再看读取接口本次用完整 Cookie 验证通过；只传 `SESSDATA` 在部分接口上可能不稳定。

输出 Markdown 时可按三类目录组织：

```text
~/Documents/Obsidian Vault/bilibili/dynamic/<date> 动态 <title>.md
~/Documents/Obsidian Vault/bilibili/favorites/<folder_name>/<date> 收藏 <title> <bvid>.md
~/Documents/Obsidian Vault/bilibili/watch_later/<date> 稍后再看 <title> <bvid>.md
```

最小 frontmatter：

```yaml
---
platform: bilibili
type: dynamic | favorite | watch_later
bvid: ""
dynamic_id: ""
author: ""
source_url: ""
created: ""
---
```
