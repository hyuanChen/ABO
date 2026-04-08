"""工具 API 路由"""

import json

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from abo.tools.xiaohongshu import (
    xiaohongshu_search,
    xiaohongshu_analyze_trends,
    xiaohongshu_fetch_comments,
    xiaohongshu_verify_cookie,
)
from abo.tools.bilibili import (
    bilibili_fetch_followed,
    bilibili_verify_sessdata,
)
from abo.tools.zhihu import (
    zhihu_search,
    zhihu_analyze_trends,
    zhihu_fetch_comments,
)
from abo.tools.arxiv_api import arxiv_api_search

router = APIRouter(prefix="/api/tools", tags=["tools"])


class SearchRequest(BaseModel):
    keyword: str
    max_results: int = 20
    min_likes: int = 100
    sort_by: str = "likes"  # likes, time
    cookie: Optional[str] = None  # 小红书登录 Cookie


class CommentsRequest(BaseModel):
    note_id: str
    max_comments: int = 50
    sort_by: str = "likes"


class TrendsRequest(BaseModel):
    keyword: str


class ZhihuSearchRequest(BaseModel):
    keyword: str
    max_results: int = 20
    min_votes: int = 100
    sort_by: str = "votes"  # votes, time
    cookie: Optional[str] = None


class ZhihuCommentsRequest(BaseModel):
    content_id: str
    max_comments: int = 50
    sort_by: str = "likes"


class ZhihuTrendsRequest(BaseModel):
    keyword: str


class ArxivAPISearchRequest(BaseModel):
    keywords: list[str]
    categories: Optional[list[str]] = None
    mode: str = "OR"
    max_results: int = 50
    days_back: Optional[int] = None
    sort_by: str = "submittedDate"
    sort_order: str = "descending"


class ArxivAPISearchResponse(BaseModel):
    total: int
    papers: list[dict]
    query: str
    search_time_ms: float


