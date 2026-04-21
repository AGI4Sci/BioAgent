import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { promptWithScopeCheck, scopeCheck } from './scopeCheck';

describe('scopeCheck', () => {
  it('builds a conservative handoff plan for cross-domain prompts', () => {
    const result = scopeCheck(
      'omics',
      'Assess CRISPR screen efficiency, TP53 conservation, protein structure, and literature evidence.',
    );

    assert.equal(result.inScope, false);
    assert.ok(result.matchedAgents.includes('omics'));
    assert.ok(result.matchedAgents.includes('structure'));
    assert.ok(result.matchedAgents.includes('literature'));
    assert.ok(result.handoffTargets.includes('literature'));
    assert.match(result.promptPrefix, /staged plan/i);
    assert.match(result.promptPrefix, /Do not collapse this into an unverified giant script/i);
  });

  it('leaves narrow in-scope prompts untouched', () => {
    const prompt = 'TP53 tumor suppressor reviews';
    assert.equal(promptWithScopeCheck('literature', prompt), prompt);
  });
});

