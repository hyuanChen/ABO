#!/usr/bin/env python3
"""测试小红书爬虫"""
import asyncio
import sys

async def test_search():
    from abo.tools.xiaohongshu import XiaohongshuAPI

    # 从命令行参数或交互式输入获取 cookie
    if len(sys.argv) > 1:
        cookie = sys.argv[1]
    else:
        cookie = input("请输入你的 web_session (或完整 cookie): ").strip()

    if not cookie:
        print("错误: 未提供 cookie")
        return

    print(f"\n使用 cookie: {cookie[:50]}...")
    print(f"Cookie 长度: {len(cookie)}")

    api = XiaohongshuAPI()
    try:
        print("\n开始搜索 'Python'...")
        notes = await api.search_by_keyword_with_cookie(
            keyword="Python",
            cookie=cookie,
            max_results=10,
            min_likes=0,  # 降低门槛，方便测试
        )

        print(f"\n找到 {len(notes)} 条笔记:")
        for i, note in enumerate(notes[:5], 1):
            print(f"\n{i}. {note.title}")
            print(f"   作者: {note.author}")
            print(f"   点赞: {note.likes}")
            print(f"   链接: {note.url}")

    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await api.close()

if __name__ == "__main__":
    asyncio.run(test_search())
