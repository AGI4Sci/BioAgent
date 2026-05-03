import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadSkillRegistry } from '../../src/runtime/skill-registry.js';
import { runWorkspaceRuntimeGateway } from '../../src/runtime/workspace-runtime-gateway.js';
import type { SciForgeSkillDomain } from '../../src/runtime/runtime-types.js';

if (!process.env.SCP_HUB_API_KEY && !process.env.SCPhub_api_key && !process.env.SCPHUB_API_KEY) {
  throw new Error('Set SCP_HUB_API_KEY or SCPhub_api_key to run live SCP capability smoke tests.');
}

const workspace = await mkdtemp(join(tmpdir(), 'sciforge-scp-capability-'));
const skills = (await loadSkillRegistry({ workspacePath: workspace }))
  .filter((skill) => skill.id.startsWith('scp.') && skill.available)
  .sort((left, right) => left.id.localeCompare(right.id));

const limit = Number(process.env.SCP_LIVE_CAPABILITY_LIMIT || skills.length);
const selected = skills.slice(0, Math.max(1, Math.min(limit, skills.length)));
const rows: Array<{ id: string; status: string; artifactType: string; message: string }> = [];

for (const skill of selected) {
  const result = await runWorkspaceRuntimeGateway({
    skillDomain: (skill.manifest.skillDomains[0] || 'knowledge') as SciForgeSkillDomain,
    workspacePath: workspace,
    availableSkills: [skill.id],
    artifacts: [],
    prompt: `capability_probe=true tool discovery for ${skill.id}`,
  });
  const status = String(result.executionUnits[0]?.status || '');
  const artifactType = String(result.artifacts[0]?.type || '');
  assert.ok(['done', 'failed-with-reason', 'repair-needed'].includes(status), `${skill.id} returned unsupported status ${status}`);
  assert.ok(result.executionUnits[0]?.skillId === skill.id || String(result.reasoningTrace).includes(skill.id), `${skill.id} should be represented in execution output`);
  assert.ok(result.uiManifest.length > 0, `${skill.id} should include uiManifest`);
  rows.push({ id: skill.id, status, artifactType, message: result.message.slice(0, 180) });
  console.log(`[${status === 'done' ? 'ok' : 'blocked'}] ${skill.id} -> ${artifactType || 'no-artifact'} :: ${result.message.slice(0, 120)}`);
}

const done = rows.filter((row) => row.status === 'done').length;
const blocked = rows.length - done;
console.log(`[summary] probed ${rows.length}/${skills.length} SCP skills: ${done} live/discoverable, ${blocked} explicit blockers`);
