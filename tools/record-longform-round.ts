import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { recordLongformRoundObservation, type RecordLongformRoundOptions } from './longform-regression';
import type { DeepRunStatus } from './deep-test-manifest';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await recordLongformRoundObservation({
    ...options,
    manifestPath: resolve(options.manifestPath),
  });
  const round = manifest.rounds.find((item) => item.round === options.round);
  console.log(`[ok] recorded round ${options.round} as ${options.status}`);
  console.log(`[ok] manifest status: ${manifest.status}`);
  console.log(`[ok] refs: artifacts=${round?.artifactRefs?.length ?? 0}, executions=${round?.executionUnitRefs?.length ?? 0}, screenshots=${round?.screenshotRefs?.length ?? 0}`);
}

interface CliOptions extends RecordLongformRoundOptions {
  manifestPath: string;
  round: number;
  status: DeepRunStatus;
  observedBehavior: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    artifactRefs: [],
    executionUnitRefs: [],
    screenshotRefs: [],
    updateRunStatus: true,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--manifest') {
      options.manifestPath = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--round') {
      options.round = Number(readValue(args, index, arg));
      index += 1;
    } else if (arg === '--status') {
      options.status = readValue(args, index, arg) as DeepRunStatus;
      index += 1;
    } else if (arg === '--observed') {
      options.observedBehavior = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--artifact-ref') {
      options.artifactRefs?.push(readValue(args, index, arg));
      index += 1;
    } else if (arg === '--execution-ref') {
      options.executionUnitRefs?.push(readValue(args, index, arg));
      index += 1;
    } else if (arg === '--screenshot-ref') {
      options.screenshotRefs?.push(readValue(args, index, arg));
      index += 1;
    } else if (arg === '--completed-at') {
      options.completedAt = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--no-update-run-status') {
      options.updateRunStatus = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.manifestPath) throw new Error('--manifest is required');
  if (!Number.isFinite(options.round)) throw new Error('--round is required');
  if (!options.status) throw new Error('--status is required');
  if (!['passed', 'failed', 'repair-needed', 'not-run'].includes(options.status)) throw new Error('--status must be passed, failed, repair-needed, or not-run');
  if (!options.observedBehavior) throw new Error('--observed is required');
  return options as CliOptions;
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/record-longform-round.ts --manifest <path> --round <n> --status <status> --observed <text> [refs]

Updates one round in a T060 longform manifest after a real browser turn.

Options:
  --manifest <path>       Manifest JSON to update.
  --round <n>             Round number.
  --status <status>       passed | failed | repair-needed | not-run.
  --observed <text>       Observed behavior for the round.
  --artifact-ref <ref>    Add an artifact ref. Repeatable.
  --execution-ref <ref>   Add an execution/log ref. Repeatable.
  --screenshot-ref <ref>  Add a screenshot ref. Repeatable.
  --completed-at <iso>    Completion time used if all rounds become passed.
  --no-update-run-status  Do not infer top-level manifest status from rounds.
`);
}
