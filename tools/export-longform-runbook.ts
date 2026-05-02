import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeepRunManifest } from './deep-test-manifest';
import { loadLongformScenarioScripts, writeLongformOperatorRunbook } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(options.manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DeepRunManifest;
  const scripts = await loadLongformScenarioScripts(options.scriptsDir ? resolve(options.scriptsDir) : undefined);
  const script = scripts.find((item) => item.scenarioId === manifest.scenarioId);
  const runbook = await writeLongformOperatorRunbook({
    manifestPath,
    manifest,
    script,
    outPath: options.outPath,
  });
  console.log(`[ok] wrote ${runbook.path}`);
  console.log(`[ok] scenario: ${runbook.scenarioId}`);
  console.log(`[ok] run: ${runbook.runId}`);
}

interface CliOptions {
  manifestPath: string;
  scriptsDir?: string;
  outPath?: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--manifest') {
      options.manifestPath = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--scripts-dir') {
      options.scriptsDir = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--out') {
      options.outPath = readValue(args, index, arg);
      index += 1;
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

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/export-longform-runbook.ts --manifest <path> [options]

Writes an operator-runbook.md beside a T060 longform manifest.

Options:
  --manifest <path>    Manifest JSON to inspect.
  --scripts-dir <dir>  Longform script root. Defaults to tests/longform/scenarios.
  --out <path>         Output markdown path. Defaults to <manifest-dir>/operator-runbook.md.
`);
}
