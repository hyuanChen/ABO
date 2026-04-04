# 哔哩哔哩主动爬取工具实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution

**Goal:** 创建一个主动调用的哔哩哔哩爬取工具，支持关注列表动态获取、关键词过滤、视频详情展示，参考小红书工具前端设计

**Architecture:** 在 `abo/tools/bilibili.py` 中创建独立工具模块，复用 `bilibili-tracker` 模块的API调用逻辑，添加 FastAPI 路由，创建 React 前端页面

**Tech Stack:** Python + httpx + Playwright + FastAPI + React + TypeScript

---

## File Structure

| File | Responsibility |
|------|----------------|
| `abo/tools/bilibili.py` | 哔哩哔哩工具模块（关注流获取、视频搜索、关键词过滤） |
| `abo/routes/tools.py` | FastAPI 路由（新增哔哩哔哩工具端点） |
| `src/api/bilibili.ts` | 前端 API 类型定义和调用函数 |
| `src/modules/bilibili/BilibiliTool.tsx` | 前端主页面（参考小红书工具设计） |
| `src/App.tsx` | 添加路由 |

---

## Task 1: 创建哔哩哔哩工具后端模块

**Files:**
- Create: `abo/tools/bilibili.py`

### Step 1: 创建哔哩哔哩工具模块

**File: `abo/tools/bilibili.py`**

