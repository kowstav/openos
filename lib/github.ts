const GH = "https://api.github.com";
function headers() {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "OpenOS/0.1" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const m = input.trim().match(/(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/);
  if (!m || m[1] === "github.com") return null;
  return { owner: m[1], repo: m[2] };
}
export async function fetchRepo(owner: string, repo: string) {
  const [r, langR, readmeR] = await Promise.all([
    fetch(`${GH}/repos/${owner}/${repo}`, { headers: headers(), next: { revalidate: 300 } }),
    fetch(`${GH}/repos/${owner}/${repo}/languages`, { headers: headers(), next: { revalidate: 300 } }),
    fetch(`${GH}/repos/${owner}/${repo}/readme`, { headers: { ...headers(), Accept: "application/vnd.github.raw+json" }, next: { revalidate: 300 } }),
  ]);
  if (!r.ok) throw new Error(`GitHub ${r.status}: repository not found or rate-limited`);
  const meta = await r.json();
  const languages = langR.ok ? Object.keys(await langR.json()) : [];
  const readme = readmeR.ok ? (await readmeR.text()).slice(0, 12000) : "";
  let files: string[] = []; let pkg: Record<string, unknown> | null = null; let pyproject = "";
  try {
    const treeR = await fetch(`${GH}/repos/${owner}/${repo}/git/trees/${meta.default_branch}?recursive=1`, { headers: headers(), next: { revalidate: 300 } });
    if (treeR.ok) { const t = await treeR.json(); files = (t.tree || []).filter((x: { type: string }) => x.type === "blob").map((x: { path: string }) => x.path).slice(0, 400); }
    if (files.includes("package.json")) { const pR = await fetch(`${GH}/repos/${owner}/${repo}/contents/package.json`, { headers: { ...headers(), Accept: "application/vnd.github.raw+json" }, next: { revalidate: 300 } }); if (pR.ok) pkg = JSON.parse(await pR.text()); }
    const pyFile = files.includes("pyproject.toml") ? "pyproject.toml" : files.includes("setup.py") ? "setup.py" : "";
    if (pyFile) { const pR = await fetch(`${GH}/repos/${owner}/${repo}/contents/${pyFile}`, { headers: { ...headers(), Accept: "application/vnd.github.raw+json" }, next: { revalidate: 300 } }); if (pR.ok) pyproject = (await pR.text()).slice(0, 4000); }
  } catch { /* tree is best-effort evidence */ }
  return {
    fullName: meta.full_name, description: meta.description ?? "", stars: meta.stargazers_count,
    forks: meta.forks_count, language: meta.language ?? languages[0] ?? "—", languages,
    license: meta.license?.spdx_id ?? "None listed", defaultBranch: meta.default_branch,
    sha: meta.pushed_at ?? "", htmlUrl: meta.html_url, topics: meta.topics ?? [], readme,
    updatedAt: meta.updated_at, openIssues: meta.open_issues_count, files, pkg, pyproject,
  };
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
