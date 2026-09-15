from __future__ import annotations

import asyncio
import base64
import json
import re
import sys
from datetime import date
from typing import Any

from gateway_adapter import (
    GatewayArtifact,
    GatewayHttpProvider,
    WeeklyEntry,
    classify_provider_error,
)


MAX_STDIN_BYTES = 4 * 1024 * 1024
HISTORICAL_PAGE_SIZE = 2


def _valid_iso_date(value: Any) -> bool:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def _session_state(payload: dict[str, Any]) -> Any:
    if "sessionState" in payload:
        candidate = payload["sessionState"]
        if (
            isinstance(candidate, dict)
            and candidate.get("version") == 2
            and isinstance(candidate.get("sessionState"), dict)
        ):
            return candidate["sessionState"]
        return candidate
    # Backward compatibility for encrypted runner sessions that were originally
    # captured as Playwright storageState. The Python runtime consumes cookies only.
    return payload.get("storageState")


def _connect_failure(error_code: str, retryable: bool, *, status: str = "rejected") -> dict[str, Any]:
    failure = _failure(None, error_code, retryable)
    # Connect-time credential/OTP rejection is not an established-session
    # invalidation. Challenge callers may retry the returned state in-place.
    failure["needsReconnect"] = False
    return {
        "ok": False,
        "status": status,
        "failures": [failure],
    }


def _connect_result(result: dict[str, Any]) -> dict[str, Any]:
    status = result.get("status")
    if status not in {"otp_required", "setup_phone", "setup_email", "connected"}:
        return _connect_failure("upstream_contract_changed", False)
    if result.get("rejected"):
        state = result.get("state")
        payload = _connect_failure(str(result.get("errorCode") or "authentication_failed"), False, status=status)
        if isinstance(state, dict):
            payload["state"] = state
        return payload
    payload: dict[str, Any] = {"ok": True, "status": status}
    if status == "connected":
        session = result.get("session")
        if (
            not isinstance(session, dict)
            or session.get("version") != 2
            or not isinstance(session.get("sessionState"), dict)
        ):
            return _connect_failure("upstream_contract_changed", False)
        payload["session"] = session
        if isinstance(result.get("evidence"), dict):
            payload["evidence"] = result["evidence"]
    else:
        if not isinstance(result.get("state"), dict):
            return _connect_failure("upstream_contract_changed", False)
        payload["state"] = result["state"]
    return payload


def _failure(
    period_type: str | None,
    error_code: str,
    retryable: bool,
    *,
    gateway_report_date: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "errorCode": error_code,
        "retryable": retryable,
        "needsReconnect": error_code == "authentication_failed",
    }
    if period_type is not None:
        payload["periodType"] = period_type
    if gateway_report_date is not None:
        payload["gatewayReportDate"] = gateway_report_date
    return payload


def _gateway_label(period_type: str, entry: WeeklyEntry, artifact: GatewayArtifact) -> str:
    if period_type == "wtd":
        return entry.gateway_label
    if period_type == "mtd":
        return f"{entry.month_id.split('-', 1)[0]} MTD"
    return f"{artifact.evidence.file_date[:4]} YTD"


def _runner_coverage(period_type: str, artifact: GatewayArtifact) -> dict[str, Any]:
    coverage = artifact.coverage
    result = {
        "periodStart": coverage["periodStart"],
        "periodEnd": coverage["periodEnd"],
        "gatewayReportDate": coverage["reportAsOfDate"],
    }
    if period_type == "wtd":
        result.update({
            "weekStart": coverage["weekStart"],
            "weekOrdinal": coverage["weekOrdinal"],
            "periodFinal": coverage["periodFinal"],
        })
    return result


def _report_payload(
    artifact: GatewayArtifact,
    *,
    entry: WeeklyEntry,
    report_date: str,
) -> dict[str, Any]:
    source_file_name = re.sub(r"\.(xlsx|xls)$", ".csv", artifact.source_filename, flags=re.I)
    return {
        "periodType": artifact.period_type,
        "reportDate": report_date,
        "sourceFileName": source_file_name,
        "gatewayLabel": _gateway_label(artifact.period_type, entry, artifact),
        "coverage": _runner_coverage(artifact.period_type, artifact),
        "artifact": {
            "sourceSha256": artifact.evidence.sha256,
            "sourceByteCount": artifact.evidence.byte_count,
            "contentType": artifact.evidence.content_type,
            "fileDate": artifact.evidence.file_date,
            "rowsSeen": artifact.evidence.row_count,
            "uniqueNpnCount": artifact.evidence.unique_npn_count,
            "duplicateNpnValues": artifact.evidence.duplicate_npn_values,
            "rawXlsxBase64": base64.b64encode(artifact.content).decode("ascii"),
        },
    }


