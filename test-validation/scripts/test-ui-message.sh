#!/bin/bash
# 测试 Message UI

echo "测试 Message 组件..."

if [ ! -f "src/modules/chat/MessageList.tsx" ]; then
    echo "❌ 失败: MessageList.tsx 不存在"
    exit 1
fi

# 检查 Markdown 支持
if ! grep -q "ReactMarkdown" src/modules/chat/MessageList.tsx; then
    echo "❌ 失败: 缺少 ReactMarkdown"
    exit 1
fi

# 检查流式光标
if ! grep -q "animate-pulse" src/modules/chat/MessageList.tsx; then
    echo "❌ 失败: 缺少流式光标动画"
    exit 1
fi

# 检查用户消息样式 (右对齐)
if ! grep -q "flex-row-reverse" src/modules/chat/MessageList.tsx; then
    echo "❌ 失败: 用户消息未右对齐"
    exit 1
fi

echo "✅ Message UI 测试通过"