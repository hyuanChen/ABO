/**
 * ChatHome - 聊天入口页面 (重构版)
 * 功能: 自动检测后端 CLI，显示加载/空状态，统一布局
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { Sparkles, Send, Bot, Loader2, Zap, BookOpen, Lightbulb, Target, Clock, Compass, Brain, Plus, Shield, ChevronDown, History } from 'lucide-react';
import { PageContainer, PageContent, Card, LoadingState, EmptyState } from '../../components/Layout';
import { detectClis } from '../../api/chat';
import type { CliConfig } from '../../types/chat';
import { useStore } from '../../core/store';

// 快捷指令配置
const QUICK_ACTIONS = [
  { id: 'summarize', label: '总结文献', icon: BookOpen, color: 'text-blue-500' },
  { id: 'hypothesis', label: '生成假设', icon: Lightbulb, color: 'text-amber-500' },
  { id: 'critique', label: '批判分析', icon: Target, color: 'text-red-500' },
  { id: 'plan', label: '研究规划', icon: Clock, color: 'text-green-500' },
  { id: 'energy', label: '精力引导', icon: Zap, color: 'text-purple-500' },
  { id: 'insight', label: '灵感激发', icon: Compass, color: 'text-pink-500' },
];

interface ChatHomeProps {
  onStartChat: (message: string, cliId?: string) => void;
  isLoading?: boolean;
}

export function ChatHome({ onStartChat, isLoading: externalLoading = false }: ChatHomeProps) {
  const aiProvider = useStore((state) => state.aiProvider);

  // 后端检测状态
  const [isDetecting, setIsDetecting] = useState(true);
  const [availableClis, setAvailableClis] = useState<CliConfig[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 本地状态
  const [selectedCli, setSelectedCli] = useState<CliConfig | null>(null);
  const [input, setInput] = useState('');
  const [showCliSelector, setShowCliSelector] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动检测后端 CLI
  useEffect(() => {
    setIsDetecting(true);
    setError(null);

    detectClis()
      .then(clis => {
        const available = clis.filter(c => c.isAvailable);
        setAvailableClis(available);
        if (available.length > 0) {
          const preferredCli = available.find((cli) => cli.id === aiProvider) ?? available[0];
          if (!selectedCli || !available.some((cli) => cli.id === selectedCli.id) || selectedCli.id !== preferredCli.id) {
            setSelectedCli(preferredCli);
          }
        }
        setIsDetecting(false);
      })
      .catch(err => {
        console.error('Failed to detect CLIs:', err);
        setError("无法连接到后端服务");
        setIsDetecting(false);
      });
  }, [aiProvider, selectedCli]);

  const currentCli = selectedCli || availableClis[0];
  const isLoading = isDetecting || externalLoading;

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const cliId = currentCli?.id;
    onStartChat(input.trim(), cliId);
    setInput('');
  }, [input, isLoading, currentCli, onStartChat]);

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

  const handleSelectCli = useCallback((cli: CliConfig) => {
    setSelectedCli(cli);
    setShowCliSelector(false);
  }, []);

  // 加载状态 - 检测中
  if (isDetecting) {
    return (
      <PageContainer>
        <LoadingState message="正在检测可用的 AI 助手..." />
      </PageContainer>
    );
  }

  // 错误状态
  if (error) {
    return (
      <PageContainer>
        <PageContent centered maxWidth="600px">
          <EmptyState
            icon={Bot}
            title="连接失败"
            description={error}
          />
        </PageContent>
      </PageContainer>
    );
  }

  // 空状态 - 无可用 CLI
  if (availableClis.length === 0) {
    return (
      <PageContainer>
        <PageContent centered maxWidth="600px">
          <EmptyState
            icon={Bot}
            title="暂无可用的 AI 助手"
            description="请安装 Codex CLI、Claude Code 或其他支持的 CLI 工具"
          />
        </PageContent>
      </PageContainer>
    );
  }

  // 主界面
  return (
    <PageContainer>
      <PageContent centered maxWidth="600px">
        <Card noPadding style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
          {/* 顶部图标和问候语 */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 4px 16px rgba(188, 164, 227, 0.3)',
              }}
            >
              <Bot style={{ width: '32px', height: '32px', color: 'white' }} />
            </div>
            <h1
              style={{
                fontFamily: "'M PLUS Rounded 1c', sans-serif",
                fontSize: 'clamp(1.5rem, 3vw, 1.75rem)',
                fontWeight: 700,
                color: 'var(--text-main)',
                marginBottom: '8px',
              }}
            >
              Hi，今天有什么安排？
            </h1>
            <p style={{ fontSize: '0.9375rem', color: 'var(--text-muted)' }}>
              选择一个 AI 助手开始对话
            </p>
          </div>

          {/* CLI 选择器 */}
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
            {showCliSelector ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '16px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-light)',
                }}
              >
                {availableClis.map(cli => (
                  <button
                    key={cli.id}
                    onClick={() => handleSelectCli(cli)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '9999px',
                      border: '1px solid',
                      borderColor: currentCli?.id === cli.id ? 'var(--color-primary)' : 'var(--border-light)',
                      background: currentCli?.id === cli.id ? 'rgba(188, 164, 227, 0.15)' : 'var(--bg-card)',
                      color: currentCli?.id === cli.id ? 'var(--color-primary)' : 'var(--text-main)',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Sparkles style={{ width: '14px', height: '14px' }} />
                    <span>{cli.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setShowCliSelector(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '9999px',
                  background: '#F3EDFA',
                  border: '1px solid #E6DDF2',
                  color: 'var(--color-primary)',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Sparkles style={{ width: '16px', height: '16px' }} />
                <span>{currentCli?.name || '选择助手'}</span>
                <span style={{ width: '1px', height: '16px', background: 'var(--color-primary)', opacity: 0.2, margin: '0 4px' }} />
                <History style={{ width: '14px', height: '14px', opacity: 0.6 }} />
                <span style={{ width: '1px', height: '16px', background: 'var(--color-primary)', opacity: 0.2, margin: '0 4px' }} />
                <Brain style={{ width: '14px', height: '14px', color: '#F87171' }} />
                <ChevronDown style={{ width: '14px', height: '14px', opacity: 0.6, marginLeft: '4px' }} />
              </button>
            )}
          </div>

          {/* 输入框区域 */}
          <div
            style={{
              borderRadius: '16px',
              background: 'var(--bg-app)',
              border: '2px solid #E6DDF2',
              overflow: 'hidden',
              transition: 'all 0.2s ease',
            }}
          >
            {/* 文本域 */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={`${currentCli?.name || 'Codex'}, 发消息、上传文件、打开文件夹或创建定时任务...`}
              disabled={externalLoading}
              rows={1}
              style={{
                width: '100%',
                resize: 'none',
                background: 'transparent',
                padding: '16px 20px',
                fontSize: '0.9375rem',
                lineHeight: 1.6,
                color: 'var(--text-main)',
                border: 'none',
                outline: 'none',
                minHeight: '60px',
                maxHeight: '200px',
              }}
            />

            {/* 底部工具栏 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px 12px',
              }}
            >
              {/* 左侧工具 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  title="添加附件"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <Plus style={{ width: '20px', height: '20px' }} />
                </button>

                {/* 默认模型 pill */}
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    borderRadius: '9999px',
                    background: '#F5F3EE',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Brain style={{ width: '14px', height: '14px' }} />
                  <span>默认模型</span>
                </button>

                {/* 权限 pill */}
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    borderRadius: '9999px',
                    background: '#F5F3EE',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Shield style={{ width: '14px', height: '14px' }} />
                  <span>权限·默认</span>
                </button>
              </div>

              {/* 右侧发送按钮 */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim() || externalLoading}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
                  border: 'none',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(188, 164, 227, 0.4)',
                  cursor: !input.trim() || externalLoading ? 'not-allowed' : 'pointer',
                  opacity: !input.trim() || externalLoading ? 0.4 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                {externalLoading ? (
                  <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Send style={{ width: '16px', height: '16px' }} />
                )}
              </button>
            </div>
          </div>

          {/* 快捷操作按钮 */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '20px',
              marginBottom: '16px',
            }}
          >
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.label)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '9999px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border-light)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-card)';
                    e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                  }}
                >
                  <Icon style={{ width: '14px', height: '14px' }} className={action.color} />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* 底部提示 */}
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            按 Enter 发送，Shift + Enter 换行
          </p>
        </Card>
      </PageContent>
    </PageContainer>
  );
}

export default ChatHome;
