"""Safety-net checks for ChopOut's membership design.

These are static policy contract checks, not substitutes for live integration
tests against RevenueCat, MongoDB or the Google Play purchase sandbox.
"""
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = (ROOT / "server.py").read_text(encoding="utf-8")
NOTICES = (ROOT / "noticeboard.py").read_text(encoding="utf-8")


def _function(source: str, name: str):
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return ast.get_source_segment(source, node) or ""
    raise AssertionError(f"Function {name} was not found")


def test_discovery_requires_pro_server_side():
    for name in ("search", "match_contacts", "check_contacts", "nearby", "send_request"):
        body = _function(SERVER, name)
        assert "Depends(pro_user)" in body, f"{name} is not gated on the server"


def test_free_members_only_reply_to_received_messages():
    body = _function(SERVER, "send_message")
    assert "if not await is_pro(user)" in body
    assert '"from_id": body.to_user_id' in body
    assert "Upgrade to Pro to start new chats" in body


def test_noticeboard_writes_require_pro_and_reads_are_free():
    assert "Depends(pro_user)" in _function(NOTICES, "publish")
    assert "Depends(current_user)" in _function(NOTICES, "feed")
    assert 'NOTICE_LIFETIME = timedelta(hours=48)' in NOTICES


def test_no_expired_entitlement_fail_open():
    body = _function(SERVER, "is_pro")
    assert "never reuse expired Pro cache" in body


def test_blocking_is_enforced_on_outgoing_contact():
    for name in ("send_request", "send_message"):
        assert "ensure_not_blocked" in _function(SERVER, name)


def test_radar_is_opt_in_and_same_trade():
    body = _function(SERVER, "nearby")
    assert '"radar_visible": True' in body
    assert '"trade": user.get("trade")' in body
    assert "NEARBY_RADIUS_KM = 20" in SERVER
