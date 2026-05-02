import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { DeepRunManifest } from './deep-test-manifest';
import { getLongformNextRound, loadLongformScenarioScripts, type LongformNextRound } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(resolve(options.manifestPath), 'utf8')) as DeepRunManifest;
  const scripts = await loadLongformScenarioScripts(options.scriptsDir ? resolve(options.scriptsDir) : undefined);
  const script = scripts.find((item) => item.scenarioId === manifest.scenarioId);
  const next = getLongformNextRound(manifest, script);
  if (options.json) {
    console.log(JSON.stringify(next, null, 2));
  } else {
    console.log(renderNextRound(next));
  }
}

interface CliOptions {
  manifestPath: string;
  scriptsDir?: string;
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
    } else if (arg === '--scripts-dir') {
      options.scriptsDir = readValue(args, index, arg);
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

function renderNextRound(next: LongformNextRound) {
  const lines = [
    `# ${next.scenarioId}`,
    '',
    next.title,
    '',
    `Run: ${next.runId}`,
    `Status: ${next.manifestStatus}`,
    `Progress: ${next.progress.completedRounds}/${next.progress.totalRounds}`,
    `App URL: ${next.appUrl ?? 'http://localhost:5173/'}`,
    '',
  ];
  if (!next.round) {
    lines.push('All rounds are complete or no runnable round is available.');
    return lines.join('\n');
  }
  lines.push(`## Next Round ${next.round.round}`, '');
  lines.push(next.round.userPrompt, '');
  if (next.referenceOps.length) {
    lines.push('Reference operations:');
    for (const op of next.referenceOps) {
      lines.push(`- ${formatReferenceOperation(op)}`);
    }
    lines.push('');
  }
  if (next.expectedArtifacts.length) {
    lines.push(`Expected artifacts: ${next.expectedArtifacts.join(', ')}`, '');
  }
  if (next.acceptanceChecks.length) {
    lines.push('Acceptance checks:');
    for (const check of next.acceptanceChecks) lines.push(`- ${check}`);
    lines.push('');
  }
  if (next.recordCommand) {
    lines.push('Record command after the browser round:', '');
    lines.push('```sh');
    lines.push(next.recordCommand);
    lines.push('```');
  }
  return lines.join('\n');
}

function formatReferenceOperation(op: LongformNextRound['referenceOps'][number]) {
  return [
    op.marker ? `${op.marker}` : '',
    op.kind,
    `source=${op.source}`,
    op.requiredPayload?.length ? `payload=${op.requiredPayload.join(',')}` : '',
    op.expectedHighlight ? `highlight=${op.expectedHighlight}` : '',
  ].filter(Boolean).join(' ');
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/longform-next-round.ts --manifest <path> [options]

Prints the next runnable T060 longform round from a pending manifest.

Options:
  --manifest <path>       Manifest JSON to inspect.
  --scripts-dir <dir>     Longform script root. Defaults to tests/longform/scenarios.
  --json                  Print JSON instead of Markdown.
`);
}