@router.post("/xiaohongshu/search")
async def api_xiaohongshu_search(req: SearchRequest):
    """搜索小红书高赞内容"""
    from fastapi import HTTPException
    try:
        result = await xiaohongshu_search(
            keyword=req.keyword,
            max_results=req.max_results,
            min_likes=req.min_likes,
            sort_by=req.sort_by,
            cookie=req.cookie,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/xiaohongshu/config")
async def get_xiaohongshu_config():
    """获取小红书工具配置（从全局配置中读取）"""
    from abo.config import load as load_config
    config = load_config()
    return {
        "cookie_configured": bool(config.get("xiaohongshu_cookie")),
        "cookie_preview": config.get("xiaohongshu_cookie", "")[:50] + "..." if config.get("xiaohongshu_cookie") else None,
    }


class CookieConfig(BaseModel):
    cookie: str


class FollowingFeedRequest(BaseModel):
    cookie: str
    keywords: list[str]
    max_notes: int = 50


@router.post("/xiaohongshu/following-feed")
async def api_xiaohongshu_following_feed(req: FollowingFeedRequest):
    """获取关注列表中匹配关键词的笔记"""
    from abo.tools.xiaohongshu import XiaohongshuAPI

    api = XiaohongshuAPI()
    try:
        notes = await api.get_following_feed_with_cookie(
            cookie=req.cookie,
            keywords=req.keywords,
            max_notes=req.max_notes,
        )
        return {
            "total_found": len(notes),
            "notes": [
                {
                    "id": n.id,
                    "title": n.title,
                    "content": n.content,
                    "author": n.author,
                    "likes": n.likes,
                    "collects": n.collects,
                    "comments_count": n.comments_count,
                    "url": n.url,
                    "published_at": n.published_at.isoformat() if n.published_at else None,
                    "matched_keywords": getattr(n, 'matched_keywords', []),
                }
                for n in notes
            ]
        }
    finally:
        await api.close()


@router.post("/xiaohongshu/config")
async def set_xiaohongshu_config(config: CookieConfig):
    """保存小红书 Cookie 配置"""
    from abo.config import load as load_config, save as save_config
    existing = load_config()
    existing["xiaohongshu_cookie"] = config.cookie
    save_config(existing)
    return {
        "success": True,
        "cookie_configured": True,
        "cookie_preview": config.cookie[:50] + "..." if len(config.cookie) > 50 else config.cookie,
    }


@router.post("/xiaohongshu/config/from-browser")
async def get_cookie_from_browser():
    """从本地 Chrome 浏览器自动获取小红书 Cookie"""
    try:
        import browser_cookie3
        import requests.utils

        # 获取 Chrome 浏览器的 cookie
        cj = browser_cookie3.chrome(domain_name="xiaohongshu.com")

        # 转换为字符串格式
        cookie_list = []
        for cookie in cj:
            cookie_list.append({
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
            })

        if not cookie_list:
            return {
                "success": False,
                "error": "未找到小红书 Cookie，请先登录 xiaohongshu.com",
            }

        # 保存到配置
        from abo.config import load as load_config, save as save_config
        existing = load_config()
        existing["xiaohongshu_cookie"] = json.dumps(cookie_list)
        save_config(existing)

        return {
            "success": True,
            "cookie_count": len(cookie_list),
            "cookie_preview": json.dumps(cookie_list)[:100] + "...",
            "message": f"成功从浏览器获取 {len(cookie_list)} 个 Cookie",
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"获取浏览器 Cookie 失败: {str(e)}",
        }


@router.post("/xiaohongshu/comments")
async def api_xiaohongshu_comments(req: CommentsRequest):
    """获取笔记评论（按赞排序）"""
    result = await xiaohongshu_fetch_comments(
        note_id=req.note_id,
        max_comments=req.max_comments,
        sort_by=req.sort_by,
    )
    return result


@router.post("/xiaohongshu/trends")
async def api_xiaohongshu_trends(req: TrendsRequest):
    """分析小红书 Trends"""
    result = await xiaohongshu_analyze_trends(keyword=req.keyword)
    return result


class XiaohongshuVerifyRequest(BaseModel):
    web_session: str
    id_token: Optional[str] = None


@router.post("/xiaohongshu/verify")
async def api_xiaohongshu_verify(req: XiaohongshuVerifyRequest):
    """验证小红书 web_session 是否有效"""
    result = await xiaohongshu_verify_cookie(req.web_session, req.id_token)
    return result


# ===== 哔哩哔哩工具 =====

class BilibiliFollowedRequest(BaseModel):
    sessdata: str
    keywords: list[str] = []
    dynamic_types: list[int] = [8, 2, 4, 64]  # video, image, text, article
    limit: int = 20
    days_back: int = 7


class BilibiliVerifyRequest(BaseModel):
    sessdata: str


@router.post("/bilibili/followed")
async def api_bilibili_followed(req: BilibiliFollowedRequest):
    """
    获取哔哩哔哩关注列表动态（带关键词过滤）

    - sessdata: B站登录 Cookie
    - keywords: 关键词过滤列表
    - dynamic_types: [8=视频, 2=图文, 4=文字, 64=专栏]
    - limit: 最大返回数量
    - days_back: 只返回几天内的动态
    """
    result = await bilibili_fetch_followed(
        sessdata=req.sessdata,
        keywords=req.keywords if req.keywords else None,
        dynamic_types=req.dynamic_types,
        limit=req.limit,
        days_back=req.days_back,
    )
    return result


@router.post("/bilibili/verify")
async def api_bilibili_verify(req: BilibiliVerifyRequest):
    """验证 SESSDATA 是否有效"""
    result = await bilibili_verify_sessdata(req.sessdata)
    return result


@router.post("/bilibili/debug")
async def api_bilibili_debug(req: BilibiliVerifyRequest):
    """
    调试端点：直接测试 Bilibili API 并返回原始响应
    用于诊断为什么获取不到关注动态
    """
    import httpx

    DYNAMIC_API = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": f"SESSDATA={req.sessdata}",
        "Referer": "https://t.bilibili.com/",
    }

    results = {}

    async with httpx.AsyncClient(timeout=30) as client:
        # 测试 1: type_list=8 (仅视频)
        try:
            resp1 = await client.get(DYNAMIC_API, params={"type_list": 8}, headers=headers)
            data1 = resp1.json()
            results["video_only"] = {
                "status_code": resp1.status_code,
                "code": data1.get("code"),
                "message": data1.get("message"),
                "cards_count": len(data1.get("data", {}).get("cards", [])),
            }
        except Exception as e:
            results["video_only"] = {"error": str(e)}

        # 测试 2: type_list=268435455 (全部)
        try:
            resp2 = await client.get(DYNAMIC_API, params={"type_list": 268435455}, headers=headers)
            data2 = resp2.json()
            cards = data2.get("data", {}).get("cards", [])
            results["all_types"] = {
                "status_code": resp2.status_code,
                "code": data2.get("code"),
                "message": data2.get("message"),
                "cards_count": len(cards),
                "first_card_types": [c.get("desc", {}).get("type") for c in cards[:5]],
            }
        except Exception as e:
            results["all_types"] = {"error": str(e)}

        # 测试 3: 无 type_list 参数
        try:
            resp3 = await client.get(DYNAMIC_API, headers=headers)
            data3 = resp3.json()
            results["no_params"] = {
                "status_code": resp3.status_code,
                "code": data3.get("code"),
                "message": data3.get("message"),
                "cards_count": len(data3.get("data", {}).get("cards", [])),
            }
        except Exception as e:
            results["no_params"] = {"error": str(e)}

    return {
        "sessdata_preview": req.sessdata[:20] + "..." if len(req.sessdata) > 20 else req.sessdata,
        "tests": results,
        "suggestions": [
            "如果所有测试都返回 0 卡片，可能是：",
            "1. SESSDATA 过期但 API 没有正确返回错误码",
            "2. 账号没有关注任何用户",
            "3. 关注用户最近没有发布动态",
            "4. API 端点或参数格式已更改",
            "5. 需要在 Cookie 中提供额外的验证字段（如 bili_jct）",
        ]
    }


