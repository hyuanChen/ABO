#!/bin/bash
# 测试 ChatInput UI

echo "测试 ChatInput 组件..."

if [ ! -f "src/modules/chat/ChatInput.tsx" ]; then
    echo "❌ 失败: ChatInput.tsx 不存在"
    exit 1
fi

# 检查 Enter 键处理
if ! grep -q "Enter" src/modules/chat/ChatInput.tsx; then
    echo "❌ 失败: 缺少 Enter 键处理"
    exit 1
fi

# 检查 Shift+Enter 处理
if ! grep -q "shiftKey" src/modules/chat/ChatInput.tsx; then
    echo "❌ 失败: 缺少 Shift+Enter 处理"
    exit 1
fi

# 检查自适应高度
if ! grep -q "scrollHeight" src/modules/chat/ChatInput.tsx; then
    echo "❌ 失败: 缺少自适应高度"
    exit 1
fi

echo "✅ ChatInput UI 测试通过"