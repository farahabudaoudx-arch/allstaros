import { createServer } from "node:https";
import { request as httpRequest } from "node:http";
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";

const host = process.env.WHITELABEL_RECORDING_DOMAIN || "customer-a.local";
const listenHost = process.env.WHITELABEL_RECORDING_PROXY_HOST || "127.0.0.1";
const listenPort = Number(process.env.WHITELABEL_RECORDING_PROXY_PORT || "443");
const upstreamHost = process.env.WHITELABEL_RECORDING_UPSTREAM_HOST || "127.0.0.1";
const upstreamPort = Number(process.env.WHITELABEL_RECORDING_UPSTREAM_PORT || "3102");
const root = process.env.WHITELABEL_LOCAL_PILOT_ROOT || "E:\\LocalPilot\\whitelabel-pilot";
const certDir = process.env.WHITELABEL_RECORDING_CERT_DIR || path.join(root, "tls");
const keyPath = path.join(certDir, `${host}.key.pem`);
const certPath = path.join(certDir, `${host}.crt.pem`);

function forwardedHeaders(headers) {
  return {
    ...headers,
    host,
    "x-forwarded-host": host,
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
  };
}

const server = createServer(
  {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  },
  (req, res) => {
    const upstream = httpRequest(
      {
        hostname: upstreamHost,
        port: upstreamPort,
        method: req.method,
        path: req.url,
        headers: forwardedHeaders(req.headers),
      },
      (upstreamResponse) => {
        res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
        upstreamResponse.pipe(res);
      },
    );
    upstream.on("error", (error) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Local recording proxy error: ${error.message}`);
    });
    req.pipe(upstream);
  },
);

server.on("upgrade", (req, socket, head) => {
  const upstream = createConnection(upstreamPort, upstreamHost, () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (const [name, value] of Object.entries(forwardedHeaders(req.headers))) {
      if (Array.isArray(value)) {
        for (const item of value) upstream.write(`${name}: ${item}\r\n`);
      } else if (value != null) {
        upstream.write(`${name}: ${value}\r\n`);
      }
    }
    upstream.write("\r\n");
    if (head?.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
});

server.listen(listenPort, listenHost, () => {
  console.log(`White Label recording proxy: https://${host} -> http://${upstreamHost}:${upstreamPort}`);
});

