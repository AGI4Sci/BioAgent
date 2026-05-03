import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runWorkspaceTask } from '../../src/runtime/workspace-task-runner.js';

const workspace = await mkdtemp(join(tmpdir(), 'sciforge-entrypoint-args-'));
await mkdir(join(workspace, '.sciforge', 'tasks'), { recursive: true });
await writeFile(join(workspace, '.sciforge', 'tasks', 'flag_task.py'), [
  'import argparse, json, os',
  'parser = argparse.ArgumentParser()',
  'parser.add_argument("--inputPath", required=True)',
  'parser.add_argument("--outputPath", required=True)',
  'args = parser.parse_args()',
  'with open(args.outputPath, "w", encoding="utf-8") as f:',
  '    json.dump({"inputExists": os.path.exists(args.inputPath)}, f)',
].join('\n'));

const result = await runWorkspaceTask(workspace, {
  id: 'flag-entrypoint',
  language: 'python',
  entrypoint: 'python3 .sciforge/tasks/flag_task.py --inputPath <inputPath> --outputPath <outputPath>',
  entrypointArgs: ['--inputPath', '<inputPath>', '--outputPath', '<outputPath>'],
  taskRel: '.sciforge/tasks/flag_task.py',
  input: { prompt: 'hello' },
  outputRel: '.sciforge/task-results/flag-entrypoint.json',
  stdoutRel: '.sciforge/logs/flag-entrypoint.stdout.log',
  stderrRel: '.sciforge/logs/flag-entrypoint.stderr.log',
});

assert.equal(result.exitCode, 0);
assert.deepEqual(JSON.parse(await readFile(join(workspace, result.outputRef), 'utf8')), {
  inputExists: true,
});

await writeFile(join(workspace, '.sciforge', 'tasks', 'inferred_flag_task.py'), [
  'import argparse, json',
  'parser = argparse.ArgumentParser()',
  'parser.add_argument("--inputPath", required=False)',
  'parser.add_argument("--outputPath", required=True)',
  'args = parser.parse_args()',
  'with open(args.outputPath, "w", encoding="utf-8") as f:',
  '    json.dump({"usedOutputFlag": True, "hasInput": bool(args.inputPath)}, f)',
].join('\n'));

const inferred = await runWorkspaceTask(workspace, {
  id: 'inferred-flag-entrypoint',
  language: 'python',
  entrypoint: 'main',
  taskRel: '.sciforge/tasks/inferred_flag_task.py',
  inputArgMode: 'empty-data-path',
  input: { prompt: 'hello' },
  outputRel: '.sciforge/task-results/inferred-flag-entrypoint.json',
  stdoutRel: '.sciforge/logs/inferred-flag-entrypoint.stdout.log',
  stderrRel: '.sciforge/logs/inferred-flag-entrypoint.stderr.log',
});

assert.equal(inferred.exitCode, 0);
assert.deepEqual(JSON.parse(await readFile(join(workspace, inferred.outputRef), 'utf8')), {
  usedOutputFlag: true,
  hasInput: false,
});

console.log('[ok] workspace task runner supports explicit and inferred generated entrypoint flag args');