@router.get("/bilibili/config")
async def get_bilibili_config():
    """获取哔哩哔哩工具配置（从全局配置中读取）"""
    from abo.config import load as load_config
    config = load_config()
    return {
        "cookie_configured": bool(config.get("bilibili_cookie")),
        "cookie_preview": config.get("bilibili_cookie", "")[:50] + "..." if config.get("bilibili_cookie") else None,
    }


@router.post("/bilibili/config")
async def set_bilibili_config(config: CookieConfig):
    """保存哔哩哔哩 Cookie 配置"""
    from abo.config import load as load_config, save as save_config
    existing = load_config()
    existing["bilibili_cookie"] = config.cookie
    save_config(existing)
    return {
        "success": True,
        "cookie_configured": True,
        "cookie_preview": config.cookie[:50] + "..." if len(config.cookie) > 50 else config.cookie,
    }


@router.post("/bilibili/config/from-browser")
async def get_bilibili_cookie_from_browser():
    """从本地 Chrome 浏览器自动获取哔哩哔哩 Cookie"""
    try:
        import browser_cookie3

        # 获取 Chrome 浏览器的 cookie
        cj = browser_cookie3.chrome(domain_name="bilibili.com")

        # 转换为列表格式
        cookie_list = []
        for cookie in cj:
            cookie_list.append({
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
            })

        if not cookie_list:
            return {
                "success": False,
                "error": "未找到哔哩哔哩 Cookie，请先登录 bilibili.com",
            }

        # 保存到配置
        from abo.config import load as load_config, save as save_config
        existing = load_config()
        existing["bilibili_cookie"] = json.dumps(cookie_list)
        save_config(existing)

        return {
            "success": True,
            "cookie_count": len(cookie_list),
            "cookie_preview": json.dumps(cookie_list)[:100] + "...",
            "message": f"成功从浏览器获取 {len(cookie_list)} 个 Cookie",
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"获取浏览器 Cookie 失败: {str(e)}",
        }


# === 知乎工具 API ===