```python
"""
哔哩哔哩主动爬取工具

功能：
1. 获取关注列表动态（视频/图文/文字/专栏）
2. 关键词过滤
3. 视频详情获取
4. 使用 SESSDATA Cookie 访问

依赖：bilibili-tracker 模块的 API 调用逻辑
"""

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import httpx


@dataclass
class BiliVideo:
    """哔哩哔哩视频数据结构"""
    id: str
    title: str
    description: str
    bvid: str
    author: str
    author_id: str
    url: str
    pic: str
    duration: str
    published_at: Optional[datetime] = None
    view_count: int = 0
    like_count: int = 0
    coin_count: int = 0
    dynamic_type: str = "video"  # video, image, text, article


@dataclass
class BiliDynamic:
    """哔哩哔哩动态数据结构"""
    id: str
    dynamic_id: str
    title: str
    content: str
    author: str
    author_id: str
    url: str
    published_at: Optional[datetime] = None
    dynamic_type: str = "text"  # video, image, text, article
    images: list = None
    pic: str = ""  # 视频封面

    def __post_init__(self):
        if self.images is None:
            self.images = []


class BilibiliToolAPI:
    """哔哩哔哩工具 API 封装"""

    API_BASE = "https://api.bilibili.com"
    DYNAMIC_API = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"

    def __init__(self, sessdata: str = None, timeout: int = 30):
        self.sessdata = sessdata
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)

    async def fetch_followed_dynamics(
        self,
        dynamic_types: list[int] = None,
        keywords: list[str] = None,
        limit: int = 20,
        days_back: int = 7,
    ) -> list[BiliDynamic]:
        """
        获取关注列表的动态

        Args:
            dynamic_types: 动态类型 [8=视频, 2=图文, 4=文字, 64=专栏]
            keywords: 关键词过滤列表
            limit: 最大返回数量
            days_back: 只返回几天内的动态

        Returns:
            BiliDynamic 列表
        """
        if not self.sessdata:
            raise ValueError("SESSDATA is required to fetch followed dynamics")

        # 默认获取视频、图文、文字、专栏
        if dynamic_types is None:
            dynamic_types = [8, 2, 4, 64]

        # Build type_list bitmask (268435455 = all types)
        type_list = 268435455
        if dynamic_types:
            type_list = sum(1 << (t - 1) for t in dynamic_types)

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={self.sessdata}",
            "Referer": "https://t.bilibili.com/",
        }

        params = {"type_list": type_list}

        try:
            resp = await self.client.get(
                self.DYNAMIC_API, params=params, headers=headers
            )

            if resp.status_code != 200:
                print(f"[bilibili-tool] API error: {resp.status_code}")
                return []

            data = resp.json()
            if data.get("code") != 0:
                print(f"[bilibili-tool] API error: {data.get('message')}")
                return []

            cards = data.get("data", {}).get("cards", [])
            dynamics = []
            cutoff = datetime.now() - timedelta(days=days_back)

            for card in cards[:limit * 2]:  # 获取更多用于过滤
                dynamic = self._parse_dynamic_card(card, keywords)
                if dynamic:
                    # 时间过滤
                    if dynamic.published_at and dynamic.published_at < cutoff:
                        continue
                    dynamics.append(dynamic)

                    if len(dynamics) >= limit:
                        break

            return dynamics

        except Exception as e:
            print(f"[bilibili-tool] Failed to fetch dynamics: {e}")
            return []

    def _parse_dynamic_card(
        self,
        card: dict,
        keywords: list[str] = None,
    ) -> BiliDynamic | None:
        """解析动态卡片"""
        desc = card.get("desc", {})
        dynamic_id = str(desc.get("dynamic_id", ""))
        dynamic_type = desc.get("type", 0)

        # 解析卡片内容
        try:
            card_content = json.loads(card.get("card", "{}"))
        except:
            card_content = {}

        # 根据类型解析
        if dynamic_type == 8:  # 视频
            return self._parse_video_card(dynamic_id, desc, card_content, keywords)
        elif dynamic_type == 2:  # 图文
            return self._parse_image_card(dynamic_id, desc, card_content, keywords)
        elif dynamic_type == 4:  # 纯文字
            return self._parse_text_card(dynamic_id, desc, card_content, keywords)
        elif dynamic_type == 64:  # 专栏
            return self._parse_article_card(dynamic_id, desc, card_content, keywords)

        return None

    def _parse_video_card(
        self, dynamic_id: str, desc: dict, card: dict, keywords: list[str]
    ) -> BiliDynamic | None:
        """解析视频动态"""
        title = card.get("title", "")
        desc_text = card.get("desc", "")
        bvid = card.get("bvid", "")

        # 关键词过滤
        if keywords:
            content = f"{title} {desc_text}".lower()
            if not any(kw.lower() in content for kw in keywords):
                return None

        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        timestamp = desc.get("timestamp", 0)

        return BiliDynamic(
            id=f"bili-dyn-{dynamic_id}",
            dynamic_id=dynamic_id,
            title=title,
            content=desc_text,
            author=up_name,
            author_id=up_uid,
            url=f"https://www.bilibili.com/video/{bvid}",
            published_at=datetime.fromtimestamp(timestamp) if timestamp else None,
            dynamic_type="video",
            pic=card.get("pic", ""),
        )

    def _parse_image_card(
        self, dynamic_id: str, desc: dict, card: dict, keywords: list[str]
    ) -> BiliDynamic | None:
        """解析图文动态"""
        item = card.get("item", {})
        description = item.get("description", "")

        # 关键词过滤
        if keywords:
            if not any(kw.lower() in description.lower() for kw in keywords):
                return None

        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        timestamp = desc.get("timestamp", 0)

        pictures = item.get("pictures", [])
        images = [p.get("img_src", "") for p in pictures if p.get("img_src")]

        return BiliDynamic(
            id=f"bili-dyn-{dynamic_id}",
            dynamic_id=dynamic_id,
            title=description[:100],
            content=description,
            author=up_name,
            author_id=up_uid,
            url=f"https://t.bilibili.com/{dynamic_id}",
            published_at=datetime.fromtimestamp(timestamp) if timestamp else None,
            dynamic_type="image",
            images=images,
        )

    def _parse_text_card(
        self, dynamic_id: str, desc: dict, card: dict, keywords: list[str]
    ) -> BiliDynamic | None:
        """解析纯文字动态"""
        item = card.get("item", {})
        content = item.get("content", "")

        # 关键词过滤
        if keywords:
            if not any(kw.lower() in content.lower() for kw in keywords):
                return None

        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        timestamp = desc.get("timestamp", 0)

        return BiliDynamic(
            id=f"bili-dyn-{dynamic_id}",
            dynamic_id=dynamic_id,
            title=content[:100],
            content=content,
            author=up_name,
            author_id=up_uid,
            url=f"https://t.bilibili.com/{dynamic_id}",
            published_at=datetime.fromtimestamp(timestamp) if timestamp else None,
            dynamic_type="text",
        )

    def _parse_article_card(
        self, dynamic_id: str, desc: dict, card: dict, keywords: list[str]
    ) -> BiliDynamic | None:
        """解析专栏文章动态"""
        title = card.get("title", "")
        summary = card.get("summary", "")

        # 关键词过滤
        if keywords:
            content = f"{title} {summary}".lower()
            if not any(kw.lower() in content for kw in keywords):
                return None

        up_name = desc.get("user_profile", {}).get("uname", "UP主")
        up_uid = str(desc.get("user_profile", {}).get("uid", ""))
        timestamp = desc.get("timestamp", 0)
        cvid = card.get("id", "")

        return BiliDynamic(
            id=f"bili-dyn-{dynamic_id}",
            dynamic_id=dynamic_id,
            title=title,
            content=summary,
            author=up_name,
            author_id=up_uid,
            url=f"https://www.bilibili.com/read/cv{cvid}",
            published_at=datetime.fromtimestamp(timestamp) if timestamp else None,
            dynamic_type="article",
            pic=card.get("banner_url", ""),
        )

    async def close(self):
        await self.client.aclose()


# === 公开工具函数 ===


async def bilibili_fetch_followed(
    sessdata: str,
    keywords: list[str] = None,
    dynamic_types: list[int] = None,
    limit: int = 20,
    days_back: int = 7,
) -> dict:
    """
    获取关注列表的动态（带关键词过滤）

    Args:
        sessdata: B站登录 Cookie SESSDATA
        keywords: 关键词过滤列表
        dynamic_types: 动态类型 [8=视频, 2=图文, 4=文字, 64=专栏]
        limit: 最大返回数量
        days_back: 只返回几天内的动态

    Returns:
        {
            "total_found": int,
            "dynamics": [
                {
                    "id": str,
                    "dynamic_id": str,
                    "title": str,
                    "content": str,
                    "author": str,
                    "author_id": str,
                    "url": str,
                    "published_at": str,
                    "dynamic_type": str,
                    "pic": str,  # 视频封面或专栏头图
                    "images": list,  # 图文动态的图片列表
                }
            ]
        }
    """
    api = BilibiliToolAPI(sessdata=sessdata)
    try:
        dynamics = await api.fetch_followed_dynamics(
            dynamic_types=dynamic_types,
            keywords=keywords,
            limit=limit,
            days_back=days_back,
        )

        return {
            "total_found": len(dynamics),
            "dynamics": [
                {
                    "id": d.id,
                    "dynamic_id": d.dynamic_id,
                    "title": d.title,
                    "content": d.content[:500] if d.content else "",
                    "author": d.author,
                    "author_id": d.author_id,
                    "url": d.url,
                    "published_at": d.published_at.isoformat() if d.published_at else None,
                    "dynamic_type": d.dynamic_type,
                    "pic": d.pic,
                    "images": d.images,
                }
                for d in dynamics
            ],
        }
    finally:
        await api.close()


async def bilibili_verify_sessdata(sessdata: str) -> dict:
    """
    验证 SESSDATA 是否有效

    Returns:
        {"valid": bool, "message": str}
    """
    api = BilibiliToolAPI(sessdata=sessdata)
    try:
        # 尝试获取关注动态来验证
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Cookie": f"SESSDATA={sessdata}",
            "Referer": "https://t.bilibili.com/",
        }

        resp = await api.client.get(
            api.DYNAMIC_API,
            params={"type_list": 8},
            headers=headers,
        )

        if resp.status_code != 200:
            return {"valid": False, "message": f"HTTP {resp.status_code}"}

        data = resp.json()
        if data.get("code") == -101:
            return {"valid": False, "message": "SESSDATA 已过期或无效"}
        elif data.get("code") == 0:
            return {"valid": True, "message": "验证成功"}
        else:
            return {"valid": False, "message": data.get("message", "未知错误")}

    except Exception as e:
        return {"valid": False, "message": str(e)}
    finally:
        await api.close()
```

