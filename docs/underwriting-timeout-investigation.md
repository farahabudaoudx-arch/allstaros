# Underwriting analyze timeout investigation — 2026-09-08

## Evidence and confidence

- The UI's `DEBOUNCE_MS = 800` automatically submitted notes after every 0.8-second pause. Blur flushed a submission immediately; toolkit changes and prefilled notes could also start analysis. Browser cancellation was not forwarded to Anthropic by the deployed route, so replacing a browser request did not explicitly stop its paid model work. This is a confirmed source of unnecessary requests, not just a missing error message.
- Read-only aggregate queries against `ai_usage_log` found 19 completed underwriting analyses from two users in 19:05–19:06 UTC on September 5, immediately before the timeouts. In 19:04–19:08, there were 37 completions; 26 were within ten seconds of the previous completion for the same user, including eight within two seconds. These are completion times, not request durations. They demonstrate repeated paid work but cannot prove which calls overlapped or why the two historical requests stalled. Aborted/timed-out work may be absent from this ledger.
- Vercel project `all-star-agency` (`prj_0NHNHKWyY1bbiyWszkDUkw4ho1tb`), production deployment `dpl_AJGibdyCgGTWNdfbraSt5D9EMirV`, region `iad1`.
- The production domain resolves to commit `7f95d0890228caf9e87b6b24bc1624ecc072850f`, also the inspected `main` head.
- Narrow runtime-log query for 2026-09-05 19:05–19:07 UTC shows POST `/api/underwriting/analyze` 504s at 19:06:09 and 19:06:11, both `Task timed out after 30 seconds`. Nearby successful serverless requests appear at 19:05:44 and 19:05:56. Middleware 200s alone are not evidence of successful function completion.
- The grouped error tool reported three occurrences but returned a first-seen date outside the requested seven-day range. Do not treat that count as a seven-day incidence rate. Broad raw-log queries timed out; the narrow query above succeeded.

The strongest code-level suspect is `POST → analyzeNotes → structured → Anthropic.messages.create`: the route allows 30 seconds, while the installed SDK defaults to a 10-minute request timeout and two retries. Neither was overridden. A stalled provider or retriable overload can therefore outlive the function and prevent its error handler from responding. This mismatch is confirmed in source and reproduced with a stalled SDK transport; historical provider latency/retry activity is **not proven** by the available logs, which contain no stage timings.

Other unbounded waits were auth, two sequential Supabase rate-limit counts, and an awaited usage insert *after* successful model completion. The rate-limit/ledger code caught errors but did not bound latency. Canonical conditions and carrier outcomes are synchronous in-memory JSON lookups, not remote dependencies.

## Fix

- Submit-only UI: typing, pausing, dictation, blur, prefilled notes, vital edits, and toolkit changes do not start analysis. Submit snapshots the latest notes/vitals/toolkit once. Synchronous in-flight guard and disabled button prevent double submissions. Successful unchanged inputs are not submitted again; errors allow an explicit retry. Changed inputs hide stale results, and switching toolkits cancels pending work without launching a replacement.
- Keep the 30-second platform limit and use one absolute 25-second application budget. Individual waits are capped at auth 5s, rate limit 2s, body 1s, LLM 18s, and accounting 1s, each shortened to the remaining total budget.
- Explicit 18s Anthropic timeout and zero SDK retries for `analyzeNotes` only. Retain the model, prompts, forced tool schema, caching, and canonical filtering.
- Abort Anthropic and Supabase requests on stage timeout or client cancellation. A promise race also bounds dependencies that do not support cancellation. Auth's existing helper cannot cancel its underlying reads; late completion cannot resume the route or start paid model work.
- Preserve rate-limit fail-open policy and best-effort usage recording. A stalled ledger can miss a usage row, but cannot discard a completed analysis. No automatic model retries or fabricated successful/healthy result on timeout.
- Return structured 504 timeout / 502 dependency error responses with manual-selection/retry guidance. Existing UI displays the JSON error message. Auth remains fail-closed; existing 401, 400, and 429 behavior is retained.
- Stage start/completion/timeout logs contain a generated correlation ID and durations, not notes, person IDs, or provider error payloads.

## Verification and follow-up

Tests exercise stalled model/auth/rate-limit/ledger dependencies, total elapsed budget, client cancellation, error sanitization, input/auth/rate-limit contracts, canonical carrier results, and timer cleanup. Real Anthropic and Supabase SDKs run against simulated transports to verify network cancellation, no provider retries, canonical filtering, and usage conversion without making paid API calls or writing production data.

Rendered React component tests verify submit-only behavior, duplicate blocking, retry, dictation, vitals, and stale-response handling. Browser verification with the real component and styles against simulated API responses confirmed zero analysis requests after typing/pausing/toolkit changes, exactly one after Submit, and no extra request or stale result after further edits.

After deploying, inspect stage durations and timeout events for this route. `stage=llm` timeouts implicate the provider path; `auth`, `rate-limit`, or `usage` isolate database/auth delays. Compare structured application 504s with platform kills and watch missing ledger entries. The chosen budgets intentionally trade slow-request success for a bounded response and should be tuned from these measurements. This PR does not establish that production has recovered before deployment.
