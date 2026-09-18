# AllStarOS per-person HTTP-only Gateway adapter

This directory is the `curl_cffi` authentication and acquisition side of the existing **personal Gateway** runner. It does not own a shared agency account, a central population report, or a second business-data source. Every connect/pull belongs to one AllStarOS member and keeps the existing `personal_gateway` import semantics.

## Boundary

- `gateway_adapter/http_provider.py` is the only Python package that knows the observed private Gateway/StatS web contract: endpoints, cookies, CSRF/handoff behavior, report navigation, XLSX export mechanics, retry taxonomy, and YTD job polling/cleanup.
- Transport uses `curl_cffi` with Chrome impersonation. Gateway/StatS is a private, unstable web contract; changing runtime, TLS impersonation, region, or egress requires transport requalification.
- `personal_bridge.py` is a local process bridge used by `gateway-runner/providers/gateway.mjs`. One JSON request is sent on stdin and one sanitized JSON response is returned on stdout. Credentials/session material never goes on argv, child environment variables, or stderr. Cookie/challenge state crosses only this local stdin/stdout boundary so the Node runner can keep it server-side and ultimately encrypt the final session.
- The bridge accepts a **single person's** generic `sessionState` cookie jar. Old encrypted Playwright `storageState` is accepted only as a backward-compatible cookie source; no Playwright/browser runtime is required. The provider clears its cookie jar before import and accepts only trusted Gateway/StatS cookie domains. No cookie jar is shared across people or bridge calls.
- Production Connect is HTTP-only. The member's Gateway email/password is sent to the signed runner Connect session, then over the local pipe to `curl_cffi` for `/api/auth/user/login`. If Gateway requires 2FA, only the next OTP/setup value is requested. Passwords and OTP values are not included in challenge state or the final encrypted session.
- WTD, MTD, and YTD are independent outcomes. Successful siblings remain usable when another period fails.
- Raw XLSX bytes are canonical evidence. The adapter validates required columns, File Date, covered-period identity, SHA-256, row/NPN counts, and retains the exact workbook bytes for the runner's fenced private-storage flow.
- NPN is exact identity evidence only. The existing personal importer selects the connected person's normalized NPN; there is no fuzzy name fallback and no agency-wide population mapping in this adapter.

## Bridge protocol

Input is a bounded JSON object:

```json
{"operation":"validate|current|historical","sessionState":{"cookies":[]},"businessDate":"YYYY-MM-DD","from":"YYYY-MM-DD","through":"YYYY-MM-DD"}
```

Only fields relevant to the operation are required. `sessionState` is the decrypted session for that claimed personal job and exists only inside the runner/child-process boundary. The legacy `storageState` field is accepted temporarily for already-encrypted version-1 sessions.

Interactive Connect starts with:

```json
{"operation":"connect_begin","email":"member@example.com","password":"<transient>"}
```

No-2FA login completes with a version-2 HTTP session envelope. When Gateway requires verification, the bridge returns only server-side challenge state (remember token, phase, trusted cookies; never password/OTP) and one of `otp_required`, `setup_phone`, or `setup_email`. The runner then sends the next value with `connect_step`; successful completion returns:

```json
{"ok":true,"status":"connected","session":{"version":2,"sessionState":{"cookies":[]}}}
```

Successful protocol/session establishment returns:

```json
{"ok":true,"reports":[],"failures":[]}
```

For current or historical acquisition, `reports` contain runner-compatible report/coverage fields plus an `artifact` object with raw XLSX base64 and validated evidence. Per-period failures remain in `failures`; `ok` stays `true` so valid sibling reports are not discarded. Authentication/session failures carry `needsReconnect=true` and affect only that person's session generation.

`ok=false` is reserved for invalid bridge input, expired/unusable session establishment, or a global operation failure before per-artifact acquisition can proceed. Error payloads are sanitized codes; exception text, credentials, cookies, CSRF tokens, and signed URLs must never cross the bridge as diagnostics.

## YTD behavior

YTD uses the observed asynchronous export job with bounded exponential polling/backoff and jitter (approximately `2s -> 3s -> 5s -> 8s -> 10s cap`). Cleanup is a separate bounded best-effort action and is attempted even after the main acquisition deadline is exhausted.

## Historical behavior

The adapter retains StatS weekly navigation and mirrors the browser plan: WTD for each eligible week, MTD/YTD at final weeks, plus current partial MTD/YTD for the latest incomplete month. Historical period URLs are opened before using the qualified export contract so File Date and report identity are validated against the requested navigation entry.

## Runtime model

Gateway authentication, Gateway→StatS handoff, current pulls, and historical pulls are all HTTP-only. There is no Chrome/Playwright/browser fallback in the Gateway production runtime. Prefer an official vendor API/service account/SFTP/export feed if one becomes available in the future.

## Local validation

```bash
cd gateway-http-worker
python -m unittest discover -s tests -v
python -m compileall -q gateway_adapter personal_bridge.py tests
```

Tests are offline and contain no real Gateway credentials, cookies, signed URLs, or producer data.

## Dependency baseline

- `curl_cffi==0.14.0`
- `openpyxl==3.1.2`

On the production Mac these dependencies are installed into the daemon-accessible venv prepared by `deploy/gateway/install-macos.sh`. The Python helper is not a separate scheduler or daemon; the existing person-scoped Node runner invokes it for the claimed user's job.
