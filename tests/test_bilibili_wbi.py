import time
from abo.default_modules.bilibili.wbi import get_mixin_key, enc_wbi


def test_mixin_key_length_and_scramble():
    raw = "abcdef"
    padded = raw * 11  # 66 chars
    key = get_mixin_key(padded)
    assert len(key) == 32
    assert key != padded[:32]


def test_enc_wbi_adds_wts_and_wrid():
    params = enc_wbi({"mid": "12345", "ps": "30"}, img_key="abc", sub_key="def")
    assert "wts" in params
    assert "w_rid" in params
    assert len(params["w_rid"]) == 32
    assert isinstance(params["wts"], int)
