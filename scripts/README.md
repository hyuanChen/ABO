# ABO Scripts

用于 ABO (Agent Boost OS) 的实用脚本集合。

---

## track_robotics_arxiv.py

自动追踪 robotics 方向的 arXiv 论文，保存到文献库的 `arxiv/` 文件夹。

### 功能
- 自动搜索 `cs.RO` (Robotics) 和相关分类的最新论文
- 生成带元数据的 Markdown 文件
- 可选下载 PDF
- 自动去重 (基于文件名)

### 依赖
```bash
pip install httpx
```

### 用法

**基础用法** (获取最近2天的论文):
```bash
python scripts/track_robotics_arxiv.py
```

**获取更多论文**:
```bash
python scripts/track_robotics_arxiv.py --days 7 --limit 50
```

**同时下载 PDF**:
```bash
python scripts/track_robotics_arxiv.py --days 3 --download-pdfs
```

**模拟运行** (不实际保存):
```bash
python scripts/track_robotics_arxiv.py --dry-run
```

### 保存位置
论文将保存到配置的文献库路径下的 `arxiv/` 文件夹:
- Markdown 元数据: `~/Documents/MyLiterature/arxiv/YYYY-MM-DD_Author_Title.md`
- PDF 文件: `~/Documents/MyLiterature/arxiv/pdfs/`

### 设置定时任务 (推荐)

每天上午9点自动运行:
```bash
crontab -e
```

添加:
```
0 9 * * * cd /Users/huanc/Desktop/ABO && python scripts/track_robotics_arxiv.py --days 1 >> /tmp/arxiv_robotics.log 2>&1
```

### Markdown 文件格式

每个论文保存为 Markdown 文件，包含:
- Frontmatter: arXiv ID, 作者, 发布日期, 分类, PDF 链接
- 标题和作者信息
- 摘要
- 阅读笔记区域
- 评分复选框
- 标签

---

## 配置

脚本自动读取 `~/.abo-config.json` 中的配置:
- `literature_path`: 文献库主文件夹
- `vault_path`: 如果未配置文献库，则使用 `Vault/Literature`

如果配置文件不存在，请先启动 ABO 应用完成初始化。

---

## bilibili/

Bilibili 一键爬取脚本，默认保存到配置的情报库路径下的 `bilibili/` 文件夹。

### 常用命令

```bash
python scripts/bilibili/verify.py
python scripts/bilibili/crawl_all.py
python scripts/bilibili/crawl_dynamics.py --limit 9
python scripts/bilibili/crawl_favorites.py --folder-limit 1 --item-limit 5
python scripts/bilibili/crawl_watch_later.py --limit 5
```

### Cookie

推荐先打开 Edge 调试端口：

```bash
open -a "Microsoft Edge" --args --remote-debugging-port=9222
```

脚本会优先通过 CDP 读取完整 Bilibili Cookie。完整说明见 `scripts/bilibili/README.md`。
