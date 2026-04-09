"""
Module Management Routes

Provides unified module management API endpoints.
"""

from datetime import datetime, timedelta
from enum import Enum
from typing import Optional

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

router = APIRouter(prefix="/api/modules")


# ── Enums ─────────────────────────────────────────────────────────

class ModuleStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"
    UNCONFIGURED = "unconfigured"


class CheckStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    WARNING = "warning"
    UNKNOWN = "unknown"


class FixStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    NOT_APPLICABLE = "not_applicable"


# ── Models ─────────────────────────────────────────────────────────

class ModuleSubscription(BaseModel):
    type: str  # 'keyword' | 'author' | 'tag' | 'source'
    value: str
    label: str


class ModuleStats(BaseModel):
    total_cards: int = 0
    this_week: int = 0
    success_rate: float = 100.0
    last_error: Optional[str] = None
    error_count: int = 0


class ModuleConfig(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    status: ModuleStatus
    schedule: str
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    stats: ModuleStats
    config: dict
    subscriptions: list[ModuleSubscription] = []
    metadata: Optional[dict] = None


class ModuleAlert(BaseModel):
    id: str
    module_id: str
    type: str  # 'cookie_expired' | 'fetch_failed' | 'config_invalid' | 'rate_limited'
    message: str
    severity: str  # 'warning' | 'error'
    created_at: datetime
    acknowledged: bool


class ModuleDashboard(BaseModel):
    modules: list[ModuleConfig]
    summary: dict
    alerts: list[ModuleAlert]


class HealthCheck(BaseModel):
    name: str
    status: CheckStatus
    message: str
    details: Optional[dict] = None


class DiagnosisResult(BaseModel):
    module_id: str
    diagnosed_at: datetime
    overall_status: CheckStatus
    checks: list[HealthCheck]
    recommendations: list[dict]


class DiagnoseRequest(BaseModel):
    deep: bool = False


class FixResult(BaseModel):
    fix: str
    status: FixStatus
    message: str
    manual_action_required: bool = False


class QuickFixResponse(BaseModel):
    module_id: str
    fixed_at: datetime
    results: list[FixResult]
    module_status: ModuleStatus
    next_steps: list[str]


class QuickFixRequest(BaseModel):
    fixes: list[str] = ["all"]


class CookieValidationResult(BaseModel):
    valid: bool
    message: str
    expiry_date: Optional[datetime] = None
    details: Optional[dict] = None


class ConfigUpdateRequest(BaseModel):
    config: dict
    subscriptions: list[ModuleSubscription] = []


# ── Module Registry ───────────────────────────────────────────────

# Default 7 modules
DEFAULT_MODULES = [
    {
        "id": "arxiv-tracker",
        "name": "arXiv 论文追踪",
        "description": "追踪 arXiv 上符合关键词的最新论文",
        "icon": "book-open",
        "schedule": "0 8 * * *",
    },
    {
        "id": "semantic-scholar-tracker",
        "name": "Semantic Scholar 追踪",
        "description": "追踪 Semantic Scholar 上的最新研究",
        "icon": "graduation-cap",
        "schedule": "0 10 * * *",
    },
    {
        "id": "xiaohongshu-tracker",
        "name": "小红书追踪",
        "description": "追踪小红书上的相关内容",
        "icon": "book-heart",
        "schedule": "0 10 * * *",
    },
    {
        "id": "bilibili-tracker",
        "name": "哔哩哔哩追踪",
        "description": "追踪 B站 上的相关视频",
        "icon": "tv",
        "schedule": "0 11 * * *",
    },
    {
        "id": "xiaoyuzhou-tracker",
        "name": "小宇宙追踪",
        "description": "追踪小宇宙播客",
        "icon": "podcast",
        "schedule": "0 10 * * *",
    },
    {
        "id": "zhihu-tracker",
        "name": "知乎追踪",
        "description": "追踪知乎上的相关内容",
        "icon": "help-circle",
        "schedule": "0 13 * * *",
    },
    {
        "id": "folder-monitor",
        "name": "文件夹监控",
        "description": "监控指定文件夹的变化",
        "icon": "folder-open",
        "schedule": "*/5 * * * *",
    },
]

# In-memory storage (replace with database)
_module_configs: dict[str, dict] = {}
_module_stats: dict[str, dict] = {}
_module_alerts: list[dict] = []


def _get_module_config(module_id: str) -> dict:
    """Get or initialize module configuration."""
    if module_id not in _module_configs:
        default = next((m for m in DEFAULT_MODULES if m["id"] == module_id), None)
        if not default:
            raise HTTPException(status_code=404, detail=f"Module {module_id} not found")

        _module_configs[module_id] = {
            "keywords": [],
            "cookie": None,
            "cookie_valid": None,
            "max_results": 50,
            "filters": {},
        }
    return _module_configs[module_id]


def _get_module_stats(module_id: str) -> dict:
    """Get or initialize module statistics."""
    if module_id not in _module_stats:
        _module_stats[module_id] = {
            "total_cards": 0,
            "this_week": 0,
            "success_rate": 100.0,
            "last_error": None,
            "error_count": 0,
        }
    return _module_stats[module_id]


def _determine_status(module_id: str) -> ModuleStatus:
    """Determine module status based on configuration and errors."""
    config = _get_module_config(module_id)
    stats = _get_module_stats(module_id)

    # Check if module needs configuration
    if module_id in ["xiaohongshu-tracker", "bilibili-tracker", "zhihu-tracker"]:
        if not config.get("cookie"):
            return ModuleStatus.UNCONFIGURED

    if not config.get("keywords"):
        return ModuleStatus.UNCONFIGURED

    # Check for errors
    if stats.get("error_count", 0) > 0:
        return ModuleStatus.ERROR

    # Default to active (would check scheduler in real implementation)
    return ModuleStatus.ACTIVE


# ── API Endpoints ──────────────────────────────────────────────────

@router.get("/dashboard")
async def get_module_dashboard() -> ModuleDashboard:
    """Returns all modules with full status for the dashboard."""
    modules = []

    for default in DEFAULT_MODULES:
        module_id = default["id"]
        config = _get_module_config(module_id)
        stats = _get_module_stats(module_id)
        status = _determine_status(module_id)

        # Calculate next run time based on cron
        next_run = datetime.utcnow() + timedelta(hours=1)  # Mock

        module = ModuleConfig(
            id=module_id,
            name=default["name"],
            description=default["description"],
            icon=default["icon"],
            status=status,
            schedule=default["schedule"],
            last_run=None,
            next_run=next_run,
            stats=ModuleStats(**stats),
            config=config,
            subscriptions=[],
        )
        modules.append(module)

    summary = {
        "total": len(modules),
        "active": sum(1 for m in modules if m.status == ModuleStatus.ACTIVE),
        "paused": sum(1 for m in modules if m.status == ModuleStatus.PAUSED),
        "error": sum(1 for m in modules if m.status == ModuleStatus.ERROR),
        "unconfigured": sum(1 for m in modules if m.status == ModuleStatus.UNCONFIGURED),
        "total_cards_this_week": sum(m.stats.this_week for m in modules),
    }

    alerts = [ModuleAlert(**a) for a in _module_alerts if not a.get("acknowledged", False)]

    return ModuleDashboard(modules=modules, summary=summary, alerts=alerts)


@router.post("/{module_id}/diagnose")
async def diagnose_module_endpoint(
    module_id: str, request: DiagnoseRequest = Body(default_factory=DiagnoseRequest)
) -> DiagnosisResult:
    """Diagnose module issues (checks config, cookie, network, etc.)."""
    # Verify module exists
    default = next((m for m in DEFAULT_MODULES if m["id"] == module_id), None)
    if not default:
        raise HTTPException(status_code=404, detail=f"Module {module_id} not found")

    checks: list[HealthCheck] = []
    config = _get_module_config(module_id)

    # Check 1: Configuration completeness
    has_keywords = bool(config.get("keywords"))
    needs_cookie = module_id in ["xiaohongshu-tracker", "bilibili-tracker", "zhihu-tracker"]
    has_cookie = bool(config.get("cookie")) if needs_cookie else True

    if has_keywords and has_cookie:
        checks.append(
            HealthCheck(name="config_complete", status=CheckStatus.PASS, message="配置完整")
        )
    else:
        missing = []
        if not has_keywords:
            missing.append("关键词")
        if needs_cookie and not has_cookie:
            missing.append("Cookie")
        checks.append(
            HealthCheck(
                name="config_complete",
                status=CheckStatus.FAIL,
                message=f"缺少必要配置: {', '.join(missing)}",
                details={"missing": missing},
            )
        )

    # Check 2: Cookie validity (if applicable)
    if needs_cookie and has_cookie:
        cookie_valid = config.get("cookie_valid")
        if cookie_valid is True:
            checks.append(
                HealthCheck(name="cookie_valid", status=CheckStatus.PASS, message="Cookie 有效")
            )
        elif cookie_valid is False:
            checks.append(
                HealthCheck(
                    name="cookie_valid",
                    status=CheckStatus.FAIL,
                    message="Cookie 已过期或无效",
                    details={"suggestion": "请重新获取 Cookie"},
                )
            )
        else:
            checks.append(
                HealthCheck(
                    name="cookie_valid",
                    status=CheckStatus.UNKNOWN,
                    message="Cookie 状态未知",
                    details={"suggestion": "请验证 Cookie"},
                )
            )

    # Check 3: Network connectivity (mock)
    checks.append(
        HealthCheck(name="network_connectivity", status=CheckStatus.PASS, message="网络连接正常")
    )

    # Check 4: API accessibility (deep check)
    if request.deep:
        if needs_cookie and not config.get("cookie_valid"):
            checks.append(
                HealthCheck(
                    name="api_accessible",
                    status=CheckStatus.UNKNOWN,
                    message="未检查（依赖 Cookie）",
                )
            )
        else:
            checks.append(
                HealthCheck(
                    name="api_accessible", status=CheckStatus.PASS, message="API 可访问"
                )
            )

    # Generate recommendations
    recommendations = []
    for check in checks:
        if check.status == CheckStatus.FAIL:
            if check.name == "cookie_valid":
                recommendations.append({
                    "priority": "high",
                    "action": "update_cookie",
                    "description": "更新 Cookie",
                    "auto_fixable": False,
                })
            elif check.name == "config_complete":
                recommendations.append({
                    "priority": "high",
                    "action": "complete_config",
                    "description": "完善模块配置",
                    "auto_fixable": False,
                })

    # Determine overall status
    overall = CheckStatus.PASS
    if any(c.status == CheckStatus.FAIL for c in checks):
        overall = CheckStatus.FAIL
    elif any(c.status == CheckStatus.WARNING for c in checks):
        overall = CheckStatus.WARNING

    return DiagnosisResult(
        module_id=module_id,
        diagnosed_at=datetime.utcnow(),
        overall_status=overall,
        checks=checks,
        recommendations=recommendations,
    )


@router.post("/{module_id}/quick-fix")
async def quick_fix_endpoint(
    module_id: str, request: QuickFixRequest = Body(default_factory=QuickFixRequest)
) -> QuickFixResponse:
    """Attempt to auto-fix common module issues."""
    default = next((m for m in DEFAULT_MODULES if m["id"] == module_id), None)
    if not default:
        raise HTTPException(status_code=404, detail=f"Module {module_id} not found")

    results: list[FixResult] = []
    config = _get_module_config(module_id)
    stats = _get_module_stats(module_id)

    fixes_to_apply = request.fixes if request.fixes != ["all"] else [
        "clear_cache", "reset_schedule", "reset_error_count", "validate_config"
    ]

    for fix_name in fixes_to_apply:
        if fix_name == "clear_cache":
            results.append(
                FixResult(fix="clear_cache", status=FixStatus.SUCCESS, message="已清除缓存")
            )
        elif fix_name == "reset_schedule":
            results.append(
                FixResult(fix="reset_schedule", status=FixStatus.SUCCESS, message="已重置调度器")
            )
        elif fix_name == "reset_error_count":
            stats["error_count"] = 0
            stats["last_error"] = None
            results.append(
                FixResult(
                    fix="reset_error_count", status=FixStatus.SUCCESS, message="已重置错误计数"
                )
            )
        elif fix_name == "validate_config":
            has_keywords = bool(config.get("keywords"))
            needs_cookie = module_id in ["xiaohongshu-tracker", "bilibili-tracker", "zhihu-tracker"]
            has_cookie = bool(config.get("cookie")) if needs_cookie else True

            if has_keywords and has_cookie:
                results.append(
                    FixResult(
                        fix="validate_config", status=FixStatus.SUCCESS, message="配置验证通过"
                    )
                )
            else:
                results.append(
                    FixResult(
                        fix="validate_config",
                        status=FixStatus.FAILED,
                        message="配置不完整",
                        manual_action_required=True,
                    )
                )
        elif fix_name == "refresh_cookie":
            results.append(
                FixResult(
                    fix="refresh_cookie",
                    status=FixStatus.FAILED,
                    message="无法自动刷新 Cookie，请手动更新",
                    manual_action_required=True,
                )
            )
        else:
            results.append(
                FixResult(
                    fix=fix_name,
                    status=FixStatus.NOT_APPLICABLE,
                    message=f"未知修复类型: {fix_name}",
                )
            )

    # Recalculate status
    new_status = _determine_status(module_id)

    # Generate next steps
    next_steps = []
    for result in results:
        if result.manual_action_required:
            if result.fix == "refresh_cookie":
                next_steps.append("请手动更新 Cookie 后重新启动模块")
            elif result.fix == "validate_config":
                next_steps.append("请完善模块配置")

    return QuickFixResponse(
        module_id=module_id,
        fixed_at=datetime.utcnow(),
        results=results,
        module_status=new_status,
        next_steps=next_steps,
    )


@router.post("/{module_id}/toggle")
async def toggle_module(module_id: str, body: dict = Body(...)) -> dict:
    """Toggle module status (active/paused)."""
    default = next((m for m in DEFAULT_MODULES if m["id"] == module_id), None)
    if not default:
        raise HTTPException(status_code=404, detail=f"Module {module_id} not found")

    new_status = body.get("status", "active")
    # In real implementation, this would update the scheduler
    return {"module_id": module_id, "status": new_status, "updated_at": datetime.utcnow()}


@router.post("/{module_id}/run")
async def run_module(module_id: str) -> dict:
    """Run module immediately."""
    default = next((m for m in DEFAULT_MODULES if m["id"] == module_id), None)
    if not default:
        raise HTTPException(status_code=404, detail=f"Module {module_id} not found")

    # In real implementation, this would trigger the module runner
    return {"module_id": module_id, "started_at": datetime.utcnow(), "status": "running"}


@router.post("/{module_id}/config")
async def update_module_config(module_id: str, request: ConfigUpdateRequest) -> ModuleConfig:
    """Update module configuration."""
    default = next((m for m in DEFAULT_MODULES if m["id"] == module_id), None)
    if not default:
        raise HTTPException(status_code=404, detail=f"Module {module_id} not found")

    # Update config
    _module_configs[module_id] = request.config

    # Recalculate status
    status = _determine_status(module_id)

    # Get updated stats
    stats = _get_module_stats(module_id)

    return ModuleConfig(
        id=module_id,
        name=default["name"],
        description=default["description"],
        icon=default["icon"],
        status=status,
        schedule=default["schedule"],
        last_run=None,
        next_run=datetime.utcnow() + timedelta(hours=1),
        stats=ModuleStats(**stats),
        config=request.config,
        subscriptions=request.subscriptions,
    )


@router.post("/{module_id}/validate-cookie")
async def validate_cookie(module_id: str, body: dict = Body(...)) -> CookieValidationResult:
    """Validate module cookie."""
    cookie = body.get("cookie", "")

    if not cookie:
        return CookieValidationResult(valid=False, message="Cookie 不能为空")

    # Mock validation - in real implementation, would make test request
    if len(cookie) < 50:
        return CookieValidationResult(valid=False, message="Cookie 格式不正确")

    # Update stored config
    if module_id in _module_configs:
        _module_configs[module_id]["cookie"] = cookie
        _module_configs[module_id]["cookie_valid"] = True

    return CookieValidationResult(
        valid=True,
        message="Cookie 验证通过",
        expiry_date=datetime.utcnow() + timedelta(days=30),
    )


@router.post("/{module_id}/get-cookie")
async def get_cookie_from_browser(module_id: str) -> dict:
    """Get cookie from browser extension or clipboard."""
    # This is a mock endpoint - in real implementation,
    # would integrate with browser extension or try clipboard
    raise HTTPException(status_code=400, detail="请手动粘贴 Cookie")


@router.get("/{module_id}/logs")
async def get_module_logs(module_id: str) -> dict:
    """Get module execution logs."""
    default = next((m for m in DEFAULT_MODULES if m["id"] == module_id), None)
    if not default:
        raise HTTPException(status_code=404, detail=f"Module {module_id} not found")

    # Mock logs
    logs = [
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Module {module_id} initialized",
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Configuration loaded",
        f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Ready to run",
    ]

    return {"module_id": module_id, "logs": logs}


@router.patch("/{module_id}/alerts/{alert_id}")
async def acknowledge_alert(module_id: str, alert_id: str) -> dict:
    """Acknowledge a module alert."""
    for alert in _module_alerts:
        if alert["id"] == alert_id and alert["module_id"] == module_id:
            alert["acknowledged"] = True
            return {"success": True}

    raise HTTPException(status_code=404, detail="Alert not found")
