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
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

import httpx

from abo.tools.bilibili_video_meta import (
    extract_bvid,
    fetch_bilibili_video_metadata,
    merge_tags,
)


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
    bvid: str = ""
    tags: list[str] = None

    def __post_init__(self):
        if self.images is None:
            self.images = []
        if self.tags is None:
            self.tags = []


@dataclass
class BiliFollowedUp:
    """哔哩哔哩关注 UP 数据结构"""
    mid: str
    uname: str
    face: str = ""
    sign: str = ""
    official_desc: str = ""
    special: int = 0
    tag_ids: list[int] = None

    def __post_init__(self):
        if self.tag_ids is None:
            self.tag_ids = []


class BilibiliToolAPI:
    """哔哩哔哩工具 API 封装"""

    API_BASE = "https://api.bilibili.com"
    DYNAMIC_API = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"
    POLYMER_DYNAMIC_API = "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all"
    POLYMER_DYNAMIC_FEATURES = (
        "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,"
        "decorationCard,forwardListHidden,ugcDelete,onlyfansQaCard"
    )
    NAV_API = "https://api.bilibili.com/x/web-interface/nav"
    FOLLOWINGS_API = "https://api.bilibili.com/x/relation/followings"
    TAGS_API = "https://api.bilibili.com/x/relation/tags"

    def __init__(self, sessdata: str = None, timeout: int = 30):
        self.sessdata = sessdata
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)
        self._video_meta_cache: dict[str, dict] = {}

    def _build_headers(self, referer: str = "https://t.bilibili.com/") -> dict[str, str]:
        return {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={self.sessdata}",
            "Referer": referer,
        }

    def _normalize_url(self, url: str) -> str:
        if not url:
            return ""
        if url.startswith("//"):
            return f"https:{url}"
        return url

    def _keyword_matches(self, text_parts: list[str], keywords: list[str] | None) -> bool:
        if not keywords:
            return True
        haystack = " ".join(part for part in text_parts if part).lower()
        return any(kw.lower() in haystack for kw in keywords if kw)

    async def _fetch_polymer_page(self, offset: str | None = None) -> dict:
        params = {
            "type": "all",
            "features": self.POLYMER_DYNAMIC_FEATURES,
        }
        if offset:
            params["offset"] = offset
        else:
            params["page"] = 1

        try:
            resp = await self.client.get(
                self.POLYMER_DYNAMIC_API,
                params=params,
                headers=self._build_headers(),
            )

            if resp.status_code != 200:
                raise ValueError(f"HTTP {resp.status_code}")

            data = resp.json()

            if data.get("code") != 0:
                raise ValueError(data.get("message") or "获取动态失败")
            return data.get("data", {}) or {}

        except Exception as e:
            print(f"[bilibili-tool] Failed to fetch polymer dynamics: {e}")
            raise

    async def fetch_followed_dynamics(
        self,
        dynamic_types: list[int] = None,
        keywords: list[str] = None,
        limit: int = 20,
        days_back: int = 7,
    ) -> list[BiliDynamic]:
        """获取关注列表的动态。"""
        if not self.sessdata:
            raise ValueError("SESSDATA is required to fetch followed dynamics")

        if dynamic_types is None:
            dynamic_types = [8, 2, 4, 64]

        VALID_TYPES = {1, 2, 4, 8, 64}
        valid_types = [t for t in dynamic_types if t in VALID_TYPES]

        print(f"[bilibili-tool] Fetching types: {valid_types}, limit={limit}, days_back={days_back}")

        if not valid_types:
            return []

        type_map = {
            1: "DYNAMIC_TYPE_FORWARD",
            2: "DYNAMIC_TYPE_DRAW",
            4: "DYNAMIC_TYPE_WORD",
            8: "DYNAMIC_TYPE_AV",
            64: "DYNAMIC_TYPE_ARTICLE",
        }
        allowed_type_names = {type_map[t] for t in valid_types if t in type_map}
        cutoff = datetime.now() - timedelta(days=days_back)

        all_dynamics: list[BiliDynamic] = []
        seen_ids = set()
        offset: str | None = None
        max_pages = max(5, math.ceil(max(limit, 1) / 20) + 8)

        for page in range(1, max_pages + 1):
            page_data = await self._fetch_polymer_page(offset=offset)
            items = page_data.get("items", []) or []
            if not items:
                break

            page_new_count = 0
            page_has_recent = False
            page_type_counts: dict[str, int] = {}

            for item in items:
                item_type = item.get("type") or ""
                page_type_counts[item_type] = page_type_counts.get(item_type, 0) + 1
                if item_type not in allowed_type_names:
                    continue

                dynamic = self._parse_polymer_item(item, keywords)
                if not dynamic:
                    continue
                if dynamic.dynamic_type == "video":
                    dynamic = await self._enrich_video_dynamic(dynamic)
                if dynamic.published_at and dynamic.published_at < cutoff:
                    continue

                page_has_recent = True
                if dynamic.dynamic_id in seen_ids:
                    continue

                seen_ids.add(dynamic.dynamic_id)
                all_dynamics.append(dynamic)
                page_new_count += 1

                if len(all_dynamics) >= limit:
                    break

            print(
                f"[bilibili-tool] Polymer page {page}: total_items={len(items)}, "
                f"matched={page_new_count}, offset={page_data.get('offset')}, "
                f"types={page_type_counts}"
            )

            if len(all_dynamics) >= limit:
                break

            offset = page_data.get("offset")
            if not page_data.get("has_more") or not offset:
                break
            if not page_has_recent:
                break

            await asyncio.sleep(0.3)

        all_dynamics.sort(key=lambda x: x.published_at or datetime.min, reverse=True)
        print(f"[bilibili-tool] Total: {len(all_dynamics)} dynamics (after pagination)")
        return all_dynamics[:limit]

    async def _enrich_video_dynamic(self, dynamic: BiliDynamic) -> BiliDynamic:
        bvid = dynamic.bvid or extract_bvid(dynamic.url)
        if not bvid:
            return dynamic

        if bvid not in self._video_meta_cache:
            try:
                self._video_meta_cache[bvid] = await fetch_bilibili_video_metadata(
                    self.client,
                    bvid=bvid,
                    headers=self._build_headers(referer=dynamic.url or f"https://www.bilibili.com/video/{bvid}"),
                    referer=dynamic.url or f"https://www.bilibili.com/video/{bvid}",
                )
            except Exception as exc:
                print(f"[bilibili-tool] Failed to enrich video {bvid}: {exc}")
                self._video_meta_cache[bvid] = {}

        metadata = self._video_meta_cache.get(bvid) or {}
        dynamic.bvid = metadata.get("bvid") or dynamic.bvid or bvid
        dynamic.title = metadata.get("title") or dynamic.title
        detail_desc = str(metadata.get("description") or "").strip()
        if detail_desc and len(detail_desc) >= len(dynamic.content or ""):
            dynamic.content = detail_desc
        dynamic.author = metadata.get("author") or dynamic.author
        dynamic.url = metadata.get("url") or dynamic.url
        dynamic.pic = metadata.get("cover") or dynamic.pic
        dynamic.tags = merge_tags(dynamic.tags, metadata.get("tags") or [])

        pub_ts = metadata.get("published_at_ts")
        if pub_ts and not dynamic.published_at:
            try:
                dynamic.published_at = datetime.fromtimestamp(int(pub_ts))
            except Exception:
                pass
        return dynamic

    async def _get_self_mid(self) -> str:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={self.sessdata}",
            "Referer": "https://www.bilibili.com/",
        }
        resp = await self.client.get(self.NAV_API, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise ValueError(data.get("message", "获取 Bilibili 登录信息失败"))
        mid = data.get("data", {}).get("mid")
        if not mid:
            raise ValueError("未能从 Bilibili 登录信息中获取 mid")
        return str(mid)

    async def fetch_followed_ups(
        self,
        max_count: int = 5000,
        progress_callback=None,
    ) -> list[BiliFollowedUp]:
        """获取关注的 UP 列表"""
        if not self.sessdata:
            raise ValueError("SESSDATA is required to fetch followed users")

        vmid = await self._get_self_mid()
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={self.sessdata}",
            "Referer": f"https://space.bilibili.com/{vmid}/fans/follow",
        }

        page = 1
        page_size = 50
        results: list[BiliFollowedUp] = []

        if progress_callback:
            progress_callback(
                {
                    "stage": "正在读取关注列表",
                    "current_page": 0,
                    "page_size": page_size,
                    "fetched_count": 0,
                }
            )

        while len(results) < max_count:
            params = {
                "vmid": vmid,
                "pn": page,
                "ps": page_size,
                "order_type": "attention",
            }
            data = None
            for attempt in range(4):
                resp = await self.client.get(self.FOLLOWINGS_API, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if data.get("code") == 0:
                    break
                if data.get("code") == -352 and attempt < 3:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                raise ValueError(data.get("message", "获取关注列表失败"))

            items = (data or {}).get("data", {}).get("list", []) or []
            if not items:
                break

            for item in items:
                results.append(
                    BiliFollowedUp(
                        mid=str(item.get("mid", "")),
                        uname=item.get("uname") or "UP主",
                        face=item.get("face") or "",
                        sign=item.get("sign") or "",
                        official_desc=(item.get("official_verify") or {}).get("desc", "") or "",
                        special=int(item.get("special") or 0),
                        tag_ids=[int(tag_id) for tag_id in (item.get("tag") or []) if str(tag_id).lstrip("-").isdigit()],
                    )
                )
                if len(results) >= max_count:
                    break

            if progress_callback:
                progress_callback(
                    {
                        "stage": f"已抓取第 {page} 页",
                        "current_page": page,
                        "page_size": page_size,
                        "fetched_count": len(results),
                    }
                )

            if len(items) < page_size:
                break
            await asyncio.sleep(0.8)
            page += 1

        return results

    async def fetch_followed_tags(self) -> list[dict]:
        """获取原生关注分组列表"""
        if not self.sessdata:
            raise ValueError("SESSDATA is required to fetch followed tags")

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Cookie": f"SESSDATA={self.sessdata}",
            "Referer": "https://space.bilibili.com/",
        }
        resp = await self.client.get(self.TAGS_API, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise ValueError(data.get("message", "获取原生关注分组失败"))

        tags = []
        for item in data.get("data", []) or []:
            tag_id = item.get("tagid")
            if tag_id is None:
                continue
            tags.append(
                {
                    "tag_id": int(tag_id),
                    "name": item.get("name") or "未命名分组",
                    "count": int(item.get("count") or 0),
                    "tip": item.get("tip") or "",
                }
            )
        return tags

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

    def _parse_polymer_item(
        self,
        item: dict,
        keywords: list[str] = None,
    ) -> BiliDynamic | None:
        item_type = item.get("type") or ""
        dynamic_id = str(item.get("id_str") or "")
        modules = item.get("modules", {}) or {}
        author_mod = modules.get("module_author", {}) or {}
        dynamic_mod = modules.get("module_dynamic", {}) or {}
        major = dynamic_mod.get("major", {}) or {}
        major_type = major.get("type") or ""
        author = author_mod.get("name") or "UP主"
        author_id = str(author_mod.get("mid") or "")
        desc_text = ((dynamic_mod.get("desc") or {}).get("text")) or ""

        published_at = None
        pub_ts = author_mod.get("pub_ts")
        if pub_ts:
            try:
                published_at = datetime.fromtimestamp(int(pub_ts))
            except Exception:
                published_at = None

        if item_type == "DYNAMIC_TYPE_AV":
            archive = major.get("archive", {}) or {}
            title = archive.get("title") or desc_text[:100]
            content = archive.get("desc") or desc_text
            if not self._keyword_matches([title, content], keywords):
                return None
            bvid = archive.get("bvid") or ""
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=title,
                content=content,
                author=author,
                author_id=author_id,
                url=self._normalize_url(archive.get("jump_url")) or f"https://www.bilibili.com/video/{bvid}",
                published_at=published_at,
                dynamic_type="video",
                pic=archive.get("cover") or "",
                bvid=bvid,
            )

        if item_type in {"DYNAMIC_TYPE_DRAW", "DYNAMIC_TYPE_ARTICLE"}:
            opus = major.get("opus", {}) if major_type == "MAJOR_TYPE_OPUS" else {}
            summary = (opus.get("summary") or {}).get("text") or desc_text
            title = opus.get("title") or summary[:100]
            if not self._keyword_matches([title, summary], keywords):
                return None
            pics = opus.get("pics") or []
            images = [pic.get("url") for pic in pics if pic.get("url")]
            dynamic_type = "article" if item_type == "DYNAMIC_TYPE_ARTICLE" else "image"
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=title,
                content=summary,
                author=author,
                author_id=author_id,
                url=self._normalize_url(opus.get("jump_url")) or f"https://www.bilibili.com/opus/{dynamic_id}",
                published_at=published_at,
                dynamic_type=dynamic_type,
                images=images,
                pic=images[0] if images else "",
            )

        if item_type == "DYNAMIC_TYPE_WORD":
            content = desc_text
            if not self._keyword_matches([content], keywords):
                return None
            return BiliDynamic(
                id=f"bili-dyn-{dynamic_id}",
                dynamic_id=dynamic_id,
                title=content[:100],
                content=content,
                author=author,
                author_id=author_id,
                url=f"https://t.bilibili.com/{dynamic_id}",
                published_at=published_at,
                dynamic_type="text",
            )

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
            bvid=bvid,
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

        pictures = item.get("pictures") or []
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
                    "content": d.content or "",
                    "author": d.author,
                    "author_id": d.author_id,
                    "url": d.url,
                    "published_at": d.published_at.isoformat() if d.published_at else None,
                    "dynamic_type": d.dynamic_type,
                    "pic": d.pic,
                    "images": d.images,
                    "bvid": d.bvid,
                    "tags": d.tags,
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


async def bilibili_fetch_followed_ups(
    sessdata: str,
    max_count: int = 5000,
    progress_callback=None,
) -> dict:
    """获取关注 UP 列表"""
    api = BilibiliToolAPI(sessdata=sessdata)
    try:
        tags = await api.fetch_followed_tags()
        tag_name_map = {tag["tag_id"]: tag["name"] for tag in tags}
        ups = await api.fetch_followed_ups(max_count=max_count, progress_callback=progress_callback)
        return {
            "total": len(ups),
            "groups": tags,
            "ups": [
                {
                    "mid": up.mid,
                    "uname": up.uname,
                    "face": up.face,
                    "sign": up.sign,
                    "official_desc": up.official_desc,
                    "special": up.special,
                    "tag_ids": up.tag_ids,
                    "tag_names": [tag_name_map[tag_id] for tag_id in up.tag_ids if tag_id in tag_name_map],
                }
                for up in ups
            ],
        }
    finally:
        await api.close()
