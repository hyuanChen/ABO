# Bilibili 一键脚本

这些脚本复用 ABO 后端的 `abo.tools.bilibili_crawler`，默认保存到情报库的 `bilibili/` 文件夹。

默认情报库来自 `~/.abo-config.json` 的 `vault_path`。

## 准备浏览器 Cookie

推荐用 Chrome/Edge CDP，和 xhs 的流程一致。脚本会先连接现有 `9222` 调试端口；如果端口没开，会尝试启动 Chrome 或 Edge：

```bash
open -na "Microsoft Edge" --args --remote-debugging-port=9222
# 或
open -na "Google Chrome" --args --remote-debugging-port=9222
```

如果端口已开启，可直接验证：

```bash
python scripts/bilibili/verify.py
```

也可以导出 Cookie：

```bash
python scripts/bilibili/export_cdp_cookies.py
```

## 一键全量测试入库

默认只写小样本，避免第一次把几百条稍后再看灌入情报库：

```bash
python scripts/bilibili/crawl_all.py
```

## 拆分执行

```bash
python scripts/bilibili/crawl_dynamics.py --limit 9
python scripts/bilibili/crawl_favorites.py --folder-limit 1 --item-limit 5
python scripts/bilibili/crawl_watch_later.py --limit 5
```

## 指定情报库

```bash
python scripts/bilibili/crawl_all.py --vault "$HOME/Documents/Obsidian Vault"
```
