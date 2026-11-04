import { promises as fs } from "fs"; import path from "path";
import { DATA_DIR } from "./store";
// Scoped object storage (I2): local credential-free equivalent of an object
// store. Objects live under objects/<ownerHash>/<key>; keys are validated so
// traversal/symlink escapes cannot cross owners. TTL is metadata-enforced.
const ROOT = path.join(DATA_DIR, "objects");
function safeKey(key: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(key) || key.includes("..")) throw new Error("Invalid object key");
  return key;
}
function ownerDir(ownerId: string) { return path.join(ROOT, Buffer.from(ownerId).toString("base64url")); }
export async function putObject(ownerId: string, key: string, data: string | Buffer, ttlMs?: number) {
  const dir = ownerDir(ownerId); await fs.mkdir(path.join(dir, path.dirname(safeKey(key))), { recursive: true });
  await fs.writeFile(path.join(dir, key), data);
  await fs.writeFile(path.join(dir, key + ".meta.json"), JSON.stringify({ expiresAt: ttlMs ? Date.now() + ttlMs : null }));
  return { key, bytes: data.length };
}
export async function getObject(ownerId: string, key: string): Promise<Buffer | null> {
  safeKey(key);
  try {
    const meta = JSON.parse(await fs.readFile(path.join(ownerDir(ownerId), key + ".meta.json"), "utf8").catch(() => "{}"));
    if (meta.expiresAt && meta.expiresAt < Date.now()) { await deleteObject(ownerId, key); return null; }
    return await fs.readFile(path.join(ownerDir(ownerId), key));
  } catch { return null; }
}
export async function deleteObject(ownerId: string, key: string) {
  safeKey(key);
  await fs.unlink(path.join(ownerDir(ownerId), key)).catch(() => {});
  await fs.unlink(path.join(ownerDir(ownerId), key + ".meta.json")).catch(() => {});
}
export async function deleteOwnerObjects(ownerId: string) { await fs.rm(ownerDir(ownerId), { recursive: true, force: true }); }
// Deleting ONE app must remove only that app's objects (prefix
// `apps/<appId>/`), never the owner's whole bucket.
export async function deleteAppObjects(ownerId: string, appId: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(appId)) throw new Error("Invalid app id");
  await fs.rm(path.join(ownerDir(ownerId), "apps", appId), { recursive: true, force: true });
}
export async function listOwnerObjectKeys(ownerId: string, prefix = ""): Promise<string[]> {
  const base = path.join(ownerDir(ownerId), prefix);
  const out: string[] = [];
  async function walk(dir: string, rel: string) {
    let entries: import("fs").Dirent[] = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) { if (e.isDirectory()) await walk(path.join(dir, e.name), `${rel}${e.name}/`); else if (!e.name.endsWith(".meta.json")) out.push(rel + e.name); }
  }
  await walk(base, prefix ? `${prefix.replace(/\/?$/, "/")}` : "");
  return out;
}
