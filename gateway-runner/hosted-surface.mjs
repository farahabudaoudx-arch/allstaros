import { randomBytes, timingSafeEqual } from "node:crypto";

const TERMINAL = new Set(["connected", "error", "cancelled"]);
const PROMPT_KINDS = new Set(["credentials", "otp", "phone", "email"]);
const MAX_INPUT_BYTES = 8 * 1024;
const TERMINAL_RETENTION_MS = 5 * 60_000;

function secureEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function bearer(req) {
  const raw = req.headers.authorization ?? "";
  return raw.startsWith("Bearer ") ? raw.slice("Bearer ".length).trim() : "";
}

function returnToApp(callbackUrl, result) {
  const target = new URL("/producer", callbackUrl.origin);
  target.searchParams.set("settings", "gateway");
  if (result === "connected") target.searchParams.set("gatewayConnected", "1");
  else target.searchParams.set("gatewayError", "connection_failed");
  return target.toString();
}

function pageHtml(session) {
  const nonce = randomBytes(18).toString("base64url");
  const sessionId = JSON.stringify(session.id);
  const token = JSON.stringify(session.token);
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Connect Gateway</title>
  <style nonce="${nonce}">
    :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0c0d0f;color:#f5f5f5}
    *{box-sizing:border-box}body{margin:0;background:#0c0d0f;color:#f5f5f5}
    main{width:min(520px,100%);margin:0 auto;padding:28px 18px}
    h1{font-size:24px;margin:0 0 8px}p{color:#b7bbc3;line-height:1.5;margin:0 0 16px}
    #status{border:1px solid #2c3037;background:#15171b;border-radius:12px;padding:12px 14px;margin:16px 0;font-size:14px}
    form{border:1px solid #2c3037;background:#111318;border-radius:14px;padding:18px;display:grid;gap:12px}
    label{display:grid;gap:6px;font-size:13px;color:#d7d9de}
    input{width:100%;border:1px solid #343840;background:#090a0d;color:#fff;border-radius:9px;padding:12px;font:inherit;outline:none}
    input:focus{border-color:#747d8c}
    button{border:1px solid #343840;background:#f3f4f6;color:#111;border-radius:9px;padding:11px 14px;font:inherit;font-weight:650;cursor:pointer}
    button:disabled{opacity:.5;cursor:not-allowed}
    .privacy{font-size:12px;color:#8f949d;margin-top:12px}
    .hidden{display:none!important}
  </style>
</head>
<body>
<main>
  <h1>Connect Gateway</h1>
  <p>Enter your Gateway sign-in details here. They are sent only to this secure Gateway runner session and are never sent to All Star OS.</p>
  <div id="status" role="status">Preparing secure Gateway sign-in…</div>
  <form id="prompt" class="hidden" autocomplete="off"></form>
  <p class="privacy">Credentials and verification values are forwarded only for the active Gateway sign-in step and are not stored by this page.</p>
</main>
<script nonce="${nonce}">
(() => {
  const sessionId = ${sessionId};
  const token = ${token};
  const base = '/connect/session/' + encodeURIComponent(sessionId);
  const statusEl = document.getElementById('status');
  const form = document.getElementById('prompt');
  let terminal = false;
  let activePromptId = null;
  let submitting = false;
  history.replaceState(null, '', '/connect/session/' + encodeURIComponent(sessionId));

  const headers = () => ({ authorization: 'Bearer ' + token });
  function input(name, type, label, autocomplete, inputmode) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const field = document.createElement('input');
    field.name = name;
    field.type = type;
    field.required = true;
    field.autocomplete = autocomplete;
    if (inputmode) field.inputMode = inputmode;
    wrapper.appendChild(field);
    form.appendChild(wrapper);
    return field;
  }
  function renderPrompt(prompt) {
    if (!prompt || prompt.id === activePromptId) return;
    activePromptId = prompt.id;
    submitting = false;
    form.replaceChildren();
    if (prompt.kind === 'credentials') {
      input('email', 'email', 'Gateway email', 'off', 'email');
      input('password', 'password', 'Gateway password', 'new-password');
      statusEl.textContent = 'Enter your Gateway email and password.';
    } else if (prompt.kind === 'otp') {
      input('value', 'text', 'Verification code', 'one-time-code', 'numeric');
      statusEl.textContent = 'Enter the verification code requested by Gateway.';
    } else if (prompt.kind === 'phone') {
      input('value', 'tel', 'Phone number', 'off', 'tel');
      statusEl.textContent = 'Gateway requires a phone number to finish verification setup.';
    } else if (prompt.kind === 'email') {
      input('value', 'email', 'Verification email', 'off', 'email');
      statusEl.textContent = 'Gateway requires an email address to finish verification setup.';
    } else {
      form.classList.add('hidden');
      return;
    }
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Continue';
    form.appendChild(submit);
    form.classList.remove('hidden');
    form.querySelector('input')?.focus();
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (terminal || submitting || !activePromptId) return;
    submitting = true;
    const data = new FormData(form);
    const body = { promptId: activePromptId };
    if (form.elements.email && form.elements.password) {
      body.email = String(data.get('email') || '');
      body.password = String(data.get('password') || '');
    } else {
      body.value = String(data.get('value') || '');
    }
    form.querySelectorAll('button,input').forEach((element) => { element.disabled = true; });
    statusEl.textContent = 'Submitting securely to Gateway…';
    try {
      const response = await fetch(base + '/prompt', {
        method: 'POST',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('prompt');
      form.reset();
      form.replaceChildren();
      form.classList.add('hidden');
      activePromptId = null;
      submitting = false;
    } catch {
      submitting = false;
      statusEl.textContent = 'That sign-in step could not be submitted. Please try again.';
      form.querySelectorAll('button,input').forEach((element) => { element.disabled = false; });
    }
  });
  async function pollStatus() {
    if (terminal) return;
    try {
      const response = await fetch(base + '/status', { headers: headers(), cache: 'no-store' });
      if (!response.ok) throw new Error('status');
      const data = await response.json();
      if (data.prompt) renderPrompt(data.prompt);
      else if (data.status === 'starting' && !submitting) statusEl.textContent = 'Contacting Gateway…';
      if (data.status === 'connected') {
        terminal = true;
        form.replaceChildren();
        form.classList.add('hidden');
        statusEl.textContent = 'Gateway connected. Returning to All Star OS…';
        setTimeout(() => { location.replace(data.returnUrl); }, 700);
      }
      if (data.status === 'error' || data.status === 'cancelled') {
        terminal = true;
        form.replaceChildren();
        form.classList.add('hidden');
        statusEl.textContent = data.message || 'Gateway connection could not be completed.';
        if (data.returnUrl) setTimeout(() => { location.replace(data.returnUrl); }, 2200);
      }
    } catch {
      if (!submitting) statusEl.textContent = 'The secure Gateway sign-in session is temporarily unreachable.';
    }
  }
  setInterval(pollStatus, 400);
  pollStatus();
})();
</script>
</body>
</html>`;
  return { html, csp };
}

function promptValue(kind, body) {
  if (!body || typeof body !== "object") throw new Error("invalid_prompt_input");
  if (kind === "credentials") {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || email.length > 320 || !password || password.length > 4096) throw new Error("invalid_prompt_input");
    return { email, password };
  }
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!value || value.length > 2048) throw new Error("invalid_prompt_input");
  return value;
}

export class HostedSurfaceManager {
  constructor({ maxSessions = 2 } = {}) {
    this.maxSessions = maxSessions;
    this.sessions = new Map();
    this.stateIndex = new Map();
  }

  activeCount() {
    return [...this.sessions.values()].filter((session) => !TERMINAL.has(session.status)).length;
  }

  create({ state, callbackUrl, expiresAt, run }) {
    if (this.stateIndex.has(state)) throw new Error("connect_already_active");
    if (this.activeCount() >= this.maxSessions) throw new Error("connect_capacity_reached");
    const id = randomBytes(18).toString("base64url");
    const token = randomBytes(32).toString("base64url");
    const controller = new AbortController();
    const session = {
      id,
      token,
      state,
      callbackUrl,
      expiresAt,
      status: "starting",
      message: null,
      returnUrl: null,
      prompt: null,
      pendingPrompt: null,
      abort: controller,
      timer: null,
      cleanupTimer: null,
    };
    const remainingMs = Math.max(1, Date.parse(expiresAt) - Date.now());
    session.timer = setTimeout(() => {
      if (TERMINAL.has(session.status)) return;
      controller.abort(new Error("Gateway connection expired."));
      session.status = "error";
      session.message = "Gateway connection expired. Return to All Star OS and try again.";
      session.returnUrl = returnToApp(callbackUrl, "error");
      this.scheduleCleanup(session);
    }, remainingMs);
    session.timer.unref?.();
    this.sessions.set(id, session);
    this.stateIndex.set(state, id);

    const surface = {
      prompt: ({ kind } = {}) => {
        if (!PROMPT_KINDS.has(kind)) return Promise.reject(new Error("invalid_gateway_prompt"));
        if (TERMINAL.has(session.status) || controller.signal.aborted) {
          return Promise.reject(controller.signal.reason ?? new Error("Connection closed."));
        }
        if (session.pendingPrompt) return Promise.reject(new Error("gateway_prompt_already_pending"));
        const promptId = randomBytes(18).toString("base64url");
        session.prompt = { id: promptId, kind };
        session.status = "interactive";
        return new Promise((resolve, reject) => {
          const onAbort = () => {
            if (session.pendingPrompt?.id !== promptId) return;
            session.pendingPrompt = null;
            session.prompt = null;
            reject(controller.signal.reason ?? new Error("Connection closed."));
          };
          controller.signal.addEventListener("abort", onAbort, { once: true });
          session.pendingPrompt = {
            id: promptId,
            kind,
            resolve: (value) => {
              controller.signal.removeEventListener("abort", onAbort);
              resolve(value);
            },
          };
        });
      },
    };

    queueMicrotask(async () => {
      try {
        await run({ surface, signal: controller.signal });
        if (controller.signal.aborted || TERMINAL.has(session.status)) return;
        session.status = "connected";
        session.message = "Gateway connected.";
        session.returnUrl = returnToApp(callbackUrl, "connected");
      } catch {
        if (session.status !== "error") {
          session.status = controller.signal.aborted ? "cancelled" : "error";
          session.message = controller.signal.aborted
            ? "Gateway connection was cancelled."
            : "Gateway connection could not be completed. Return to All Star OS and try again.";
          session.returnUrl = returnToApp(callbackUrl, "error");
        }
      } finally {
        session.prompt = null;
        session.pendingPrompt = null;
        this.scheduleCleanup(session);
      }
    });

    return { id, token, ...pageHtml(session) };
  }

  scheduleCleanup(session) {
    clearTimeout(session.timer);
    if (session.cleanupTimer) return;
    const retainThroughSignedExpiry = Math.max(0, Date.parse(session.expiresAt) - Date.now() + 1000);
    session.cleanupTimer = setTimeout(
      () => this.remove(session.id),
      Math.max(TERMINAL_RETENTION_MS, retainThroughSignedExpiry),
    );
    session.cleanupTimer.unref?.();
  }

  remove(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    clearTimeout(session.timer);
    clearTimeout(session.cleanupTimer);
    if (!session.abort.signal.aborted && !TERMINAL.has(session.status)) session.abort.abort(new Error("Connection removed."));
    this.sessions.delete(id);
    if (this.stateIndex.get(session.state) === id) this.stateIndex.delete(session.state);
  }

  authorize(req, id) {
    const session = this.sessions.get(id);
    if (!session || !secureEqual(bearer(req), session.token)) return null;
    return session;
  }

  async handle(req, res, url) {
    const match = /^\/connect\/session\/([A-Za-z0-9_-]+)\/(status|prompt|cancel)$/.exec(url.pathname);
    if (!match) return false;
    const session = this.authorize(req, match[1]);
    if (!session) {
      json(res, 404, { error: "not_found" });
      return true;
    }
    const action = match[2];
    if (action === "status" && req.method === "GET") {
      json(res, 200, {
        status: session.status,
        message: session.message,
        returnUrl: session.returnUrl,
        prompt: session.prompt,
      });
      return true;
    }
    if (action === "prompt" && req.method === "POST") {
      const pending = session.pendingPrompt;
      if (!pending || session.status !== "interactive") {
        json(res, 409, { error: "prompt_not_ready" });
        return true;
      }
      try {
        const body = await readJson(req);
        if (!secureEqual(typeof body?.promptId === "string" ? body.promptId : "", pending.id)) {
          json(res, 409, { error: "prompt_mismatch" });
          return true;
        }
        const value = promptValue(pending.kind, body);
        session.pendingPrompt = null;
        session.prompt = null;
        session.status = "starting";
        pending.resolve(value);
        json(res, 200, { ok: true });
      } catch {
        json(res, 400, { error: "invalid_input" });
      }
      return true;
    }
    if (action === "cancel" && req.method === "POST") {
      if (!session.abort.signal.aborted) session.abort.abort(new Error("Member cancelled Gateway connection."));
      session.status = "cancelled";
      session.message = "Gateway connection was cancelled.";
      session.returnUrl = returnToApp(session.callbackUrl, "error");
      session.prompt = null;
      session.pendingPrompt = null;
      this.scheduleCleanup(session);
      json(res, 200, { ok: true });
      return true;
    }
    json(res, 405, { error: "method_not_allowed" });
    return true;
  }

  closeAll() {
    for (const id of [...this.sessions.keys()]) this.remove(id);
  }
}

export const __test = {
  secureEqual,
  returnToApp,
  promptValue,
  MAX_INPUT_BYTES,
  TERMINAL_RETENTION_MS,
};
