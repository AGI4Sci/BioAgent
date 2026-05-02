import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadDeepManifests } from './deep-test-manifest';
import { loadLongformScenarioScripts, validateLongformRunManifest } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const scripts = await loadLongformScenarioScripts(options.scriptsDir ? resolve(options.scriptsDir) : undefined);
  const scriptById = new Map(scripts.map((script) => [script.scenarioId, script]));
  const manifests = await loadDeepManifests({
    rootDir: options.rootDir ? resolve(options.rootDir) : undefined,
    scenario: options.scenario,
  });
  const t060Manifests = manifests.filter((entry) => entry.manifest.taskId === 'T060' || scriptById.has(entry.manifest.scenarioId));
  const results = t060Manifests.map((entry) => validateLongformRunManifest(entry.manifest, scriptById.get(entry.manifest.scenarioId)));

  for (const result of results) {
    if (result.pass) {
      console.log(`[ok] ${result.scenarioId}`);
    } else {
      console.error(`[longform] ${result.scenarioId}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  }
  console.log(`[ok] checked ${results.length} T060 longform manifest(s)`);
  if (results.some((result) => !result.pass)) process.exitCode = 1;
}

interface CliOptions {
  rootDir?: string;
  scriptsDir?: string;
  scenario?: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
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
  console.log(`Usage: tsx tools/validate-longform-regression.ts [options]

Checks T060 longform manifests for evidence quality beyond the generic deep schema.

Options:
  --root-dir <dir>     Deep scenario root. Defaults to docs/test-artifacts/deep-scenarios.
  --scripts-dir <dir>  Longform script root. Defaults to tests/longform/scenarios.
  --scenario <id>      Validate one scenario.
`);
}
