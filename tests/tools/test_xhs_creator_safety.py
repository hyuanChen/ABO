from datetime import timedelta

from abo.tools.xhs_creator_safety import check_creator_allowed, iso, utc_now


def test_creator_safety_does_not_block_same_creator_recent_attempt():
    now = utc_now()
    state = {
        "global": {},
        "creators": {
            "creator-1": {
                "last_attempt_at": iso(now - timedelta(seconds=5)),
            }
        },
    }

    decision = check_creator_allowed("creator-1", state=state, now=now)

    assert decision.allowed is True


def test_creator_safety_blocks_risk_cooldown():
    now = utc_now()
    state = {
        "global": {},
        "creators": {
            "creator-1": {
                "cooldown_until": iso(now + timedelta(hours=1)),
            }
        },
    }

    decision = check_creator_allowed("creator-1", state=state, now=now)

    assert decision.allowed is False
    assert decision.reason == "该博主风险冷却中"
