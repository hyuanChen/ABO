/**
 * ChatHome - 聊天入口页面 (AionUi Style)
 * 设计: 居中输入界面，顶部有快捷按钮横排
 * 开始对话后平滑过渡到 ChatSession
 */
import { useState, useRef, useCallback } from 'react';
import { Sparkles, Send, Bot, Loader2, Zap, BookOpen, Lightbulb, Target, Clock, Compass, Brain, Plus, Shield, ChevronDown, History } from 'lucide-react';
import type { CliConfig } from '../../types/chat';

interface ChatHomeProps {
  clis: CliConfig[];
  selectedCli: CliConfig | null;
  onSelectCli: (cli: CliConfig) => void;
  onStartChat: (message: string) => void;
  isLoading: boolean;
}

// 快捷指令配置 - AionUi 风格
const QUICK_ACTIONS = [
  { id: 'summarize', label: '总结文献', icon: BookOpen, color: 'text-blue-500' },
  { id: 'hypothesis', label: '生成假设', icon: Lightbulb, color: 'text-amber-500' },
  { id: 'critique', label: '批判分析', icon: Target, color: 'text-red-500' },
  { id: 'plan', label: '研究规划', icon: Clock, color: 'text-green-500' },
  { id: 'energy', label: '精力引导', icon: Zap, color: 'text-purple-500' },
  { id: 'insight', label: '灵感激发', icon: Compass, color: 'text-pink-500' },
];

export function ChatHome({ clis, selectedCli, onSelectCli, onStartChat, isLoading }: ChatHomeProps) {
  const [input, setInput] = useState('');
  const [showCliSelector, setShowCliSelector] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const availableClis = clis.filter(c => c.isAvailable);
  const currentCli = selectedCli || availableClis[0];

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    // 如果没有选择CLI，默认选择第一个
    if (!selectedCli && availableClis.length > 0) {
      onSelectCli(availableClis[0]);
    }

    onStartChat(input.trim());
    setInput('');
  }, [input, isLoading, selectedCli, availableClis, onSelectCli, onStartChat]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  }, []);

  const handleQuickAction = useCallback((prompt: string) => {
    setInput(prev => prev ? `${prev} ${prompt}` : prompt);
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col h-full items-center justify-center p-6 bg-[var(--bg-app)] relative overflow-hidden">
      {/* 背景装饰 - 柔和的毛玻璃光晕 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[var(--color-primary)]/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[var(--color-secondary)]/5 rounded-full blur-3xl" />
      </div>

      {/* 主内容区 */}
      <div className="w-full max-w-[760px] relative z-10 animate-fade-in">
        {/* Logo & 主标题 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] shadow-lg mb-5 animate-float">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-[32px] font-semibold text-[var(--text-main)] mb-3 tracking-tight">
            Hi，今天有什么安排？
          </h1>
          <p className="text-[var(--text-muted)] text-base">
            选择一个 AI 助手开始对话
          </p>
        </div>

        {/* CLI 选择器 - 药丸形状，AionUi 风格 */}
        <div className="flex justify-center mb-5">
          {showCliSelector ? (
            <div className="flex flex-wrap justify-center gap-2 p-3 rounded-2xl bg-white/60 backdrop-blur-xl border border-[var(--border-color)] shadow-soft animate-fade-scale">
              {availableClis.map(cli => (
                <button
                  key={cli.id}
                  onClick={() => {
                    onSelectCli(cli);
                    setShowCliSelector(false);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all spring-hover
                    ${currentCli?.id === cli.id
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--border-color)] bg-white/80 text-[var(--text-main)] hover:border-[var(--color-primary-light)]'
                    }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm font-medium">{cli.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => setShowCliSelector(true)}
              className="group flex items-center gap-2 px-5 py-2.5 rounded-full
                bg-[#F3EDFA] border border-[#E6DDF2]
                text-[var(--color-primary)] transition-all spring-hover
                hover:bg-[#EDE5F5] hover:shadow-soft"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">{currentCli?.name || '选择助手'}</span>
              <span className="w-px h-4 bg-[var(--color-primary)]/20 mx-1" />
              <History className="w-4 h-4 opacity-60" />
              <span className="w-px h-4 bg-[var(--color-primary)]/20 mx-1" />
              <Brain className="w-4 h-4 text-red-400" />
              <ChevronDown className="w-4 h-4 opacity-60 ml-1 group-hover:translate-y-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* 核心输入框 - AionUi 风格 */}
        <div className="relative mb-4">
          <div className="relative rounded-2xl bg-white/80 backdrop-blur-xl border-2 border-[#E6DDF2] shadow-soft transition-all focus-within:border-[var(--color-primary)] focus-within:shadow-medium overflow-hidden">
            {/* 文本域 */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="Claude Code, 发消息、上传文件、打开文件夹或创建定时任务..."
              disabled={isLoading}
              rows={1}
              className="w-full resize-none bg-transparent px-5 py-4 text-[var(--text-main)] placeholder:text-[var(--text-muted)]/50 outline-none text-[15px] leading-relaxed"
              style={{ minHeight: '60px', maxHeight: '200px' }}
            />

            {/* 输入框底部工具栏 */}
            <div className="flex items-center justify-between px-3 pb-3">
              {/* 左侧工具 */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)]"
                  title="添加附件"
                >
                  <Plus className="w-5 h-5" />
                </button>

                {/* 默认模型 pill */}
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F5F3EE] text-[var(--text-secondary)] text-xs font-medium hover:bg-[#EDE9E2] transition-colors"
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>默认模型</span>
                </button>

                {/* 权限 pill */}
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F5F3EE] text-[var(--text-secondary)] text-xs font-medium hover:bg-[#EDE9E2] transition-colors"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>权限·默认</span>
                </button>
              </div>

              {/* 右侧发送按钮 */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
                  bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)]
                  text-white shadow-md
                  transition-all spring-hover hover:shadow-lg hover:scale-105 hover:brightness-110
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 推荐技能/快捷指令区 - AionUi 风格 pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.label)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm
                  bg-white/70 border border-[var(--border-color)]
                  text-[var(--text-secondary)]
                  transition-all spring-hover hover:scale-105 hover:shadow-soft hover:bg-white hover:border-[var(--color-primary-light)]"
              >
                <Icon className={`w-4 h-4 ${action.color}`} />
                <span className="font-medium">{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* 底部提示 */}
        <p className="text-center text-xs text-[var(--text-muted)]">
          按 Enter 发送，Shift + Enter 换行
        </p>
      </div>
    </div>
  );
}

export default ChatHome;
