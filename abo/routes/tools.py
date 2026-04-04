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


@router.post("/xiaohongshu/verify")
async def api_xiaohongshu_verify(req: XiaohongshuVerifyRequest):
    """验证小红书 web_session 是否有效"""
    result = await xiaohongshu_verify_cookie(req.web_session)
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
