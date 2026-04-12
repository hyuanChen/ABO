# 小红书爬取方案：当前可用设计

本文记录当前已经实测的小红书抓取方案。目标不是做一个只会单篇复制的脚本，而是形成可批量、可增量、可选媒体下载、可选评论抓取的本地知识库导入流程。

## 1. 能力边界

默认模式可以抓取：

- 单篇笔记正文
- 普通图片
- Live 图封面
- 作者信息
- 发布时间
- IP 属地
- 标签
- 点赞数
- 收藏数
- 评论总数
- 搜索结果里的 `noteId` 和 `xsec_token`
- 收藏夹笔记列表
- 专辑列表
- 专辑内笔记列表
- 按专辑批量抓取
- 按专辑增量去重

可选增强能力：

- `--video`：下载视频帖 MP4。
- `--live-photo`：下载 Live 图动态 MP4。
- `--comments`：用隐藏 CDP 页面抓一级评论正文和点赞数。
- `--sub-comments`：在 `--comments` 基础上抓楼中楼。
- `--transcribe`：下载视频并转录音频；当前本机缺少 `mlx_whisper`，流程已设计但未跑通。

当前不默认开启的能力：

- 评论正文全量抓取。
- 楼中楼全量展开。
- 视频批量转录。

原因是这些能力更慢、更容易触发风控，且评论接口需要前端动态签名。默认批量模式只抓正文、图片、互动数和媒体元数据。

## 2. 登录态

登录态文件：

```text
~/cookies.json
```

自动导出方式：

```text
Microsoft Edge 登录小红书
-> Edge 以 --remote-debugging-port=9222 启动
-> 连接 http://127.0.0.1:9222/json/version
-> 调用 Storage.getCookies
-> 过滤 xiaohongshu.com cookies
-> 写入 ~/cookies.json
```

需要注意：

- 单篇详情页经常可以只靠 `~/cookies.json` 后端解析。
- 搜索、收藏分页、评论接口更依赖浏览器上下文和动态签名。
- 如果新建 CDP target 后页面提示“登录后查看”，说明仅注入 cookies 不够，需要复用真实已登录页面，或重新导出 cookies。

## 3. 输入模式

单篇：

```text
xhs <小红书详情链接>
xhs <小红书详情链接> --video
xhs <小红书详情链接> --live-photo
xhs <小红书详情链接> --comments --comments-limit 20
xhs <小红书详情链接> --comments --sub-comments
```

批量：

```text
xhs-batch <链接1> <链接2> ...
xhs-batch search <关键词> [数量]
xhs-batch favorites [数量]
xhs-batch favorites 新增
xhs-batch albums all
xhs-batch albums 新增
xhs-batch albums <专辑名>
```

批量可叠加：

```text
--video
--live-photo
--comments
--comments-limit <N>
--sub-comments
--transcribe
```

默认建议：

```text
批量默认不带 --comments / --sub-comments / --transcribe
需要媒体文件时显式加 --video 或 --live-photo
需要评论时显式加 --comments
```

## 4. 单篇详情抓取

详情链接格式：

```text
https://www.xiaohongshu.com/explore/<noteId>?xsec_token=<xsec_token>&xsec_source=<source>
```

搜索结果链接也支持：

```text
https://www.xiaohongshu.com/search_result/<noteId>?xsec_token=...
```

应转换为：

```text
https://www.xiaohongshu.com/explore/<noteId>?xsec_token=<xsec_token>&xsec_source=pc_search
```

后端请求详情页 HTML，解析：

```javascript
window.__INITIAL_STATE__ = {...}
```

笔记路径：

```python
data["note"]["noteDetailMap"][note_id]["note"]
```

常用字段：

```text
note.noteId
note.xsecToken
note.type
note.title
note.desc
note.time
note.lastUpdateTime
note.ipLocation
note.user.nickname
note.user.userId
note.user.xsecToken
note.tagList
note.imageList
note.video
note.interactInfo
```

互动字段：

```text
note.interactInfo.likedCount
note.interactInfo.collectedCount
note.interactInfo.commentCount
note.interactInfo.shareCount
```

重要边界：

```text
详情 initial state 里通常只有评论总数，没有评论正文。
comments.list 经常是空数组，只代表评论区加载状态。
```

## 5. 普通图片

普通图片路径：

```text
note.imageList[].urlDefault
note.imageList[].urlPre
note.imageList[].infoList[]
```

