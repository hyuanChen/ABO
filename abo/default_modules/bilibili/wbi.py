import hashlib
import time
import urllib.parse
from functools import reduce

import httpx

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
]


def get_mixin_key(raw: str) -> str:
    # Pad raw to at least 64 chars to satisfy MIXIN_KEY_ENC_TAB indices
    padded = raw * 11 if len(raw) < 64 else raw
    return reduce(lambda s, i: s + padded[i], MIXIN_KEY_ENC_TAB, "")[:32]


def enc_wbi(params: dict, img_key: str, sub_key: str) -> dict:
    params = dict(params)
    mixin_key = get_mixin_key(img_key + sub_key)
    params["wts"] = round(time.time())
    params = dict(sorted(params.items()))
    filtered = {
        k: "".join(filter(lambda c: c not in "!'()*", str(v)))
        for k, v in params.items()
    }
    query = urllib.parse.urlencode(filtered, quote_via=urllib.parse.quote)
    params["w_rid"] = hashlib.md5((query + mixin_key).encode()).hexdigest()
    return params


async def get_wbi_keys(timeout: int = 15) -> tuple[str, str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.bilibili.com/",
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(
            "https://api.bilibili.com/x/web-interface/nav", headers=headers
        )
    resp.raise_for_status()
    json_data = resp.json()
    wbi_img = json_data.get("data", {}).get("wbi_img")
    if not wbi_img:
        raise ValueError("Invalid WBI key response from Bilibili")
    img_key = wbi_img["img_url"].rsplit("/", 1)[-1].split(".")[0]
    sub_key = wbi_img["sub_url"].rsplit("/", 1)[-1].split(".")[0]
    return img_key, sub_key
