#!/usr/bin/env python3
"""
Bilibili API 直接测试脚本 - 用于诊断关注动态获取问题

用法:
    python test_bilibili_direct.py <SESSDATA>

或者:
    export SESSDATA="你的SESSDATA值"
    python test_bilibili_direct.py
"""

import asyncio
import sys
import os
import json
import httpx

# Bilibili API 端点
DYNAMIC_API = "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new"

def get_headers(sessdata: str):
    """构造请求头"""
    return {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": f"SESSDATA={sessdata}",
        "Referer": "https://t.bilibili.com/",
    }

async def test_api(sessdata: str):
    """测试各种 API 参数组合"""
    headers = get_headers(sessdata)

    print("=" * 60)
    print("Bilibili 关注动态 API 诊断测试")
    print("=" * 60)
    print(f"\nSESSDATA (前30字符): {sessdata[:30]}...")
    print(f"SESSDATA 长度: {len(sessdata)} 字符")

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        # 测试 1: 仅视频 (type_list=8)
        print("\n" + "-" * 60)
        print("【测试 1】仅获取视频动态 (type_list=8)")
        print("-" * 60)
        try:
            resp = await client.get(DYNAMIC_API, params={"type_list": 8}, headers=headers)
            print(f"HTTP 状态码: {resp.status_code}")
            data = resp.json()
            print(f"API 返回码: {data.get('code')}")
            print(f"API 消息: {data.get('message')}")

            if data.get('code') == 0:
                cards = data.get("data", {}).get("cards", [])
                print(f"✓ 成功! 获取到 {len(cards)} 条动态")
                if cards:
                    print(f"\n前 3 条动态:")
                    for i, card in enumerate(cards[:3], 1):
                        desc = card.get("desc", {})
                        card_type = desc.get("type", "unknown")
                        dynamic_id = desc.get("dynamic_id", "unknown")
                        author = desc.get("user_profile", {}).get("uname", "未知")

                        try:
                            content = json.loads(card.get("card", "{}"))
                            title = content.get("title", content.get("item", {}).get("description", "无标题"))[:50]
                        except:
                            title = "解析失败"

                        print(f"  {i}. [{card_type}] {author} - {title}...")
            else:
                print(f"✗ 失败: {data.get('message')}")
        except Exception as e:
            print(f"✗ 错误: {e}")

        # 测试 2: 全部类型 (type_list=268435455)
        print("\n" + "-" * 60)
        print("【测试 2】获取全部类型动态 (type_list=268435455)")
        print("-" * 60)
        try:
            resp = await client.get(DYNAMIC_API, params={"type_list": 268435455}, headers=headers)
            print(f"HTTP 状态码: {resp.status_code}")
            data = resp.json()
            print(f"API 返回码: {data.get('code')}")
            print(f"API 消息: {data.get('message')}")

            if data.get('code') == 0:
                cards = data.get("data", {}).get("cards", [])
                print(f"✓ 成功! 获取到 {len(cards)} 条动态")

                if cards:
                    # 统计各类型数量
                    type_counts = {}
                    for card in cards:
                        t = card.get("desc", {}).get("type", "unknown")
                        type_counts[t] = type_counts.get(t, 0) + 1

                    print(f"\n动态类型分布:")
                    type_names = {8: "视频", 2: "图文", 4: "文字", 64: "专栏", 1: "转发"}
                    for t, count in sorted(type_counts.items()):
                        print(f"  - 类型 {t} ({type_names.get(t, '其他')}): {count} 条")
                else:
                    print("\n⚠️ 警告: API 返回成功但没有卡片数据")
                    print("   可能原因:")
                    print("   1. 你的账号没有关注任何用户")
                    print("   2. 关注的用户最近没有发布动态")
                    print("   3. SESSDATA 已过期（虽然验证接口返回成功）")
                    print("   4. 需要额外的 Cookie 字段（如 bili_jct, DedeUserID）")
            else:
                print(f"✗ 失败: {data.get('message')}")
        except Exception as e:
            print(f"✗ 错误: {e}")

        # 测试 3: 不使用 type_list 参数
        print("\n" + "-" * 60)
        print("【测试 3】不带任何参数调用")
        print("-" * 60)
        try:
            resp = await client.get(DYNAMIC_API, headers=headers)
            print(f"HTTP 状态码: {resp.status_code}")
            data = resp.json()
            print(f"API 返回码: {data.get('code')}")
            print(f"API 消息: {data.get('message')}")

            if data.get('code') == 0:
                cards = data.get("data", {}).get("cards", [])
                print(f"✓ 成功! 获取到 {len(cards)} 条动态")
            else:
                print(f"✗ 失败: {data.get('message')}")
        except Exception as e:
            print(f"✗ 错误: {e}")

        # 测试 4: 验证用户信息
        print("\n" + "-" * 60)
        print("【测试 4】验证登录状态 (获取当前用户信息)")
        print("-" * 60)
        try:
            nav_url = "https://api.bilibili.com/x/web-interface/nav"
            resp = await client.get(nav_url, headers=headers)
            data = resp.json()

            if data.get('code') == 0 and data.get('data', {}).get('isLogin'):
                user_data = data['data']
                print(f"✓ 已登录!")
                print(f"  用户名: {user_data.get('uname', '未知')}")
                print(f"  UID: {user_data.get('mid', '未知')}")
                print(f"  会员等级: {user_data.get('level_info', {}).get('current_level', '未知')}")
                print(f"  硬币数: {user_data.get('money', '未知')}")
            else:
                print(f"✗ 未登录或 SESSDATA 无效")
                print(f"  返回码: {data.get('code')}")
                print(f"  消息: {data.get('message')}")
        except Exception as e:
            print(f"✗ 错误: {e}")

    # 总结
    print("\n" + "=" * 60)
    print("诊断总结")
    print("=" * 60)
    print("""
如果所有测试都返回 0 条动态，但验证成功，可能的原因:

1. 【账号问题】
   - 这个 B站账号确实没有关注任何人
   - 或者关注的 UP 主最近 7 天内都没有发布动态
   - 建议: 打开 https://t.bilibili.com/ 确认网页版能看到动态

2. 【Cookie 问题】
   - SESSDATA 可能已过期，但验证接口没有正确检测
   - 可能需要额外的 Cookie 字段
   - 建议: 重新从浏览器获取完整的 Cookie (不只是 SESSDATA)

3. 【API 问题】
   - B站可能更改了 API 参数格式
   - 建议: 检查浏览器开发者工具的 Network 面板，查看实际请求的参数

4. 【网络/地区限制】
   - 某些网络环境可能被限制访问
   - 建议: 尝试使用不同的网络环境
""")

def main():
    # 获取 SESSDATA
    if len(sys.argv) > 1:
        sessdata = sys.argv[1]
    else:
        sessdata = os.environ.get("SESSDATA", "")

    if not sessdata:
        print("请提供 SESSDATA:")
        print(f"  方法 1: python {sys.argv[0]} <SESSDATA>")
        print(f"  方法 2: export SESSDATA=<SESSDATA> && python {sys.argv[0]}")
        sys.exit(1)

    # 运行测试
    asyncio.run(test_api(sessdata))

if __name__ == "__main__":
    main()
