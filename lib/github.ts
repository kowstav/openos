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
  return {
    fullName: meta.full_name, description: meta.description ?? "", stars: meta.stargazers_count,
    forks: meta.forks_count, language: meta.language ?? languages[0] ?? "—", languages,
    license: meta.license?.spdx_id ?? "None listed", defaultBranch: meta.default_branch,
    sha: meta.pushed_at ?? "", htmlUrl: meta.html_url, topics: meta.topics ?? [], readme,
    updatedAt: meta.updated_at, openIssues: meta.open_issues_count,
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