判断：

```text
imageList[i].livePhoto == false
```

保存策略：

```text
优先保存 urlDefault
没有 urlDefault 时使用 infoList 里的 WB_DFT / WB_PRV
文件保存到 ~/Documents/Obsidian Vault/xhs/img/
Markdown 中记录本地路径和原始图片 URL
```

## 6. Live 图

Live 图不是 `type=video`，而是 `imageList` 里的特殊图片。

判断：

```text
note.type 通常是 normal
imageList[i].livePhoto == true
```

已验证字段：

```text
imageList[i].urlDefault
imageList[i].stream.h264[0].masterUrl
imageList[i].stream.h264[0].backupUrls[]
```

备用 codec 尝试顺序：

```text
h264
h265
av1
h266
backupUrls
```

保存策略：

```text
封面图: img/xhs_<note_id>_live_<index>.webp
动态片段: video/xhs_<note_id>_live_<index>.mp4
```

实测样本：

```text
note_id: 69d7037e000000001a035376
标题: 东京又有人卧轨了
作者: 无明火
type: normal
image_count: 1
imageList[0].livePhoto: true
动态字段: imageList[0].stream.h264[0].masterUrl
```

已下载并验证：

```text
~/Documents/Obsidian Vault/xhs/img/xhs_69d7037e_live_0.webp
~/Documents/Obsidian Vault/xhs/video/xhs_69d7037e_live_0.mp4
```

MP4 信息：

```text
编码: h264
尺寸: 1080x1440
帧率: 30fps
时长: 1.966667 秒
大小: 600148 bytes
音频: 无
```

## 7. 视频帖

视频帖判断：

```text
note.type == "video"
```

视频字段：

```python
note["video"]["media"]["stream"]
```

已验证结构：

```text
video.media.videoId
video.media.stream.h264[]
video.media.stream.h265[]
video.media.stream.av1[]
video.media.stream.h266[]
```

每个 stream 条目常见字段：

```text
qualityType
format
duration
width
height
fps
videoBitrate
videoDuration
masterUrl
backupUrls
```

下载顺序：

```text
h264[0].masterUrl
h265[0].masterUrl
av1[0].masterUrl
h266[0].masterUrl
backupUrls[]
```

下载命令：

```bash
curl -L -H "Referer: https://www.xiaohongshu.com/" \
  -o "$HOME/Documents/Obsidian Vault/xhs/video/xhs_<note_id>.mp4" \
  "<masterUrl>"
```

实测样本：

```text
note_id: 67027c85000000001b0204d6
标题: 🧳假期播报⁺₊ 𖠳 ⸝⸝∗⏳ﾉ📄ੈ
作者: iiikio
type: video
h264: 960x720, 60fps, mp4
h265: 1440x1080, 60fps, mp4
```

已下载并验证：

```text
~/Documents/Obsidian Vault/xhs/video/xhs_67027c85000000001b0204d6.mp4
```

MP4 信息：

```text
编码: h264
音频: aac
尺寸: 960x720
帧率: 60fps
时长: 12.63 秒
大小: 2069670 bytes
```

## 8. 视频转录

转录流程：

```text
下载 MP4
-> ffmpeg 提取 16kHz mono wav
-> mlx_whisper 转录
-> 清理文本
-> 写入 Markdown
```

音频提取命令：

```bash
ffmpeg -y -i "video/xhs_<note_id>.mp4" \
  -vn -acodec pcm_s16le -ar 16000 -ac 1 \
  /tmp/xhs_<note_id>.wav
```

当前环境状态：

```text
ffmpeg: 可用
mlx_whisper: 未安装
```

因此当前已经验证：

```text
视频下载: 可用
音频提取: 可用
Whisper 转录: 依赖缺失，暂未跑通
```

## 9. 评论

详情页 initial state 里的评论字段示例：

```text
note.noteDetailMap[note_id].comments.list = []
note.noteDetailMap[note_id].comments.hasMore = true
note.noteDetailMap[note_id].note.interactInfo.commentCount = "7"
```

这说明详情数据里有评论区状态和评论总数，但没有评论正文。

一级评论接口：

```text
GET https://edith.xiaohongshu.com/api/sns/web/v2/comment/page
```

二级评论接口：

```text
GET https://edith.xiaohongshu.com/api/sns/web/v2/comment/sub/page
```

评论响应字段：

