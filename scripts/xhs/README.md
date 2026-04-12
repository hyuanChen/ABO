# 小红书一键脚本

这些脚本复用 ABO 后端的 `abo.tools.xhs_crawler`，默认保存到情报库的 `xhs/` 文件夹。

## 单帖入库

```bash
python scripts/xhs/crawl_note.py "https://www.xiaohongshu.com/explore/..."
```

常用选项：

```bash
python scripts/xhs/crawl_note.py "https://www.xiaohongshu.com/explore/..." --video --comments
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

## 导出 Cookie

先打开带调试端口的浏览器：

```bash
open -na "Microsoft Edge" --args --remote-debugging-port=9222
```

登录小红书后导出：

```bash
python scripts/xhs/export_cdp_cookies.py
```

输出默认在 `~/cookies.json`。