@router.post("/zhihu/search")
async def api_zhihu_search(req: ZhihuSearchRequest):
    """搜索知乎高赞内容"""
    result = await zhihu_search(
        keyword=req.keyword,
        max_results=req.max_results,
        min_votes=req.min_votes,
        sort_by=req.sort_by,
        cookie=req.cookie,
    )
    return result


@router.get("/zhihu/config")
async def get_zhihu_config():
    """获取知乎工具配置"""
    from abo.config import load as load_config
    config = load_config()
    return {
        "cookie_configured": bool(config.get("zhihu_cookie")),
        "cookie_preview": config.get("zhihu_cookie", "")[:50] + "..." if config.get("zhihu_cookie") else None,
    }


@router.post("/zhihu/config")
async def set_zhihu_config(config: CookieConfig):
    """保存知乎 Cookie 配置"""
    from abo.config import load as load_config, save as save_config
    existing = load_config()
    existing["zhihu_cookie"] = config.cookie
    save_config(existing)
    return {
        "success": True,
        "cookie_configured": True,
        "cookie_preview": config.cookie[:50] + "..." if len(config.cookie) > 50 else config.cookie,
    }


@router.post("/zhihu/config/from-browser")
async def get_zhihu_cookie_from_browser():
    """从本地浏览器自动获取知乎 Cookie"""
    try:
        import browser_cookie3

        # 获取 Chrome 浏览器的 cookie
        cj = browser_cookie3.chrome(domain_name="zhihu.com")

        # 转换为列表格式
        cookie_list = []
        for cookie in cj:
            cookie_list.append({
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
            })

        if not cookie_list:
            return {
                "success": False,
                "error": "未找到知乎 Cookie，请先登录 zhihu.com",
            }

        # 保存到配置
        from abo.config import load as load_config, save as save_config
        existing = load_config()
        existing["zhihu_cookie"] = json.dumps(cookie_list)
        save_config(existing)

        return {
            "success": True,
            "cookie_count": len(cookie_list),
            "cookie_preview": json.dumps(cookie_list)[:100] + "...",
            "message": f"成功从浏览器获取 {len(cookie_list)} 个 Cookie",
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"获取浏览器 Cookie 失败: {str(e)}",
        }


@router.post("/zhihu/comments")
async def api_zhihu_comments(req: ZhihuCommentsRequest):
    """获取知乎内容评论"""
    result = await zhihu_fetch_comments(
        content_id=req.content_id,
        max_comments=req.max_comments,
        sort_by=req.sort_by,
    )
    return result


@router.post("/zhihu/trends")
async def api_zhihu_trends(req: ZhihuTrendsRequest):
    """分析知乎 Trends"""
    result = await zhihu_analyze_trends(keyword=req.keyword)
    return result


# ===== arXiv API 工具 =====

@router.post("/arxiv/search")
async def api_arxiv_search(req: ArxivAPISearchRequest):
    import time
    from fastapi import HTTPException
    start_time = time.time()

    if req.mode not in ("AND", "OR"):
        raise HTTPException(status_code=400, detail="mode must be 'AND' or 'OR'")

    try:
        papers = await arxiv_api_search(
            keywords=req.keywords,
            categories=req.categories,
            mode=req.mode,
            max_results=req.max_results,
            days_back=req.days_back,
            sort_by=req.sort_by,
            sort_order=req.sort_order,
        )
        search_time_ms = (time.time() - start_time) * 1000
        return {
            "total": len(papers),
            "papers": papers,
            "query": " ".join(req.keywords),
            "search_time_ms": round(search_time_ms, 2),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"arXiv API error: {str(e)}")


@router.get("/arxiv/categories")
async def get_arxiv_categories():
    from abo.default_modules.arxiv.category import ALL_SUBCATEGORIES
    return {
        "categories": [
            {"code": code, "name": name, "main": code.split(".")[0]}
            for code, name in ALL_SUBCATEGORIES.items()
        ]
    }


class ArxivFiguresRequest(BaseModel):
    arxiv_id: str


