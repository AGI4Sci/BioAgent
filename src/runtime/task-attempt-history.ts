import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { TaskAttemptRecord } from './runtime-types.js';
import { fileExists } from './workspace-task-runner.js';

export async function appendTaskAttempt(workspacePath: string, record: TaskAttemptRecord) {
  const workspace = resolve(workspacePath || process.cwd());
  const path = join(workspace, '.bioagent', 'task-attempts', `${safeName(record.id)}.json`);
  await mkdir(dirname(path), { recursive: true });
  const previous = await readAttempts(path);
  const attempts = [
    ...previous.filter((item) => item.attempt !== record.attempt),
    record,
  ].sort((left, right) => left.attempt - right.attempt);
  await writeFile(path, JSON.stringify({
    id: record.id,
    prompt: record.prompt,
    skillDomain: record.skillDomain,
    scenarioPackageRef: record.scenarioPackageRef,
    skillPlanRef: record.skillPlanRef,
    uiPlanRef: record.uiPlanRef,
    routeDecision: record.routeDecision,
    updatedAt: new Date().toISOString(),
    attempts,
  }, null, 2));
  return path;
}

export async function readTaskAttempts(workspacePath: string, id: string): Promise<TaskAttemptRecord[]> {
  const workspace = resolve(workspacePath || process.cwd());
  return readAttempts(join(workspace, '.bioagent', 'task-attempts', `${safeName(id)}.json`));
}

export async function readRecentTaskAttempts(workspacePath: string, skillDomain?: string, limit = 8): Promise<TaskAttemptRecord[]> {
  const workspace = resolve(workspacePath || process.cwd());
  const dir = join(workspace, '.bioagent', 'task-attempts');
  if (!await fileExists(dir)) return [];
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const groups = await Promise.all(files
    .filter((file) => file.endsWith('.json'))
    .map((file) => readAttempts(join(dir, file))));
  return groups
    .flat()
    .filter((attempt) => !skillDomain || attempt.skillDomain === skillDomain)
    .sort((left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''))
    .slice(0, limit);
}

async function readAttempts(path: string): Promise<TaskAttemptRecord[]> {
  if (!await fileExists(path)) return [];
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(parsed.attempts) ? parsed.attempts : [];
  } catch {
    return [];
  }
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}
