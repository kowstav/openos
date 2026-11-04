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
