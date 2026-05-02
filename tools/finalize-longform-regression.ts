import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeLongformRegression, validateLongformRunManifest, type FinalizeLongformRegressionOptions } from './longform-regression';
import { deepCoverageStages, deepRunStatuses, type DeepCoverageStage, type DeepRunStatus } from './deep-test-manifest';
import type { DeepRunFailurePoint, DeepRunQualityScores } from './deep-test-manifest';

type NumericScoreKey = Exclude<keyof DeepRunQualityScores, 'rationale'>;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await finalizeLongformRegression({
    ...options,
    manifestPath: resolve(options.manifestPath),
  });
  const quality = validateLongformRunManifest(manifest);
  console.log(`[ok] finalized ${manifest.scenarioId} as ${manifest.status}`);
  console.log(`[ok] coverage stage: ${manifest.coverageStage}`);
  console.log(`[ok] quality gate: ${quality.pass ? 'pass' : 'needs-attention'}`);
  if (quality.issues.length) {
    for (const issue of quality.issues) console.log(`- ${issue}`);
  }
}

interface CliOptions extends FinalizeLongformRegressionOptions {
  manifestPath: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {};
  const qualityScores: Partial<DeepRunQualityScores> = {};
  const failurePoint: Partial<DeepRunFailurePoint> = {};
  let hasFailurePoint = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--manifest') {
      options.manifestPath = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--status') {
      options.status = readEnum(readValue(args, index, arg), deepRunStatuses, '--status') as DeepRunStatus;
      index += 1;
    } else if (arg === '--coverage-stage') {
      options.coverageStage = readEnum(readValue(args, index, arg), deepCoverageStages, '--coverage-stage') as DeepCoverageStage;
      index += 1;
    } else if (arg === '--completed-at') {
      options.completedAt = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--notes') {
      options.notes = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--replace-notes') {
      options.appendNotes = false;
    } else if (arg === '--score-rationale') {
      qualityScores.rationale = readValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith('--score-')) {
      const key = scoreKeyFromArg(arg);
      qualityScores[key] = readScore(readValue(args, index, arg), arg);
      index += 1;
    } else if (arg === '--failure-id') {
      failurePoint.id = readValue(args, index, arg);
      hasFailurePoint = true;
      index += 1;
    } else if (arg === '--failure-round') {
      failurePoint.round = readNumber(readValue(args, index, arg), arg);
      hasFailurePoint = true;
      index += 1;
    } else if (arg === '--failure-severity') {
      failurePoint.severity = readEnum(readValue(args, index, arg), ['info', 'warning', 'error', 'blocker'], arg) as DeepRunFailurePoint['severity'];
      hasFailurePoint = true;
      index += 1;
    } else if (arg === '--failure-category') {
      failurePoint.category = readEnum(
        readValue(args, index, arg),
        ['protocol', 'model', 'runtime', 'data', 'artifact-schema', 'ui', 'scientific-quality', 'other'],
        arg,
      ) as DeepRunFailurePoint['category'];
      hasFailurePoint = true;
      index += 1;
    } else if (arg === '--failure-summary') {
      failurePoint.summary = readValue(args, index, arg);
      hasFailurePoint = true;
      index += 1;
    } else if (arg === '--failure-evidence-ref') {
      failurePoint.evidenceRefs = [...(failurePoint.evidenceRefs ?? []), readValue(args, index, arg)];
      hasFailurePoint = true;
      index += 1;
    } else if (arg === '--failure-repair-action') {
      failurePoint.repairAction = readValue(args, index, arg);
      hasFailurePoint = true;
      index += 1;
    } else if (arg === '--failure-resolved') {
      failurePoint.resolved = true;
      hasFailurePoint = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.manifestPath) throw new Error('--manifest is required');
  if (Object.keys(qualityScores).length) options.qualityScores = qualityScores;
  if (hasFailurePoint) options.failurePoint = completeFailurePoint(failurePoint);
  return options as CliOptions;
}

function completeFailurePoint(failurePoint: Partial<DeepRunFailurePoint>): DeepRunFailurePoint {
  if (!failurePoint.id) throw new Error('--failure-id is required when recording a failure point');
  if (!failurePoint.summary) throw new Error('--failure-summary is required when recording a failure point');
  return {
    id: failurePoint.id,
    round: failurePoint.round,
    severity: failurePoint.severity ?? 'blocker',
    category: failurePoint.category ?? 'runtime',
    summary: failurePoint.summary,
    evidenceRefs: failurePoint.evidenceRefs,
    repairAction: failurePoint.repairAction,
    resolved: failurePoint.resolved ?? false,
  };
}

function scoreKeyFromArg(arg: string): NumericScoreKey {
  const key = arg.slice('--score-'.length).replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
  if (!['taskCompletion', 'reproducibility', 'dataAuthenticity', 'artifactSchema', 'selfHealing', 'reportQuality', 'overall'].includes(key)) {
    throw new Error(`Unknown score field: ${arg}`);
  }
  return key as NumericScoreKey;
}

function readScore(value: string, name: string) {
  const number = readNumber(value, name);
  if (number < 1 || number > 5) throw new Error(`${name} must be between 1 and 5`);
  return number;
}

function readNumber(value: string, name: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a number`);
  return number;
}

function readEnum(value: string, allowed: readonly string[], name: string) {
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/finalize-longform-regression.ts --manifest <path> [options]

Finalizes or updates a T060 longform manifest after a real run.

Options:
  --status <status>                 passed | failed | repair-needed | not-run.
  --coverage-stage <stage>          Deep coverage stage.
  --completed-at <iso>              Run completion timestamp.
  --notes <text>                    Append final notes.
  --replace-notes                   Replace existing notes instead of appending.
  --score-task-completion <1-5>     Score goal completion.
  --score-reproducibility <1-5>     Score reproducibility.
  --score-data-authenticity <1-5>   Score real-data usage.
  --score-artifact-schema <1-5>     Score artifact schema quality.
  --score-self-healing <1-5>        Score recovery behavior.
  --score-report-quality <1-5>      Score final report quality.
  --score-overall <1-5>             Optional overall score.
  --score-rationale <text>          Scoring rationale.
  --failure-id <id>                 Upsert a failure point.
  --failure-severity <severity>     info | warning | error | blocker.
  --failure-category <category>     protocol | model | runtime | data | artifact-schema | ui | scientific-quality | other.
  --failure-summary <text>          Failure summary.
  --failure-evidence-ref <ref>      Add a failure evidence ref. Repeatable.
  --failure-repair-action <text>    Repair action or next step.
  --failure-resolved                Mark the failure point resolved.
`);
}