```text
data.comments[].id
data.comments[].content
data.comments[].like_count
data.comments[].user_info.nickname
data.comments[].ip_location
data.comments[].create_time
data.comments[].sub_comment_count
data.comments[].sub_comment_cursor
data.comments[].sub_comment_has_more
data.comments[].sub_comments[]
data.cursor
data.has_more
```

限制：

```text
纯 cookies 请求评论接口会返回 300011 或 406。
评论接口需要前端动态签名头。
```

动态头：

```text
X-s
X-t
X-S-Common
x-rap-param
```

可靠抓取方式：

```text
复用 Edge CDP
-> 创建一个隐藏/后台 target
-> Network.enable
-> Page.navigate 到详情 URL
-> 捕获 /comment/page 响应
-> 如果开启 --sub-comments，触发并捕获 /comment/sub/page
-> Network.getResponseBody 读取响应
-> 写回 Markdown
```

批量策略：

```text
默认不抓评论正文
--comments 抓一级评论
--comments-limit <N> 限制每条笔记一级评论数量
--sub-comments 展开楼中楼
始终复用一个 CDP 页面，不为每条笔记打开新可见页面
```

已验证样本：

```text
comment/page 可以拿到 content、like_count、user_info.nickname、sub_comments
sub/page 可以通过 root_comment_id + cursor 获取楼中楼
```

## 10. 搜索

搜索页：

```text
https://www.xiaohongshu.com/search_result?keyword=<keyword>&source=web_search_result_notes
```

静态 HTML 里的：

```python
data["search"]["feeds"]
```

实测可能为空。因此搜索采用两种方式。

### 10.1 DOM 提取

浏览器前端渲染后，从 DOM 链接中提取：

```text
/explore/<noteId>
/search_result/<noteId>?xsec_token=...
```

转换为详情链接：

```text
https://www.xiaohongshu.com/explore/<noteId>?xsec_token=<xsec_token>&xsec_source=pc_search
```

### 10.2 搜索接口复放

接口：

```text
POST https://edith.xiaohongshu.com/api/sns/web/v1/search/notes
```

纯 cookies 请求可能返回：

```json
{
  "code": 300011,
  "success": false,
  "msg": "当前账号存在异常，请切换账号后重试"
}
```

带浏览器真实动态头复放时，可以拿到：

```text
items[].id
items[].xsec_token
items[].note_card.display_title
```

限制：

```text
搜索也依赖动态签名和登录上下文。
如果新建 target 后显示“登录后查看搜索结果”，需要复用真实已登录页面或重新导出登录态。
```

## 11. 收藏夹

用户主页：

```text
https://www.xiaohongshu.com/user/profile/<user_id>
```

当前用户已验证：

```text
user_id: 612a1b23000000000101e216
收藏笔记: 3129
专辑: 27
```

收藏笔记接口：

```text
GET https://edith.xiaohongshu.com/api/sns/web/v2/note/collect/page?num=30&cursor=<cursor>&user_id=<user_id>&image_formats=jpg,webp,avif&xsec_token=&xsec_source=
```

响应字段：

```text
data.notes[].note_id
data.notes[].xsec_token
data.notes[].display_title
data.notes[].type
data.notes[].user.nickname
data.notes[].interact_info.liked_count
data.cursor
data.has_more
```

限制：

```text
收藏分页接口需要动态签名头。
同一组动态头不能随意替换 cursor。
直接 cookies-only GET 返回 406。
```

可靠方式：

```text
打开收藏页
-> 让前端滚动生成分页请求
-> CDP 监听 collect/page 响应
-> 提取 note_id/xsec_token
-> 后端抓详情页
```

增量进度文件：

```text
~/Documents/Obsidian Vault/xhs/.xhs-favorites-progress.json
```

## 12. 专辑

专辑入口：

```text
用户主页 -> 收藏 -> 专辑
```

专辑列表从 DOM 的 `/board/<board_id>` 链接提取。

已验证：

```text
专辑数: 27
总量: 约 3086 条
```

专辑页：

```text
https://www.xiaohongshu.com/board/<board_id>?source=web_user_page
```

专辑内笔记路径：

```python
data["board"]["boardFeedsMap"][board_id]["notes"]
```

字段：

```text
noteId
xsecToken
displayTitle
type
user.nickName
interactInfo.likedCount
interactInfo.collectedCount
interactInfo.commentCount
```

转换详情链接：

```text
https://www.xiaohongshu.com/explore/<noteId>?xsec_token=<xsecToken>&xsec_source=pc_collect_board
```

