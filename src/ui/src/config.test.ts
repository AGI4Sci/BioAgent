import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { defaultSciForgeConfig, loadSciForgeConfig, normalizeWorkspaceRootPath, saveSciForgeConfig, updateConfig } from './config';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

describe('SciForge config persistence', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('round-trips qwen/openrouter style model settings through localStorage', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: new MemoryStorage() },
    });

    const saved = updateConfig(defaultSciForgeConfig, {
      modelProvider: 'openrouter',
      modelBaseUrl: 'https://openrouter.ai/api/v1/',
      modelName: 'qwen/qwen3.6-plus:free',
      apiKey: 'test-key',
      maxContextWindowTokens: 128000,
    });

    saveSciForgeConfig(saved);
    const loaded = loadSciForgeConfig();

    assert.equal(loaded.modelProvider, 'openrouter');
    assert.equal(loaded.modelBaseUrl, 'https://openrouter.ai/api/v1');
    assert.equal(loaded.modelName, 'qwen/qwen3.6-plus:free');
    assert.equal(loaded.apiKey, 'test-key');
    assert.equal(loaded.maxContextWindowTokens, 128000);
  });

  it('normalizes accidental .sciforge internal paths back to the workspace root', () => {
    const root = '/Applications/workspace/ailab/research/app/SciForge/workspace';

    assert.equal(normalizeWorkspaceRootPath(`${root}/.sciforge/tasks/.sciforge/logs`), root);
    assert.equal(normalizeWorkspaceRootPath(`${root}/.sciforge`), root);
    assert.equal(updateConfig(defaultSciForgeConfig, { workspacePath: `${root}/.sciforge/tasks/run-1` }).workspacePath, root);
  });

  it('preserves gemini as a selectable AgentBackend', () => {
    const config = updateConfig(defaultSciForgeConfig, { agentBackend: 'gemini' });

    assert.equal(config.agentBackend, 'gemini');
  });

  it('normalizes user context window limits', () => {
    assert.equal(updateConfig(defaultSciForgeConfig, { maxContextWindowTokens: 64000 }).maxContextWindowTokens, 64000);
    assert.equal(updateConfig(defaultSciForgeConfig, { maxContextWindowTokens: 12 }).maxContextWindowTokens, 1000);
  });
});
