#!/usr/bin/env python3
"""
Robotics arXiv 论文自动追踪脚本
保存到文献库的 arxiv/ 文件夹

用法:
    python scripts/track_robotics_arxiv.py
    python scripts/track_robotics_arxiv.py --days 7 --limit 50
"""

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import httpx


def get_config() -> dict:
    """读取 ABO 配置获取 vault 和 literature 路径"""
    config_path = Path.home() / ".abo-config.json"
    if not config_path.exists():
        print(f"错误: 未找到配置文件 {config_path}")
        print("请先启动 ABO 应用并配置 Vault 和文献库路径")
        sys.exit(1)

    return json.loads(config_path.read_text())


def get_literature_path(config: dict) -> Path:
    """获取文献库路径"""
    lit_path = config.get("literature_path", "")
    if lit_path:
        return Path(lit_path)

    # 如果没有配置文献库路径，使用 Vault 路径（文献库与情报库共用）
    vault_path = config.get("vault_path", "")
    if vault_path:
        return Path(vault_path)

    print("错误: 未配置文献库路径或 Vault 路径")
    sys.exit(1)


def fetch_robotics_papers(days: int = 2, max_results: int = 30) -> list[dict]:
    """
    从 arXiv 获取 robotics 相关论文

    使用 arXiv API 搜索 cs.RO (Robotics) 类别
    同时搜索关键词: robotics, manipulation, locomotion, humanoid
    """
    # arXiv 搜索查询
    # cs.RO = Robotics, cs.SY = Systems and Control, cs.AI = AI
    search_query = (
        "cat:cs.RO+OR+cat:cs.SY+OR+"
        "(all:robotics+AND+(all:manipulation+OR+all:locomotion+OR+all:humanoid+OR+all:planning))"
    )

    url = (
        f"https://export.arxiv.org/api/query"
        f"?search_query={search_query}"
        f"&max_results={max_results}"
        f"&sortBy=submittedDate&sortOrder=descending"
    )

    print(f"正在获取论文 (最近 {days} 天)...")

    resp = httpx.get(url, timeout=30)
    resp.raise_for_status()

    ns = {"a": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(resp.text)

    papers = []
    cutoff = datetime.now().replace(tzinfo=None) - timedelta(days=days)

    for entry in root.findall("a:entry", ns):
        try:
            raw_id = entry.find("a:id", ns).text.strip()
            arxiv_id = raw_id.split("/abs/")[-1]

            published_str = entry.find("a:published", ns).text.strip()
            published = datetime.fromisoformat(
                published_str.replace("Z", "+00:00")
            ).replace(tzinfo=None)

            if published < cutoff:
                continue

            # 获取分类
            categories = [
                cat.get("term", "")
                for cat in entry.findall("a:category", ns)
            ]

            paper = {
                "arxiv_id": arxiv_id,
                "title": entry.find("a:title", ns).text.strip().replace("\n", " "),
                "abstract": entry.find("a:summary", ns).text.strip(),
                "authors": [
                    a.find("a:name", ns).text
                    for a in entry.findall("a:author", ns)
                ],
                "url": f"https://arxiv.org/abs/{arxiv_id}",
                "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}.pdf",
                "published": published.strftime("%Y-%m-%d"),
                "categories": categories,
            }
            papers.append(paper)
        except Exception as e:
            print(f"解析论文时出错: {e}")
            continue

    return papers


def sanitize_filename(title: str, max_length: int = 50) -> str:
    """生成安全的文件名"""
    # 移除特殊字符，只保留字母数字和空格
    clean = re.sub(r'[^\w\s-]', '', title)
    clean = re.sub(r'\s+', '_', clean).strip('_')
    return clean[:max_length]


def save_paper_metadata(paper: dict, folder: Path) -> Path:
    """
    保存论文元数据为 Markdown 文件

    文件名格式: YYYY-MM-DD_FirstAuthor_Title.md
    """
    # 生成文件名
    first_author = paper["authors"][0].split()[-1] if paper["authors"] else "Unknown"
    date_prefix = paper["published"]
    title_slug = sanitize_filename(paper["title"], 40)
    filename = f"{date_prefix}_{first_author}_{title_slug}.md"

    filepath = folder / filename

    # 如果文件已存在，跳过
    if filepath.exists():
        return None

    # 生成 Markdown 内容
    md_content = f"""---
arXiv-ID: {paper['arxiv_id']}
title: "{paper['title']}"
authors: {json.dumps(paper['authors'])}
published: {paper['published']}
categories: {json.dumps(paper['categories'])}
pdf_url: {paper['pdf_url']}
source: arxiv-robotics
tracked_at: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
---

# {paper['title']}

**作者**: {', '.join(paper['authors'])}

**发布日期**: {paper['published']}

**arXiv 链接**: [{paper['arxiv_id']}]({paper['url']})

**PDF 下载**: [{paper['pdf_url']}]({paper['pdf_url']})

**分类**: {', '.join(paper['categories'])}

---

## 摘要

{paper['abstract']}

---

## 笔记

<!-- 在此添加你的阅读笔记 -->

## 评分

- [ ] ⭐ 值得细读
- [ ] ⭐⭐ 重要工作
- [ ] ⭐⭐⭐ 必读经典

## 标签

#arxiv #robotics

"""

    filepath.write_text(md_content, encoding="utf-8")
    return filepath


def download_pdf(paper: dict, folder: Path) -> Path:
    """下载 PDF 文件到 pdfs/ 子文件夹"""
    pdf_folder = folder / "pdfs"
    pdf_folder.mkdir(exist_ok=True)

    # 生成文件名
    first_author = paper["authors"][0].split()[-1] if paper["authors"] else "Unknown"
    date_prefix = paper["published"]
    title_slug = sanitize_filename(paper["title"], 30)
    filename = f"{date_prefix}_{first_author}_{title_slug}.pdf"

    filepath = pdf_folder / filename

    # 如果文件已存在，跳过
    if filepath.exists():
        return None

    # 下载 PDF
    print(f"  下载 PDF: {filename[:60]}...")
    try:
        resp = httpx.get(paper["pdf_url"], timeout=60, follow_redirects=True)
        resp.raise_for_status()
        filepath.write_bytes(resp.content)
        return filepath
    except Exception as e:
        print(f"  下载失败: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="自动追踪 robotics arXiv 论文并保存到文献库"
    )
    parser.add_argument(
        "--days", "-d",
        type=int,
        default=2,
        help="获取最近几天的论文 (默认: 2)"
    )
    parser.add_argument(
        "--limit", "-l",
        type=int,
        default=30,
        help="最大获取数量 (默认: 30)"
    )
    parser.add_argument(
        "--download-pdfs", "-p",
        action="store_true",
        help="同时下载 PDF 文件"
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="模拟运行，不实际保存文件"
    )

    args = parser.parse_args()

    # 读取配置
    config = get_config()
    lit_path = get_literature_path(config)
    arxiv_folder = lit_path / "arxiv"

    print(f"文献库路径: {lit_path}")
    print(f"arXiv 文件夹: {arxiv_folder}")

    if not args.dry_run:
        arxiv_folder.mkdir(parents=True, exist_ok=True)

    # 获取论文
    papers = fetch_robotics_papers(args.days, args.limit)
    print(f"找到 {len(papers)} 篇论文")

    if not papers:
        print("没有新论文")
        return

    # 保存论文
    saved_count = 0
    skipped_count = 0
    pdf_count = 0

    for i, paper in enumerate(papers, 1):
        print(f"\n[{i}/{len(papers)}] {paper['title'][:70]}...")
        print(f"  作者: {', '.join(paper['authors'][:2])}{'...' if len(paper['authors']) > 2 else ''}")
        print(f"  分类: {', '.join(paper['categories'][:3])}")

        if args.dry_run:
            print(f"  [模拟] 将保存到: {arxiv_folder}")
            continue

        # 保存元数据
        result = save_paper_metadata(paper, arxiv_folder)
        if result:
            print(f"  ✓ 已保存: {result.name}")
            saved_count += 1
        else:
            print(f"  ⏭ 已存在，跳过")
            skipped_count += 1

        # 下载 PDF
        if args.download_pdfs:
            pdf_path = download_pdf(paper, arxiv_folder)
            if pdf_path:
                pdf_count += 1

    # 总结
    print(f"\n{'='*50}")
    print(f"完成!")
    if args.dry_run:
        print(f"[模拟模式] 找到 {len(papers)} 篇论文")
    else:
        print(f"新增: {saved_count} 篇")
        print(f"跳过: {skipped_count} 篇 (已存在)")
        if args.download_pdfs:
            print(f"下载 PDF: {pdf_count} 个")
        print(f"保存位置: {arxiv_folder}")


if __name__ == "__main__":
    main()