@router.post("/arxiv/figures")
async def api_arxiv_figures(req: ArxivFiguresRequest):
    """获取arXiv论文的图片（模型架构图等）"""
    from abo.tools.arxiv_api import ArxivAPITool
    tool = ArxivAPITool()
    try:
        figures = await tool.fetch_figures(req.arxiv_id)
        return {"figures": figures}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch figures: {str(e)}")


class ArxivSaveRequest(BaseModel):
    arxiv_id: str
    title: str
    authors: list[str]
    summary: str
    pdf_url: str
    arxiv_url: str
    primary_category: str
    published: str
    comment: Optional[str] = None
    figures: list[dict] = []


@router.post("/arxiv/save")
async def api_arxiv_save(req: ArxivSaveRequest):
    """保存arXiv论文为markdown格式，同时下载PDF到文献库/arxiv目录"""
    from pathlib import Path
    import httpx
    import aiofiles
    import re
    import base64
    from mimetypes import guess_extension
    from abo.config import get_literature_path

    # 获取文献库路径，如果不存在则报错
    lit_path = get_literature_path()
    if not lit_path:
        raise HTTPException(status_code=400, detail="未配置文献库路径，请先在设置中配置")

    # 保存到文献库/arxiv目录
    base_dir = lit_path / "arxiv"
    try:
        base_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"无法创建目录: {str(e)}")

    # 清理标题作为文件名 (标题在前，arxiv id 在后)
    safe_title = re.sub(r'[^\w\s-]', '', req.title)[:50].strip().replace(' ', '_')
    md_file_name = f"{safe_title}_{req.arxiv_id}.md"
    pdf_file_name = f"{safe_title}_{req.arxiv_id}.pdf"
    md_file_path = base_dir / md_file_name
    pdf_file_path = base_dir / pdf_file_name

    # 构建markdown内容
    md_content = f"""# {req.title}

**Authors:** {', '.join(req.authors)}

**arXiv ID:** [{req.arxiv_id}]({req.arxiv_url})

**Category:** {req.primary_category}

**Published:** {req.published}

**PDF:** [[{pdf_file_name}]]

{req.comment and f"**Comment:** {req.comment}" or ""}

## Abstract

{req.summary}

"""

    # 下载图片并嵌入base64
    if req.figures:
        md_content += "## Figures\n\n"
        async with httpx.AsyncClient(timeout=30) as client:
            for i, fig in enumerate(req.figures[:6]):  # 最多6张图
                try:
                    img_url = fig.get("url", "")
                    if not img_url:
                        continue
                    img_resp = await client.get(img_url)
                    if img_resp.status_code == 200:
                        # 获取图片格式
                        content_type = img_resp.headers.get("content-type", "image/png")
                        ext = guess_extension(content_type) or ".png"
                        ext = ext.lstrip(".") or "png"
                        # 转base64
                        b64_data = base64.b64encode(img_resp.content).decode("utf-8")
                        caption = fig.get("caption", f"Figure {i+1}")
                        md_content += f"### {caption}\n\n"
                        md_content += f"<img src=\"data:{content_type};base64,{b64_data}\" width=\"600\" />\n\n"
                except Exception as e:
                    md_content += f"*Figure {i+1}: [图片链接]({fig.get('url', '')})*\n\n"

    # 同时执行：写入markdown + 下载PDF
    async with httpx.AsyncClient(timeout=120) as client:
        # 下载PDF
        pdf_downloaded = False
        try:
            pdf_resp = await client.get(req.pdf_url, follow_redirects=True)
            if pdf_resp.status_code == 200:
                async with aiofiles.open(pdf_file_path, "wb") as f:
                    await f.write(pdf_resp.content)
                pdf_downloaded = True
        except Exception as e:
            print(f"Failed to download PDF: {e}")

    # 写入markdown文件
    async with aiofiles.open(md_file_path, "w", encoding="utf-8") as f:
        await f.write(md_content)

    return {
        "success": True,
        "saved_to": str(md_file_path),
        "pdf_path": str(pdf_file_path) if pdf_downloaded else None,
        "files": [md_file_name, pdf_file_name] if pdf_downloaded else [md_file_name],
    }
