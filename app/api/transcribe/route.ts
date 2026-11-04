import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser, crossOriginDenied } from "@/lib/auth";
import { checkQuota } from "@/lib/ratelimit";
import { saveTranscription, getTranscriptionForOwner, listTranscriptions } from "@/lib/store";
import { putObject, getObject } from "@/lib/storage";
import { providerStatus } from "@/lib/sandbox-provider";
export const runtime = "nodejs";
const MAX = 25 * 1024 * 1024;
// Real transcription path: the upload is stored scoped to the owner, then
// the worker runs faster-whisper (CPU tiny/int8 profile) inside the
// isolated sandbox and writes back timestamped segments. Without an
// isolated provider the job honestly lands in `needs-runtime` — the editor
// and subtitle export still work, and no transcript is ever invented.
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (crossOriginDenied(req)) return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
  const quota = checkQuota("execute", u.userId);
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an audio file first." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Audio is limited to 25 MB." }, { status: 413 });
  if (!/audio|\.mp3$|\.wav$|\.m4a$|\.ogg$|\.webm$/i.test(file.type + file.name)) return NextResponse.json({ error: "Only audio files (MP3, WAV, M4A, OGG, WebM)." }, { status: 415 });
  const id = `tr-${randomUUID().slice(0, 12)}`;
  const objectKey = `transcribe/${id}/audio`;
  await putObject(u.userId, objectKey, Buffer.from(await file.arrayBuffer()), 7 * 24 * 3600_000);
  const configured = providerStatus().isolated;
  const rec = { id, ownerId: u.userId, fileName: file.name.slice(0, 120), objectKey, status: configured ? "queued" as const : "needs-runtime" as const, segments: [], error: configured ? undefined : "Automatic transcription needs the isolated Python sandbox with faster-whisper (CPU tiny model). Your file is saved; edit timestamps below or export subtitles from text you add.", createdAt: Date.now(), updatedAt: Date.now() };
  await saveTranscription(rec);
  return NextResponse.json({ transcription: rec });
}
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const t = await getTranscriptionForOwner(id, u.userId);
    return t ? NextResponse.json({ transcription: t }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ transcriptions: await listTranscriptions(u.userId) });
}
export async function PATCH(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (crossOriginDenied(req)) return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const t = b.id ? await getTranscriptionForOwner(String(b.id), u.userId) : null;
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.action === "cancel") { t.status = "cancelled"; t.updatedAt = Date.now(); await saveTranscription(t); return NextResponse.json({ transcription: t }); }
  if (Array.isArray(b.segments)) {
    const segs = b.segments.slice(0, 500).map((s: { start?: unknown; end?: unknown; text?: unknown }) => ({ start: Math.max(0, Number(s.start) || 0), end: Math.max(0, Number(s.end) || 0), text: String(s.text ?? "").slice(0, 2000) }));
    if (segs.some((s: { start: number; end: number }) => s.end <= s.start)) return NextResponse.json({ error: "Each segment must end after it starts. Nothing was saved." }, { status: 422 });
    t.segments = segs; t.updatedAt = Date.now(); await saveTranscription(t);
  }
  return NextResponse.json({ transcription: t });
}
export async function DELETE(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const t = await getTranscriptionForOwner(id, u.userId);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { deleteObject } = await import("@/lib/storage");
  await deleteObject(u.userId, t.objectKey).catch(() => {});
  t.status = "cancelled"; t.segments = []; await saveTranscription(t);
  return NextResponse.json({ ok: true });
}
void getObject;
