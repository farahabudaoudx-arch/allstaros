import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_GC_BATCH_SIZE = 500;

function fileName(sessionRef) {
  return createHash("sha256").update(sessionRef).digest("hex") + ".session";
}

export class EncryptedSessionStore {
  constructor({ dir, key, idleTtlMs = DEFAULT_IDLE_TTL_MS, gcBatchSize = DEFAULT_GC_BATCH_SIZE, now = () => Date.now() }) {
    this.dir = dir;
    this.key = key;
    this.idleTtlMs = idleTtlMs;
    this.gcBatchSize = gcBatchSize;
    this.now = now;
    this.gcCursor = null;
    if (!Number.isFinite(idleTtlMs) || idleTtlMs <= 0) throw new Error("Gateway session idle TTL must be positive.");
    if (!Number.isInteger(gcBatchSize) || gcBatchSize < 1) throw new Error("Gateway session GC batch size must be positive.");
  }

  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
  }

  async create(session) {
    const sessionRef = `gw_${randomUUID()}`;
    await this.put(sessionRef, session);
    return sessionRef;
  }

  async put(sessionRef, session) {
    await this.init();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(session), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const payload = JSON.stringify({
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    });
    const target = join(this.dir, fileName(sessionRef));
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, payload, { encoding: "utf8", mode: 0o600 });
    await rename(temp, target);
  }

  async get(sessionRef) {
    const target = join(this.dir, fileName(sessionRef));
    try {
      const metadata = await stat(target);
      const now = this.now();
      if (now - metadata.mtimeMs > this.idleTtlMs) {
        await rm(target, { force: true });
        return null;
      }
      const raw = await readFile(target, "utf8");
      const payload = JSON.parse(raw);
      if (payload?.version !== 1) throw new Error("Unsupported encrypted Gateway session version.");
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(payload.iv, "base64"));
      decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64")),
        decipher.final(),
      ]);
      const session = JSON.parse(plaintext.toString("utf8"));
      const touchedAt = new Date(now);
      await utimes(target, touchedAt, touchedAt).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
      return session;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(sessionRef) {
    await rm(join(this.dir, fileName(sessionRef)), { force: true });
  }

  async gcIdle() {
    await this.init();
    const entries = (await readdir(this.dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".session"))
      .map((entry) => entry.name)
      .sort();
    if (entries.length === 0) {
      this.gcCursor = null;
      return { scanned: 0, deleted: 0 };
    }

    let start = 0;
    if (this.gcCursor) {
      const cursorIndex = entries.findIndex((name) => name > this.gcCursor);
      start = cursorIndex === -1 ? 0 : cursorIndex;
    }
    const scan = [];
    for (let offset = 0; offset < Math.min(this.gcBatchSize, entries.length); offset += 1) {
      scan.push(entries[(start + offset) % entries.length]);
    }
    this.gcCursor = scan.length < entries.length ? scan.at(-1) : null;

    const cutoff = this.now() - this.idleTtlMs;
    let deleted = 0;
    for (const name of scan) {
      const target = join(this.dir, name);
      try {
        const metadata = await stat(target);
        if (metadata.mtimeMs < cutoff) {
          await rm(target, { force: true });
          deleted += 1;
        }
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    return { scanned: scan.length, deleted };
  }
}
