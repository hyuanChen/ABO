import { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Settings,
  Rss,
  ScrollText,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  Trash2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../core/api';
import { CookieValidator } from './CookieValidator';
import type {
  ModuleConfig,
  DiagnosisResult,
  QuickFixResponse,
  ModuleStatus,
  CookieValidationResult,
} from '../../types/module';

type TabType = 'overview' | 'config' | 'subscriptions' | 'logs';

interface ModuleDetailDrawerProps {
  module: ModuleConfig;
  onClose: () => void;
  onUpdate: (updatedModule: ModuleConfig) => void;
}

const statusConfig: Record<ModuleStatus, { label: string; color: string; bgColor: string }> = {
  active: { label: '运行中', color: 'text-green-600', bgColor: 'bg-green-50' },
  paused: { label: '已暂停', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  error: { label: '错误', color: 'text-red-600', bgColor: 'bg-red-50' },
  unconfigured: { label: '未配置', color: 'text-gray-400', bgColor: 'bg-gray-50' },
};

export function ModuleDetailDrawer({ module, onClose, onUpdate }: ModuleDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [fixResult, setFixResult] = useState<QuickFixResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Config form state
  const [keywords, setKeywords] = useState<string[]>(module.config.keywords || []);
  const [newKeyword, setNewKeyword] = useState('');
  const [cookie, setCookie] = useState(module.config.cookie || '');
  const [cookieValidation, setCookieValidation] = useState<CookieValidationResult | null>(null);
  const [maxResults, setMaxResults] = useState(module.config.maxResults || 50);

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState(module.subscriptions || []);
  const [newSubType, setNewSubType] = useState<'keyword' | 'author' | 'tag' | 'source'>('keyword');
  const [newSubValue, setNewSubValue] = useState('');
  const [newSubLabel, setNewSubLabel] = useState('');

  // Logs state
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab]);

  const fetchLogs = async () => {
    try {
      const result = await api.get<{ logs: string[] }>(`/api/modules/${module.id}/logs`);
      setLogs(result.logs || []);
    } catch {
      setLogs(['暂无日志']);
    }
  };

  const runDiagnosis = async () => {
    setIsDiagnosing(true);
    setDiagnosisResult(null);
    try {
      const result = await api.post<DiagnosisResult>(`/api/modules/${module.id}/diagnose`, {
        deep: true,
      });
      setDiagnosisResult(result);
    } catch (err) {
      setDiagnosisResult({
        moduleId: module.id,
        diagnosedAt: new Date().toISOString(),
        overallStatus: 'fail',
        checks: [
          {
            name: 'diagnosis',
            status: 'fail',
            message: err instanceof Error ? err.message : '诊断失败',
          },
        ],
        recommendations: [],
      });
    } finally {
      setIsDiagnosing(false);
    }
  };

  const runQuickFix = async () => {
    setIsFixing(true);
    setFixResult(null);
    try {
      const result = await api.post<QuickFixResponse>(`/api/modules/${module.id}/quick-fix`, {
        fixes: ['all'],
      });
      setFixResult(result);
      // Update module status if changed
      if (result.moduleStatus !== module.status) {
        onUpdate({ ...module, status: result.moduleStatus });
      }
    } catch (err) {
      setFixResult({
        moduleId: module.id,
        fixedAt: new Date().toISOString(),
        results: [
          {
            fix: 'all',
            status: 'failed',
            message: err instanceof Error ? err.message : '修复失败',
          },
        ],
        moduleStatus: module.status,
        nextSteps: ['请手动检查配置'],
      });
    } finally {
      setIsFixing(false);
    }
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      const updatedConfig = {
        ...module.config,
        keywords,
        cookie,
        maxResults,
        cookieValid: cookieValidation?.valid ?? module.config.cookieValid,
      };
      const result = await api.post<ModuleConfig>(`/api/modules/${module.id}/config`, {
        config: updatedConfig,
        subscriptions,
      });
      onUpdate(result);
      // Close drawer after successful save
      onClose();
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const addSubscription = () => {
    if (newSubValue.trim()) {
      setSubscriptions([
        ...subscriptions,
        {
          type: newSubType,
          value: newSubValue.trim(),
          label: newSubLabel.trim() || newSubValue.trim(),
        },
      ]);
      setNewSubValue('');
      setNewSubLabel('');
    }
  };

  const removeSubscription = (index: number) => {
    setSubscriptions(subscriptions.filter((_, i) => i !== index));
  };

  const getCheckIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Loader2 className="w-5 h-5 text-gray-400" />;
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: '概览', icon: <FileText className="w-4 h-4" /> },
    { id: 'config', label: '配置', icon: <Settings className="w-4 h-4" /> },
    { id: 'subscriptions', label: '订阅', icon: <Rss className="w-4 h-4" /> },
    { id: 'logs', label: '日志', icon: <ScrollText className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-2xl h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl flex items-center justify-center border border-blue-100 dark:border-blue-800">
              <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{module.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                    statusConfig[module.status].bgColor
                  } ${statusConfig[module.status].color}`}
                >
                  {statusConfig[module.status].label}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{module.id}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">描述</h3>
                <p className="text-gray-600 dark:text-gray-400">{module.description}</p>
              </div>

              {/* Stats */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">统计数据</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      {module.stats.totalCards}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">累计卡片</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      {module.stats.thisWeek}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">本周</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      {module.stats.successRate}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">成功率</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      {module.stats.errorCount}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">错误次数</div>
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">调度信息</h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Cron 表达式</span>
                    <span className="font-mono text-sm">{module.schedule || '未设置'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">上次运行</span>
                    <span className="text-sm">
                      {module.lastRun ? new Date(module.lastRun).toLocaleString('zh-CN') : '从未'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">下次运行</span>
                    <span className="text-sm">
                      {module.nextRun ? new Date(module.nextRun).toLocaleString('zh-CN') : '未安排'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Diagnosis */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">健康诊断</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={runQuickFix}
                      disabled={isFixing}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {isFixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      快速修复
                    </button>
                    <button
                      onClick={runDiagnosis}
                      disabled={isDiagnosing}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {isDiagnosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                      运行诊断
                    </button>
                  </div>
                </div>

                {diagnosisResult && (
                  <div className="space-y-3">
                    <div
                      className={`p-4 rounded-lg border ${
                        diagnosisResult.overallStatus === 'pass'
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : diagnosisResult.overallStatus === 'fail'
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {getCheckIcon(diagnosisResult.overallStatus)}
                        <span className="font-medium">
                          {diagnosisResult.overallStatus === 'pass'
                            ? '模块运行正常'
                            : diagnosisResult.overallStatus === 'fail'
                            ? '发现问题需要处理'
                            : '存在潜在问题'}
                        </span>
                      </div>
                    </div>

                    {diagnosisResult.checks.map((check, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        {getCheckIcon(check.status)}
                        <div>
                          <p className="font-medium text-sm">{check.message}</p>
                          {check.details && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {JSON.stringify(check.details)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}

                    {diagnosisResult.recommendations.length > 0 && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                        <h4 className="text-sm font-medium mb-2">修复建议</h4>
                        {diagnosisResult.recommendations.map((rec, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-2"
                          >
                            <div>
                              <p className="text-sm font-medium">{rec.description}</p>
                              {rec.autoFixable && (
                                <span className="text-xs text-green-600 dark:text-green-400">可自动修复</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {fixResult && (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-sm font-medium">修复结果</h4>
                    {fixResult.results.map((result, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                          result.status === 'success'
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                            : result.status === 'failed'
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                            : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {result.status === 'success' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : result.status === 'failed' ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                        {result.message}
                      </div>
                    ))}
                    {fixResult.nextSteps.length > 0 && (
                      <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">下一步:</p>
                        <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-1 list-disc list-inside">
                          {fixResult.nextSteps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Config Tab */}
          {activeTab === 'config' && (
            <div className="space-y-6">
              {/* Keywords */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  关键词
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                    placeholder="添加关键词..."
                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addKeyword}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                    >
                      {kw}
                      <button
                        onClick={() => removeKeyword(kw)}
                        className="hover:text-blue-900 dark:hover:text-blue-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Cookie Validator */}
              {module.config.cookie !== undefined && (
                <CookieValidator
                  moduleId={module.id}
                  initialCookie={cookie}
                  onValidationChange={setCookieValidation}
                  onCookieChange={setCookie}
                />
              )}

              {/* Max Results */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  最大结果数
                </label>
                <input
                  type="number"
                  value={maxResults}
                  onChange={(e) => setMaxResults(parseInt(e.target.value) || 50)}
                  min={1}
                  max={200}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={saveConfig}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存配置
                </button>
              </div>
            </div>
          )}

          {/* Subscriptions Tab */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-6">
              {/* Add Subscription */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">添加订阅</h3>
                <div className="space-y-3">
                  <select
                    value={newSubType}
                    onChange={(e) => setNewSubType(e.target.value as typeof newSubType)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="keyword">关键词</option>
                    <option value="author">作者/UP主</option>
                    <option value="tag">标签</option>
                    <option value="source">来源</option>
                  </select>
                  <input
                    type="text"
                    value={newSubValue}
                    onChange={(e) => setNewSubValue(e.target.value)}
                    placeholder="订阅值..."
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={newSubLabel}
                    onChange={(e) => setNewSubLabel(e.target.value)}
                    placeholder="显示名称（可选）..."
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addSubscription}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    添加订阅
                  </button>
                </div>
              </div>

              {/* Subscription List */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  当前订阅 ({subscriptions.length})
                </h3>
                {subscriptions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    暂无订阅，请添加一个
                  </div>
                ) : (
                  <div className="space-y-2">
                    {subscriptions.map((sub, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div>
                          <span className="inline-block px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-full mb-1">
                            {sub.type === 'keyword'
                              ? '关键词'
                              : sub.type === 'author'
                              ? '作者'
                              : sub.type === 'tag'
                              ? '标签'
                              : '来源'}
                          </span>
                          <p className="font-medium text-sm">{sub.label}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{sub.value}</p>
                        </div>
                        <button
                          onClick={() => removeSubscription(i)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={saveConfig}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存订阅
                </button>
              </div>
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">运行日志</h3>
                <button
                  onClick={fetchLogs}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新
                </button>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-gray-300 overflow-x-auto">
                {logs.length === 0 ? (
                  <p className="text-gray-500">暂无日志</p>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="py-0.5">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