async def _execute(payload: dict[str, Any]) -> dict[str, Any]:
    operation = payload.get("operation")
    if operation not in {"connect_begin", "connect_step", "validate", "current", "historical"}:
        return {"ok": False, "reports": [], "failures": [_failure(None, "bridge_input_invalid", False)]}

    if operation == "connect_begin":
        email = payload.get("email")
        password = payload.get("password")
        if not isinstance(email, str) or not email.strip() or not isinstance(password, str) or not password:
            return _connect_failure("bridge_input_invalid", False)
        async with GatewayHttpProvider() as provider:
            try:
                return _connect_result(await provider.connect_begin(email=email, password=password))
            except Exception as exc:
                error_code, retryable = classify_provider_error(exc)
                return _connect_failure(error_code, retryable)

    if operation == "connect_step":
        state = payload.get("state")
        if not isinstance(state, dict):
            return _connect_failure("bridge_input_invalid", False)
        for field in ("action", "value", "code"):
            if payload.get(field) is not None and not isinstance(payload.get(field), str):
                return _connect_failure("bridge_input_invalid", False)
        async with GatewayHttpProvider() as provider:
            try:
                return _connect_result(await provider.connect_step(
                    state=state,
                    action=payload.get("action"),
                    value=payload.get("value"),
                    code=payload.get("code"),
                ))
            except Exception as exc:
                error_code, retryable = classify_provider_error(exc)
                return _connect_failure(error_code, retryable)

    session_state = _session_state(payload)
    if session_state is None:
        return {"ok": False, "reports": [], "failures": [_failure(None, "bridge_input_invalid", False)]}
    business_date = payload.get("businessDate")
    from_date = payload.get("from")
    through_date = payload.get("through")
    historical_offset = payload.get("historicalOffset", 0)
    if operation == "current" and not _valid_iso_date(business_date):
        return {"ok": False, "reports": [], "failures": [_failure(None, "bridge_input_invalid", False)]}
    if operation == "historical" and (
        not _valid_iso_date(from_date)
        or not _valid_iso_date(through_date)
        or through_date < from_date
        or isinstance(historical_offset, bool)
        or not isinstance(historical_offset, int)
        or historical_offset < 0
    ):
        return {"ok": False, "reports": [], "failures": [_failure(None, "bridge_input_invalid", False)]}

    async with GatewayHttpProvider() as provider:
        try:
            resume = getattr(provider, "establish_session_from_state", None)
            if resume is None:
                # Test/backward-compatible provider surface during the storageState
                # naming transition. Production GatewayHttpProvider uses the new name.
                resume = provider.establish_session_from_storage_state
            identity = await resume(session_state)
        except Exception as exc:
            error_code, retryable = classify_provider_error(exc)
            return {"ok": False, "reports": [], "failures": [_failure(None, error_code, retryable)]}

        if operation == "validate":
            return {
                "ok": True,
                "reports": [],
                "failures": [],
                "evidence": {
                    "navigationWeekCount": identity.available_week_count,
                    "historicalNavigation": identity.available_week_count > 1,
                },
            }

        reports: list[dict[str, Any]] = []
        failures: list[dict[str, Any]] = []
        if operation == "current":
            pull = await provider.pull_current_artifacts()
            for period_type in ("wtd", "mtd", "ytd"):
                outcome = pull.outcomes[period_type]
                if outcome.artifact is None:
                    failures.append(_failure(period_type, outcome.error_code or "unexpected_provider_failure", outcome.retryable))
                    continue
                reports.append(_report_payload(
                    outcome.artifact,
                    entry=identity.current_week,
                    report_date=business_date,
                ))
        else:
            try:
                pull = await provider.pull_historical_artifacts(
                    from_date=from_date,
                    through_date=through_date,
                    offset=historical_offset,
                    limit=HISTORICAL_PAGE_SIZE,
                )
            except Exception as exc:
                error_code, retryable = classify_provider_error(exc)
                return {"ok": False, "reports": [], "failures": [_failure(None, error_code, retryable)]}
            for outcome in pull.outcomes:
                if outcome.artifact is None:
                    failures.append(_failure(
                        outcome.period_type,
                        outcome.error_code or "unexpected_provider_failure",
                        outcome.retryable,
                        gateway_report_date=outcome.entry.date,
                    ))
                    continue
                reports.append(_report_payload(
                    outcome.artifact,
                    entry=outcome.entry,
                    report_date=through_date,
                ))

        result = {
            # `ok` means the bridge/session/global operation was established.
            # Period-level acquisition failures stay independent so the Node
            # runner can import every valid sibling report from a partial pull.
            "ok": True,
            "reports": reports,
            "failures": failures,
        }
        if operation == "historical":
            next_offset = historical_offset + len(pull.outcomes)
            result["nextHistoricalOffset"] = next_offset if next_offset < pull.total_count else None
        return result


def _read_request() -> dict[str, Any] | None:
    raw = sys.stdin.buffer.read(MAX_STDIN_BYTES + 1)
    if not raw or len(raw) > MAX_STDIN_BYTES:
        return None
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def main() -> None:
    payload = _read_request()
    if payload is None:
        result = {"ok": False, "reports": [], "failures": [_failure(None, "bridge_input_invalid", False)]}
    else:
        try:
            result = asyncio.run(_execute(payload))
        except Exception as exc:
            error_code, retryable = classify_provider_error(exc)
            result = {"ok": False, "reports": [], "failures": [_failure(None, error_code, retryable)]}
    sys.stdout.write(json.dumps(result, separators=(",", ":"), sort_keys=True))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
