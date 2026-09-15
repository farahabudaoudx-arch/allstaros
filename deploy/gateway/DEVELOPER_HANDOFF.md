# Gateway release handoff

The Gateway implementation is already in the current All Star OS tree. Update the existing live installation; do not create a second Vercel project or Supabase project.

## One-time production setup

1. Apply all pending Supabase migrations. Confirm both `20260905000100_gateway_runner_hardening.sql` and `20260914000100_gateway_report_pull_artifacts.sql` are applied, then run `deploy/gateway/verify-production-schema.sql` and require every boolean to be `true`.
2. Add the production values from `deploy/gateway/app.env.example` to the existing Vercel project. Keep `GATEWAY_AGENT_CONNECT_TOKEN` and `GATEWAY_AGENT_REPORT_TOKEN` identical to the Mac runner values. Keep all three server secrets distinct.
3. Create a stable Cloudflare named-tunnel hostname whose origin is `http://127.0.0.1:8788`. Put its token in the Mac runner env copied from `deploy/gateway/runner.env.example`.
4. On the Gateway Mac, with Node.js, Python 3, and `cloudflared` installed, choose the dedicated non-root runtime account and run:

```bash
sudo ALLSTAR_GATEWAY_SERVICE_USER=<mac-user> bash deploy/gateway/install-macos.sh /absolute/path/to/runner.env
```

The installer validates the runner configuration, installs Node lockfile dependencies plus the pinned HTTP-adapter Python requirements, creates the encrypted session directory, registers the runner and tunnel as system LaunchDaemons executing under the runtime account, starts them, and verifies local/public health. The daemon secret source must not depend on an interactive keychain.

## Every normal All Star OS update after that

1. Apply any new migrations included in the release.
2. Deploy/promote the same release to the **existing** Vercel project.
3. Update the same release checkout on the Gateway Mac and run:

```bash
sudo bash deploy/gateway/update-macos.sh /absolute/path/to/runner.env
```

That is the complete Gateway runtime update procedure. No Gateway business-logic edits, browser installation, or manual worker commands are required during a normal release.

## Production invariants

- Never commit `runner.env`, Vercel secrets, the Cloudflare tunnel token, Gateway passwords, OTPs, or the runner session key.
- Never enable `GATEWAY_RUNNER_TEST_MODE`, test acceleration, any retired Chrome/browser-fallback setting, `GATEWAY_LOGIN_EMAIL`, or `GATEWAY_LOGIN_PASSWORD` in production.
- The member-facing `/connect` request is short-lived and HMAC-signed. Its credential/OTP/status endpoints use a separate random per-session bearer token.
- All Star OS stores only the opaque `gw_...` session reference. The resulting per-member HTTP session state stays AES-256-GCM encrypted on the Gateway Mac; the password/OTP is never placed in that envelope.