---

## Task 2: 添加 FastAPI 路由

**Files:**
- Modify: `abo/routes/tools.py` (或创建)

### Step 2: 创建/更新工具路由

**File: `abo/routes/tools.py`**

```python
"""工具 API 路由"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List

# 小红书工具（已存在）
from abo.tools.xiaohongshu import (
    xiaohongshu_search,
    xiaohongshu_analyze_trends,
    xiaohongshu_fetch_comments,
)

# 哔哩哔哩工具（新增）
from abo.tools.bilibili import (
    bilibili_fetch_followed,
    bilibili_verify_sessdata,
)

router = APIRouter(prefix="/api/tools")


# ===== 小红书工具（已有）=====

class XiaohongshuSearchRequest(BaseModel):
    keyword: str
    max_results: int = 20
    min_likes: int = 100
    sort_by: str = "likes"


class XiaohongshuCommentsRequest(BaseModel):
    note_id: str
    max_comments: int = 50
    sort_by: str = "likes"


class XiaohongshuTrendsRequest(BaseModel):
    keyword: str


@router.post("/xiaohongshu/search")
async def api_xiaohongshu_search(req: XiaohongshuSearchRequest):
    """搜索小红书高赞内容"""
    result = await xiaohongshu_search(
        keyword=req.keyword,
        max_results=req.max_results,
        min_likes=req.min_likes,
        sort_by=req.sort_by,
    )
    return result


@router.post("/xiaohongshu/comments")
async def api_xiaohongshu_comments(req: XiaohongshuCommentsRequest):
    """获取笔记评论（按赞排序）"""
    result = await xiaohongshu_fetch_comments(
        note_id=req.note_id,
        max_comments=req.max_comments,
        sort_by=req.sort_by,
    )
    return result


@router.post("/xiaohongshu/trends")
async def api_xiaohongshu_trends(req: XiaohongshuTrendsRequest):
    """分析小红书 Trends"""
    result = await xiaohongshu_analyze_trends(keyword=req.keyword)
    return result


# ===== 哔哩哔哩工具（新增）=====

class BilibiliFollowedRequest(BaseModel):
    sessdata: str
    keywords: List[str] = []
    dynamic_types: List[int] = [8, 2, 4, 64]  # video, image, text, article
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
```

