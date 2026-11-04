// Subtitle export (I4): editable timestamped segments become standards-
// compliant SRT / WebVTT. This is editor tooling — it never invents a
// transcript. Live transcription requires the faster-whisper sandbox.
export type Segment = { start: number; end: number; text: string };
function stamp(sec: number, comma: boolean) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}${comma ? "," : "."}${p(r, 3)}`;
}
export function toSrt(segments: Segment[]): string {
  return segments.map((s, i) => `${i + 1}\n${stamp(s.start, true)} --> ${stamp(s.end, true)}\n${s.text.trim()}\n`).join("\n");
}
export function toVtt(segments: Segment[]): string {
  return `WEBVTT\n\n${segments.map((s) => `${stamp(s.start, false)} --> ${stamp(s.end, false)}\n${s.text.trim()}\n`).join("\n")}`;
}
export function validateSegments(segments: Segment[]): string | null {
  for (const s of segments) { if (s.end <= s.start) return "Each segment must end after it starts"; if (!s.text.trim()) return "Segments need text"; }
  return null;
}
