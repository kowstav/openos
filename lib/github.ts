const GH = "https://api.github.com";
function headers() { const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "OpenOS/0.1" }; if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`; return h; }
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
export async function resolveCommit(owner: string, repo: string, branch: string): Promise<string> {
  const r = await fetch(`${GH}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, { headers: headers() });
  if (!r.ok) throw new Error(`GitHub ${r.status}: cannot resolve commit for ${branch}`);
  const j = await r.json(); if (!/^[0-9a-f]{40}$/i.test(j.sha || "")) throw new Error("GitHub returned no commit SHA");
  return j.sha as string;
}
async function rawAt(owner: string, repo: string, sha: string, path: string, cap = 6000): Promise<string> {
  const r = await fetch(`${GH}/repos/${owner}/${repo}/contents/${path}?ref=${sha}`, { headers: { ...headers(), Accept: "application/vnd.github.raw+json" } });
  return r.ok ? (await r.text()).slice(0, cap) : "";
}
export async function fetchRepo(owner: string, repo: string, pinnedSha?: string) {
  const metaR = await fetch(`${GH}/repos/${owner}/${repo}`, { headers: headers() });
  if (!metaR.ok) throw new Error(`GitHub ${metaR.status}: repository not found or rate-limited`);
  const meta = await metaR.json();
  const commitSha = pinnedSha && /^[0-9a-f]{40}$/i.test(pinnedSha) ? pinnedSha : await resolveCommit(owner, repo, meta.default_branch);
  const [langR, treeR] = await Promise.all([fetch(`${GH}/repos/${owner}/${repo}/languages`, { headers: headers() }), fetch(`${GH}/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`, { headers: headers() })]);
  const languages = langR.ok ? Object.keys(await langR.json()) : [];
  let files: string[] = []; let truncated = false;
  if (treeR.ok) { const t = await treeR.json(); truncated = Boolean(t.truncated); files = (t.tree || []).filter((x: { type: string }) => x.type === "blob").map((x: { path: string }) => x.path).slice(0, 400); }
  const readme = files.includes("README.md") ? await rawAt(owner, repo, commitSha, "README.md", 12000) : "";
  let pkg: Record<string, unknown> | null = null; let pyproject = "";
  if (files.includes("package.json")) { try { pkg = JSON.parse(await rawAt(owner, repo, commitSha, "package.json")); } catch { pkg = null; } }
  const pyFile = files.includes("pyproject.toml") ? "pyproject.toml" : files.includes("setup.py") ? "setup.py" : "";
  if (pyFile) pyproject = await rawAt(owner, repo, commitSha, pyFile, 4000);
  const licPath = files.find((f) => /^(LICENSE|LICENCE|COPYING)(\.|$)/i.test(f));
  const licenseText = licPath ? await rawAt(owner, repo, commitSha, licPath, 2000) : "";
  const licenseEvidence = licPath ? `${licPath}@${commitSha.slice(0, 7)}: ${licenseText.split("\n")[0].slice(0, 80)}` : null;
  // Bounded source evidence: entry manifests' likely source files only.
  const srcPaths = files.filter((f) => /(^|\/)(index|main|cli|__init__|__main__)\.(ts|js|py)$/.test(f) || (pkg?.main && f === String((pkg as { main?: string }).main))).slice(0, 8);
  const sources: { path: string; content: string }[] = [];
  for (const p of srcPaths) { const c = await rawAt(owner, repo, commitSha, p, 6000); if (c) sources.push({ path: p, content: c }); }
  return { fullName: meta.full_name, description: meta.description ?? "", stars: meta.stargazers_count, forks: meta.forks_count, language: meta.language ?? languages[0] ?? "—", languages, license: meta.license?.spdx_id ?? "None listed", licenseEvidence, defaultBranch: meta.default_branch, commitSha, sha: commitSha, treeTruncated: truncated, htmlUrl: meta.html_url, topics: meta.topics ?? [], readme, updatedAt: meta.updated_at, openIssues: meta.open_issues_count, files, pkg, pyproject, sources };
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
