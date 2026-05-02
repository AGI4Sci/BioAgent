import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadDeepManifests } from './deep-test-manifest';
import { loadLongformScenarioScripts, summarizeLongformRegressionStatus } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const scripts = await loadLongformScenarioScripts(options.scriptsDir ? resolve(options.scriptsDir) : undefined);
  const manifests = await loadDeepManifests({
    rootDir: options.rootDir ? resolve(options.rootDir) : undefined,
    scenario: options.scenario,
  });
  const status = summarizeLongformRegressionStatus({
    scripts,
    manifests: manifests.map((entry) => entry.manifest),
    now: options.now ? new Date(options.now) : new Date(),
    weeklyRequiredPassedRealRuns: options.weeklyRequiredPassedRealRuns,
  });

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(renderStatus(status));
  }

  if (options.enforceWeekly && !status.weeklyRequirementMet) {
    console.error(`[longform] weekly requirement not met: ${status.currentWeekPassedRealRuns}/${status.weeklyRequiredPassedRealRuns} passed real runs`);
    process.exitCode = 1;
  }
}

interface CliOptions {
  rootDir?: string;
  scriptsDir?: string;
  scenario?: string;
  now?: string;
  weeklyRequiredPassedRealRuns: number;
  enforceWeekly: boolean;
  json: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    weeklyRequiredPassedRealRuns: 2,
    enforceWeekly: false,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--root-dir') {
      options.rootDir = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--scripts-dir') {
      options.scriptsDir = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--scenario') {
      options.scenario = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--now') {
      options.now = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--weekly-required') {
      options.weeklyRequiredPassedRealRuns = Number(readValue(args, index, arg));
      index += 1;
    } else if (arg === '--enforce-weekly') {
      options.enforceWeekly = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(options.weeklyRequiredPassedRealRuns) || options.weeklyRequiredPassedRealRuns < 0) {
    throw new Error('--weekly-required must be a non-negative number');
  }
  return options;
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function renderStatus(status: ReturnType<typeof summarizeLongformRegressionStatus>) {
  const lines = [
    '# T060 Longform Regression Status',
    '',
    `Scripts: ${status.scenarioCount}`,
    `Manifests: ${status.manifestCount}`,
    `Passed: ${status.passedCount}`,
    `Pending: ${status.pendingCount}`,
    `Repair-needed: ${status.repairNeededCount}`,
    `Failed: ${status.failedCount}`,
    `Current week passed real runs: ${status.currentWeekPassedRealRuns}/${status.weeklyRequiredPassedRealRuns}`,
    `Weekly deficit: ${status.weeklyDeficit}`,
    `Next recommended: ${status.nextRecommendedScenarioIds.join(', ') || '-'}`,
    '',
    '| Scenario | Latest | Passed | Pending | Quality | Latest run |',
    '| --- | --- | ---: | ---: | --- | --- |',
  ];
  for (const scenario of status.scenarios) {
    const quality = scenario.qualityIssues.length ? scenario.qualityIssues.join('; ') : 'ok';
    lines.push(`| ${scenario.scenarioId} | ${scenario.latestStatus} | ${scenario.passedRuns} | ${scenario.pendingRuns} | ${escapeCell(quality)} | ${scenario.latestRunId ?? '-'} |`);
  }
  return lines.join('\n');
}

function escapeCell(value: string) {
  return value.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function printHelp() {
  console.log(`Usage: tsx tools/longform-status.ts [options]

Summarizes T060 longform script and manifest coverage.

Options:
  --root-dir <dir>          Deep scenario root. Defaults to docs/test-artifacts/deep-scenarios.
  --scripts-dir <dir>       Longform script root. Defaults to tests/longform/scenarios.
  --scenario <id>           Summarize one scenario.
  --now <iso>               Override current time for weekly status.
  --weekly-required <n>     Required passed real runs per week. Defaults to 2.
  --enforce-weekly          Exit non-zero if weekly requirement is not met.
  --json                    Print JSON instead of Markdown.
`);
}
