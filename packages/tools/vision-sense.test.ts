import assert from 'node:assert/strict';
import { test } from 'node:test';

import { skillPackageManifests } from '../skills';
import { toolPackageManifests } from './index';

test('vision sense package is discoverable as a visual runtime tool', () => {
  const visionTool = toolPackageManifests.find((tool) => tool.id === 'local.vision-sense');

  assert.ok(visionTool);
  assert.equal(visionTool.toolType, 'sense-plugin');
  assert.equal(visionTool.packageRoot, 'packages/senses/vision-sense');
  assert.ok(visionTool.tags.includes('modality:vision'));
  assert.ok(visionTool.requiredConfig?.includes('gui-executor'));
  assert.equal(visionTool.sensePlugin?.inputContract.textField, 'text');
  assert.equal(visionTool.sensePlugin?.inputContract.modalitiesField, 'modalities');
  assert.ok(visionTool.sensePlugin?.inputContract.acceptedModalities.includes('screenshot'));
  assert.equal(visionTool.sensePlugin?.outputContract.kind, 'text');
  assert.ok(visionTool.sensePlugin?.outputContract.formats.includes('text/x-computer-use-command'));
  assert.equal(visionTool.sensePlugin?.executionBoundary, 'text-signal-only');
  assert.equal(visionTool.sensePlugin?.safety.highRiskPolicy, 'reject');
});

test('vision gui task skill points to the VisionTaskRequest template', () => {
  const visionSkill = skillPackageManifests.find((skill) => skill.id === 'vision-gui-task');

  assert.ok(visionSkill);
  assert.equal(
    visionSkill.inputContract.visionTaskRequest,
    'packages/senses/vision-sense/sciforge_vision_sense/types.py:VisionTaskRequest',
  );
  assert.ok(visionSkill.requiredCapabilities.some((item) => item.capability === 'vision-sense'));
});
