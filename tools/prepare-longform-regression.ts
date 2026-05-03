import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { prepareLongformRegression, type PrepareLongformRegressionOptions } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const prepared = await prepareLongformRegression({
    ...options,
    scriptsDir: options.scriptsDir ? resolve(options.scriptsDir) : undefined,
    outRoot: options.outRoot ? resolve(options.outRoot) : undefined,
  });

  for (const item of prepared) {
    console.log(`[ok] prepared ${item.scenarioId}`);
    console.log(`  manifest: ${item.manifestPath}`);
    console.log(`  checklist: ${item.checklistPath}`);
    console.log(`  evidence: ${item.evidenceDirectory}`);
  }
}

interface CliOptions extends PrepareLongformRegressionOptions {
  scriptsDir?: string;
  outRoot?: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--scenario') {
      options.scenario = readValue(args, index, arg);
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
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/prepare-longform-regression.ts [options]

Creates pending T060 manifest/checklist directories from tests/longform/scenarios/*.json.

Options:
  --scenario <id>          Prepare only one scenarioId.
  --out-root <dir>         Output root. Defaults to docs/test-artifacts/deep-scenarios.
  --scripts-dir <dir>      Scenario script directory. Defaults to tests/longform/scenarios.
  --run-id <id>            Stable run id. Defaults to <scenarioId>-<timestamp>.
  --app-url <url>          SciForge app URL. Defaults to http://localhost:5173/.
  --workspace-path <path>  Workspace path recorded in manifest.
  --backend <name>         Backend recorded in manifest.
  --model-provider <name>  Model provider recorded in manifest.
  --model-name <name>      Model name recorded in manifest.
  --operator <name>        Operator recorded in manifest. Defaults to Codex.
`);
}
