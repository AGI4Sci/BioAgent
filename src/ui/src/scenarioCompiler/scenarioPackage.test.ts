import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scenarios, type ScenarioId } from '../data';
import { SCENARIO_SPECS } from '../scenarioSpecs';
import { compileScenarioDraft } from './scenarioDraftCompiler';
import { compileScenarioIRFromSelection, recommendScenarioElements } from './scenarioElementCompiler';
import { buildBuiltInScenarioPackage } from './scenarioPackage';
import { compileSkillPlan } from './skillPlanCompiler';
import { validateScenarioPackage } from './validationGate';

describe('scenario compiler package model', () => {
  it('exports each built-in scenario as a published scenario package', () => {
    for (const scenario of scenarios) {
      const scenarioId = scenario.id as ScenarioId;
      const pkg = buildBuiltInScenarioPackage(scenarioId, '2026-04-25T00:00:00.000Z');
      const spec = SCENARIO_SPECS[scenarioId];

      assert.equal(pkg.schemaVersion, '1');
      assert.equal(pkg.status, 'published');
      assert.equal(pkg.scenario.id, scenarioId);
      assert.equal(pkg.scenario.skillDomain, spec.skillDomain);
      assert.deepEqual(pkg.scenario.outputArtifacts.map((artifact) => artifact.type), spec.outputArtifacts.map((artifact) => artifact.type));
      assert.deepEqual(pkg.uiPlan.slots.map((slot) => slot.componentId), spec.defaultSlots.map((slot) => slot.componentId));
      assert.ok(pkg.skillPlan.skillIRs.length);
      assert.equal(validateScenarioPackage(pkg, undefined, '2026-04-25T00:00:00.000Z').ok, true);
      assert.ok(pkg.versions[0].scenarioHash);
    }
  });

  it('compiles user descriptions into scenario drafts without touching runtime', () => {
    const draft = compileScenarioDraft('分析单细胞RNA表达矩阵，展示UMAP、热图和差异基因火山图');

    assert.equal(draft.skillDomain, 'omics');
    assert.equal(draft.baseScenarioId, 'omics-differential-exploration');
    assert.ok(draft.defaultComponents.includes('umap-viewer'));
    assert.match(draft.scenarioMarkdown, /输出 artifact/);
  });

  it('compiles skill plans with route options for seed and generated skill paths', () => {
    const plan = compileSkillPlan(['literature.pubmed_search', 'scp.biomarker_discovery']);

    assert.ok(plan.skillIRs.some((skill) => skill.skillId === 'literature.pubmed_search'));
    assert.ok(plan.skillIRs.some((skill) => skill.skillId === 'scp.biomarker_discovery'));
    assert.ok(plan.routeOptions.some((route) => route.skillId === 'literature.pubmed_search' && route.runtimeProfileId === 'seed-skill'));
    assert.ok(plan.routeOptions.some((route) => route.skillId === 'scp.biomarker_discovery' && route.runtimeProfileId === 'scp-hub'));
  });

  it('reports blocking validation errors for packages without selected producers', () => {
    const pkg = buildBuiltInScenarioPackage('literature-evidence-review', '2026-04-25T00:00:00.000Z');
    const broken = {
      ...pkg,
      scenario: {
        ...pkg.scenario,
        selectedSkillIds: [],
      },
    };
    const report = validateScenarioPackage(broken, undefined, '2026-04-25T00:00:00.000Z');

    assert.equal(report.ok, false);
    assert.ok(report.issues.some((issue) => issue.code === 'missing-selected-producer'));
  });

  it('compiles manual element selections into a workspace scenario package', () => {
    const result = compileScenarioIRFromSelection({
      id: 'custom-literature-review',
      title: 'Custom literature review',
      description: 'Review PubMed evidence and show papers with evidence claims.',
      selectedSkillIds: ['literature.pubmed_search'],
      selectedArtifactTypes: ['paper-list'],
      selectedComponentIds: ['paper-card-list', 'evidence-matrix', 'unknown-artifact-inspector'],
      selectedToolIds: ['tool.pubmed'],
    });

    assert.equal(result.scenario.id, 'custom-literature-review');
    assert.equal(result.scenario.skillDomain, 'literature');
    assert.deepEqual(result.scenario.selectedSkillIds, ['literature.pubmed_search']);
    assert.equal(result.uiPlan.scenarioId, 'custom-literature-review');
    assert.equal(result.package.validationReport?.ok, true);
    assert.equal(result.validationReport.ok, true);
  });

  it('returns compiler diagnostics for selections that cannot produce requested artifacts', () => {
    const result = compileScenarioIRFromSelection({
      id: 'broken-structure-review',
      title: 'Broken sequence review',
      description: 'Show a sequence alignment artifact without selecting a sequence-producing skill.',
      selectedSkillIds: ['literature.pubmed_search'],
      selectedArtifactTypes: ['sequence-alignment'],
      selectedComponentIds: ['data-table', 'unknown-artifact-inspector'],
    });

    assert.equal(result.validationReport.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'missing-producer'));
    assert.ok(result.validationReport.issues.some((issue) => issue.code === 'missing-producer'));
  });

  it('keeps AgentServer recommendation as an optional placeholder with offline heuristic fallback', () => {
    const recommendation = recommendScenarioElements('分析单细胞RNA表达矩阵并展示UMAP和火山图', undefined, {
      allowAgentServer: true,
      agentServerBaseUrl: 'http://127.0.0.1:18080',
    });

    assert.equal(recommendation.source, 'agentserver-placeholder');
    assert.ok(recommendation.selectedSkillIds.some((skillId) => skillId.includes('omics')));
    assert.ok(recommendation.selectedArtifactTypes.includes('omics-differential-expression'));
    assert.ok(recommendation.selectedComponentIds.includes('volcano-plot'));
  });
});