---

## Task 3: 更新主应用注册路由

**Files:**
- Modify: `abo/main.py`

### Step 3: 在 main.py 中注册工具路由

找到 `abo/main.py` 中的 `app = FastAPI()` 部分，添加：

```python
# 在文件顶部导入
from abo.routes.tools import router as tools_router

# 在创建 app 后注册路由
app = FastAPI(title="ABO API", version="1.0.0")

# ... 其他路由 ...

# 注册工具路由（新增）
app.include_router(tools_router)
```

---

## Task 4: 创建前端 API 类型定义

**Files:**
- Create: `src/api/bilibili.ts`

### Step 4: 创建哔哩哔哩 API 类型和调用函数

**File: `src/api/bilibili.ts`**

```typescript
export interface BiliDynamic {
  id: string;
  dynamic_id: string;
  title: string;
  content: string;
  author: string;
  author_id: string;
  url: string;
  published_at: string | null;
  dynamic_type: "video" | "image" | "text" | "article";
  pic: string;
  images: string[];
}

export interface FetchFollowedRequest {
  sessdata: string;
  keywords?: string[];
  dynamic_types?: number[];
  limit?: number;
  days_back?: number;
}

export interface FetchFollowedResponse {
  total_found: number;
  dynamics: BiliDynamic[];
}

export interface VerifySessdataRequest {
  sessdata: string;
}

export interface VerifySessdataResponse {
  valid: boolean;
  message: string;
}

const API_BASE = "http://127.0.0.1:8765/api/tools";

export async function bilibiliFetchFollowed(
  req: FetchFollowedRequest
): Promise<FetchFollowedResponse> {
  const res = await fetch(`${API_BASE}/bilibili/followed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Fetch failed");
  }
  return res.json();
}

