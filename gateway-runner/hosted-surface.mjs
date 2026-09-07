import { randomBytes, timingSafeEqual } from "node:crypto";

const TERMINAL = new Set(["connected", "error", "cancelled"]);
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

function empty(res, status) {
  res.writeHead(status, { "cache-control": "no-store" });
  res.end();
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
    "img-src 'self' blob:",
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
    *{box-sizing:border-box} body{margin:0;background:#0c0d0f;color:#f5f5f5}
    main{width:min(1180px,100%);margin:0 auto;padding:20px}
    h1{font-size:22px;margin:0 0 6px} p{color:#b7bbc3;line-height:1.45;margin:0 0 14px}
    #status{border:1px solid #2c3037;background:#15171b;border-radius:10px;padding:10px 12px;margin:12px 0;font-size:14px}
    #viewport{position:relative;background:#050506;border:1px solid #2c3037;border-radius:12px;overflow:hidden;min-height:220px;display:flex;align-items:center;justify-content:center}
    #frame{display:block;width:100%;height:auto;max-height:72vh;object-fit:contain;user-select:none;-webkit-user-drag:none;touch-action:manipulation;cursor:default}
    #placeholder{color:#8b9099;padding:80px 20px;text-align:center}
    .keyboard{margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    #keys{flex:1;min-width:220px;border:1px solid #343840;background:#111318;color:#fff;border-radius:9px;padding:11px 12px;font-size:16px;outline:none}
    #keys:focus{border-color:#6f7785}
    button{border:1px solid #343840;background:#191c21;color:#fff;border-radius:9px;padding:10px 13px;font:inherit;cursor:pointer}
    button:hover{background:#23272e} button:disabled{opacity:.45;cursor:not-allowed}
    .privacy{font-size:12px;color:#8f949d;margin-top:10px}
    .hidden{display:none!important}
    @media(max-width:640px){main{padding:12px}#frame{max-height:62vh}.keyboard{position:sticky;bottom:0;background:#0c0d0f;padding:8px 0 env(safe-area-inset-bottom)}}
  </style>
</head>
<body>
<main>
  <h1>Connect Gateway</h1>
  <p>Sign in inside the secure hosted browser below. All Star OS receives only a connection reference, not your Gateway password or verification code.</p>
  <div id="status" role="status">Opening Gateway…</div>
  <div id="viewport">
    <div id="placeholder">Starting the secure Gateway browser…</div>
    <img id="frame" class="hidden" alt="Gateway sign-in browser" draggable="false">
  </div>
  <div class="keyboard">
    <input id="keys" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Gateway keyboard" placeholder="Click a Gateway field, then type here">
    <button type="button" data-key="Tab">Tab</button>
    <button type="button" data-key="Enter">Enter</button>
    <button type="button" data-key="Backspace">Backspace</button>
  </div>
  <p class="privacy">Keyboard input is forwarded to the active Gateway browser session and is not saved by this page.</p>
</main>
<script nonce="${nonce}">
(() => {
  const sessionId = ${sessionId};
  const token = ${token};
  const base = '/connect/session/' + encodeURIComponent(sessionId);
  const statusEl = document.getElementById('status');
  const frame = document.getElementById('frame');
  const placeholder = document.getElementById('placeholder');
  const keys = document.getElementById('keys');
  let terminal = false;
  let frameUrl = null;
  let frameBusy = false;
  let inputBusy = Promise.resolve();
  history.replaceState(null, '', '/connect/session/' + encodeURIComponent(sessionId));

  const headers = () => ({ authorization: 'Bearer ' + token });
  async function send(action) {
    if (terminal) return;
    inputBusy = inputBusy.then(() => fetch(base + '/input', {
      method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify(action), cache: 'no-store'
    })).catch(() => undefined);
    return inputBusy;
  }
  async function pollFrame() {
    if (terminal || frameBusy) return;
    frameBusy = true;
    try {
      const response = await fetch(base + '/frame', { headers: headers(), cache: 'no-store' });
      if (response.status === 200) {
        const blob = await response.blob();
        const next = URL.createObjectURL(blob);
        const old = frameUrl;
        frameUrl = next;
        frame.src = next;
        frame.classList.remove('hidden');
        placeholder.classList.add('hidden');
        if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
      }
    } catch {}
    finally { frameBusy = false; }
  }
  async function pollStatus() {
    if (terminal) return;
    try {
      const response = await fetch(base + '/status', { headers: headers(), cache: 'no-store' });
      if (!response.ok) throw new Error('status');
      const data = await response.json();
      if (data.status === 'starting') statusEl.textContent = 'Opening Gateway…';
      if (data.status === 'interactive') statusEl.textContent = 'Gateway is ready. Sign in and complete verification only if Gateway asks.';
      if (data.status === 'connected') {
        terminal = true;
        statusEl.textContent = 'Gateway connected. Returning to All Star OS…';
        keys.disabled = true;
        document.querySelectorAll('button[data-key]').forEach((button) => { button.disabled = true; });
        setTimeout(() => { location.replace(data.returnUrl); }, 900);
      }
      if (data.status === 'error' || data.status === 'cancelled') {
        terminal = true;
        statusEl.textContent = data.message || 'Gateway connection could not be completed.';
        keys.disabled = true;
        document.querySelectorAll('button[data-key]').forEach((button) => { button.disabled = true; });
        if (data.returnUrl) setTimeout(() => { location.replace(data.returnUrl); }, 2500);
      }
    } catch {
      statusEl.textContent = 'The hosted Gateway browser is temporarily unreachable.';
    }
  }

  frame.addEventListener('pointerdown', (event) => {
    if (terminal || !frame.naturalWidth || !frame.naturalHeight) return;
    event.preventDefault();
    const rect = frame.getBoundingClientRect();
    const x = (event.clientX - rect.left) * frame.naturalWidth / rect.width;
    const y = (event.clientY - rect.top) * frame.naturalHeight / rect.height;
    send({ type: 'click', x, y });
    keys.focus({ preventScroll: true });
  });
  frame.addEventListener('wheel', (event) => {
    if (terminal) return;
    event.preventDefault();
    send({ type: 'scroll', deltaY: Math.max(-1200, Math.min(1200, event.deltaY)) });
  }, { passive: false });

  keys.addEventListener('beforeinput', (event) => {
    if (terminal) return;
    if (event.inputType === 'insertText' && event.data) {
      event.preventDefault();
      send({ type: 'text', text: event.data });
    }
  });
  keys.addEventListener('paste', (event) => {
    if (terminal) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text') || '';
    if (text) send({ type: 'text', text });
  });
  keys.addEventListener('keydown', (event) => {
    if (terminal) return;
    const special = new Set(['Enter','Tab','Backspace','Delete','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End']);
    if (special.has(event.key)) {
      event.preventDefault();
      send({ type: 'key', key: event.key });
    }
  });
  document.querySelectorAll('button[data-key]').forEach((button) => {
    button.addEventListener('click', () => { send({ type: 'key', key: button.dataset.key }); keys.focus({ preventScroll: true }); });
  });

  setInterval(pollFrame, 450);
  setInterval(pollStatus, 500);
  pollStatus();
  pollFrame();
})();
</script>
</body>
</html>`;
  return { html, csp };
}

export class HostedSurfaceManager {
  constructor({ maxSessions = 2, logger = console } = {}) {
    this.maxSessions = maxSessions;
    this.logger = logger;
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
      controller: null,
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
      attach: async (interactiveController) => {
        if (TERMINAL.has(session.status) || controller.signal.aborted) throw controller.signal.reason ?? new Error("Connection closed.");
        if (
          typeof interactiveController?.captureFrame !== "function" ||
          typeof interactiveController?.handleInput !== "function"
        ) {
          throw new Error("Gateway provider supplied an invalid hosted-browser controller.");
        }
        session.controller = interactiveController;
        session.status = "interactive";
      },
      detach: () => {
        session.controller = null;
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
        session.controller = null;
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
    const match = /^\/connect\/session\/([A-Za-z0-9_-]+)\/(status|frame|input|cancel)$/.exec(url.pathname);
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
      });
      return true;
    }
    if (action === "frame" && req.method === "GET") {
      if (!session.controller || TERMINAL.has(session.status)) {
        empty(res, 204);
        return true;
      }
      try {
        const frame = await session.controller.captureFrame();
        res.writeHead(200, {
          "content-type": "image/jpeg",
          "content-length": String(frame.length),
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        res.end(frame);
      } catch {
        empty(res, 204);
      }
      return true;
    }
    if (action === "input" && req.method === "POST") {
      if (!session.controller || session.status !== "interactive") {
        json(res, 409, { error: "browser_not_ready" });
        return true;
      }
      try {
        const body = await readJson(req);
        await session.controller.handleInput(body);
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

export const __test = { secureEqual, returnToApp, MAX_INPUT_BYTES, TERMINAL_RETENTION_MS };
