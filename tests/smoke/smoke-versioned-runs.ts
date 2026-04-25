import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendTaskAttempt, readTaskAttempts } from '../../src/runtime/task-attempt-history';

const workspace = await mkdtemp(join(tmpdir(), 'bioagent-versioned-runs-'));
const id = 'scenario-version-ref-smoke';

await appendTaskAttempt(workspace, {
  id,
  prompt: 'version one prompt',
  skillDomain: 'literature',
  skillId: 'literature.pubmed_search',
  scenarioPackageRef: { id: 'custom-review', version: '1.0.0', source: 'workspace' },
  skillPlanRef: 'skill-plan.custom-review.v1',
  uiPlanRef: 'ui-plan.custom-review.v1',
  runtimeProfileId: 'workspace-python',
  routeDecision: {
    selectedSkill: 'literature.pubmed_search',
    selectedRuntime: 'workspace-python',
    selectedAt: '2026-04-25T00:00:00.000Z',
  },
  attempt: 1,
  status: 'done',
  createdAt: '2026-04-25T00:00:00.000Z',
});

await appendTaskAttempt(workspace, {
  id,
  prompt: 'version two prompt',
  skillDomain: 'literature',
  skillId: 'literature.pubmed_search',
  scenarioPackageRef: { id: 'custom-review', version: '2.0.0', source: 'workspace' },
  skillPlanRef: 'skill-plan.custom-review.v2',
  uiPlanRef: 'ui-plan.custom-review.v2',
  runtimeProfileId: 'workspace-python',
  routeDecision: {
    selectedSkill: 'literature.pubmed_search',
    selectedRuntime: 'workspace-python',
    fallbackReason: 'version-specific rerun',
    selectedAt: '2026-04-25T00:01:00.000Z',
  },
  attempt: 2,
  status: 'done',
  createdAt: '2026-04-25T00:01:00.000Z',
});

const attempts = await readTaskAttempts(workspace, id);
assert.equal(attempts.length, 2);
assert.equal(attempts[0].scenarioPackageRef?.version, '1.0.0');
assert.equal(attempts[1].scenarioPackageRef?.version, '2.0.0');
assert.equal(attempts[0].skillPlanRef, 'skill-plan.custom-review.v1');
assert.equal(attempts[1].uiPlanRef, 'ui-plan.custom-review.v2');
assert.equal(attempts[1].routeDecision?.fallbackReason, 'version-specific rerun');

console.log('[ok] versioned run attempts retain scenario package and plan refs');
