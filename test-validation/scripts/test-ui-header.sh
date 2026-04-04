#!/bin/bash
# 测试 ChatHeader UI

echo "测试 ChatHeader 组件..."

# 检查文件存在
if [ ! -f "src/modules/chat/ChatHeader.tsx" ]; then
    echo "❌ 失败: ChatHeader.tsx 不存在"
    exit 1
fi

# 检查必需元素
echo "检查必需元素..."

# 检查在线状态圆点
if ! grep -q "bg-green-500" src/modules/chat/ChatHeader.tsx; then
    echo "❌ 失败: 缺少在线状态圆点样式"
    exit 1
fi

# 检查设置按钮
if ! grep -q "Settings" src/modules/chat/ChatHeader.tsx; then
    echo "❌ 失败: 缺少设置按钮"
    exit 1
fi

# 检查关闭按钮
if ! grep -q "X" src/modules/chat/ChatHeader.tsx && ! grep -q "Close" src/modules/chat/ChatHeader.tsx; then
    echo "❌ 失败: 缺少关闭按钮"
    exit 1
fi

echo "✅ ChatHeader UI 测试通过"