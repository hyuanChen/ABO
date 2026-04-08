import { useState, useEffect } from 'react';
import {
  LayoutGrid,
  List,
  Filter,
  Search,
  AlertCircle,
  CheckCircle,
  PauseCircle,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../core/api';
import { useStore } from '../../core/store';
import { ModuleCard } from './ModuleCard';
import { ModuleDetailDrawer } from './ModuleDetailDrawer';
import type { ModuleConfig, ModuleDashboard, ModuleStatus } from '../../types/module';

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'active' | 'paused' | 'error' | 'unconfigured';

export function ModuleManagementPanel() {
  const [dashboard, setDashboard] = useState<ModuleDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<ModuleConfig | null>(null);
  const { addToast } = useStore();

  useEffect(() => {
    loadDashboard();
    // Refresh every 30 seconds
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await api.get<ModuleDashboard>('/api/modules/dashboard');
      setDashboard(data);
    } catch (err) {
      addToast({
        kind: 'error',
        title: '加载失败',
        message: err instanceof Error ? err.message : '无法加载模块数据',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleModule = async (moduleId: string) => {
    try {
      const module = dashboard?.modules.find((m) => m.id === moduleId);
      if (!module) return;

      const newStatus = module.status === 'active' ? 'paused' : 'active';
      await api.post(`/api/modules/${moduleId}/toggle`, { status: newStatus });

      // Update local state
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              modules: prev.modules.map((m) =>
                m.id === moduleId ? { ...m, status: newStatus as ModuleStatus } : m
              ),
              summary: {
                ...prev.summary,
                active: newStatus === 'active' ? prev.summary.active + 1 : prev.summary.active - 1,
                paused: newStatus === 'paused' ? prev.summary.paused + 1 : prev.summary.paused - 1,
              },
            }
          : null
      );

      addToast({
        kind: 'success',
        title: '状态已更新',
        message: `模块已${newStatus === 'active' ? '启动' : '暂停'}`,
      });
    } catch (err) {
      addToast({
        kind: 'error',
        title: '操作失败',
        message: err instanceof Error ? err.message : '无法切换模块状态',
      });
    }
  };

  const handleRunModule = async (moduleId: string) => {
    try {
      setRunningModules((prev) => new Set(prev).add(moduleId));
      await api.post(`/api/modules/${moduleId}/run`, {});
      addToast({
        kind: 'success',
        title: '运行成功',
        message: '模块已开始运行',
      });
      // Refresh dashboard after a short delay
      setTimeout(loadDashboard, 2000);
    } catch (err) {
      addToast({
        kind: 'error',
        title: '运行失败',
        message: err instanceof Error ? err.message : '无法运行模块',
      });
    } finally {
      setRunningModules((prev) => {
        const next = new Set(prev);
        next.delete(moduleId);
        return next;
      });
    }
  };

  const handleDiagnoseModule = (moduleId: string) => {
    const module = dashboard?.modules.find((m) => m.id === moduleId);
    if (module) {
      setSelectedModule(module);
    }
  };

  const handleUpdateModule = (updatedModule: ModuleConfig) => {
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            modules: prev.modules.map((m) => (m.id === updatedModule.id ? updatedModule : m)),
          }
        : null
    );
    setSelectedModule(null);
    loadDashboard();
  };

  const filteredModules =
    dashboard?.modules.filter((module) => {
      // Filter by status
      if (filter !== 'all' && module.status !== filter) return false;

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          module.name.toLowerCase().includes(query) ||
          module.description.toLowerCase().includes(query) ||
          module.id.toLowerCase().includes(query) ||
          module.config.keywords?.some((k) => k.toLowerCase().includes(query))
        );
      }

      return true;
    }) || [];

  const getStatusIcon = (status: FilterType) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4" />;
      case 'paused':
        return <PauseCircle className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      case 'unconfigured':
        return <Settings className="w-4 h-4" />;
      default:
        return <Filter className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: FilterType) => {
    switch (status) {
      case 'active':
        return '运行中';
      case 'paused':
        return '已暂停';
      case 'error':
        return '错误';
      case 'unconfigured':
        return '未配置';
      default:
        return '全部';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-gray-500">加载模块数据...</p>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">加载失败</h3>
          <p className="text-gray-500 mb-4">无法加载模块数据</p>
          <button
            onClick={loadDashboard}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50/50 dark:bg-gray-900/50">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">模块管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理所有自动化模块的配置和运行状态
            </p>
          </div>
          <button
            onClick={loadDashboard}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-5 gap-4 mb-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {dashboard.summary.total}
            </div>
            <div className="text-xs text-blue-600/70 dark:text-blue-400/70">总模块</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {dashboard.summary.active}
            </div>
            <div className="text-xs text-green-600/70 dark:text-green-400/70">运行中</div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {dashboard.summary.paused}
            </div>
            <div className="text-xs text-yellow-600/70 dark:text-yellow-400/70">已暂停</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {dashboard.summary.error}
            </div>
            <div className="text-xs text-red-600/70 dark:text-red-400/70">错误</div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {dashboard.summary.totalCardsThisWeek}
            </div>
            <div className="text-xs text-purple-600/70 dark:text-purple-400/70">本周卡片</div>
          </div>
        </div>

        {/* Alerts */}
        {dashboard.alerts.length > 0 && (
          <div className="space-y-2 mb-4">
            {dashboard.alerts
              .filter((a) => !a.acknowledged)
              .slice(0, 3)
              .map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    alert.severity === 'error'
                      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  }`}
                >
                  <AlertCircle
                    className={`w-5 h-5 ${
                      alert.severity === 'error'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-yellow-600 dark:text-yellow-400'
                    }`}
                  />
                  <span
                    className={`text-sm ${
                      alert.severity === 'error'
                        ? 'text-red-800 dark:text-red-200'
                        : 'text-yellow-800 dark:text-yellow-200'
                    }`}
                  >
                    {alert.message}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索模块..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border border-transparent rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-colors"
            />
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            {(['all', 'active', 'paused', 'error', 'unconfigured'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {getStatusIcon(f)}
                {getStatusLabel(f)}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-600 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-600 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Module Grid/List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredModules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Settings className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              没有找到模块
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery ? '尝试其他搜索词' : '当前筛选条件下没有模块'}
            </p>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
                : 'space-y-3'
            }
          >
            {filteredModules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                onClick={() => setSelectedModule(module)}
                onRun={() => handleRunModule(module.id)}
                onToggle={() => handleToggleModule(module.id)}
                onDiagnose={() => handleDiagnoseModule(module.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedModule && (
        <ModuleDetailDrawer
          module={selectedModule}
          onClose={() => setSelectedModule(null)}
          onUpdate={handleUpdateModule}
        />
      )}
    </div>
  );
}
