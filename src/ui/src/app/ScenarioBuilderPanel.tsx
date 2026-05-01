import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Download, FileCode, FilePlus, Play } from 'lucide-react';
import { type ScenarioId } from '../data';
import { SCENARIO_SPECS, componentManifest } from '../scenarioSpecs';
import { scenarioIdBySkillDomain, type ScenarioBuilderDraft } from '../scenarioCompiler/scenarioDraftCompiler';
import { compileScenarioIRFromSelection, recommendScenarioElements, type ScenarioElementSelection } from '../scenarioCompiler/scenarioElementCompiler';
import { elementRegistry } from '../scenarioCompiler/elementRegistry';
import { runScenarioRuntimeSmoke } from '../scenarioCompiler/runtimeSmoke';
import { buildScenarioQualityReport } from '../scenarioCompiler/scenarioQualityGate';
import { saveWorkspaceScenario, publishWorkspaceScenario } from '../api/workspaceClient';
import type { ScenarioPackage } from '../scenarioCompiler/scenarioPackage';
import type { BioAgentConfig, ScenarioRuntimeOverride } from '../domain';
import type { RuntimeHealthItem } from '../runtimeHealth';
import { exportJsonFile } from './exportUtils';
import { ActionButton, Badge, cx } from './uiPrimitives';

