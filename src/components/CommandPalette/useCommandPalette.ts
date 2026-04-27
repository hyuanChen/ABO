import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '../../core/store';
import { api } from '../../core/api';
import { isActionEnterKey, isComposingKeyboardEvent } from '../../core/keyboard';
import {
  LayoutDashboard,
  User,
  BookOpen,
  Settings,
  Bot,
  Play,
  PlayCircle,
  Lightbulb,
  Search,
  FileText,
  type LucideIcon,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────

export interface Command {
  id: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  icon: LucideIcon;
  action: () => void | Promise<void>;
  keywords?: string[];
}

export interface UseCommandPaletteReturn {
  isOpen: boolean;
  searchQuery: string;
  selectedIndex: number;
  filteredCommands: Command[];
  open: () => void;
  close: () => void;
  toggle: () => void;
  setSearchQuery: (query: string) => void;
  selectNext: () => void;
  selectPrev: () => void;
  executeSelected: () => void;
  executeCommand: (commandId: string) => void;
}

// ── Helper Functions ──────────────────────────────────────────────

const isMac = navigator.platform.toLowerCase().includes('mac');

export const formatShortcut = (shortcut: string): string => {
  return shortcut
    .replace('Cmd', isMac ? '⌘' : 'Ctrl')
    .replace('Ctrl', isMac ? '⌘' : 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', isMac ? '⌥' : 'Alt')
    .replace(/\s+/g, '');
};

// ── Hook ──────────────────────────────────────────────────────────

export function useCommandPalette(): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [, setRunningModules] = useState<Set<string>>(new Set());

  const {
    setActiveTab,
    addToast,
  } = useStore();

  // Define all available commands
  const commands: Command[] = useMemo(() => [
    // Navigation commands
    {
      id: 'goto-assistant',
      title: '打开助手',
      subtitle: '用 Codex 串联情报、Wiki 和对话',
      shortcut: 'G A',
      icon: Bot,
      keywords: ['assistant', '助手', 'codex', '对话', 'wiki', '情报'],
      action: () => setActiveTab('assistant'),
    },
    {
      id: 'goto-feed',
      title: '打开 Feed',
      subtitle: '查看情报卡片流',
      shortcut: 'G F',
      icon: LayoutDashboard,
      keywords: ['feed', '卡片', '情报', '首页', '主页'],
      action: () => setActiveTab('overview'),
    },
    {
      id: 'goto-profile',
      title: '打开角色主页',
      subtitle: '查看个人状态和六维雷达图',
      shortcut: 'G P',
      icon: User,
      keywords: ['profile', '角色', '主页', '个人', '状态', '六维'],
      action: () => setActiveTab('profile'),
    },
    {
      id: 'goto-literature',
      title: '打开文献库',
      subtitle: '管理和搜索文献',
      shortcut: 'G L',
      icon: BookOpen,
      keywords: ['literature', '文献', '论文', 'arxiv', '学术'],
      action: () => setActiveTab('literature'),
    },
    {
      id: 'goto-modules',
      title: '打开模块管理',
      subtitle: '管理所有自动化模块',
      shortcut: 'G M',
      icon: Settings,
      keywords: ['modules', '模块', '管理', '配置', '爬虫'],
      action: () => setActiveTab('modules'),
    },
    {
      id: 'goto-settings',
      title: '打开设置',
      subtitle: '应用配置和偏好设置',
      shortcut: 'Cmd ,',
      icon: Settings,
      keywords: ['settings', '设置', '配置', '偏好'],
      action: () => setActiveTab('settings'),
    },
    // Module commands
    {
      id: 'run-arxiv',
      title: '运行 ArXiv 爬虫',
      subtitle: '立即运行 ArXiv 论文追踪模块',
      shortcut: 'R A',
      icon: Play,
      keywords: ['arxiv', '爬虫', '运行', '论文', '学术'],
      action: async () => {
        try {
          setRunningModules(prev => new Set(prev).add('arxiv-tracker'));
          await api.post('/api/modules/arxiv-tracker/run', {});
          addToast({
            kind: 'success',
            title: 'ArXiv 爬虫已启动',
            message: '正在获取最新论文...',
          });
        } catch (err) {
          addToast({
            kind: 'error',
            title: '运行失败',
            message: err instanceof Error ? err.message : '无法运行 ArXiv 爬虫',
          });
        } finally {
          setRunningModules(prev => {
            const next = new Set(prev);
            next.delete('arxiv-tracker');
            return next;
          });
        }
      },
    },
    {
      id: 'run-all',
      title: '运行所有模块',
      subtitle: '立即运行所有启用的模块',
      shortcut: 'R R',
      icon: PlayCircle,
      keywords: ['run', '全部', '运行', '所有', '模块', '爬虫'],
      action: async () => {
        try {
          addToast({
            kind: 'info',
            title: '正在运行所有模块',
            message: '请稍候...',
          });
          // Run all modules in parallel
          const modules = ['arxiv-tracker', 'semantic-scholar-tracker', 'xiaohongshu-tracker', 'bilibili-tracker'];
          await Promise.all(
            modules.map(id => api.post(`/api/modules/${id}/run`, {}).catch(() => null))
          );
          addToast({
            kind: 'success',
            title: '所有模块已启动',
            message: '正在后台运行...',
          });
        } catch (err) {
          addToast({
            kind: 'error',
            title: '运行失败',
            message: err instanceof Error ? err.message : '无法运行模块',
          });
        }
      },
    },
    // Content creation commands
    {
      id: 'create-idea',
      title: '新建 Idea',
      subtitle: '在 Idea 工坊创建新想法',
      shortcut: 'C I',
      icon: Lightbulb,
      keywords: ['idea', '想法', '新建', '创建', '工坊'],
      action: () => {
        // Navigate to ideas tab (vault for now, can be updated when ideas module exists)
        setActiveTab('vault');
        addToast({
          kind: 'info',
          title: '提示',
          message: '请在 Vault 中创建新想法',
        });
      },
    },
    // Search command
    {
      id: 'global-search',
      title: '全局搜索',
      subtitle: '搜索卡片、文献和想法',
      shortcut: 'Cmd K',
      icon: Search,
      keywords: ['search', '搜索', '查找', '全局'],
      action: () => {
        // This will be handled by the command palette itself
        // Just keep the palette open
      },
    },
    // Quick module access
    {
      id: 'goto-arxiv',
      title: '打开 ArXiv 追踪器',
      subtitle: '高级 ArXiv 论文搜索和追踪',
      icon: FileText,
      keywords: ['arxiv', '追踪器', '论文', '学术', '搜索'],
      action: () => setActiveTab('arxiv'),
    },
    {
      id: 'goto-chat',
      title: '打开 Agent 对话',
      subtitle: '与 AI 助手对话',
      icon: LayoutDashboard,
      keywords: ['chat', '对话', 'agent', 'claude', 'codex', 'ai', '助手'],
      action: () => setActiveTab('chat'),
    },
  ], [setActiveTab, addToast]);

  // Filter commands based on search query
  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) return commands;

    const query = searchQuery.toLowerCase();
    return commands.filter(cmd => {
      const titleMatch = cmd.title.toLowerCase().includes(query);
      const subtitleMatch = cmd.subtitle?.toLowerCase().includes(query);
      const keywordMatch = cmd.keywords?.some(k => k.toLowerCase().includes(query));
      const idMatch = cmd.id.toLowerCase().includes(query);
      return titleMatch || subtitleMatch || keywordMatch || idMatch;
    });
  }, [commands, searchQuery]);

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length, searchQuery]);

  // Keyboard shortcut handlers
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setSearchQuery('');
    setSelectedIndex(0);
  }, []);
  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
    if (isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const selectNext = useCallback(() => {
    setSelectedIndex(prev =>
      prev < filteredCommands.length - 1 ? prev + 1 : prev
    );
  }, [filteredCommands.length]);

  const selectPrev = useCallback(() => {
    setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
  }, []);

  const executeCommand = useCallback((commandId: string) => {
    const command = commands.find(c => c.id === commandId);
    if (command) {
      close();
      // Small delay to allow modal to close before action
      setTimeout(() => {
        command.action();
      }, 50);
    }
  }, [commands, close]);

  const executeSelected = useCallback(() => {
    const command = filteredCommands[selectedIndex];
    if (command) {
      close();
      // Small delay to allow modal to close before action
      setTimeout(() => {
        command.action();
      }, 50);
    }
  }, [filteredCommands, selectedIndex, close]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
        return;
      }

      // Cmd/Ctrl + , for settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        if (!isOpen) {
          setActiveTab('settings');
        }
        return;
      }

      // Only handle these shortcuts when palette is open
      if (!isOpen) return;
      if (isComposingKeyboardEvent(e)) return;

      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      // Arrow navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectNext();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectPrev();
        return;
      }

      // Enter to execute
      if (isActionEnterKey(e)) {
        e.preventDefault();
        executeSelected();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggle, close, selectNext, selectPrev, executeSelected, setActiveTab]);

  return {
    isOpen,
    searchQuery,
    selectedIndex,
    filteredCommands,
    open,
    close,
    toggle,
    setSearchQuery,
    selectNext,
    selectPrev,
    executeSelected,
    executeCommand,
  };
}
