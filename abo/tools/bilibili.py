"""
哔哩哔哩主动爬取工具

功能：
1. 获取关注列表动态（视频/图文/文字/专栏）
2. 关键词过滤
3. 视频详情获取
4. 使用 SESSDATA Cookie 访问

依赖：bilibili-tracker 模块的 API 调用逻辑
"""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

import httpx


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

    async def _fetch_single_type(
        self,
        type_list: int,
        keywords: list[str] = None,
        limit: int = 20,
        days_back: int = 7,
    ) -> list[BiliDynamic]:
        """获取单个类型的动态（内部方法）"""
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
                print(f"[bilibili-tool] API error for type_list={type_list}: {resp.status_code}")
                return []

            data = resp.json()

            if data.get("code") != 0:
                print(f"[bilibili-tool] API error for type_list={type_list}: {data.get('message')}")
                return []

            cards = data.get("data", {}).get("cards", [])
            dynamics = []
            cutoff = datetime.now() - timedelta(days=days_back)

            for card in cards[:limit]:
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
            print(f"[bilibili-tool] Failed to fetch type_list={type_list}: {e}")
            return []

    async def fetch_followed_dynamics(
        self,
        dynamic_types: list[int] = None,
        keywords: list[str] = None,
        limit: int = 20,
        days_back: int = 7,
    ) -> list[BiliDynamic]:
        """
        获取关注列表的动态

        Note: Bilibili API 不支持组合 type_list，只能传单个类型或 268435455 (all)
        所以我们需要分别获取每种类型，然后合并

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

        VALID_TYPES = {1, 2, 4, 8, 64}
        valid_types = [t for t in dynamic_types if t in VALID_TYPES]

        print(f"[bilibili-tool] Fetching types: {valid_types}, limit={limit}, days_back={days_back}")

        all_dynamics = []

        # Bilibili API 不支持组合 type_list，需要分别获取每种类型
        for type_val in valid_types:
            type_dynamics = await self._fetch_single_type(
                type_list=type_val,
                keywords=keywords,
                limit=limit // len(valid_types) + 5,  # 每种类型分配限额
                days_back=days_back,
            )
            print(f"[bilibili-tool] Type {type_val}: got {len(type_dynamics)} dynamics")
            all_dynamics.extend(type_dynamics)

        # 按时间排序
        all_dynamics.sort(key=lambda x: x.published_at or datetime.min, reverse=True)

        # 去重（按 dynamic_id）
        seen_ids = set()
        unique_dynamics = []
        for d in all_dynamics:
            if d.dynamic_id not in seen_ids:
                seen_ids.add(d.dynamic_id)
                unique_dynamics.append(d)

        print(f"[bilibili-tool] Total: {len(unique_dynamics)} unique dynamics (after dedup)")
        return unique_dynamics[:limit]

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
        except json.JSONDecodeError:
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
        item = card.get("item") or {}
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
        item = card.get("item") or {}
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
    """
    print(f"[bilibili-tool] Fetch request: keywords={keywords}, types={dynamic_types}, limit={limit}, days={days_back}")
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
    """
    api = BilibiliToolAPI(sessdata=sessdata)
    try:
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