当前最稳定链路：

```text
专辑页 initial state
-> noteId/xsecToken
-> 后端抓详情
-> 保存 Markdown
```

注意：

```text
如果登录态不稳定，boardFeedsMap[board_id].notes 可能为空。
这时需要刷新登录态或复用真实已登录页面。
```

## 13. 批量与增量

专辑进度文件：

```text
~/Documents/Obsidian Vault/xhs/.xhs-albums-progress.json
```

建议结构：

```json
{
  "last_run_at": "2026-04-11T15:30:00+08:00",
  "albums": {
    "board_id": {
      "name": "专辑名",
      "count": 75,
      "seen_note_ids": ["note_id"],
      "last_cursor": "",
      "done": false
    }
  },
  "notes": {
    "note_id": {
      "file": "/path/to/note.md",
      "albums": ["专辑名"],
      "last_seen_at": "2026-04-11T15:30:00+08:00",
      "media": {
        "images": [],
        "videos": [],
        "live_photos": []
      }
    }
  }
}
```

增量逻辑：

```text
读取 seen_note_ids
-> 扫描专辑最新列表
-> 跳过已抓 noteId
-> 新 noteId 抓详情
-> 成功后立即写进度
```

同一笔记出现在多个专辑：

```text
不重复抓详情
只更新 notes[note_id].albums
```

## 14. Markdown 输出

保存目录：

```text
~/Documents/Obsidian Vault/xhs
```

文件名：

```text
{YYYY-MM-DD} {短标题}.md
```

媒体目录：

```text
~/Documents/Obsidian Vault/xhs/img
~/Documents/Obsidian Vault/xhs/video
```

建议 Markdown 结构：

```markdown
# 一句话核心洞察

正文摘要和判断。

> [!info]- 原始信息
> - 来源: 小红书 · 作者
> - 链接: 原始链接
> - 类型: normal / video
> - 发布时间: YYYY-MM-DD HH:mm:ss
> - IP属地: 地区
> - 点赞: N
> - 收藏: N
> - 评论: N
> - 收藏专辑: 专辑名

## 原文

原始 desc。

## 媒体

- 图片: img/xxx.webp
- 视频: video/xxx.mp4
- Live 图: img/xxx.webp + video/xxx_live_0.mp4

> [!quote]- 评论
> 1. **用户**（3赞 · 广东）：评论内容
>    - **回复用户**（1赞 · 北京）：回复内容
```

## 15. 已验证结果

单篇详情：

```text
note_id: 69d929f1000000002b00ec63
标题: SBTI这么火，如果有AITI会是怎么样的
结果: 后端解析正文、图片、作者、标签、互动数成功
```

搜索：

```text
关键词: AI wiki
结果: 拿到 22 条搜索结果
样本: 69d480510000000023012f19
```

评论：

```text
接口: /api/sns/web/v2/comment/page
结果: 通过 CDP 捕获到一级评论正文和点赞数
字段: content / like_count / user_info.nickname / sub_comments
```

批量：

```text
保存成功: 110
失败: 0
来源:
计算机行业 8
interesting 31
sth useful 35
cute 36
```

视频：

```text
note_id: 67027c85000000001b0204d6
结果: 下载完整 MP4 成功
文件: ~/Documents/Obsidian Vault/xhs/video/xhs_67027c85000000001b0204d6.mp4
```

Live 图：

```text
note_id: 69d7037e000000001a035376
结果: 下载封面 WebP 和 Live MP4 成功
文件:
~/Documents/Obsidian Vault/xhs/img/xhs_69d7037e_live_0.webp
~/Documents/Obsidian Vault/xhs/video/xhs_69d7037e_live_0.mp4
```

## 16. 推荐执行策略

默认全量批量：

```text
albums 新增
-> 抓专辑列表
-> 抓 noteId/xsecToken
-> 后端抓详情
-> 保存正文、图片 URL、互动数
-> 写进度
```

带媒体文件：

```text
albums 新增 --video --live-photo
```

带评论：

```text
albums 新增 --comments --comments-limit 20
```

带楼中楼：

```text
albums 新增 --comments --sub-comments --comments-limit 20
```

不建议默认：

```text
albums all --comments --sub-comments --transcribe
```

这个组合太慢，且会显著增加风控概率。更合理的是先抓正文和媒体，再对少量重点笔记补评论和转录。
