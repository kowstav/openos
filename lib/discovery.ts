import { CATALOG, type CatalogEntry } from "./catalog";
// Common evidence-backed discovery layer (I4). All five search entry points
// — natural-language problem, capability, paid product, project name and a
// pasted GitHub URL — resolve through rankDiscovery and return the same
// entry shape with explicit ranking reasons, so the marketplace, the repo
// page graph/list and the builder all share capability IDs.
export type SearchMode = "problem" | "capability" | "product" | "project" | "url";
export type RankedEntry = { entry: CatalogEntry; score: number; reasons: string[]; mode: SearchMode };
export function detectMode(q: string): SearchMode {
  const s = q.trim();
  if (/github\.com\/|^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) return "url";
  if (CATALOG.some((e) => e.comparisons.some((c) => s.toLowerCase().includes(c.product.split(" ")[0].toLowerCase())))) return "product";
  if (CATALOG.some((e) => e.capabilityIds.some((id) => s.toLowerCase().includes(id)))) return "capability";
  if (CATALOG.some((e) => s.toLowerCase() === e.repo.toLowerCase() || s.toLowerCase() === `${e.owner}/${e.repo}`.toLowerCase())) return "project";
  return "problem";
}
export function parseRepoQuery(q: string): { owner: string; repo: string } | null {
  const m = q.trim().match(/(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}
export function rankDiscovery(q: string, entries: CatalogEntry[] = CATALOG): RankedEntry[] {
  const mode = detectMode(q); const s = q.trim().toLowerCase();
  if (!s) return entries.map((entry) => ({ entry, score: 0, reasons: ["Listed in this collection"], mode }));
  const repo = mode === "url" || mode === "project" ? parseRepoQuery(q) : null;
  const ranked: RankedEntry[] = [];
  for (const entry of entries) {
    let score = 0; const reasons: string[] = [];
    if (repo && entry.owner.toLowerCase() === repo.owner.toLowerCase() && entry.repo.toLowerCase() === repo.repo.toLowerCase()) { score += 100; reasons.push("Exact project match"); }
    for (const p of entry.problems) if (s.includes(p) || p.includes(s)) { score += 30; reasons.push(`Matches the problem “${p}”`); }
    for (const id of entry.capabilityIds) if (s.includes(id)) { score += 40; reasons.push(`Provides capability ${id}`); }
    for (const c of entry.comparisons) if (s.includes(c.product.toLowerCase()) || c.product.toLowerCase().includes(s)) { score += 25; reasons.push(`Compared feature by feature with ${c.product}`); }
    if (entry.label.toLowerCase().includes(s) || entry.repo.toLowerCase().includes(s)) { score += 20; reasons.push("Name matches your search"); }
    if (entry.covered.some((c) => c.toLowerCase().includes(s))) { score += 10; reasons.push("A covered feature matches"); }
    if (score > 0) ranked.push({ entry, score, reasons: reasons.slice(0, 3), mode });
  }
  return ranked.sort((a, b) => b.score - a.score);
}
export const COLLECTIONS = [...new Set(CATALOG.map((e) => e.collection))];
export function byCollection(name: string) { return name === "All" ? CATALOG : CATALOG.filter((e) => e.collection === name); }
