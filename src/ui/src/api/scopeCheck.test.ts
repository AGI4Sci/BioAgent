import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { promptWithScopeCheck, scopeCheck } from './scopeCheck';

describe('scopeCheck', () => {
  it('builds a conservative handoff plan for cross-domain prompts', () => {
    const result = scopeCheck(
      'omics-differential-exploration',
      'Assess CRISPR screen efficiency, TP53 conservation, protein structure, and literature evidence.',
    );

    assert.equal(result.inScope, false);
    assert.ok(result.matchedScenarios.includes('omics-differential-exploration'));
    assert.ok(result.matchedScenarios.includes('structure-exploration'));
    assert.ok(result.matchedScenarios.includes('literature-evidence-review'));
    assert.ok(result.handoffTargets.includes('literature-evidence-review'));
    assert.match(result.promptPrefix, /staged plan/i);
    assert.match(result.promptPrefix, /Do not collapse this into an unverified giant script/i);
  });

  it('leaves narrow in-scope prompts untouched', () => {
    const prompt = 'TP53 tumor suppressor reviews';
    assert.equal(promptWithScopeCheck('literature-evidence-review', prompt), prompt);
  });

  it('does not treat CRISPR editing literature about stem cells as an omics handoff', () => {
    const prompt = 'CRISPR base editing off-target detection in hematopoietic stem cells';
    const result = scopeCheck('literature-evidence-review', prompt);

    assert.equal(result.inScope, true);
    assert.equal(result.handoffTargets.includes('omics-differential-exploration'), false);
    assert.equal(promptWithScopeCheck('literature-evidence-review', prompt), prompt);
  });
});
