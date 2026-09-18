from __future__ import annotations

import hashlib
import io
import asyncio
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from curl_cffi.requests.exceptions import ConnectionError as CurlConnectionError
from curl_cffi.requests.exceptions import Timeout as CurlTimeout
from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from gateway_adapter.http_provider import (  # noqa: E402
    ArtifactOutcome,
    CurrentArtifactPull,
    REQUIRED_COLUMNS,
    GatewayArtifact,
    GatewayAuthenticationError,
    GatewayHttpProvider,
    GatewayTransientError,
    HttpGatewayConfig,
    WorkbookEvidence,
    GatewayContractError,
    HistoricalPlanItem,
    ReportIdentity,
    WeeklyEntry,
    _normalize_npn,
    _parse_workbook,
    _require_success_status,
    classify_provider_error,
    historical_plan,
    parse_report_identity,
    parse_stats_bootstrap,
    validate_workbook,
)
import personal_bridge  # noqa: E402


UUID = "11111111-2222-3333-4444-555555555555"


def report_html() -> str:
    return f"""
    <html>
      <head><meta name="csrf-token" content="report-csrf"></head>
      <body>
        <div class="downline-ip-report" data-uuid="{UUID}" data-week="2026-08-28"></div>
        <div id="August-2026">
          <a href="/ipreport/{UUID}/2026-08-07">Week 1</a>
          <a href="/ipreport/{UUID}/2026-08-14">Week 2</a>
          <a href="/ipreport/{UUID}/2026-08-21">Week 3</a>
          <a href="/ipreport/{UUID}/2026-08-28">Week 4</a>
        </div>
      </body>
    </html>
    """


def workbook_bytes(file_date: str = "8/22/2026") -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(list(REQUIRED_COLUMNS))
    sheet.append([
        file_date,
        "Producer One",
        "123456",
        "one@example.com",
        "Upline",
        "999",
        "Agency",
        100.0,
        250.0,
        "First Leg",
        "888",
        50.0,
        150.0,
    ])
    sheet.append([
        file_date,
        "Producer Two",
        "123456",
        "two@example.com",
        "Upline",
        "999",
        "Agency",
        200.0,
        350.0,
        "First Leg",
        "888",
        25.0,
        175.0,
    ])
    output = io.BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


