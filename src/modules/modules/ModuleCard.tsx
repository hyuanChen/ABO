import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Settings, AlertCircle, MoreVertical, FileText, RefreshCw } from 'lucide-react';
import type { ModuleConfig, ModuleStatus } from '../../types/module';

interface ModuleCardProps {
  module: ModuleConfig;
  onClick: () => void;
  onRun: () => void;
  onToggle: () => void;
  onDiagnose: () => void;
}

const statusConfig: Record<ModuleStatus, {
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  description: string;
}> = {
  active: {
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    label: '运行中',
    description: '模块正常运行中',
  },
  paused: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    label: '已暂停',
    description: '用户手动暂停',
  },
  error: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    label: '错误',
    description: '运行出错，需要处理',
  },
  unconfigured: {
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    label: '未配置',
    description: '缺少必要配置',
  },
};

function ModuleStatusBadge({ status }: { status: ModuleStatus }) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color} border ${config.borderColor}`}
    >
      {status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
      {config.label}
    </span>
  );
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '从未';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

function formatNextRun(dateStr: string | null): string {
  if (!dateStr) return '未安排';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (diff < 0) return '已过期';
  if (hours < 1) return '即将运行';
  if (hours < 24) return `${hours}小时后`;
  return `${days}天后`;
}

export function ModuleCard({ module, onClick, onRun, onToggle, onDiagnose }: ModuleCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getActionButton = () => {
    switch (module.status) {
      case 'active':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
            title="暂停"
          >
            <Pause className="w-5 h-5" />
          </button>
        );
      case 'paused':
      case 'error':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="启动"
          >
            <Play className="w-5 h-5" />
          </button>
        );
      case 'unconfigured':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="配置"
          >
            <Settings className="w-5 h-5" />
          </button>
        );
    }
  };

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-lg transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-800">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{module.name}</h3>
            <ModuleStatusBadge status={module.status} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {getActionButton()}
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); onRun(); setShowMenu(false); }}
                  className="w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <Play className="w-4 h-4" /> 立即运行
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDiagnose(); setShowMenu(false); }}
                  className="w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <AlertCircle className="w-4 h-4" /> 诊断问题
                </button>
                <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); onClick(); setShowMenu(false); }}
                  className="w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <Settings className="w-4 h-4" /> 配置
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
        {module.description}
      </p>

      {/* Cookie Status */}
      {module.config.cookie !== undefined && (
        <div className="flex items-center gap-2 mb-3">
          {module.config.cookieValid ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Cookie 有效
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Cookie 无效
            </span>
          )}
        </div>
      )}

      {/* Keywords */}
      {module.config.keywords && module.config.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {module.config.keywords.slice(0, 3).map((kw, i) => (
            <span
              key={i}
              className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full"
            >
              {kw}
            </span>
          ))}
          {module.config.keywords.length > 3 && (
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full">
              +{module.config.keywords.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 text-sm mb-3">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
          <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">累计卡片</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{module.stats.totalCards}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
          <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">本周</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{module.stats.thisWeek}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
          <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">成功率</div>
          <div className={`font-semibold ${module.stats.successRate >= 90 ? 'text-green-600' : module.stats.successRate >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
            {module.stats.successRate}%
          </div>
        </div>
      </div>

      {/* Schedule Info */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          <span>{module.schedule || '未设置'}</span>
        </div>
        {module.status === 'active' && module.nextRun && (
          <span>下次运行: {formatNextRun(module.nextRun)}</span>
        )}
        {module.lastRun && (
          <span>上次: {formatRelativeTime(module.lastRun)}</span>
        )}
      </div>

      {/* Error Message */}
      {module.stats.lastError && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-600 dark:text-red-400 line-clamp-2">
          {module.stats.lastError}
        </div>
      )}
    </div>
  );
}
