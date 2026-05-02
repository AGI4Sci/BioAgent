import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadDeepManifests } from './deep-test-manifest';
import { loadLongformScenarioScripts, summarizeLongformRegressionStatus } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const scripts = await loadLongformScenarioScripts(options.scriptsDir ? resolve(options.scriptsDir) : undefined);
  const manifests = await loadDeepManifests({
    rootDir: options.rootDir ? resolve(options.rootDir) : undefined,
  });
  const status = summarizeLongformRegressionStatus({
    scripts,
    manifests: manifests.map((entry) => entry.manifest),
    now: options.now ? new Date(options.now) : new Date(),
    weeklyRequiredPassedRealRuns: options.weeklyRequiredPassedRealRuns,
  });
  const scriptById = new Map(scripts.map((script) => [script.scenarioId, script]));
  const recommended = status.nextRecommendedScenarioIds
    .map((scenarioId) => scriptById.get(scenarioId))
    .filter((script): script is NonNullable<typeof script> => Boolean(script));

  if (options.json) {
    console.log(JSON.stringify({ status, recommended }, null, 2));
  } else {
    console.log(renderWeeklyPlan({
      status,
      recommended,
      appUrl: options.appUrl,
      workspacePath: options.workspacePath,
      backend: options.backend,
      modelName: options.modelName,
      operator: options.operator,
    }));
  }

  if (options.enforceWeekly && !status.weeklyRequirementMet) {
    process.exitCode = 1;
  }
}

interface CliOptions {
  rootDir?: string;
  scriptsDir?: string;
  now?: string;
  weeklyRequiredPassedRealRuns: number;
  enforceWeekly: boolean;
  json: boolean;
  appUrl: string;
  workspacePath?: string;
  backend?: string;
  modelName?: string;
  operator?: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    weeklyRequiredPassedRealRuns: 2,
    enforceWeekly: false,
    json: false,
    appUrl: 'http://localhost:5173/',
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--root-dir') {
      options.rootDir = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--scripts-dir') {
      options.scriptsDir = readValue(args, index, arg);
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
    } else if (arg === '--model-name') {
      options.modelName = readValue(args, index, arg);
      index += 1;
    } else if (arg === '--operator') {
      options.operator = readValue(args, index, arg);
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

function renderWeeklyPlan({
  status,
  recommended,
  appUrl,
  workspacePath,
  backend,
  modelName,
  operator,
}: {
  status: ReturnType<typeof summarizeLongformRegressionStatus>;
  recommended: Awaited<ReturnType<typeof loadLongformScenarioScripts>>;
  appUrl: string;
  workspacePath?: string;
  backend?: string;
  modelName?: string;
  operator?: string;
}) {
  const lines = [
    '# T060 Weekly Longform Plan',
    '',
    `Current week passed real runs: ${status.currentWeekPassedRealRuns}/${status.weeklyRequiredPassedRealRuns}`,
    `Weekly deficit: ${status.weeklyDeficit}`,
    '',
  ];
  if (!recommended.length) {
    lines.push('Weekly requirement is already met. No additional scenario is required.');
    return lines.join('\n');
  }
  lines.push('## Recommended Runs', '');
  for (const script of recommended) {
    lines.push(`### ${script.scenarioId}`, '');
    lines.push(script.title, '');
    lines.push(`Goal: ${script.goal}`, '');
    lines.push('Prepare command:', '');
    lines.push('```sh');
    lines.push(renderPrepareCommand({ scenarioId: script.scenarioId, appUrl, workspacePath, backend, modelName, operator }));
    lines.push('```', '');
    lines.push(`Minimum rounds: ${script.minRounds}`);
    lines.push(`Reference operations: ${script.rounds.flatMap((round) => round.referenceOps).map((op) => op.kind).join(', ')}`);
    lines.push(`Expected evidence: browser; Computer Use; workspace refs`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderPrepareCommand({
  scenarioId,
  appUrl,
  workspacePath,
  backend,
  modelName,
  operator,
}: {
  scenarioId: string;
  appUrl: string;
  workspacePath?: string;
  backend?: string;
  modelName?: string;
  operator?: string;
}) {
  return [
    'npm run longform:prepare --',
    `--scenario ${shellQuote(scenarioId)}`,
    `--app-url ${shellQuote(appUrl)}`,
    workspacePath ? `--workspace-path ${shellQuote(workspacePath)}` : '',
    backend ? `--backend ${shellQuote(backend)}` : '',
    modelName ? `--model-name ${shellQuote(modelName)}` : '',
    operator ? `--operator ${shellQuote(operator)}` : '',
  ].filter(Boolean).join(' ');
}

function shellQuote(value: string) {
  if (/^[a-zA-Z0-9_./:@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/longform-weekly-plan.ts [options]

Selects the next T060 scenarios needed to satisfy the weekly real-backend regression target.

Options:
  --root-dir <dir>          Deep scenario root. Defaults to docs/test-artifacts/deep-scenarios.
  --scripts-dir <dir>       Longform script root. Defaults to tests/longform/scenarios.
  --now <iso>               Override current time for weekly selection.
  --weekly-required <n>     Required passed real runs per week. Defaults to 2.
  --app-url <url>           BioAgent app URL for generated prepare commands.
  --workspace-path <path>   Workspace path for generated prepare commands.
  --backend <name>          Backend label for generated prepare commands.
  --model-name <name>       Model label for generated prepare commands.
  --operator <name>         Operator label for generated prepare commands.
  --enforce-weekly          Exit non-zero if weekly requirement is not met.
  --json                    Print JSON instead of Markdown.
`);
}
