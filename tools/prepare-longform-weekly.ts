import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadDeepManifests } from './deep-test-manifest';
import { prepareLongformWeeklyRegression, type PrepareLongformWeeklyRegressionOptions } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const loaded = await loadDeepManifests({
    rootDir: options.rootDir ? resolve(options.rootDir) : undefined,
  });
  const result = await prepareLongformWeeklyRegression({
    ...options,
    manifests: loaded.map((entry) => entry.manifest),
    scriptsDir: options.scriptsDir ? resolve(options.scriptsDir) : undefined,
    outRoot: options.outRoot ? resolve(options.outRoot) : undefined,
    now: options.now ? new Date(options.now) : undefined,
  });

  console.log(`# T060 Weekly Prepare`);
  console.log(`Current week passed real runs: ${result.status.currentWeekPassedRealRuns}/${result.status.weeklyRequiredPassedRealRuns}`);
  console.log(`Weekly deficit: ${result.status.weeklyDeficit}`);
  console.log(`Recommended: ${result.status.nextRecommendedScenarioIds.join(', ') || '-'}`);
  for (const item of result.prepared) {
    console.log(`[ok] prepared ${item.scenarioId}`);
    console.log(`  manifest: ${item.manifestPath}`);
    console.log(`  checklist: ${item.checklistPath}`);
    console.log(`  evidence: ${item.evidenceDirectory}`);
  }
  for (const item of result.skipped) {
    console.log(`[skip] ${item.scenarioId}: ${item.reason}${item.latestRunId ? ` (${item.latestRunId})` : ''}`);
  }
  if (!result.prepared.length && !result.skipped.length) {
    console.log('[ok] weekly requirement already met');
  }
}

interface CliOptions extends Omit<PrepareLongformWeeklyRegressionOptions, 'manifests' | 'now'> {
  rootDir?: string;
  scriptsDir?: string;
  outRoot?: string;
  now?: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    skipPending: true,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--root-dir') {
      options.rootDir = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--scripts-dir') {
      options.scriptsDir = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--out-root') {
      options.outRoot = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--run-id') {
      options.runId = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--now') {
      options.now = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--weekly-required') {
      options.weeklyRequiredPassedRealRuns = Number(readValue(args, index, arg));
      index += 1;
    } else if (arg === '--app-url') {
      options.appUrl = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--workspace-path') {
      options.workspacePath = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--backend') {
      options.backend = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--model-provider') {
      options.modelProvider = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--model-name') {
      options.modelName = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--operator') {
      options.operator = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--force-pending') {
      options.skipPending = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.weeklyRequiredPassedRealRuns !== undefined && (!Number.isFinite(options.weeklyRequiredPassedRealRuns) || options.weeklyRequiredPassedRealRuns < 0)) {
    throw new Error('--weekly-required must be a non-negative number');
  }
  return options;
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/prepare-longform-weekly.ts [options]

Prepares pending manifests/checklists for the T060 scenarios recommended by the weekly plan.

Options:
  --root-dir <dir>          Deep scenario root. Defaults to docs/test-artifacts/deep-scenarios.
  --scripts-dir <dir>       Longform script root. Defaults to tests/longform/scenarios.
  --out-root <dir>          Output root. Defaults to docs/test-artifacts/deep-scenarios.
  --run-id <id>             Stable run id prefix. Scenario id is appended for multiple runs.
  --now <iso>               Override current time for weekly selection.
  --weekly-required <n>     Required passed real runs per week. Defaults to 2.
  --app-url <url>           BioAgent app URL. Defaults to http://localhost:5173/.
  --workspace-path <path>   Workspace path recorded in prepared manifests.
  --backend <name>          Backend recorded in prepared manifests.
  --model-provider <name>   Model provider recorded in prepared manifests.
  --model-name <name>       Model name recorded in prepared manifests.
  --operator <name>         Operator recorded in prepared manifests.
  --force-pending           Recreate recommended scenarios even when a pending manifest already exists.
`);
}
