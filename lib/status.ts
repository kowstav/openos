// U2 state vocabulary: user copy derived from backend reason codes.
export type AppState = "ready" | "partial" | "needs-runtime" | "unsupported" | "build-failed" | "blocked-safety" | "suspended";
export function statusLabel(runnable: boolean, state?: string): { state: AppState; label: string } {
  if (state === "suspended") return { state: "suspended", label: "Suspended" };
  return runnable ? { state: "ready", label: "Ready to use" } : { state: "needs-runtime", label: "Needs a runtime" };
}
export function reasonCopy(code: string): string {
  const m: Record<string, string> = {
    "password-pdf": "This PDF is password-protected. Choose an unlocked copy.",
    "build-interrupted": "Build interrupted. View build details.",
    "permission-denied": "Permission was not granted, so this run did not start. You can allow once or cancel.",
    "runtime-missing": "This tool needs a runtime that is not configured here.",
  };
  return m[code] || code;
}
