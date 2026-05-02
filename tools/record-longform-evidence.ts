import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { recordLongformEvidence, type LongformEvidenceInput } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await recordLongformEvidence({
    manifestPath: resolve(options.manifestPath),
    evidence: options.evidence,
  });
  console.log(`[ok] recorded ${options.evidence.kind}`);
  console.log(`[ok] totals: artifacts=${manifest.artifacts.length}, executionUnits=${manifest.executionUnits.length}, screenshots=${manifest.screenshots.length}`);
}

interface CliOptions {
  manifestPath: string;
  evidence: LongformEvidenceInput;
}

function parseArgs(args: string[]): CliOptions {
  let manifestPath = '';
  let kind = '';
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--manifest') {
      manifestPath = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--kind') {
      kind = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      values[arg.slice(2)] = readValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!manifestPath) throw new Error('--manifest is required');
  if (!kind) throw new Error('--kind is required');
  return { manifestPath, evidence: evidenceFromArgs(kind, values) };
}

function evidenceFromArgs(kind: string, values: Record<string, string>): LongformEvidenceInput {
  if (kind === 'artifact') {
    requireFields(values, ['id', 'type']);
    return {
      kind,
      artifact: {
        id: values.id,
        type: values.type,
        path: values.path,
        producer: values.producer,
        round: optionalNumber(values.round),
        status: values.status as 'produced' | 'missing' | 'invalid' | 'partial' | undefined,
        summary: values.summary,
      },
    };
  }
  if (kind === 'execution-unit') {
    requireFields(values, ['id', 'status']);
    return {
      kind,
      executionUnit: {
        id: values.id,
        tool: values.tool,
        status: values.status,
        runtimeProfile: values.runtimeProfile,
        attempt: optionalNumber(values.attempt),
        startedAt: values.startedAt,
        completedAt: values.completedAt,
        logRef: values.logRef,
        artifactRefs: splitList(values.artifactRefs),
        failureReason: values.failureReason,
      },
    };
  }
  if (kind === 'screenshot') {
    requireFields(values, ['id', 'path']);
    return {
      kind,
      screenshot: {
        id: values.id,
        path: values.path,
        round: optionalNumber(values.round),
        caption: values.caption,
      },
    };
  }
  throw new Error('--kind must be artifact, execution-unit, or screenshot');
}

function requireFields(values: Record<string, string>, fields: string[]) {
  for (const field of fields) {
    if (!values[field]) throw new Error(`--${field} is required`);
  }
}

function optionalNumber(value: string | undefined) {
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Expected number, got: ${value}`);
  return number;
}

function splitList(value: string | undefined) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/record-longform-evidence.ts --manifest <path> --kind <artifact|execution-unit|screenshot> [fields]

Artifact fields:
  --id <id> --type <type> [--path <path>] [--round <n>] [--status produced|missing|invalid|partial] [--summary <text>]

Execution unit fields:
  --id <id> --status <status> [--tool <tool>] [--logRef <ref>] [--artifactRefs a,b] [--failureReason <text>]

Screenshot fields:
  --id <id> --path <path> [--round <n>] [--caption <text>]
`);
}
