"""Twilio SMS: invites, phone verification codes and crew-request alerts.

All functions are sync (twilio SDK) — call them via run_in_threadpool.
When Twilio is not configured every call raises SmsNotConfigured so the API
can answer with a clear 503 instead of crashing.
"""
import logging
import os
import re

from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

logger = logging.getLogger(__name__)

DEFAULT_COUNTRY_CODE = os.environ.get("DEFAULT_COUNTRY_CODE", "+61")  # Australia


class SmsNotConfigured(Exception):
    pass


class SmsError(Exception):
    pass


def _cfg() -> dict:
    return {
        "sid": (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip(),
        "token": (os.environ.get("TWILIO_AUTH_TOKEN") or "").strip(),
        "verify": (os.environ.get("TWILIO_VERIFY_SERVICE_SID") or "").strip(),
        "from": (os.environ.get("TWILIO_PHONE_NUMBER") or "").strip(),
    }


def messaging_configured() -> bool:
    c = _cfg()
    return bool(c["sid"] and c["token"] and c["from"])


def verify_configured() -> bool:
    c = _cfg()
    return bool(c["sid"] and c["token"] and c["verify"])


def _client() -> Client:
    c = _cfg()
    if not (c["sid"] and c["token"]):
        raise SmsNotConfigured()
    return Client(c["sid"], c["token"])


def to_e164(phone: str) -> str | None:
    """Normalise a locally formatted mobile (e.g. 0412 345 678) to E.164 (+61412345678)."""
    raw = (phone or "").strip()
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if raw.startswith("+"):
        return "+" + digits if 8 <= len(digits) <= 15 else None
    cc = DEFAULT_COUNTRY_CODE.lstrip("+")
    if digits.startswith("00"):
        digits = digits[2:]
        return "+" + digits if 8 <= len(digits) <= 15 else None
    if digits.startswith("0"):
        digits = digits[1:]
    elif digits.startswith(cc) and len(digits) > 10:
        digits = digits[len(cc):]
    if not 6 <= len(digits) <= 12:
        return None
    return f"+{cc}{digits}"


def _friendly(exc: TwilioRestException) -> str:
    if exc.code == 21211:
        return "That mobile number doesn't look valid"
    if exc.code == 21608:
        return "This Twilio trial account can only text verified numbers"
    if exc.code == 60200:
        return "Invalid mobile number for verification"
    if exc.code == 60203:
        return "Too many codes sent. Please wait a few minutes"
    if exc.code == 60202:
        return "Too many attempts. Request a new code"
    return exc.msg or "SMS failed"


def send_sms(to: str, body: str) -> str:
    c = _cfg()
    if not c["from"]:
        raise SmsNotConfigured()
    try:
        msg = _client().messages.create(to=to, from_=c["from"], body=body)
        return msg.sid
    except TwilioRestException as exc:
        logger.warning("send_sms(%s) failed: %s %s", to, exc.code, exc.msg)
        raise SmsError(_friendly(exc)) from exc


def start_verification(to: str) -> str:
    c = _cfg()
    if not c["verify"]:
        raise SmsNotConfigured()
    try:
        v = _client().verify.v2.services(c["verify"]).verifications.create(to=to, channel="sms")
        return v.status
    except TwilioRestException as exc:
        logger.warning("start_verification(%s) failed: %s %s", to, exc.code, exc.msg)
        raise SmsError(_friendly(exc)) from exc


def check_verification(to: str, code: str) -> bool:
    c = _cfg()
    if not c["verify"]:
        raise SmsNotConfigured()
    try:
        chk = _client().verify.v2.services(c["verify"]).verification_checks.create(to=to, code=code)
        return chk.status == "approved"
    except TwilioRestException as exc:
        if exc.code == 20404:  # no pending verification for this number
            return False
        logger.warning("check_verification(%s) failed: %s %s", to, exc.code, exc.msg)
        raise SmsError(_friendly(exc)) from exc
