import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { BioAgentProfile, GatewayRequest, SkillAvailability, SkillManifest } from './runtime-types.js';
import { fileExists } from './workspace-task-runner.js';

const SEED_SKILLS_ROOT = resolve(process.cwd(), 'skills', 'seed');

export async function loadSkillRegistry(request: Pick<GatewayRequest, 'workspacePath'>): Promise<SkillAvailability[]> {
  const workspace = resolve(request.workspacePath || process.cwd());
  const roots = [
    { root: SEED_SKILLS_ROOT, kind: 'seed' as const },
    { root: join(workspace, '.bioagent', 'skills'), kind: 'workspace' as const },
    { root: resolve(process.cwd(), 'skills', 'installed'), kind: 'installed' as const },
  ];
  const skills: SkillAvailability[] = [];
  for (const { root, kind } of roots) {
    for (const manifestPath of await manifestFiles(root)) {
      const manifest = await readManifest(manifestPath, kind);
      const availability = await validateManifest(manifest, manifestPath);
      skills.push(availability);
    }
  }
  await persistWorkspaceSkillStatus(workspace, skills);
  return skills;
}

export function matchSkill(request: GatewayRequest, skills: SkillAvailability[]): SkillAvailability | undefined {
  const allowed = new Set(request.availableSkills?.filter(Boolean) ?? []);
  const prompt = request.prompt.toLowerCase();
  return skills
    .filter((skill) => skill.available)
    .filter((skill) => !allowed.size || allowed.has(skill.id))
    .filter((skill) => skill.manifest.profiles.includes(request.profile))
    .filter((skill) => skill.manifest.entrypoint.type !== 'inspector' || request.artifacts.length > 0 || /\b(inspect|preview|open|log|file|table|json)\b/i.test(request.prompt))
    .map((skill) => ({ skill, score: scoreSkill(skill.manifest, request.profile, prompt) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || priority(left.skill.kind) - priority(right.skill.kind))[0]?.skill;
}

export function agentServerGenerationSkill(profile: BioAgentProfile): SkillAvailability {
  const checkedAt = new Date().toISOString();
  return {
    id: `agentserver.generate.${profile}`,
    kind: 'legacy',
    available: true,
    reason: 'No executable skill matched; caller should fall through to AgentServer task generation.',
    checkedAt,
    manifestPath: 'agentserver://generation',
    manifest: {
      id: `agentserver.generate.${profile}`,
      kind: 'legacy',
      description: 'Generic AgentServer task generation fallback.',
      profiles: [profile],
      inputContract: { prompt: 'string', workspacePath: 'string' },
      outputArtifactSchema: { type: 'runtime-artifact' },
      entrypoint: { type: 'agentserver-generation' },
      environment: { runtime: 'AgentServer' },
      validationSmoke: { mode: 'delegated' },
      examplePrompts: [],
      promotionHistory: [],
    },
  };
}

async function manifestFiles(root: string): Promise<string[]> {
  if (!await fileExists(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await manifestFiles(path));
    if (entry.isFile() && entry.name === 'skill.json') files.push(path);
  }
  return files;
}

async function readManifest(path: string, kind: SkillManifest['kind']): Promise<SkillManifest> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<SkillManifest>;
  return {
    id: String(parsed.id || ''),
    kind: parsed.kind ?? kind,
    description: String(parsed.description || ''),
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles as BioAgentProfile[] : [],
    inputContract: recordOrEmpty(parsed.inputContract),
    outputArtifactSchema: recordOrEmpty(parsed.outputArtifactSchema),
    entrypoint: recordOrEmpty(parsed.entrypoint) as SkillManifest['entrypoint'],
    environment: recordOrEmpty(parsed.environment),
    validationSmoke: recordOrEmpty(parsed.validationSmoke),
    examplePrompts: Array.isArray(parsed.examplePrompts) ? parsed.examplePrompts.map(String) : [],
    promotionHistory: Array.isArray(parsed.promotionHistory) ? parsed.promotionHistory.filter(isRecord) : [],
    scopeDeclaration: isRecord(parsed.scopeDeclaration) ? parsed.scopeDeclaration : undefined,
  };
}

async function validateManifest(manifest: SkillManifest, manifestPath: string): Promise<SkillAvailability> {
  const checkedAt = new Date().toISOString();
  const missing = ['id', 'description', 'inputContract', 'outputArtifactSchema', 'entrypoint', 'environment', 'validationSmoke', 'examplePrompts', 'promotionHistory']
    .filter((key) => !(key in manifest) || manifest[key as keyof SkillManifest] === undefined || manifest[key as keyof SkillManifest] === '');
  if (missing.length) {
    return { id: manifest.id || manifestPath, kind: manifest.kind, available: false, reason: `Manifest missing ${missing.join(', ')}`, checkedAt, manifestPath, manifest };
  }
  if (!manifest.profiles.length) {
    return { id: manifest.id, kind: manifest.kind, available: false, reason: 'Manifest profiles is empty', checkedAt, manifestPath, manifest };
  }
  if (manifest.entrypoint.type === 'workspace-task' && manifest.entrypoint.path) {
    const path = resolve(dirname(manifestPath), manifest.entrypoint.path);
    if (!await fileExists(path)) {
      return { id: manifest.id, kind: manifest.kind, available: false, reason: `Entrypoint not found: ${path}`, checkedAt, manifestPath, manifest };
    }
  }
  return { id: manifest.id, kind: manifest.kind, available: true, reason: 'Manifest validation passed', checkedAt, manifestPath, manifest };
}

async function persistWorkspaceSkillStatus(workspace: string, skills: SkillAvailability[]) {
  const statusPath = join(workspace, '.bioagent', 'skills', 'status.json');
  await mkdir(dirname(statusPath), { recursive: true });
  await writeFile(statusPath, JSON.stringify({
    updatedAt: new Date().toISOString(),
    skills: skills.map((skill) => ({
      id: skill.id,
      kind: skill.kind,
      available: skill.available,
      reason: skill.reason,
      checkedAt: skill.checkedAt,
      manifestPath: skill.manifestPath,
    })),
  }, null, 2));
}

function scoreSkill(manifest: SkillManifest, profile: BioAgentProfile, prompt: string) {
  let score = manifest.profiles.includes(profile) ? 10 : 0;
  for (const item of manifest.examplePrompts) {
    const tokens = item.toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length > 2);
    score += tokens.filter((token) => prompt.includes(token)).length;
  }
  const text = `${manifest.id} ${manifest.description}`.toLowerCase();
  for (const token of prompt.split(/[^a-z0-9_]+/).filter((item) => item.length > 2)) {
    if (text.includes(token)) score += 0.5;
  }
  return score;
}

function priority(kind: SkillManifest['kind']) {
  return kind === 'seed' ? 0 : kind === 'workspace' ? 1 : kind === 'installed' ? 2 : 3;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
