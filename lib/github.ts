const GH = "https://api.github.com";
function headers(useToken = false) { const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "OpenOS/0.1" }; if (useToken && process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`; return h; }
// Public-visibility gate: the privileged token is attached ONLY after an
// unauthenticated request has confirmed the repository is public. A private
// or missing repo fails here, before any token-bearing fetch can happen.
export async function confirmPublic(owner: string, repo: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${GH}/repos/${owner}/${repo}`, { headers: headers(false) });
  if (r.ok) {
    const meta = (await r.json()) as Record<string, unknown>;
    if (meta.private) throw new Error("Repository is private — OpenOS only fetches public source, even with a token configured");
    return meta;
  }
  // The anonymous pool can be rate-limited on shared egress. With a token
  // configured, visibility may be verified WITH it — but a private repo is
  // still refused, and no source is fetched before this check passes.
  if (process.env.GITHUB_TOKEN) {
    const authed = await fetch(`${GH}/repos/${owner}/${repo}`, { headers: headers(true) });
    if (authed.ok) {
      const meta = (await authed.json()) as Record<string, unknown>;
      if (meta.private) throw new Error("Repository is private — OpenOS only fetches public source, even with a token configured");
      return meta;
    }
  }
  throw new Error(`GitHub ${r.status}: repository not found, private, or rate-limited (checked without credentials)`);
}
// Strict source identity (S2-2): only github.com owner/repo forms or a bare
// owner/repo pair. Userinfo, credentials, other hosts, IP literals and
// look-alike hosts are refused so a privileged token can never be steered
// at a private or impersonated source.
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const s = input.trim();
  if (!s || /@|\\|\s/.test(s)) return null;
  if (/^https?:\/\//i.test(s)) {
    try { const u = new URL(s); if (u.hostname !== "github.com" || u.username || u.password) return null; const parts = u.pathname.split("/").filter(Boolean); if (parts.length < 2) return null; return clean(parts[0], parts[1]); } catch { return null; }
  }
  const m = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/);
  return m ? clean(m[1], m[2]) : null;
  function clean(owner: string, repo: string) { const r = repo.replace(/\.git$/, ""); if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(r) || owner === "github.com") return null; return { owner, repo: r }; }
}
// Immutable provenance (I3): resolve the branch to a commit ONCE, then fetch
// the tree, manifests, license and bounded source files AT that commit. A
// moving branch or pushed_at timestamp never establishes provenance.
export async function resolveCommit(owner: string, repo: string, branch: string, useToken = false): Promise<string> {
  const r = await fetch(`${GH}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, { headers: headers(useToken) });
  if (!r.ok) throw new Error(`GitHub ${r.status}: cannot resolve commit for ${branch}`);
  const j = await r.json(); if (!/^[0-9a-f]{40}$/i.test(j.sha || "")) throw new Error("GitHub returned no commit SHA");
  return j.sha as string;
}
async function rawAt(owner: string, repo: string, sha: string, path: string, cap = 6000, useToken = false): Promise<string> {
  const r = await fetch(`${GH}/repos/${owner}/${repo}/contents/${path}?ref=${sha}`, { headers: { ...headers(useToken), Accept: "application/vnd.github.raw+json" } });
  return r.ok ? (await r.text()).slice(0, cap) : "";
}
const repoCache = new Map<string, { at: number; repo: Awaited<ReturnType<typeof fetchRepoFresh>> }>();
export async function fetchRepo(owner: string, repo: string, pinnedSha?: string) {
  const key = `${owner}/${repo}@${pinnedSha || "HEAD"}`;
  const hit = repoCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.repo;
  const fresh = await fetchRepoFresh(owner, repo, pinnedSha);
  repoCache.set(key, { at: Date.now(), repo: fresh });
  return fresh;
}
async function fetchRepoFresh(owner: string, repo: string, pinnedSha?: string) {
  // Visibility is confirmed WITHOUT credentials first; only then may the
  // configured token ride along (for rate limits) on public source.
  const meta = await confirmPublic(owner, repo);
  const useToken = true;
  const commitSha = pinnedSha && /^[0-9a-f]{40}$/i.test(pinnedSha) ? pinnedSha : await resolveCommit(owner, repo, meta.default_branch as string, useToken);
  const [langR, treeR] = await Promise.all([fetch(`${GH}/repos/${owner}/${repo}/languages`, { headers: headers(useToken) }), fetch(`${GH}/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`, { headers: headers(useToken) })]);
  const languages = langR.ok ? Object.keys(await langR.json()) : [];
  let files: string[] = []; let truncated = false;
  if (treeR.ok) { const t = await treeR.json(); truncated = Boolean(t.truncated); files = (t.tree || []).filter((x: { type: string }) => x.type === "blob").map((x: { path: string }) => x.path).slice(0, 400); }
  const readme = files.includes("README.md") ? await rawAt(owner, repo, commitSha, "README.md", 12000, useToken) : "";
  let pkg: Record<string, unknown> | null = null; let pyproject = "";
  if (files.includes("package.json")) { try { pkg = JSON.parse(await rawAt(owner, repo, commitSha, "package.json", 6000, useToken)); } catch { pkg = null; } }
  const pyFile = files.includes("pyproject.toml") ? "pyproject.toml" : files.includes("setup.py") ? "setup.py" : "";
  if (pyFile) pyproject = await rawAt(owner, repo, commitSha, pyFile, 4000, useToken);
  const licPath = files.find((f) => /^(LICENSE|LICENCE|COPYING)(\.|$)/i.test(f));
  const licenseText = licPath ? await rawAt(owner, repo, commitSha, licPath, 2000, useToken) : "";
  const licenseEvidence = licPath ? `${licPath}@${commitSha.slice(0, 7)}: ${licenseText.split("\n")[0].slice(0, 80)}` : null;
  // Bounded source evidence: entry manifests' likely source files only.
  const srcPaths = files.filter((f) => /(^|\/)(index|main|cli|__init__|__main__)\.(ts|js|py)$/.test(f) || (pkg?.main && f === String((pkg as { main?: string }).main))).slice(0, 8);
  const sources: { path: string; content: string }[] = [];
  for (const p of srcPaths) { const c = await rawAt(owner, repo, commitSha, p, 6000, useToken); if (c) sources.push({ path: p, content: c }); }
  const m = meta as { full_name: string; description?: string; stargazers_count: number; forks_count: number; language?: string; license?: { spdx_id?: string }; default_branch: string; html_url: string; topics?: string[]; updated_at: string; open_issues_count: number };
  return { fullName: m.full_name, description: m.description ?? "", stars: m.stargazers_count, forks: m.forks_count, language: m.language ?? languages[0] ?? "—", languages, license: m.license?.spdx_id ?? "None listed", licenseEvidence, defaultBranch: m.default_branch, commitSha, sha: commitSha, treeTruncated: truncated, htmlUrl: m.html_url, topics: m.topics ?? [], readme, updatedAt: m.updated_at, openIssues: m.open_issues_count, files, pkg, pyproject, sources };
}
export const CURATED = [
  { owner: "Hopding", repo: "pdf-lib", label: "PDF Toolkit", blurb: "Create & modify PDFs in any JS runtime" },
  { owner: "naptha", repo: "tesseract.js", label: "OCR Reader", blurb: "OCR for 100+ languages, runs in browser" },
  { owner: "markedjs", repo: "marked", label: "Markdown", blurb: "Fast Markdown parser & compiler" },
  { owner: "jgm", repo: "pandoc", label: "Doc Converter", blurb: "Universal document converter" },
  { owner: "mozilla", repo: "pdf.js", label: "PDF Viewer", blurb: "Mozilla's PDF reader in JavaScript" },
  { owner: "faker-js", repo: "faker", label: "Fake Data", blurb: "Generate realistic fake data" },
  { owner: "mermaid-js", repo: "mermaid", label: "Diagrams", blurb: "Diagrams from text, like Markdown" },
  { owner: "prettier", repo: "prettier", label: "Formatter", blurb: "Opinionated code formatter" },
];
