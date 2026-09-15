# Gateway production deployment — existing All Star OS installation

This package is for updating the existing live All Star OS deployment. It does not create a second application or a second database.

## What is already in the application

The current tree contains the Gateway connection routes, encrypted external runner, per-person HTTP-only `curl_cffi` authentication/report acquisition, durable report queue, immutable raw-XLSX evidence, first-connect/current pulls, reminder cron, report-pull cron, automatic Scorecard publishing cron, and the required Gateway migrations through `20260914000100_gateway_report_pull_artifacts.sql`.

The application stores only an opaque runner `sessionRef`. Per-member Gateway HTTP session state remains encrypted on the Mac runner host. Gateway passwords and verification codes are transient Connect inputs and are not application or runner-session data.

## One-time production provisioning

### 1. Database

Apply all pending repository migrations to the existing production Supabase project before enabling Gateway runner traffic. The Gateway production boundary requires at least:

`supabase/migrations/20260905000100_gateway_runner_hardening.sql`

`supabase/migrations/20260914000100_gateway_report_pull_artifacts.sql`

After migration, run `deploy/gateway/verify-production-schema.sql` in the production SQL editor. `latest_migration` must be at least `20260914000100` and every boolean in the result must be `true`.

### 2. Existing Vercel project

Use `deploy/gateway/app.env.example` as the production environment checklist. Add the values to the existing Vercel project, not a new project.

The important Gateway values are:

- `GATEWAY_HOSTED_CONNECT_URL=https://<stable-gateway-host>/connect`
- `GATEWAY_AGENT_CONNECT_TOKEN`
- `GATEWAY_AGENT_REPORT_TOKEN`
- `CRON_SECRET`

The two agent tokens must exactly match the Mac runner environment. The three secrets must be different high-entropy values. `RESEND_API_KEY` and `RESEND_FROM` are required for Gateway reminder emails.

Before deployment, an operator can export/pull the intended production environment and run:

```bash
node deploy/gateway/preflight.mjs app
```

### 3. Stable Cloudflare tunnel

Create one remotely-managed named Cloudflare Tunnel for the Gateway Mac. Configure one stable public hostname, for example `gateway.example.com`, with its service target set to:

`http://127.0.0.1:8788`

Put only the tunnel token in the Mac `runner.env`. The launcher passes it to `cloudflared` through its supported `TUNNEL_TOKEN` environment variable so it is not placed on the process command line. Do not commit the token or a Cloudflare credentials file.

The stable hostname origin becomes `GATEWAY_RUNNER_PUBLIC_URL`; the Vercel value is the same origin plus `/connect`.

### 4. Gateway Mac

The Mac must have:

- Node.js/npm compatible with the application lockfile
- Python 3 for the isolated `curl_cffi` Gateway adapter
- `cloudflared`
- a dedicated non-root macOS account for the Gateway runtime; the service itself is installed in the system LaunchDaemon domain and must not depend on an interactive keychain
- the exact Supabase project HTTPS origin in `GATEWAY_RUNNER_ARTIFACT_UPLOAD_ORIGIN`; the runner refuses raw-XLSX signed uploads to any other origin
- the current repository checkout

Create a real runner env file from `deploy/gateway/runner.env.example`, use absolute paths, then run once:

```bash
sudo ALLSTAR_GATEWAY_SERVICE_USER=<mac-user> bash deploy/gateway/install-macos.sh /absolute/path/to/runner.env
```

The installer:

- validates production configuration and rejects test/legacy credentials;
- installs the Node runtime dependencies plus the isolated Python HTTP adapter;
- creates the private encrypted-session directory;
- installs a system LaunchDaemon for the Gateway runner, executing as the dedicated non-root runtime account;
- installs a system LaunchDaemon for the Cloudflare tunnel;
- configures both to restart automatically;
- verifies local `/health` and the public tunnel `/health`.

The production runner serves a token-protected Connect form through the stable tunnel. The member submits Gateway credentials directly to that short-lived runner session; if Gateway requires OTP or initial 2FA setup, the same surface prompts only for the required next value. The runner sends those values to Gateway over HTTPS using `curl_cffi`, discards passwords/OTP values after each step, and persists only the resulting encrypted per-member HTTP session state. The signed `/connect` URL expires with the one-time application connection request, and the runner refuses unsigned/tampered requests before accepting credentials.

Logs are written under `/Library/Logs/AllStarOSGateway/`. Runtime secrets must be readable by the daemon account without an interactive login/keychain and must remain outside Git.

## Updating the already-live installation

For a normal release, the developer does not change Gateway business logic or hand-edit runner configuration:

1. Apply pending Supabase migrations.
2. Update/deploy the existing Vercel project with the committed application changes.
3. Pull the same committed release on the Gateway Mac.
4. Run:

```bash
sudo bash deploy/gateway/update-macos.sh /absolute/path/to/runner.env
```

The updater runs the runner production preflight, installs exactly the Node lockfile dependencies plus the pinned HTTP-adapter Python requirements, restarts the existing runner/tunnel LaunchDaemons, and fails if the local runner does not return healthy.

## Production safety rules

Do not set any of these on the production Mac:

- `GATEWAY_RUNNER_TEST_MODE=true`
- `GATEWAY_RUNNER_GATEWAY_CHROME_PATH`
- `GATEWAY_RUNNER_GATEWAY_HEADLESS`
- `GATEWAY_RUNNER_GATEWAY_CONNECT_HEADLESS`
- `GATEWAY_RUNNER_GATEWAY_BROWSER_FALLBACK_ENABLED`
- `GATEWAY_RUNNER_GATEWAY_LEGACY_PROFILE_DIR`
- `GATEWAY_LOGIN_EMAIL`
- `GATEWAY_LOGIN_PASSWORD`
- accelerated Gateway report-pull test variables

Do not put Gateway passwords, OTP values, Supabase service-role keys, agent tokens, session keys, or the Cloudflare tunnel token in Git.

The Gateway feature can therefore be deployed onto the existing installation without creating a new All Star OS instance or requiring members to remote-control the Mac desktop.
