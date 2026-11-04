import { promises as fs } from "fs"; import path from "path";
// Runtime skill registry: the same audited .agents/skills used by Muse
// are loaded by the deployed conversion pipeline and recorded per job.
export const SKILL_NAMES = ["repository-intelligence", "appification", "environment-builder", "interface-design", "workflow-composer", "sandbox-security", "permission-broker", "verification", "failure-recovery", "software-alternatives", "deployment"] as const;
export type SkillName = (typeof SKILL_NAMES)[number];
export type Skill = { name: SkillName; description: string; body: string };
const cache = new Map<string, Skill>();
export async function loadSkill(name: SkillName): Promise<Skill> {
  const hit = cache.get(name); if (hit) return hit;
  const raw = await fs.readFile(path.join(process.cwd(), ".agents", "skills", name, "SKILL.md"), "utf8");
  const desc = raw.match(/description:\s*(.+)/)?.[1]?.trim() || name;
  const skill = { name, description: desc, body: raw }; cache.set(name, skill); return skill;
}
export async function loadSkills(names: SkillName[]): Promise<Skill[]> { return Promise.all(names.map(loadSkill)); }
export function skillsForStrategy(strategy: string): SkillName[] {
  const base: SkillName[] = ["repository-intelligence", "appification", "interface-design", "workflow-composer", "sandbox-security", "permission-broker", "verification", "deployment"];
  if (strategy === "js-library" || strategy === "python-library" || strategy === "python-cli") return [...base.slice(0, 2), "environment-builder", ...base.slice(2), "failure-recovery"];
  return base;
}
