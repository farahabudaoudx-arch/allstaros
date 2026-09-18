import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EncryptedSessionStore } from "./session-store.mjs";

const cleanup = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()();
});

async function store(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "allstar-gateway-session-gc-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const instance = new EncryptedSessionStore({
    dir,
    key: Buffer.alloc(32, 9),
    idleTtlMs: 30 * 24 * 60 * 60 * 1000,
    ...options,
  });
  await instance.init();
  return { dir, instance };
}

describe("EncryptedSessionStore idle retention", () => {
  it("expires an idle encrypted session before returning its browser state", async () => {
    const now = Date.parse("2026-09-14T10:00:00.000Z");
    const { dir, instance } = await store({ now: () => now });
    const ref = await instance.create({ cookie: "secret-cookie" });
    const [name] = await readdir(dir);
    const expired = new Date(now - 31 * 24 * 60 * 60 * 1000);
    await utimes(join(dir, name), expired, expired);

    await expect(instance.get(ref)).resolves.toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  it("touches an active session so weekly use extends its idle retention", async () => {
    let now = Date.parse("2026-09-14T10:00:00.000Z");
    const { dir, instance } = await store({ now: () => now });
    const ref = await instance.create({ alive: true });
    const [name] = await readdir(dir);
    const older = new Date(now - 20 * 24 * 60 * 60 * 1000);
    await utimes(join(dir, name), older, older);

    await expect(instance.get(ref)).resolves.toEqual({ alive: true });
    now += 20 * 24 * 60 * 60 * 1000;
    await expect(instance.gcIdle()).resolves.toEqual({ scanned: 1, deleted: 0 });
    await expect(instance.get(ref)).resolves.toEqual({ alive: true });
  });

  it("bounds each GC pass and advances across batches", async () => {
    const now = Date.parse("2026-09-14T10:00:00.000Z");
    const { dir, instance } = await store({ now: () => now, gcBatchSize: 2 });
    await Promise.all([
      instance.create({ id: 1 }),
      instance.create({ id: 2 }),
      instance.create({ id: 3 }),
    ]);
    const expired = new Date(now - 31 * 24 * 60 * 60 * 1000);
    for (const name of await readdir(dir)) await utimes(join(dir, name), expired, expired);

    await expect(instance.gcIdle()).resolves.toEqual({ scanned: 2, deleted: 2 });
    expect(await readdir(dir)).toHaveLength(1);
    await expect(instance.gcIdle()).resolves.toEqual({ scanned: 1, deleted: 1 });
    expect(await readdir(dir)).toEqual([]);
  });
});
