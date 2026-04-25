import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const sourceRoot = '/Applications/workspace/ailab/research/app/openteam-studio-run/agents/skills/scp';
const installedRoot = join(process.cwd(), 'skills', 'installed', 'scp');

const sourceDirs = await skillDirs(sourceRoot);
const installedDirs = await skillDirs(installedRoot);

assert.equal(installedDirs.length, sourceDirs.length, 'installed SCP skill count must match source');
assert.ok(installedDirs.length > 0, 'SCP skills should be installed');

for (const id of sourceDirs) {
  assert.ok(installedDirs.includes(id), `${id} should be installed`);
  const skillPath = join(installedRoot, id, 'SKILL.md');
  await access(skillPath);
  const text = await readFile(skillPath, 'utf8');
  assert.match(text, /^---\n[\s\S]*?\n---/, `${id} should preserve markdown frontmatter`);
}

for (const id of ['protein-properties-calculation', 'molecular-properties-calculation', 'sequence-alignment-pairwise']) {
  const manifestPath = join(installedRoot, id, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { id?: string; name?: string };
  assert.ok(manifest.id || manifest.name, `${id} manifest should expose an id or name`);
}

console.log(`[ok] installed ${installedDirs.length} SCP markdown skills under skills/installed/scp`);

async function skillDirs(root: string) {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
