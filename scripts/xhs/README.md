# 小红书一键脚本

这些脚本复用 ABO 后端的 `abo.tools.xhs_crawler`，当前默认主链路是：

1. 本地浏览器扩展 bridge
2. 本机 CDP
3. 后端 HTML 解析兜底

默认情况下，单帖/批量链接保存到情报库的 `xhs/` 文件夹；收藏专辑抓取保存到情报库的 `专辑/` 文件夹。

## 启动带扩展的浏览器

```bash
bash scripts/xhs/open_browser_with_extension.sh
```

这个脚本会：

- 启动 Edge 或 Chrome
- 自动加载 `/Users/huanc/Desktop/ABO/extension`
- 打开 CDP 端口 `9222`
- 使用持久 profile `~/.abo/xhs-browser-profile`

首次使用请在这个浏览器实例里登录小红书。

如果要走“专用浏览器窗口”模式，建议这样启动：

```bash
ABO_XHS_WINDOW_MODE=dedicated \
ABO_XHS_PROFILE_DIR="$HOME/.abo/xhs-dedicated-browser-profile" \
ABO_XHS_CDP_PORT=9223 \
bash scripts/xhs/open_browser_with_extension.sh
```

这个模式会额外带上 `--new-window`，更适合把 XHS 自动化与当前工作用浏览器隔离开。

如果你已经打开了自己的 Edge，并且插件已经手动加载好，更适合直接在当前 Edge 里开一个独立窗口：

```bash
bash scripts/xhs/open_current_edge_window.sh
```

这个脚本不会新起浏览器实例，只会在当前 Edge 里新开一个窗口并打开小红书页面。

## 验证扩展 bridge

在浏览器已经启动的前提下执行：

```bash
python scripts/xhs/test_extension_bridge.py
```

看到 `success: true` 且 `hasState` / `href` 返回正常时，说明 Python 到扩展的 bridge 已连通。

## 单帖入库

```bash
python scripts/xhs/crawl_note.py "https://www.xiaohongshu.com/explore/..."
```

常用选项：

```bash
python scripts/xhs/crawl_note.py "https://www.xiaohongshu.com/explore/..." --video --comments
```

如果只想用扩展主链路，不想等后端或 CDP 兜底：

```bash
python scripts/xhs/crawl_note.py "https://www.xiaohongshu.com/explore/..." --no-cdp
```

## 批量链接

```bash
python scripts/xhs/batch_links.py --file links.txt --video
```

也可以直接传多个链接：

```bash
python scripts/xhs/batch_links.py "https://www.xiaohongshu.com/explore/..." "69d7037e000000001a035376"
```

## 收藏专辑

打开小红书收藏专辑页，并列出专辑预览：

```bash
python scripts/xhs/list_albums.py
```

如果已经准备好了“专用浏览器窗口”，补抓专辑时可加：

```bash
python scripts/xhs/fill_album_target.py --dedicated-window
```

专辑里的 Markdown、图片/视频资源，以及 `.xhs-albums-progress.json` / `.xhs-albums-cache.json` 都会写到情报库的 `专辑/` 目录下。

## 导出 Cookie

如果扩展 bridge 不可用，或者后续要走 CDP / 后端兜底，再导出 Cookie：

先打开带调试端口的浏览器：

```bash
bash scripts/xhs/open_browser_with_extension.sh
```

登录小红书后导出：

```bash
python scripts/xhs/export_cdp_cookies.py
```

输出默认在 `~/cookies.json`。
