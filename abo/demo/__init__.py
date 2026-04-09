"""
Demo Mode — 展示模式

当 demo_mode 开启时，API 返回精心设计的假数据用于宣传截图。
关闭时恢复真实数据接口，不会清空任何真实数据。
"""
from ..config import load as load_config


def is_demo_mode() -> bool:
    """Check if demo mode is currently enabled."""
    return bool(load_config().get("demo_mode", False))
