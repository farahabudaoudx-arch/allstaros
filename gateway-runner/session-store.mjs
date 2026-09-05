import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

function fileName(sessionRef) {
  return createHash("sha256").update(sessionRef).digest("hex") + ".session";
}

export class EncryptedSessionStore {
  constructor({ dir, key }) {
    this.dir = dir;
    this.key = key;
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
    try {
      const raw = await readFile(join(this.dir, fileName(sessionRef)), "utf8");
      const payload = JSON.parse(raw);
      if (payload?.version !== 1) throw new Error("Unsupported encrypted Gateway session version.");
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(payload.iv, "base64"));
      decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64")),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString("utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(sessionRef) {
    await rm(join(this.dir, fileName(sessionRef)), { force: true });
  }
}