export async function bilibiliVerifySessdata(
  req: VerifySessdataRequest
): Promise<VerifySessdataResponse> {
  const res = await fetch(`${API_BASE}/bilibili/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error("Verification failed");
  return res.json();
}
```

---

## Task 5: 创建哔哩哔哩工具前端页面

**Files:**
- Create: `src/modules/bilibili/BilibiliTool.tsx`
- Create: `src/modules/bilibili/index.ts`

### Step 5.1: 创建主页面组件

**File: `src/modules/bilibili/BilibiliTool.tsx`**

参考小红书工具设计，创建哔哩哔哩工具页面：

```tsx
import { useState, useEffect } from "react";
import {
  Play,
  Users,
  Filter,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
  Image,
  FileText,
  MessageSquare,
  Cookie,
  Settings,
  RefreshCw,
  Tag,
  Trash2,
} from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState, LoadingState } from "../../components/Layout";
import { api } from "../../core/api";
import { useToast } from "../../components/Toast";
import type { BiliDynamic, FetchFollowedResponse } from "../../api/bilibili";
import { bilibiliFetchFollowed, bilibiliVerifySessdata } from "../../api/bilibili";

// 动态类型选项
const DYNAMIC_TYPE_OPTIONS = [
  { value: 8, label: "视频", icon: Play },
  { value: 2, label: "图文", icon: Image },
  { value: 4, label: "文字", icon: MessageSquare },
  { value: 64, label: "专栏", icon: FileText },
];

// 预设关键词
const PRESET_KEYWORDS = ["科研", "学术", "读博", "论文", "AI", "机器学习", "深度学习", "Python"];

export function BilibiliTool() {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const toast = useToast();

  // 配置状态
  const [sessdata, setSessdata] = useState("");
  const [sessdataValid, setSessdataValid] = useState<boolean | null>(null);
  const [keywords, setKeywords] = useState<string[]>(["科研", "学术"]);
  const [newKeyword, setNewKeyword] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<number[]>([8, 2, 4, 64]);
  const [limit, setLimit] = useState(20);
  const [daysBack, setDaysBack] = useState(7);

  // 结果状态
  const [result, setResult] = useState<FetchFollowedResponse | null>(null);

  // 验证 SESSDATA
  const handleVerifySessdata = async () => {
    if (!sessdata.trim()) {
      toast.error("请输入 SESSDATA");
      return;
    }
    setVerifying(true);
    try {
      const res = await bilibiliVerifySessdata({ sessdata: sessdata.trim() });
      setSessdataValid(res.valid);
      if (res.valid) {
        toast.success("SESSDATA 验证成功");
        // 保存到 localStorage
        localStorage.setItem("bilibili_sessdata", sessdata.trim());
      } else {
        toast.error(`验证失败: ${res.message}`);
      }
    } catch (e) {
      toast.error("验证请求失败");
      setSessdataValid(false);
    } finally {
      setVerifying(false);
    }
  };

  // 获取关注动态
  const handleFetch = async () => {
    if (!sessdata.trim()) {
      toast.error("请先输入 SESSDATA");
      return;
    }
    setLoading(true);
    try {
      const res = await bilibiliFetchFollowed({
        sessdata: sessdata.trim(),
        keywords: keywords.length > 0 ? keywords : undefined,
        dynamic_types: selectedTypes,
        limit,
        days_back: daysBack,
      });
      setResult(res);
      toast.success(`获取到 ${res.total_found} 条动态`);
      // 保存配置
      localStorage.setItem("bilibili_keywords", JSON.stringify(keywords));
    } catch (e) {
      console.error("Fetch failed:", e);
      toast.error("获取动态失败，请检查 SESSDATA");
    } finally {
      setLoading(false);
    }
  };

  // 添加关键词
  const handleAddKeyword = () => {
    if (!newKeyword.trim()) return;
    if (keywords.includes(newKeyword.trim())) {
      toast.info("关键词已存在");
      return;
    }
    setKeywords([...keywords, newKeyword.trim()]);
    setNewKeyword("");
  };

  // 删除关键词
  const handleRemoveKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  // 切换动态类型
  const toggleDynamicType = (type: number) => {
    if (selectedTypes.includes(type)) {
      setSelectedTypes(selectedTypes.filter((t) => t !== type));
    } else {
      setSelectedTypes([...selectedTypes, type]);
    }
  };

  // 加载保存的配置
  useEffect(() => {
    const savedSessdata = localStorage.getItem("bilibili_sessdata");
    const savedKeywords = localStorage.getItem("bilibili_keywords");
    if (savedSessdata) {
      setSessdata(savedSessdata);
    }
    if (savedKeywords) {
      try {
        setKeywords(JSON.parse(savedKeywords));
      } catch {}
    }
  }, []);

  // 获取动态类型图标
  const getDynamicTypeIcon = (type: string) => {
    switch (type) {
      case "video":
        return <Play style={{ width: "14px", height: "14px" }} />;
      case "image":
        return <Image style={{ width: "14px", height: "14px" }} />;
      case "text":
        return <MessageSquare style={{ width: "14px", height: "14px" }} />;
      case "article":
        return <FileText style={{ width: "14px", height: "14px" }} />;
      default:
        return null;
    }
  };

  // 获取动态类型标签
  const getDynamicTypeLabel = (type: string) => {
    switch (type) {
      case "video":
        return "视频";
      case "image":
        return "图文";
      case "text":
        return "文字";
      case "article":
        return "专栏";
      default:
        return type;
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="哔哩哔哩关注追踪"
        subtitle="获取关注列表动态，按关键词过滤"
        icon={Users}
      />
      <PageContent maxWidth="1200px">
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* SESSDATA 配置 */}
          <Card title="登录配置" icon={<Cookie style={{ width: "18px", height: "18px" }} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                获取 SESSDATA 方法：登录 bilibili.com → F12 打开开发者工具 →
                Application/Storage → Cookies → 复制 SESSDATA 值
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <input
                  type="password"
                  value={sessdata}
                  onChange={(e) => {
                    setSessdata(e.target.value);
                    setSessdataValid(null);
                  }}
                  placeholder="输入 SESSDATA..."
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-card)",
                    color: "var(--text-main)",
                    fontSize: "0.9375rem",
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleVerifySessdata}
                  disabled={verifying || !sessdata.trim()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "12px 24px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: verifying ? "var(--bg-hover)" : "var(--color-primary)",
                    color: "white",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    cursor: verifying || !sessdata.trim() ? "not-allowed" : "pointer",
                    opacity: verifying || !sessdata.trim() ? 0.6 : 1,
                  }}
                >
                  {verifying ? (
                    <span className="animate-spin">⟳</span>
                  ) : sessdataValid === true ? (
                    <CheckCircle style={{ width: "16px", height: "16px" }} />
                  ) : (
                    "验证"
                  )}
                  {verifying ? "验证中..." : sessdataValid === true ? "有效" : "验证"}
                </button>
              </div>
              {sessdataValid === false && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-danger)20",
                    color: "var(--color-danger)",
                    fontSize: "0.875rem",
                  }}
                >
                  <AlertCircle style={{ width: "16px", height: "16px" }} />
                  SESSDATA 无效或已过期，请重新获取
                </div>
              )}
            </div>
          </Card>

          {/* 过滤配置 */}
          <Card title="过滤设置" icon={<Filter style={{ width: "18px", height: "18px" }} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* 关键词 */}
              <div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "var(--text-main)",
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Tag style={{ width: "16px", height: "16px" }} />
                  关键词过滤（只显示包含这些关键词的动态）
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "var(--radius-full)",
                        background: "var(--color-primary)15",
                        color: "var(--color-primary)",
                        fontSize: "0.875rem",
                      }}
                    >
                      {kw}
                      <button
                        onClick={() => handleRemoveKeyword(kw)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          border: "none",
                          background: "var(--color-primary)",
                          color: "white",
                          cursor: "pointer",
                          fontSize: "10px",
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                    placeholder="输入关键词..."
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleAddKeyword}
                    disabled={!newKeyword.trim()}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "var(--radius-md)",
                      border: "none",
                      background: "var(--color-primary)",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor: !newKeyword.trim() ? "not-allowed" : "pointer",
                      opacity: !newKeyword.trim() ? 0.6 : 1,
                    }}
                  >
                    添加
                  </button>
                </div>
                {/* 预设关键词 */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginRight: "4px" }}>
                    快速添加:
                  </span>
                  {PRESET_KEYWORDS.filter((k) => !keywords.includes(k)).map((kw) => (
                    <button
                      key={kw}
                      onClick={() => setKeywords([...keywords, kw])}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-hover)",
                        color: "var(--text-secondary)",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      + {kw}
                    </button>
                  ))}
                </div>
              </div>

              {/* 动态类型 */}
              <div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "var(--text-main)",
                    marginBottom: "12px",
                  }}
                >
                  动态类型
                </div>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {DYNAMIC_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => toggleDynamicType(value)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 16px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid",
                        borderColor: selectedTypes.includes(value)
                          ? "var(--color-primary)"
                          : "var(--border-light)",
                        background: selectedTypes.includes(value)
                          ? "var(--color-primary)15"
                          : "var(--bg-card)",
                        color: selectedTypes.includes(value)
                          ? "var(--color-primary)"
                          : "var(--text-secondary)",
                        fontSize: "0.875rem",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <Icon style={{ width: "16px", height: "16px" }} />
                      {label}
                      {selectedTypes.includes(value) && <CheckCircle style={{ width: "14px", height: "14px" }} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* 时间和数量限制 */}
              <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                <div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--text-main)",
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Clock style={{ width: "14px", height: "14px" }} />
                    时间范围
                  </div>
                  <select
                    value={daysBack}
                    onChange={(e) => setDaysBack(Number(e.target.value))}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                  >
                    <option value={1}>最近 1 天</option>
                    <option value={3}>最近 3 天</option>
                    <option value={7}>最近 7 天</option>
                    <option value={14}>最近 14 天</option>
                    <option value={30}>最近 30 天</option>
                  </select>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--text-main)",
                      marginBottom: "8px",
                    }}
                  >
                    最大数量
                  </div>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                      color: "var(--text-main)",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                  >
                    <option value={10}>10 条</option>
                    <option value={20}>20 条</option>
                    <option value={50}>50 条</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          {/* 获取按钮 */}
          <button
            onClick={handleFetch}
            disabled={loading || !sessdata.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "16px 32px",
              borderRadius: "var(--radius-lg)",
              border: "none",
              background: loading ? "var(--bg-hover)" : "var(--color-primary)",
              color: "white",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading || !sessdata.trim() ? "not-allowed" : "pointer",
              opacity: loading || !sessdata.trim() ? 0.6 : 1,
              transition: "all 0.2s",
            }}
          >
            {loading ? (
              <>
                <RefreshCw style={{ width: "20px", height: "20px" }} className="animate-spin" />
                获取中...
              </>
            ) : (
              <>
                <RefreshCw style={{ width: "20px", height: "20px" }} />
                获取关注动态
              </>
            )}
          </button>

          {/* 结果展示 */}
          {result && (
            <Card
              title={`关注动态 (${result.total_found})`}
              icon={<Users style={{ width: "18px", height: "18px" }} />}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {result.dynamics.map((dyn) => (
                  <div
                    key={dyn.id}
                    style={{
                      padding: "16px",
                      borderRadius: "var(--radius-lg)",
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    {/* 标题行 */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "4px 10px",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--color-primary)20",
                            color: "var(--color-primary)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          {getDynamicTypeIcon(dyn.dynamic_type)}
                          {getDynamicTypeLabel(dyn.dynamic_type)}
                        </span>
                        <h4
                          style={{
                            fontSize: "0.9375rem",
                            fontWeight: 600,
                            color: "var(--text-main)",
                            flex: 1,
                          }}
                        >
                          {dyn.title}
                        </h4>
                      </div>
                      <a
                        href={dyn.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "6px 12px",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--color-primary)",
                          color: "white",
                          fontSize: "0.75rem",
                          textDecoration: "none",
                          marginLeft: "12px",
                        }}
                      >
                        <ExternalLink style={{ width: "12px", height: "12px" }} />
                        查看
                      </a>
                    </div>

                    {/* 内容 */}
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.6,
                        marginBottom: "12px",
                      }}
                    >
                      {dyn.content}
                    </p>

                    {/* 图片（图文动态） */}
                    {dyn.images && dyn.images.length > 0 && (
                      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                        {dyn.images.slice(0, 4).map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`图片 ${idx + 1}`}
                            style={{
                              width: "80px",
                              height: "80px",
                              objectFit: "cover",
                              borderRadius: "var(--radius-md)",
                            }}
                          />
                        ))}
                        {dyn.images.length > 4 && (
                          <div
                            style={{
                              width: "80px",
                              height: "80px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "var(--radius-md)",
                              background: "var(--bg-card)",
                              color: "var(--text-muted)",
                              fontSize: "0.75rem",
                            }}
                          >
                            +{dyn.images.length - 4}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 视频封面 */}
                    {dyn.dynamic_type === "video" && dyn.pic && (
                      <div style={{ marginBottom: "12px" }}>
                        <img
                          src={dyn.pic}
                          alt={dyn.title}
                          style={{
                            width: "100%",
                            maxWidth: "320px",
                            height: "180px",
                            objectFit: "cover",
                            borderRadius: "var(--radius-md)",
                          }}
                        />
                      </div>
                    )}

                    {/* 元信息 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.8125rem", color: "var(--color-primary)", fontWeight: 600 }}>
                        @{dyn.author}
                      </span>
                      {dyn.published_at && (
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                          {new Date(dyn.published_at).toLocaleString("zh-CN")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {result.dynamics.length === 0 && (
                  <EmptyState
                    icon={Filter}
                    title="没有找到匹配的内容"
                    description="尝试调整关键词或扩大时间范围"
                  />
                )}
              </div>
            </Card>
          )}

          {!result && !loading && (
            <EmptyState
              icon={Users}
              title="开始获取关注动态"
              description="配置 SESSDATA 和关键词后，点击获取按钮"
            />
          )}
        </div>
      </PageContent>
    </PageContainer>
  );
}
```

### Step 5.2: 创建索引文件

**File: `src/modules/bilibili/index.ts`**

```typescript
export { BilibiliTool } from "./BilibiliTool";
```

---

## Task 6: 更新 App.tsx 添加路由

**Files:**
- Modify: `src/App.tsx`

### Step 6: 添加哔哩哔哩工具路由

在 `src/App.tsx` 中找到路由配置部分，添加：

```tsx
// 在导入部分添加
import { BilibiliTool } from "./modules/bilibili";

// 在路由配置中添加
{
  id: "bilibili-tool",
  label: "哔哩哔哩",
  icon: Play,
  component: BilibiliTool,
},
```

---

## Task 7: 更新导航侧边栏（如果需要）

如果导航是动态生成的，检查 `src/modules/nav/NavSidebar.tsx` 确保新路由会被显示。

---

## Task 8: 测试和提交

### Step 8.1: 类型检查

```bash
cd /Users/huanc/Desktop/ABO
npx tsc --noEmit
```

### Step 8.2: 运行测试

```bash
python -m pytest tests/ -v -k bilibili --tb=short 2>/dev/null || echo "No bilibili tests yet"
```

### Step 8.3: Git 提交

```bash
cd /Users/huanc/Desktop/ABO
git add abo/tools/bilibili.py abo/routes/tools.py src/api/bilibili.ts src/modules/bilibili/ src/App.tsx
git commit -m "feat(bilibili): add proactive crawling tool

- Add bilibili tool module for fetching followed dynamics
- Add FastAPI routes /api/tools/bilibili/followed and /verify
- Add React frontend BilibiliTool with keyword filtering
- Support video, image, text, and article dynamic types
- LocalStorage persistence for SESSDATA and keywords"
```

---

## 使用说明

### 获取 SESSDATA

1. 登录 bilibili.com
2. 按 F12 打开开发者工具
3. 切换到 Application/Storage → Cookies → https://bilibili.com
4. 找到 `SESSDATA` 字段并复制值

### 配置关键词

- 支持多关键词过滤（OR 关系）
- 预设关键词快速添加
- 可随时增删关键词

### 动态类型

- **视频** (8): 视频投稿
- **图文** (2): 带图片的动态
- **文字** (4): 纯文字动态
- **专栏** (64): 专栏文章

---

## 自检清单

- [ ] 后端工具模块 `abo/tools/bilibili.py` 实现完整
- [ ] FastAPI 路由 `/api/tools/bilibili/followed` 工作正常
- [ ] FastAPI 路由 `/api/tools/bilibili/verify` 工作正常
- [ ] 前端 API 类型定义完整
- [ ] 前端页面 `BilibiliTool.tsx` 设计符合规范
- [ ] SESSDATA 验证功能正常
- [ ] 关键词过滤功能正常
- [ ] 动态类型筛选功能正常
- [ ] 时间范围和数量限制功能正常
- [ ] 配置持久化到 localStorage
- [ ] 类型检查通过
- [ ] Git 提交完成

---

**Plan complete. Execute inline using executing-plans skill.**
