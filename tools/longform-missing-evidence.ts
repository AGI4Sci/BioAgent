import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeepRunManifest } from './deep-test-manifest';
import { loadLongformScenarioScripts, summarizeLongformEvidenceGaps, type LongformEvidenceGapReport } from './longform-regression';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(resolve(options.manifestPath), 'utf8')) as DeepRunManifest;
  const scripts = await loadLongformScenarioScripts(options.scriptsDir ? resolve(options.scriptsDir) : undefined);
  const script = scripts.find((item) => item.scenarioId === manifest.scenarioId);
  const report = summarizeLongformEvidenceGaps(manifest, script);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderReport(report));
  }
  if (options.enforcePassedReady && !report.readyToFinalizePassed) process.exitCode = 1;
}

interface CliOptions {
  manifestPath: string;
  scriptsDir?: string;
  json: boolean;
  enforcePassedReady: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    json: false,
    enforcePassedReady: false,
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
    } else if (arg === '--enforce-passed-ready') {
      options.enforcePassedReady = true;
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

function renderReport(report: LongformEvidenceGapReport) {
  const lines = [
    `# ${report.scenarioId}`,
    '',
    report.title,
    '',
    `Run: ${report.runId}`,
    `Status: ${report.status}`,
    `Progress: ${report.completedRounds}/${report.totalRounds}`,
    `Ready to finalize passed: ${report.readyToFinalizePassed ? 'yes' : 'no'}`,
    '',
    '## Missing',
    '',
    `- Rounds: ${report.missing.rounds.join(', ') || 'none'}`,
    `- Round artifact refs: ${report.missing.roundArtifactRefs.join(', ') || 'none'}`,
    `- Round execution refs: ${report.missing.roundExecutionRefs.join(', ') || 'none'}`,
    `- Round screenshot refs: ${report.missing.roundScreenshotRefs.join(', ') || 'none'}`,
    `- Evidence classes: ${report.missing.evidenceClasses.join(', ') || 'none'}`,
    `- Produced artifact recorded: ${report.missing.producedArtifacts ? 'yes' : 'no'}`,
    `- Reference impact explained: ${report.missing.referenceImpact ? 'yes' : 'no'}`,
    `- CompletedAt recorded: ${report.missing.completedAt ? 'yes' : 'no'}`,
    `- Blocker recorded if failed/repair-needed: ${report.missing.blocker ? 'yes' : 'no'}`,
    '',
  ];
  if (report.qualityIssues.length) {
    lines.push('## Quality Issues', '');
    for (const issue of report.qualityIssues) lines.push(`- ${issue}`);
    lines.push('');
  }
  if (report.suggestedCommands.length) {
    lines.push('## Suggested Commands', '');
    lines.push('```sh');
    for (const command of report.suggestedCommands) lines.push(command);
    lines.push('```');
  }
  return lines.join('\n');
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: tsx tools/longform-missing-evidence.ts --manifest <path> [options]

Shows what evidence is still missing before a T060 longform manifest can be finalized as passed.

Options:
  --manifest <path>          Manifest JSON to inspect.
  --scripts-dir <dir>        Longform script root. Defaults to tests/longform/scenarios.
  --json                     Print JSON instead of Markdown.
  --enforce-passed-ready     Exit non-zero unless the manifest has enough evidence for passed finalization.
`);
}
