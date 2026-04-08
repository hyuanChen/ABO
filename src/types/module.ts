// Module Management Types

export type ModuleStatus = 'active' | 'paused' | 'error' | 'unconfigured';

export interface ModuleSubscription {
  type: 'keyword' | 'author' | 'tag' | 'source';
  value: string;
  label: string;
}

export interface ModuleStats {
  totalCards: number;
  thisWeek: number;
  successRate: number;
  lastError?: string;
  errorCount: number;
}

export interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: ModuleStatus;
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  stats: ModuleStats;
  config: {
    keywords?: string[];
    cookie?: string;
    cookieValid?: boolean;
    cookieExpiry?: string;
    maxResults?: number;
    filters?: Record<string, unknown>;
    [key: string]: unknown;
  };
  subscriptions?: ModuleSubscription[];
  metadata?: {
    version: string;
    author: string;
    homepage?: string;
    docs?: string;
  };
}

export interface ModuleDashboard {
  modules: ModuleConfig[];
  summary: {
    total: number;
    active: number;
    paused: number;
    error: number;
    unconfigured: number;
    totalCardsThisWeek: number;
  };
  alerts: ModuleAlert[];
}

export interface ModuleAlert {
  id: string;
  moduleId: string;
  type: 'cookie_expired' | 'fetch_failed' | 'config_invalid' | 'rate_limited';
  message: string;
  severity: 'warning' | 'error';
  createdAt: string;
  acknowledged: boolean;
}

// Diagnosis Types
export type CheckStatus = 'pass' | 'fail' | 'warning' | 'unknown';

export interface HealthCheck {
  name: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface DiagnosisResult {
  moduleId: string;
  diagnosedAt: string;
  overallStatus: CheckStatus;
  checks: HealthCheck[];
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    description: string;
    autoFixable: boolean;
  }>;
}

// Quick Fix Types
export type FixStatus = 'success' | 'failed' | 'skipped' | 'not_applicable';

export interface FixResult {
  fix: string;
  status: FixStatus;
  message: string;
  manualActionRequired?: boolean;
}

export interface QuickFixResponse {
  moduleId: string;
  fixedAt: string;
  results: FixResult[];
  moduleStatus: ModuleStatus;
  nextSteps: string[];
}

// Cookie Validation
export interface CookieValidationResult {
  valid: boolean;
  message: string;
  expiryDate?: string;
  details?: Record<string, unknown>;
}
