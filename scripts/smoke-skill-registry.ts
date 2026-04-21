import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadSkillRegistry, matchSkill } from './skill-registry.js';
import type { SkillAvailability } from './runtime-types.js';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-skill-registry-'));
const brokenSkillDir = join(workspace, '.bioagent', 'skills', 'broken.skill');
await mkdir(brokenSkillDir, { recursive: true });
await writeFile(join(brokenSkillDir, 'skill.json'), JSON.stringify({
  id: 'broken.skill',
  kind: 'workspace',
  description: 'Broken workspace skill used by registry smoke.',
  profiles: ['literature'],
  inputContract: { prompt: 'string' },
  outputArtifactSchema: { type: 'paper-list' },
  entrypoint: { type: 'workspace-task', command: 'python', path: './missing-task.py' },
  environment: { language: 'python' },
  validationSmoke: { mode: 'workspace-task', prompt: 'KRAS', expectedArtifactType: 'paper-list' },
  examplePrompts: ['KRAS literature broken skill'],
  promotionHistory: [],
}, null, 2));

const skills = await loadSkillRegistry({ workspacePath: workspace });
const byId = new Map(skills.map((skill) => [skill.id, skill]));

for (const id of [
  'literature.pubmed_search',
  'structure.rcsb_latest_or_entry',
  'omics.differential_expression',
  'knowledge.uniprot_chembl_lookup',
  'inspector.generic_file_table_log',
]) {
  assert.equal(byId.get(id)?.available, true, `${id} should be available`);
}

const broken = byId.get('broken.skill');
assert.equal(broken?.available, false);
assert.match(String(broken?.reason), /Entrypoint not found/);

const matched = matchSkill({
  profile: 'literature',
  prompt: 'KRAS literature broken skill',
  workspacePath: workspace,
  artifacts: [],
  availableSkills: ['broken.skill'],
}, skills);
assert.equal(matched, undefined, 'unavailable skills must not be matched even when explicitly allowed');

const status = JSON.parse(await readFile(join(workspace, '.bioagent', 'skills', 'status.json'), 'utf8')) as {
  skills: Array<Pick<SkillAvailability, 'id' | 'available' | 'reason'>>;
};
const statusBroken = status.skills.find((skill) => skill.id === 'broken.skill');
assert.equal(statusBroken?.available, false);
assert.match(String(statusBroken?.reason), /Entrypoint not found/);

console.log('[ok] skill registry smoke writes status and excludes unavailable workspace skills');
