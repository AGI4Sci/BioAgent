import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeepRunManifest } from './deep-test-manifest';
import { buildLongformEvidenceCommandPlan, type LongformEvidenceCommandPlan } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(resolve(options.manifestPath), 'utf8')) as DeepRunManifest;
  const plan = buildLongformEvidenceCommandPlan(manifest);
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(renderPlan(plan));
  }
}

interface CliOptions {
  manifestPath: string;
  json: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--manifest') {
      options.manifestPath = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.manifestPath) throw new Error('--manifest is required');
  return options as CliOptions;
}

function renderPlan(plan: LongformEvidenceCommandPlan) {
  const lines = [
    `# ${plan.scenarioId}`,
    '',
    `Run: ${plan.runId}`,
    '',
    '## Round Commands',
    '',
  ];
  if (plan.roundCommands.length) {
    lines.push('```sh');
    for (const item of plan.roundCommands) lines.push(item.command);
    lines.push('```', '');
  } else {
    lines.push('No round commands needed.', '');
  }
  lines.push('## Top-Level Evidence', '', '```sh');
  for (const command of plan.evidenceCommands) lines.push(command);
  lines.push('```', '', '## Finalize', '', '```sh', plan.finalizeCommand, '```');
  return lines.join('\n');
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/longform-evidence-commands.ts --manifest <path> [options]

Prints command skeletons for recording T060 longform rounds, top-level evidence, and final scoring.

Options:
  --manifest <path>  Manifest JSON to inspect.
  --json             Print JSON instead of Markdown.
`);
}
