"""工具 API 路由"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from abo.tools.xiaohongshu import (
    xiaohongshu_search,
    xiaohongshu_analyze_trends,
    xiaohongshu_fetch_comments,
)

router = APIRouter(prefix="/api/tools")


class SearchRequest(BaseModel):
    keyword: str
    max_results: int = 20
    min_likes: int = 100
    sort_by: str = "likes"  # likes, time


class CommentsRequest(BaseModel):
    note_id: str
    max_comments: int = 50
    sort_by: str = "likes"


class TrendsRequest(BaseModel):
    keyword: str


@router.post("/xiaohongshu/search")
async def api_xiaohongshu_search(req: SearchRequest):
    """搜索小红书高赞内容"""
    result = await xiaohongshu_search(
        keyword=req.keyword,
        max_results=req.max_results,
        min_likes=req.min_likes,
        sort_by=req.sort_by,
    )
    return result


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