export function ScenarioBuilderPanel({
  scenarioId,
  scenario,
  config,
  runtimeHealth,
  expanded,
  onToggle,
  onChange,
}: {
  scenarioId: ScenarioId;
  scenario: ScenarioRuntimeOverride;
  config: BioAgentConfig;
  runtimeHealth: RuntimeHealthItem[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (override: ScenarioRuntimeOverride) => void;
}) {
  const builtin = SCENARIO_SPECS[scenarioId];
  const initialSelection = useMemo(() => defaultElementSelectionForScenario(scenarioId, scenario), [scenarioId]);
  const [selection, setSelection] = useState<ScenarioElementSelection>(initialSelection);
  const [builderStep, setBuilderStep] = useState<'describe' | 'elements' | 'contract' | 'quality' | 'publish'>('describe');
  const [previewTab, setPreviewTab] = useState<'scenario' | 'skill' | 'ui' | 'validation'>('scenario');
  const [advancedPreviewOpen, setAdvancedPreviewOpen] = useState(false);
  const [publishStatus, setPublishStatus] = useState('');
  useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection]);
  const componentOptions = Array.from(new Set([...builtin.componentPolicy.allowedComponents, ...scenario.allowedComponents]));
  const compileResult = useMemo(() => compileScenarioIRFromSelection(selection), [selection]);
  const qualityReport = useMemo(() => buildScenarioQualityReport({
    package: compileResult.package,
    validationReport: compileResult.validationReport,
    runtimeHealth,
  }), [compileResult, runtimeHealth]);
  const qualityCounts = useMemo(() => ({
    blocking: qualityReport.items.filter((item) => item.severity === 'blocking').length,
    warning: qualityReport.items.filter((item) => item.severity === 'warning').length,
    note: qualityReport.items.filter((item) => item.severity === 'note').length,
  }), [qualityReport]);
  const skillOptions = elementRegistry.skills.filter((skill) => skill.skillDomains.includes(selection.skillDomain ?? scenario.skillDomain));
  const artifactOptions = elementRegistry.artifacts.filter((artifact) => (
    artifact.tags?.includes(selection.skillDomain ?? scenario.skillDomain)
    || artifact.producerSkillIds.some((skillId) => selection.selectedSkillIds.includes(skillId))
    || selection.selectedArtifactTypes.includes(artifact.artifactType)
  ));
  const toolOptions = elementRegistry.tools.filter((tool) => tool.skillDomains.includes(selection.skillDomain ?? scenario.skillDomain));
  const recommendationReasons = builderRecommendationReasons(selection, scenario, compileResult.uiPlan.slots.length, compileResult.skillPlan.skillIRs.length);
  function patch(patchValue: Partial<ScenarioRuntimeOverride>) {
    onChange({ ...scenario, ...patchValue });
  }
  function patchSelection(patchValue: Partial<ScenarioElementSelection>) {
    setSelection((current) => ({ ...current, ...patchValue }));
  }
  function toggleComponent(component: string) {
    const next = scenario.defaultComponents.includes(component)
      ? scenario.defaultComponents.filter((item) => item !== component)
      : [...scenario.defaultComponents, component];
    patchSelection({ selectedComponentIds: toggleList(selection.selectedComponentIds ?? [], component) });
    patch({ defaultComponents: next.length ? next : [scenario.fallbackComponent] });
  }
  function toggleSelectionList(key: 'selectedSkillIds' | 'selectedToolIds' | 'selectedArtifactTypes' | 'selectedFailurePolicyIds', value: string) {
    setSelection((current) => ({
      ...current,
      [key]: toggleList((current[key] ?? []) as string[], value),
    }));
  }
  async function saveCompiled(status: 'draft' | 'published') {
    try {
      setPublishStatus(status === 'draft' ? '保存中...' : '发布中...');
      const smoke = await runScenarioRuntimeSmoke({ package: compileResult.package, mode: 'dry-run' });
      const quality = buildScenarioQualityReport({
        package: compileResult.package,
        validationReport: smoke.validationReport,
        runtimeSmoke: smoke,
        runtimeHealth,
      });
      const pkg = {
        ...compileResult.package,
        status,
        metadata: {
          ...(compileResult.package as ScenarioPackage & { metadata?: Record<string, unknown> }).metadata,
          recommendationReasons,
          compiledFrom: {
            builderStep,
            skillDomain: selection.skillDomain ?? scenario.skillDomain,
            selectedSkillIds: selection.selectedSkillIds,
            selectedToolIds: selection.selectedToolIds,
            selectedComponentIds: selection.selectedComponentIds,
            selectedArtifactTypes: selection.selectedArtifactTypes,
          },
        },
        validationReport: smoke.validationReport,
        qualityReport: quality,
      };
      if (status === 'published') {
        if (!quality.ok) {
          setPublishStatus('quality gate blocking errors，已保持为 draft。');
          await saveWorkspaceScenario(config, { ...pkg, status: 'draft' });
          return;
        }
        await publishWorkspaceScenario(config, pkg);
      } else {
        await saveWorkspaceScenario(config, pkg);
      }
      setPublishStatus(status === 'draft' ? '已保存 draft 到 workspace。' : '已发布到 workspace scenario library。');
    } catch (error) {
      setPublishStatus(error instanceof Error ? error.message : String(error));
    }
  }
  const previewJson = previewTab === 'scenario'
    ? compileResult.scenario
    : previewTab === 'skill'
      ? compileResult.skillPlan
      : previewTab === 'ui'
        ? compileResult.uiPlan
        : compileResult.validationReport;
  return (
    <section className={cx('scenario-settings', expanded && 'expanded')}>
      <button className="scenario-settings-summary" onClick={onToggle}>
        <FileCode size={16} />
        <span>Scenario Builder</span>
        <strong>{scenario.skillDomain}</strong>
        <em>{compileResult.package.id}@{compileResult.package.version} · {compileResult.validationReport.ok ? 'valid' : 'needs fixes'}</em>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded ? (
        <div className="scenario-settings-body">
          <div className="builder-stepper" aria-label="Scenario Builder steps">
            {[
              ['describe', '需求描述'],
              ['elements', '推荐元素'],
              ['contract', '编辑契约'],
              ['quality', '质量检查'],
              ['publish', '发布运行'],
            ].map(([id, label], index) => (
              <button key={id} className={cx(builderStep === id && 'active')} onClick={() => setBuilderStep(id as typeof builderStep)}>
                <span>{index + 1}</span>
                {label}
              </button>
            ))}
          </div>
          <div className={cx('builder-step-panel', builderStep !== 'describe' && 'muted')}>
            <label>
              <span>场景名称</span>
              <input
                value={scenario.title}
                onChange={(event) => {
                  patch({ title: event.target.value });
                  patchSelection({ title: event.target.value });
                }}
              />
            </label>
            <label>
              <span>Skill domain</span>
              <select
                value={scenario.skillDomain}
                onChange={(event) => {
                  const skillDomain = event.target.value as ScenarioRuntimeOverride['skillDomain'];
                  const base = SCENARIO_SPECS[scenarioIdBySkillDomain[skillDomain]];
                  const domainSkillIds = elementRegistry.skills
                    .filter((skill) => skill.skillDomains.includes(skillDomain))
                    .map((skill) => skill.id);
                  const generatedSkillId = `agentserver.generate.${skillDomain}`;
                  const nextSelectedSkillIds = domainSkillIds.includes(generatedSkillId)
                    ? [generatedSkillId]
                    : domainSkillIds.slice(0, 1);
                  const nextDefaultComponents = base.componentPolicy.defaultComponents;
                  patch({
                    skillDomain,
                    defaultComponents: nextDefaultComponents,
                    allowedComponents: base.componentPolicy.allowedComponents,
                    fallbackComponent: base.componentPolicy.fallbackComponent,
                    scenarioPackageRef: undefined,
                    skillPlanRef: undefined,
                    uiPlanRef: undefined,
                  });
                  patchSelection({
                    skillDomain,
                    selectedSkillIds: nextSelectedSkillIds,
                    selectedToolIds: elementRegistry.tools.filter((tool) => tool.skillDomains.includes(skillDomain)).slice(0, 5).map((tool) => tool.id),
                    selectedArtifactTypes: base.outputArtifacts.map((artifact) => artifact.type),
                    selectedComponentIds: nextDefaultComponents,
                    fallbackComponentId: base.componentPolicy.fallbackComponent,
                  });
                }}
              >
                <option value="literature">literature</option>
                <option value="structure">structure</option>
                <option value="omics">omics</option>
                <option value="knowledge">knowledge</option>
              </select>
            </label>
            <label className="wide">
              <span>场景描述</span>
              <input
                value={scenario.description}
                onChange={(event) => {
                  patch({ description: event.target.value });
                  patchSelection({ description: event.target.value });
                }}
              />
            </label>
          </div>
          <div className={cx('builder-step-panel', builderStep !== 'elements' && 'muted')}>
            <div className="component-selector">
              <span>默认组件集合</span>
              <div>
                {componentOptions.map((component) => (
                  <button
                    key={component}
                    className={cx(scenario.defaultComponents.includes(component) && 'active')}
                    onClick={() => toggleComponent(component)}
                  >
                    {component}
                    <ElementPopover {...componentElementPopover(component)} />
                  </button>
                ))}
              </div>
            </div>
            <ElementSelector
              title="Skills"
              options={skillOptions.map((skill) => ({
                id: skill.id,
                label: skill.label,
                detail: skill.description,
                meta: `produces ${skill.outputArtifactTypes.join(', ') || 'runtime artifacts'} · ${skill.requiredCapabilities.map((item) => `${item.capability}:${item.level}`).join(', ') || 'no extra capability profile'}`,
              }))}
              selected={selection.selectedSkillIds}
              onToggle={(id) => toggleSelectionList('selectedSkillIds', id)}
            />
            <ElementSelector
              title="Tools"
              options={toolOptions.map((tool) => ({
                id: tool.id,
                label: tool.label,
                detail: tool.description,
                meta: `${tool.toolType} · produces ${(tool.producesArtifactTypes ?? []).join(', ') || 'supporting runtime data'}`,
              }))}
              selected={selection.selectedToolIds ?? []}
              onToggle={(id) => toggleSelectionList('selectedToolIds', id)}
            />
            <ElementSelector
              title="Artifacts"
              options={artifactOptions.map((artifact) => ({
                id: artifact.artifactType,
                label: artifact.label,
                detail: artifact.description,
                meta: `producer ${artifact.producerSkillIds.join(', ') || 'none'} · consumer ${artifact.consumerComponentIds.join(', ') || 'none'} · handoff ${artifact.handoffTargets.join(', ') || 'none'}`,
              }))}
              selected={selection.selectedArtifactTypes}
              onToggle={(id) => toggleSelectionList('selectedArtifactTypes', id)}
            />
            <ElementSelector
              title="Failure policies"
              options={elementRegistry.failurePolicies.map((policy) => ({
                id: policy.id,
                label: policy.label,
                detail: policy.description,
                meta: `fallback ${policy.fallbackComponentId} · ${policy.recoverActions.join(', ')}`,
              }))}
              selected={selection.selectedFailurePolicyIds ?? []}
              onToggle={(id) => toggleSelectionList('selectedFailurePolicyIds', id)}
            />
          </div>
          <div className={cx('builder-step-panel', builderStep !== 'contract' && 'muted')}>
            <label className="wide">
              <span>Scenario markdown</span>
              <textarea
                value={scenario.scenarioMarkdown}
                onChange={(event) => {
                  patch({ scenarioMarkdown: event.target.value });
                  patchSelection({ scenarioMarkdown: event.target.value });
                }}
              />
            </label>
          </div>
          <div className="builder-recommendation-summary">
            <strong>推荐组合</strong>
            <span>基于 skill domain={selection.skillDomain ?? scenario.skillDomain}，当前会生成 {compileResult.uiPlan.slots.length} 个 UI slot、{compileResult.skillPlan.skillIRs.length} 个 skill step。</span>
            <span>发布前会检查 producer/consumer、fallback、runtime profile 和 package quality gate。</span>
            <ul>
              {recommendationReasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </div>
          <div className={cx('scenario-preview-panel', builderStep !== 'contract' && 'muted')}>
            <button className="advanced-preview-toggle" onClick={() => setAdvancedPreviewOpen((value) => !value)}>
              {advancedPreviewOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {advancedPreviewOpen ? '收起高级 JSON contract' : '展开高级 JSON contract'}
            </button>
            {advancedPreviewOpen ? (
              <>
                <div className="scenario-preview-tabs">
                  {(['scenario', 'skill', 'ui', 'validation'] as const).map((tab) => (
                    <button key={tab} className={cx(previewTab === tab && 'active')} onClick={() => setPreviewTab(tab)}>{tab}</button>
                  ))}
                </div>
                <pre className="inspector-json">{JSON.stringify(previewJson, null, 2)}</pre>
              </>
            ) : null}
          </div>
          <div className={cx('manifest-diagnostics', builderStep !== 'quality' && 'muted')}>
            <strong>Quality gate</strong>
            <span><Badge variant={qualityCounts.blocking ? 'danger' : 'success'}>{qualityCounts.blocking} blocking</Badge></span>
            <span><Badge variant={qualityCounts.warning ? 'warning' : 'muted'}>{qualityCounts.warning} warning</Badge></span>
            <span><Badge variant="info">{qualityCounts.note} note</Badge></span>
            <code>{qualityReport.items.slice(0, 3).map((item) => `${item.severity}:${item.code}`).join(' · ') || 'ready'}</code>
          </div>
          <div className={cx('scenario-publish-row', builderStep !== 'publish' && 'muted')}>
            <div>
              <Badge variant={compileResult.validationReport.ok ? 'success' : 'warning'}>
                {compileResult.validationReport.ok ? 'validation ok' : `${compileResult.validationReport.issues.length} issues`}
              </Badge>
              {publishStatus ? <span>{publishStatus}</span> : null}
            </div>
            <div>
              <ActionButton icon={FilePlus} variant="secondary" onClick={() => void saveCompiled('draft')}>保存 draft</ActionButton>
              <ActionButton icon={Play} disabled={!compileResult.validationReport.ok} onClick={() => void saveCompiled('published')}>发布</ActionButton>
              {publishStatus.includes('已发布') ? <ActionButton icon={Download} variant="secondary" onClick={() => exportJsonFile(`${compileResult.package.id}-${compileResult.package.version}.scenario-package.json`, compileResult.package)}>导出 package</ActionButton> : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function defaultElementSelectionForScenario(scenarioId: ScenarioId, scenario: ScenarioRuntimeOverride): ScenarioElementSelection {
  const spec = SCENARIO_SPECS[scenarioId];
  const compiledHints = scenario as ScenarioRuntimeOverride & Partial<Pick<ScenarioBuilderDraft, 'recommendedSkillIds' | 'recommendedArtifactTypes' | 'recommendedComponentIds'>>;
  const recommendation = recommendScenarioElements([
    scenario.title,
    scenario.description,
  ].join('\n'));
  return {
    id: `${scenarioId}-workspace-draft`,
    title: scenario.title,
    description: scenario.description,
    skillDomain: scenario.skillDomain,
    scenarioMarkdown: scenario.scenarioMarkdown,
    selectedSkillIds: compiledHints.recommendedSkillIds?.length
      ? compiledHints.recommendedSkillIds
      : recommendation.selectedSkillIds.length
      ? recommendation.selectedSkillIds
      : [`agentserver.generate.${scenario.skillDomain}`],
    selectedToolIds: recommendation.selectedToolIds.length
      ? recommendation.selectedToolIds
      : elementRegistry.tools.filter((tool) => tool.skillDomains.includes(scenario.skillDomain)).slice(0, 5).map((tool) => tool.id),
    selectedArtifactTypes: compiledHints.recommendedArtifactTypes?.length
      ? compiledHints.recommendedArtifactTypes
      : recommendation.selectedArtifactTypes.length
      ? recommendation.selectedArtifactTypes
      : spec.outputArtifacts.map((artifact) => artifact.type),
    selectedComponentIds: compiledHints.recommendedComponentIds?.length
      ? compiledHints.recommendedComponentIds
      : recommendation.selectedComponentIds.length
      ? recommendation.selectedComponentIds
      : scenario.defaultComponents,
    selectedFailurePolicyIds: ['failure.missing-input', 'failure.schema-mismatch', 'failure.backend-unavailable'],
    fallbackComponentId: scenario.fallbackComponent,
    status: 'draft',
  };
}

export function scenarioPackageToOverride(pkg: { scenario: { title: string; description: string; skillDomain: ScenarioRuntimeOverride['skillDomain']; scenarioMarkdown: string; selectedComponentIds: string[]; fallbackComponentId: string } }): ScenarioRuntimeOverride {
  const base = SCENARIO_SPECS[scenarioIdBySkillDomain[pkg.scenario.skillDomain]];
  const defaultComponents = pkg.scenario.selectedComponentIds.length ? pkg.scenario.selectedComponentIds : base.componentPolicy.defaultComponents;
  const packageLike = pkg as { id?: string; version?: string; skillPlan?: { id?: string }; uiPlan?: { id?: string } };
  return {
    title: pkg.scenario.title,
    description: pkg.scenario.description,
    skillDomain: pkg.scenario.skillDomain,
    scenarioMarkdown: pkg.scenario.scenarioMarkdown,
    defaultComponents,
    allowedComponents: Array.from(new Set([...base.componentPolicy.allowedComponents, ...defaultComponents])),
    fallbackComponent: pkg.scenario.fallbackComponentId || base.componentPolicy.fallbackComponent,
    scenarioPackageRef: packageLike.id && packageLike.version ? { id: packageLike.id, version: packageLike.version, source: 'workspace' } : undefined,
    skillPlanRef: packageLike.skillPlan?.id,
    uiPlanRef: packageLike.uiPlan?.id,
  };
}

function toggleList(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function builderRecommendationReasons(
  selection: ScenarioElementSelection,
  scenario: ScenarioRuntimeOverride,
  uiSlotCount: number,
  skillStepCount: number,
) {
  const domain = selection.skillDomain ?? scenario.skillDomain;
  return [
    `skill domain ${domain} 决定默认 skill/tool/profile 搜索空间。`,
    `${selection.selectedSkillIds.length} 个 skill 覆盖 ${selection.selectedArtifactTypes.length} 个 artifact contract。`,
    `${uiSlotCount} 个 UI slot 由已选 artifact consumer 自动编译，fallback=${scenario.fallbackComponent}。`,
    `${skillStepCount} 个 skill step 会进入 package metadata，便于后续 diff 和复现。`,
  ];
}

function componentElementPopover(componentId: string) {
  const component = elementRegistry.components.find((item) => item.componentId === componentId);
  if (!component) {
    return {
      label: componentId,
      detail: '未注册组件会使用 unknown-artifact-inspector fallback。',
      meta: 'producer/consumer unknown · fallback unknown-artifact-inspector',
    };
  }
  return {
    label: component.label,
    detail: component.description,
    meta: `accepts ${component.acceptsArtifactTypes.join(', ') || '*'} · fields ${component.requiredFields.join(', ') || 'none'} · fallback ${component.fallback}`,
  };
}

function ElementPopover({ label, detail, meta }: { label: string; detail: string; meta: string }) {
  return (
    <span className="element-popover" role="tooltip">
      <strong>{label}</strong>
      <small>{detail}</small>
      <em>{meta}</em>
    </span>
  );
}

function ElementSelector({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ id: string; label: string; detail?: string; meta?: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="component-selector">
      <span>{title}</span>
      <div>
        {options.slice(0, 24).map((option) => (
          <button key={option.id} className={cx(selected.includes(option.id) && 'active')} onClick={() => onToggle(option.id)} title={option.label}>
            {option.id}
            <ElementPopover label={option.label} detail={option.detail ?? option.id} meta={option.meta ?? 'no additional profile'} />
          </button>
        ))}
      </div>
    </div>
  );
}