class HttpProviderContractTests(unittest.TestCase):
    class _Response:
        def __init__(
            self,
            payload: dict[str, object] | None = None,
            *,
            status_code: int = 200,
            text: str = "",
        ) -> None:
            self.status_code = status_code
            self._payload = payload if payload is not None else {}
            self.text = text

        def json(self) -> dict[str, object]:
            return self._payload

    class _EmptyCookies:
        def __init__(self) -> None:
            self.jar: tuple[object, ...] = ()

        def clear(self) -> None:
            return None

        def set(self, *_: object, **__: object) -> None:
            return None

    class _AuthSession:
        def __init__(self, post_responses: list[tuple[str, dict[str, object]]]) -> None:
            self.cookies = HttpProviderContractTests._EmptyCookies()
            self.post_responses = list(post_responses)
            self.calls: list[tuple[str, str, dict[str, object] | None]] = []

        async def get(self, url: str, **_: object) -> "HttpProviderContractTests._Response":
            self.calls.append(("GET", url, None))
            if url.endswith("/login"):
                return HttpProviderContractTests._Response(
                    text='<html><input id="login-email"><input id="login-password"></html>',
                )
            raise AssertionError(f"unexpected GET: {url}")

        async def post(self, url: str, **kwargs: object) -> "HttpProviderContractTests._Response":
            data = kwargs.get("data")
            self.calls.append(("POST", url, data if isinstance(data, dict) else None))
            if not self.post_responses:
                raise AssertionError(f"unexpected POST: {url}")
            expected_suffix, payload = self.post_responses.pop(0)
            if not url.endswith(expected_suffix):
                raise AssertionError(f"expected POST {expected_suffix}, got {url}")
            return HttpProviderContractTests._Response(payload)

        async def close(self) -> None:
            return None

    def test_http_connect_without_two_factor_returns_generic_session_state(self) -> None:
        provider = GatewayHttpProvider()
        session = self._AuthSession([
            ("/api/auth/user/login", {"status": True, "twoFaEnabled": False, "access_token": "access-1"}),
        ])
        provider.session = session  # type: ignore[assignment]
        provider._finish_http_connect = AsyncMock(return_value={  # type: ignore[method-assign]
            "status": "connected",
            "session": {"version": 2, "sessionState": {"cookies": [{"name": "sid"}]}},
        })
        try:
            result = asyncio.run(provider.connect_begin(email="user@example.com", password="password-secret"))
        finally:
            asyncio.run(provider.close())

        self.assertEqual(result["status"], "connected")
        self.assertEqual(result["session"]["version"], 2)
        self.assertIn("sessionState", result["session"])
        self.assertNotIn("storageState", result)
        login_call = next(call for call in session.calls if call[0] == "POST")
        self.assertTrue(login_call[1].endswith("/api/auth/user/login"))
        self.assertEqual(login_call[2], {"email": "user@example.com", "password": "password-secret"})
        provider._finish_http_connect.assert_awaited_once_with("access-1")  # type: ignore[attr-defined]

    def test_http_connect_existing_two_factor_verifies_then_handles_login(self) -> None:
        provider = GatewayHttpProvider()
        session = self._AuthSession([
            ("/api/auth/user/login", {
                "status": True,
                "twoFaEnabled": True,
                "showSetupScreen": False,
                "showVerifyScreen": True,
                "remember_token": "remember-secret",
            }),
            ("/api/two-fa/verify", {"status": True}),
            ("/api/two-fa/handleLogin", {"status": True, "active": True, "access_token": "access-2"}),
        ])
        provider.session = session  # type: ignore[assignment]
        provider._finish_http_connect = AsyncMock(return_value={  # type: ignore[method-assign]
            "status": "connected",
            "session": {"version": 2, "sessionState": {"cookies": [{"name": "sid"}]}},
        })
        try:
            begin = asyncio.run(provider.connect_begin(email="user@example.com", password="password-secret"))
            self.assertEqual(begin["status"], "otp_required")
            self.assertEqual(begin["state"]["verified"], 1)
            self.assertEqual(begin["state"]["type"], "all")
            self.assertNotIn("password", begin["state"])
            connected = asyncio.run(provider.connect_step(
                state=begin["state"],
                action="verify",
                code="123456",
            ))
        finally:
            asyncio.run(provider.close())

        self.assertEqual(connected["status"], "connected")
        post_calls = [call for call in session.calls if call[0] == "POST"]
        self.assertEqual(post_calls[1][2], {
            "email": "user@example.com",
            "userType": "user",
            "token": "remember-secret",
            "secretKey": "123456",
            "verified": 1,
            "type": "all",
        })
        self.assertEqual(post_calls[2][2], {
            "email": "user@example.com",
            "userType": "user",
            "token": "remember-secret",
        })
        provider._finish_http_connect.assert_awaited_once_with("access-2")  # type: ignore[attr-defined]

    def test_http_connect_setup_phone_then_email_sequence_matches_observed_client(self) -> None:
        provider = GatewayHttpProvider()
        session = self._AuthSession([
            ("/api/auth/user/login", {
                "status": True,
                "twoFaEnabled": True,
                "showSetupScreen": True,
                "showVerifyScreen": False,
                "remember_token": "remember-setup",
            }),
            ("/api/two-fa/register", {"status": True}),
            ("/api/two-fa/verify", {"status": True}),
            ("/api/two-fa/register", {"status": True}),
            ("/api/two-fa/verify", {"status": True}),
            ("/api/two-fa/handleLogin", {"status": True, "active": True, "access_token": "access-setup"}),
        ])
        provider.session = session  # type: ignore[assignment]
        provider._finish_http_connect = AsyncMock(return_value={  # type: ignore[method-assign]
            "status": "connected",
            "session": {"version": 2, "sessionState": {"cookies": [{"name": "sid"}]}},
        })
        try:
            begin = asyncio.run(provider.connect_begin(email="setup@example.com", password="password-secret"))
            self.assertEqual(begin["status"], "setup_phone")
            phone_otp = asyncio.run(provider.connect_step(
                state=begin["state"], action="register", value="+15555550123",
            ))
            self.assertEqual(phone_otp["status"], "otp_required")
            email_setup = asyncio.run(provider.connect_step(
                state=phone_otp["state"], action="verify", code="111111",
            ))
            self.assertEqual(email_setup["status"], "setup_email")
            email_otp = asyncio.run(provider.connect_step(
                state=email_setup["state"], action="register", value="setup@example.com",
            ))
            self.assertEqual(email_otp["status"], "otp_required")
            connected = asyncio.run(provider.connect_step(
                state=email_otp["state"], action="verify", code="222222",
            ))
        finally:
            asyncio.run(provider.close())

        self.assertEqual(connected["status"], "connected")
        post_calls = [call for call in session.calls if call[0] == "POST"]
        self.assertEqual(post_calls[1][2]["type"], "phone")
        self.assertEqual(post_calls[2][2]["verified"], 0)
        self.assertEqual(post_calls[2][2]["value"], "+15555550123")
        self.assertEqual(post_calls[3][2]["type"], "email")
        self.assertEqual(post_calls[4][2]["verified"], 1)
        self.assertEqual(post_calls[4][2]["value"], "setup@example.com")
        provider._finish_http_connect.assert_awaited_once_with("access-setup")  # type: ignore[attr-defined]

    def test_http_connect_invalid_otp_keeps_challenge_without_echoing_code(self) -> None:
        provider = GatewayHttpProvider()
        session = self._AuthSession([
            ("/api/auth/user/login", {
                "status": True,
                "twoFaEnabled": True,
                "showSetupScreen": False,
                "showVerifyScreen": True,
                "remember_token": "remember-invalid",
            }),
            ("/api/two-fa/verify", {"status": False, "message": "private-upstream-rejection-detail"}),
        ])
        provider.session = session  # type: ignore[assignment]
        try:
            begin = asyncio.run(provider.connect_begin(email="user@example.com", password="password-secret"))
            result = asyncio.run(provider.connect_step(
                state=begin["state"], action="verify", code="654321",
            ))
        finally:
            asyncio.run(provider.close())

        self.assertTrue(result["rejected"])
        self.assertEqual(result["status"], "otp_required")
        serialized = json.dumps(result)
        self.assertNotIn("654321", serialized)
        self.assertNotIn("private-upstream-rejection-detail", serialized)
        self.assertEqual(result["state"]["token"], "remember-invalid")

    def test_http_connect_invalid_otp_http_error_keeps_retry_state(self) -> None:
        provider = GatewayHttpProvider()

        class RejectSession:
            def __init__(self) -> None:
                self.cookies = HttpProviderContractTests._EmptyCookies()

            async def post(self, *_: object, **__: object) -> "HttpProviderContractTests._Response":
                return HttpProviderContractTests._Response(
                    {"message": {"secretKey": ["private validation detail"]}},
                    status_code=422,
                )

            async def close(self) -> None:
                return None

        provider.session = RejectSession()  # type: ignore[assignment]
        state = {
            "version": 1,
            "email": "user@example.com",
            "token": "remember-http-error",
            "phase": "otp_required",
            "type": "all",
            "verified": 1,
            "sessionState": {"cookies": []},
        }
        try:
            result = asyncio.run(provider.connect_step(state=state, action="verify", code="123456"))
        finally:
            asyncio.run(provider.close())

        self.assertTrue(result["rejected"])
        self.assertEqual(result["status"], "otp_required")
        serialized = json.dumps(result)
        self.assertNotIn("123456", serialized)
        self.assertNotIn("private validation detail", serialized)
        self.assertEqual(result["state"]["token"], "remember-http-error")

    def test_bridge_connect_response_is_secret_safe(self) -> None:
        class Provider:
            async def __aenter__(self) -> "Provider":
                return self

            async def __aexit__(self, *_: object) -> None:
                return None

            async def connect_begin(self, *, email: str, password: str) -> dict[str, object]:
                self.seen = (email, password)
                return {
                    "status": "otp_required",
                    "state": {
                        "version": 1,
                        "email": email,
                        "token": "challenge-token",
                        "phase": "otp_required",
                        "type": "all",
                        "verified": 1,
                        "sessionState": {"cookies": []},
                    },
                }

            async def connect_step(self, **_: object) -> dict[str, object]:
                raise GatewayAuthenticationError("private server detail must not escape")

        with patch.object(personal_bridge, "GatewayHttpProvider", Provider):
            begin = asyncio.run(personal_bridge._execute({
                "operation": "connect_begin",
                "email": "user@example.com",
                "password": "password-secret-marker",
            }))
            failed = asyncio.run(personal_bridge._execute({
                "operation": "connect_step",
                "state": begin["state"],
                "action": "verify",
                "code": "987654",
            }))

        begin_text = json.dumps(begin)
        failed_text = json.dumps(failed)
        self.assertNotIn("password-secret-marker", begin_text)
        self.assertNotIn("987654", failed_text)
        self.assertNotIn("private server detail", failed_text)
        self.assertEqual(failed["failures"][0]["errorCode"], "authentication_failed")
        self.assertFalse(failed["failures"][0]["needsReconnect"])

    def test_bridge_connected_session_contract_is_version_two(self) -> None:
        result = personal_bridge._connect_result({
            "status": "connected",
            "session": {
                "version": 2,
                "sessionState": {"cookies": [{"name": "sid", "value": "opaque"}]},
            },
            "evidence": {"navigationWeekCount": 4},
        })
        self.assertEqual(result, {
            "ok": True,
            "status": "connected",
            "session": {
                "version": 2,
                "sessionState": {"cookies": [{"name": "sid", "value": "opaque"}]},
            },
            "evidence": {"navigationWeekCount": 4},
        })

    def test_person_specific_storage_states_do_not_share_cookies(self) -> None:
        first = GatewayHttpProvider()
        second = GatewayHttpProvider()
        first_state = {
            "cookies": [{
                "name": "gateway_session",
                "value": "person-one-cookie",
                "domain": "ww3.familyfirstlife.com",
                "path": "/",
                "expires": -1,
                "httpOnly": True,
                "secure": True,
                "sameSite": "Lax",
            }],
            "origins": [],
        }
        second_state = {
            "cookies": [{
                "name": "gateway_session",
                "value": "person-two-cookie",
                "domain": "ww3.familyfirstlife.com",
                "path": "/",
                "expires": -1,
                "httpOnly": True,
                "secure": True,
                "sameSite": "Lax",
            }],
            "origins": [],
        }
        try:
            self.assertEqual(first.import_storage_state(first_state), 1)
            self.assertEqual(second.import_storage_state(second_state), 1)
            self.assertEqual(
                first.session.cookies.get("gateway_session", domain="ww3.familyfirstlife.com"),
                "person-one-cookie",
            )
            self.assertEqual(
                second.session.cookies.get("gateway_session", domain="ww3.familyfirstlife.com"),
                "person-two-cookie",
            )
            self.assertNotEqual(
                first.session.cookies.get("gateway_session", domain="ww3.familyfirstlife.com"),
                second.session.cookies.get("gateway_session", domain="ww3.familyfirstlife.com"),
            )

            replacement_state = {
                "cookies": [{
                    "name": "replacement_session",
                    "value": "person-one-new-cookie",
                    "domain": "ww3.familyfirstlife.com",
                    "path": "/",
                    "expires": -1,
                    "httpOnly": True,
                    "secure": True,
                    "sameSite": "Lax",
                }],
                "origins": [],
            }
            first.import_storage_state(replacement_state)
            self.assertIsNone(first.session.cookies.get("gateway_session", domain="ww3.familyfirstlife.com"))
            self.assertEqual(
                first.session.cookies.get("replacement_session", domain="ww3.familyfirstlife.com"),
                "person-one-new-cookie",
            )
        finally:
            asyncio.run(first.close())
            asyncio.run(second.close())

    def test_storage_state_rejects_malformed_or_untrusted_cookies_without_echoing_values(self) -> None:
        provider = GatewayHttpProvider()
        secret = "do-not-echo-this-cookie"
        try:
            with self.assertRaises(GatewayContractError) as caught:
                provider.import_storage_state({
                    "cookies": [{
                        "name": "session",
                        "value": secret,
                        "domain": ".evil.example",
                        "path": "/",
                        "expires": -1,
                        "secure": True,
                        "httpOnly": True,
                        "sameSite": "Lax",
                    }],
                })
            self.assertNotIn(secret, str(caught.exception))
            with self.assertRaises(GatewayContractError):
                provider.import_storage_state({"cookies": "not-a-list"})
        finally:
            asyncio.run(provider.close())

    def test_expired_resumed_storage_state_requires_reconnect(self) -> None:
        class CookieJar:
            def clear(self) -> None:
                return None

            def set(self, *_: object, **__: object) -> None:
                return None

        class Response:
            status_code = 200
            text = '<html><input id="login-email"><input id="login-password"></html>'

        class Session:
            def __init__(self) -> None:
                self.cookies = CookieJar()

            async def get(self, *_: object, **__: object) -> Response:
                return Response()

            async def close(self) -> None:
                return None

        provider = GatewayHttpProvider()
        provider.session = Session()  # type: ignore[assignment]
        state = {
            "cookies": [{
                "name": "gateway_session",
                "value": "opaque-session",
                "domain": "ww3.familyfirstlife.com",
                "path": "/",
                "expires": -1,
                "httpOnly": True,
                "secure": True,
                "sameSite": "Lax",
            }],
        }
        try:
            with self.assertRaisesRegex(GatewayAuthenticationError, "requires reconnect"):
                asyncio.run(provider.establish_session_from_storage_state(state))
        finally:
            asyncio.run(provider.close())

    def test_historical_plan_matches_runner_weekly_navigation_contract(self) -> None:
        identity = parse_report_identity(report_html(), UUID)
        plan = historical_plan(identity.weekly_entries, "2026-08-07", "2026-08-21")
        self.assertEqual(
            [(item.period_type, item.entry.date) for item in plan],
            [
                ("wtd", "2026-08-07"),
                ("wtd", "2026-08-14"),
                ("wtd", "2026-08-21"),
                ("mtd", "2026-08-21"),
                ("ytd", "2026-08-21"),
            ],
        )
        final_plan = historical_plan(identity.weekly_entries, "2026-08-28", "2026-08-28")
        self.assertEqual(
            [(item.period_type, item.entry.date) for item in final_plan],
            [("wtd", "2026-08-28"), ("mtd", "2026-08-28"), ("ytd", "2026-08-28")],
        )

    def test_historical_context_navigates_period_specific_page_and_uses_target_date(self) -> None:
        class Response:
            status_code = 200
            text = f"""
            <html><head><meta name="csrf-token" content="historical-csrf"></head>
            <body><button class="downline-ip-report" data-uuid="{UUID}" data-week="2026-08-14" data-type="mtd"></button></body></html>
            """

        class Session:
            def __init__(self) -> None:
                self.urls: list[str] = []

            async def get(self, url: str, **_: object) -> Response:
                self.urls.append(url)
                return Response()

            async def close(self) -> None:
                return None

        provider = GatewayHttpProvider()
        session = Session()
        provider.session = session  # type: ignore[assignment]
        provider.identity = parse_report_identity(report_html(), UUID)
        entry = next(entry for entry in provider.identity.weekly_entries if entry.date == "2026-08-14")
        try:
            historical_identity, report_url = asyncio.run(provider._historical_identity(
                HistoricalPlanItem(period_type="mtd", entry=entry),
            ))
            self.assertEqual(
                report_url,
                f"https://stats.uppatop.com/ipreport_mtd/{UUID}/2026-08-14",
            )
            self.assertEqual(session.urls, [report_url])
            self.assertEqual(historical_identity.gateway_date, "2026-08-14")
            self.assertEqual(historical_identity.csrf_token, "historical-csrf")
            self.assertEqual(provider._export_params("mtd", identity=historical_identity)["selected_date"], "2026-08-14")
        finally:
            asyncio.run(provider.close())

    def test_bridge_rejects_untrusted_storage_state_without_echoing_cookie_secret(self) -> None:
        secret = "bridge-cookie-secret"
        request = {
            "operation": "validate",
            "storageState": {
                "cookies": [{
                    "name": "session",
                    "value": secret,
                    "domain": ".evil.example",
                    "path": "/",
                    "expires": -1,
                    "httpOnly": True,
                    "secure": True,
                    "sameSite": "Lax",
                }],
            },
        }
        completed = subprocess.run(
            [sys.executable, str(ROOT / "personal_bridge.py")],
            input=json.dumps(request),
            capture_output=True,
            text=True,
            check=True,
        )
        payload = json.loads(completed.stdout)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["failures"][0]["errorCode"], "upstream_contract_changed")
        self.assertNotIn(secret, completed.stdout)
        self.assertNotIn(secret, completed.stderr)

    def test_bridge_keeps_ok_true_for_partial_current_period_outcomes(self) -> None:
        identity = parse_report_identity(report_html(), UUID)
        content = workbook_bytes()
        evidence, rows = _parse_workbook(
            content,
            period="wtd",
            identity=identity,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        artifact = GatewayArtifact(
            period_type="wtd",
            source_filename="wtd.xlsx",
            content=content,
            evidence=evidence,
            coverage={
                "periodStart": identity.current_week.period_start,
                "periodEnd": identity.current_week.period_end,
                "weekStart": evidence.file_date,
                "weekOrdinal": identity.current_week.week_ordinal,
                "periodFinal": identity.current_week.period_final,
                "reportAsOfDate": identity.gateway_date,
            },
            generate_ms=1,
            ready_ms=1,
            download_ms=1,
            total_ms=3,
            rows=rows,
        )

        class Provider:
            async def __aenter__(self) -> "Provider":
                return self

            async def __aexit__(self, *_: object) -> None:
                return None

            async def establish_session_from_storage_state(self, _: object) -> ReportIdentity:
                return identity

            async def pull_current_artifacts(self) -> CurrentArtifactPull:
                return CurrentArtifactPull(
                    status="partial",
                    outcomes={
                        "wtd": ArtifactOutcome(period_type="wtd", status="validated", artifact=artifact),
                        "mtd": ArtifactOutcome(
                            period_type="mtd",
                            status="failed",
                            error_code="upstream_transient_failure",
                            retryable=True,
                        ),
                        "ytd": ArtifactOutcome(
                            period_type="ytd",
                            status="failed",
                            error_code="authentication_failed",
                            retryable=False,
                        ),
                    },
                )

        with patch.object(personal_bridge, "GatewayHttpProvider", Provider):
            result = asyncio.run(personal_bridge._execute({
                "operation": "current",
                "sessionState": {"cookies": []},
                "businessDate": "2026-08-28",
            }))
        self.assertTrue(result["ok"])
        self.assertEqual([report["periodType"] for report in result["reports"]], ["wtd"])
        self.assertEqual(result["reports"][0]["coverage"]["gatewayReportDate"], identity.gateway_date)
        self.assertEqual([failure["periodType"] for failure in result["failures"]], ["mtd", "ytd"])
        self.assertTrue(result["failures"][1]["needsReconnect"])

    def test_bridge_historical_failure_keeps_gateway_snapshot_identity_for_fallback(self) -> None:
        failure = personal_bridge._failure(
            "wtd",
            "upstream_transient_failure",
            True,
            gateway_report_date="2026-08-14",
        )
        self.assertEqual(failure["periodType"], "wtd")
        self.assertEqual(failure["gatewayReportDate"], "2026-08-14")
        self.assertTrue(failure["retryable"])

    def test_bridge_pages_historical_artifacts_in_small_bounded_batches(self) -> None:
        identity = parse_report_identity(report_html(), UUID)
        calls: list[tuple[int, int]] = []

        class Outcome:
            artifact = None
            period_type = "wtd"
            error_code = "upstream_transient_failure"
            retryable = True
            entry = identity.current_week

        class Pull:
            outcomes = (Outcome(),)
            total_count = 5

        class Provider:
            async def __aenter__(self) -> "Provider":
                return self

            async def __aexit__(self, *_: object) -> None:
                return None

            async def establish_session_from_storage_state(self, _: object) -> ReportIdentity:
                return identity

            async def pull_historical_artifacts(self, *, from_date: str, through_date: str, offset: int, limit: int) -> Pull:
                self_from = from_date
                self_through = through_date
                self.assert_dates = (self_from, self_through)
                calls.append((offset, limit))
                return Pull()

        with patch.object(personal_bridge, "GatewayHttpProvider", Provider):
            result = asyncio.run(personal_bridge._execute({
                "operation": "historical",
                "storageState": {"cookies": []},
                "from": "2026-01-01",
                "through": "2026-08-28",
                "historicalOffset": 2,
            }))

        self.assertTrue(result["ok"])
        self.assertEqual(calls, [(2, personal_bridge.HISTORICAL_PAGE_SIZE)])
        self.assertEqual(result["nextHistoricalOffset"], 3)
        self.assertEqual(result["failures"][0]["gatewayReportDate"], identity.current_week.date)

    def test_config_rejects_non_https_or_path_bearing_upstream_origins(self) -> None:
        with self.assertRaisesRegex(GatewayContractError, "trusted HTTPS origin"):
            HttpGatewayConfig(gateway_origin="http://ww3.familyfirstlife.com")
        with self.assertRaisesRegex(GatewayContractError, "trusted HTTPS origin"):
            HttpGatewayConfig(stats_origin="https://stats.uppatop.com/not-an-origin")

    def test_identity_probe_statuses_distinguish_auth_transient_and_contract_failures(self) -> None:
        class Response:
            def __init__(self, status_code: int) -> None:
                self.status_code = status_code

        with self.assertRaises(GatewayAuthenticationError):
            _require_success_status(Response(401), "identity")
        with self.assertRaises(GatewayTransientError):
            _require_success_status(Response(503), "identity")
        with self.assertRaises(GatewayContractError):
            _require_success_status(Response(404), "identity")

    def test_curl_transport_failures_are_retryable_without_exposing_exception_text(self) -> None:
        secret = "signed-url-secret-value"
        for error in (CurlTimeout(secret), CurlConnectionError(secret)):
            code, retryable = classify_provider_error(error)
            self.assertEqual(code, "transport_failure")
            self.assertTrue(retryable)
            self.assertNotIn(secret, code)

    def test_parses_stats_bootstrap_without_executing_javascript(self) -> None:
        html = f"""
        <script>
          var spoofed_data = "opaque\\\"payload";
          $.ajax({{
            url: '/api/auth/user/auto-login/{UUID}',
            data: {{ uuid: 'uuid-token', _token: 'csrf-token', spoofed_data: spoofed_data }}
          }});
        </script>
        """
        bootstrap = parse_stats_bootstrap(html, "https://stats.uppatop.com")
        self.assertEqual(bootstrap.report_uuid_hint, UUID)
        self.assertEqual(bootstrap.uuid_token, "uuid-token")
        self.assertEqual(bootstrap.csrf_token, "csrf-token")
        self.assertEqual(bootstrap.spoofed_data, 'opaque"payload')
        self.assertEqual(
            bootstrap.endpoint,
            f"https://stats.uppatop.com/api/auth/user/auto-login/{UUID}",
        )

    def test_stats_bootstrap_binds_data_to_the_auto_login_request(self) -> None:
        html = f"""
        <script>
          $.ajax({{ url: '/api/unrelated', data: {{ uuid: 'WRONG-UUID', _token: 'WRONG-TOKEN' }} }});
          var spoofed_data = "opaque";
          $.ajax({{
            url: '/api/auth/user/auto-login/{UUID}',
            method: 'POST',
            data: {{ uuid: 'right-uuid-token', _token: 'right-csrf-token', spoofed_data: spoofed_data }}
          }});
        </script>
        """
        bootstrap = parse_stats_bootstrap(html, "https://stats.uppatop.com")
        self.assertEqual(bootstrap.uuid_token, "right-uuid-token")
        self.assertEqual(bootstrap.csrf_token, "right-csrf-token")

    def test_report_identity_keeps_gateway_week_ordinal_and_month_boundary(self) -> None:
        identity = parse_report_identity(report_html(), UUID)
        self.assertEqual(identity.gateway_date, "2026-08-28")
        self.assertEqual(identity.current_week.week_ordinal, 4)
        self.assertTrue(identity.current_week.period_final)
        self.assertEqual(identity.current_week.period_start, "2026-08-01")
        self.assertEqual(identity.current_week.period_end, "2026-08-31")
        self.assertEqual(identity.available_week_count, 4)
        self.assertEqual(identity.oldest_week_date, "2026-08-07")
        self.assertEqual(identity.newest_week_date, "2026-08-28")

    def test_workbook_validation_returns_raw_source_sha_and_duplicate_npn_evidence(self) -> None:
        content = workbook_bytes()
        identity = parse_report_identity(report_html(), UUID)
        evidence = validate_workbook(
            content,
            period="wtd",
            identity=identity,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertEqual(evidence.file_date, "2026-08-22")
        self.assertEqual(evidence.row_count, 2)
        self.assertEqual(evidence.unique_npn_count, 1)
        self.assertEqual(evidence.duplicate_npn_values, 1)
        self.assertEqual(evidence.sha256, hashlib.sha256(content).hexdigest())

    def test_workbook_parser_retains_canonical_rows_for_replay_safe_staging(self) -> None:
        content = workbook_bytes()
        identity = parse_report_identity(report_html(), UUID)
        evidence, rows = _parse_workbook(
            content,
            period="wtd",
            identity=identity,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertEqual(evidence.row_count, 2)
        self.assertEqual(rows[0].row_index, 2)
        self.assertEqual(rows[0].producer_npn, "123456")
        self.assertEqual(rows[0].personal_ip_cents, 10000)
        self.assertEqual(rows[0].team_ip_cents, 25000)
        self.assertEqual(rows[0].first_leg_percent, 50.0)
        self.assertEqual(rows[0].outside_first_leg_cents, 15000)
        self.assertEqual(rows[0].as_payload()["producerNpn"], "123456")

    def test_mtd_file_date_must_match_covered_month(self) -> None:
        identity = parse_report_identity(report_html(), UUID)
        with self.assertRaisesRegex(GatewayContractError, "covered month start"):
            validate_workbook(
                workbook_bytes("8/2/2026"),
                period="mtd",
                identity=identity,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

    def test_npn_evidence_uses_same_digits_only_normalization_as_application(self) -> None:
        self.assertEqual(_normalize_npn("123-456"), "123456")
        self.assertEqual(_normalize_npn("NPN 123 456"), "123456")
        self.assertEqual(_normalize_npn(123456.0), "123456")

    def test_current_pull_preserves_valid_artifacts_when_one_period_fails(self) -> None:
        provider = GatewayHttpProvider()
        provider.identity = ReportIdentity(
            uuid=UUID,
            gateway_date="2026-08-28",
            csrf_token="csrf",
            current_week=WeeklyEntry(
                date="2026-08-28",
                week_ordinal=4,
                month_id="August-2026",
                period_start="2026-08-01",
                period_end="2026-08-31",
                period_final=True,
            ),
        )
        evidence = WorkbookEvidence(
            file_date="2026-08-22",
            row_count=1,
            unique_npn_count=1,
            duplicate_npn_values=0,
            sha256="a" * 64,
            byte_count=4,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        async def direct(period: str) -> GatewayArtifact:
            return GatewayArtifact(
                period_type=period,
                source_filename=f"{period}.xlsx",
                content=b"xlsx",
                evidence=evidence,
                coverage={},
                generate_ms=1,
                ready_ms=1,
                download_ms=1,
                total_ms=1,
            )

        async def ytd() -> GatewayArtifact:
            raise GatewayTransientError("simulated ytd failure")

        provider._direct_export = direct  # type: ignore[method-assign]
        provider._ytd_export = ytd  # type: ignore[method-assign]
        try:
            result = asyncio.run(provider.pull_current_artifacts())
            self.assertEqual(result.status, "partial")
            self.assertEqual(set(result.artifacts), {"wtd", "mtd"})
            self.assertEqual(result.outcomes["ytd"].error_code, "upstream_transient_failure")
            self.assertTrue(result.outcomes["ytd"].retryable)
        finally:
            asyncio.run(provider.close())

    def test_current_pull_propagates_cancellation_instead_of_classifying_it(self) -> None:
        provider = GatewayHttpProvider()
        provider.identity = ReportIdentity(
            uuid=UUID,
            gateway_date="2026-08-28",
            csrf_token="csrf",
            current_week=WeeklyEntry(
                date="2026-08-28",
                week_ordinal=4,
                month_id="August-2026",
                period_start="2026-08-01",
                period_end="2026-08-31",
                period_final=True,
            ),
        )

        async def cancelled(_: str) -> GatewayArtifact:
            raise asyncio.CancelledError()

        async def ytd() -> GatewayArtifact:
            raise asyncio.CancelledError()

        provider._direct_export = cancelled  # type: ignore[method-assign]
        provider._ytd_export = ytd  # type: ignore[method-assign]
        try:
            with self.assertRaises(asyncio.CancelledError):
                asyncio.run(provider.pull_current_artifacts())
        finally:
            asyncio.run(provider.close())

    def test_ytd_polling_rejects_unexpected_4xx_without_sleeping_to_timeout(self) -> None:
        class Response:
            def __init__(self, status_code: int, payload: dict[str, object]) -> None:
                self.status_code = status_code
                self._payload = payload

            def json(self) -> dict[str, object]:
                return self._payload

        class Session:
            calls = 0

            async def get(self, url: str, **_: object) -> Response:
                self.calls += 1
                if url.endswith("/report/ip-download-ytd"):
                    return Response(200, {"log_id": "opaque-job"})
                if url.endswith("/report/ip-download-status"):
                    return Response(404, {"error": "not_found"})
                return Response(200, {})

            async def close(self) -> None:
                return None

        provider = GatewayHttpProvider(HttpGatewayConfig(ytd_timeout_seconds=0.1))
        provider.session = Session()  # type: ignore[assignment]
        provider.identity = parse_report_identity(report_html(), UUID)
        provider.report_url = f"https://stats.uppatop.com/ipreport/{UUID}"
        started = __import__("time").monotonic()
        try:
            with self.assertRaisesRegex(GatewayContractError, "unexpected HTTP 404"):
                asyncio.run(provider._ytd_export())
            self.assertLess(__import__("time").monotonic() - started, 0.5)
        finally:
            asyncio.run(provider.close())

    def test_ytd_timeout_still_attempts_bounded_cleanup_after_deadline(self) -> None:
        class Response:
            status_code = 200

            def __init__(self, payload: dict[str, object]) -> None:
                self._payload = payload

            def json(self) -> dict[str, object]:
                return self._payload

        class Session:
            def __init__(self) -> None:
                self.cleanup_timeouts: list[float] = []

            async def get(self, url: str, **kwargs: object) -> Response:
                if url.endswith("/report/ip-download-ytd"):
                    return Response({"log_id": "opaque-job"})
                if url.endswith("/report/ip-download-status"):
                    return Response({"status": "processing"})
                if url.endswith("/report/deleteYTDFileIP"):
                    self.cleanup_timeouts.append(float(kwargs["timeout"]))
                    return Response({})
                return Response({})

            async def close(self) -> None:
                return None

        provider = GatewayHttpProvider(HttpGatewayConfig(ytd_timeout_seconds=0.01, request_timeout_seconds=30.0))
        session = Session()
        provider.session = session  # type: ignore[assignment]
        provider.identity = parse_report_identity(report_html(), UUID)
        provider.report_url = f"https://stats.uppatop.com/ipreport/{UUID}"
        try:
            with self.assertRaisesRegex(GatewayTransientError, "timed out"):
                asyncio.run(provider._ytd_export())
            self.assertEqual(len(session.cleanup_timeouts), 1)
            self.assertGreater(session.cleanup_timeouts[0], 0)
            self.assertLessEqual(session.cleanup_timeouts[0], 5.0)
        finally:
            asyncio.run(provider.close())


if __name__ == "__main__":
    unittest.main()
