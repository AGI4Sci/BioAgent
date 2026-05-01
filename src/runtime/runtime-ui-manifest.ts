import type { GatewayRequest } from './runtime-types.js';

const REGISTERED_COMPONENTS = new Set([
  'report-viewer',
  'paper-card-list',
  'molecule-viewer',
  'volcano-plot',
  'heatmap-viewer',
  'umap-viewer',
  'network-graph',
  'data-table',
  'evidence-matrix',
  'execution-unit-table',
  'notebook-timeline',
  'unknown-artifact-inspector',
]);

const COMPONENT_ALIASES: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 'report-viewer', patterns: [/report[-\s]?viewer/i, /research[-\s]?report/i, /报告|总结|系统性整理/i] },
  { id: 'paper-card-list', patterns: [/paper[-\s]?card/i, /paper[-\s]?list/i, /文献卡片|文献列表|论文列表/i] },
  { id: 'molecule-viewer', patterns: [/molecule[-\s]?viewer/i, /structure viewer/i, /mol\*/i, /分子|结构查看|蛋白结构/i] },
  { id: 'volcano-plot', patterns: [/volcano/i, /火山图/i] },
  { id: 'heatmap-viewer', patterns: [/heatmap/i, /热图/i] },
  { id: 'umap-viewer', patterns: [/umap/i, /降维/i] },
  { id: 'network-graph', patterns: [/network[-\s]?graph/i, /drug[-\s]?target network/i, /knowledge graph/i, /网络图|知识图谱|关系网络/i] },
  { id: 'data-table', patterns: [/data[-\s]?table/i, /\btable\b/i, /blast/i, /alignment hits?/i, /数据表|表格|证据表|知识卡片|比对结果/i] },
  { id: 'evidence-matrix', patterns: [/evidence[-\s]?matrix/i, /证据矩阵|证据表/i] },
  { id: 'execution-unit-table', patterns: [/execution[-\s]?unit/i, /可复现|执行单元/i] },
  { id: 'notebook-timeline', patterns: [/notebook[-\s]?timeline/i, /研究记录|时间线/i] },
  { id: 'unknown-artifact-inspector', patterns: [/inspector/i, /原始\s*json|raw json|日志/i] },
];

const DOMAIN_DEFAULT_COMPONENTS: Record<string, string[]> = {
  literature: ['paper-card-list', 'evidence-matrix', 'execution-unit-table'],
  structure: ['molecule-viewer', 'evidence-matrix', 'execution-unit-table'],
  omics: ['volcano-plot', 'heatmap-viewer', 'umap-viewer', 'execution-unit-table'],
  knowledge: ['network-graph', 'data-table', 'evidence-matrix', 'execution-unit-table'],
};

export function composeRuntimeUiManifest(
  incoming: Array<Record<string, unknown>>,
  artifacts: Array<Record<string, unknown>>,
  request: Pick<GatewayRequest, 'prompt' | 'skillDomain' | 'uiState' | 'selectedComponentIds'>,
): Array<Record<string, unknown>> {
  const override = isRecord(request.uiState?.scenarioOverride) ? request.uiState.scenarioOverride : undefined;
  const overrideComponents = toStringList(override?.defaultComponents).filter((id) => REGISTERED_COMPONENTS.has(id));
  const selectedComponents = selectedComponentIdsForRequest(request).filter((id) => REGISTERED_COMPONENTS.has(id));
  const promptComponents = componentsRequestedByPrompt(request.prompt);
  const incomingComponents = incoming
    .map((slot) => typeof slot.componentId === 'string' ? slot.componentId : undefined)
    .filter((id): id is string => typeof id === 'string' && REGISTERED_COMPONENTS.has(id));
  const componentIds = uniqueStrings([
    ...overrideComponents,
    ...selectedComponents,
    ...promptComponents,
    ...(overrideComponents.length || selectedComponents.length || promptComponents.length ? [] : incomingComponents),
    ...(overrideComponents.length || selectedComponents.length || promptComponents.length || incomingComponents.length ? [] : DOMAIN_DEFAULT_COMPONENTS[request.skillDomain] ?? []),
    ...(componentNegated(request.prompt, 'execution-unit-table') ? [] : ['execution-unit-table']),
  ]).slice(0, 8);
  const sourceByComponent = new Map(incoming.map((slot) => [String(slot.componentId || ''), slot]));
  return componentIds.map((componentId, index) => {
    const base = sourceByComponent.get(componentId) ?? {};
    return {
      ...base,
      componentId,
      title: typeof base.title === 'string' && base.title.trim() ? base.title : titleForComponent(componentId),
      artifactRef: typeof base.artifactRef === 'string' && base.artifactRef.trim()
        ? base.artifactRef
        : inferArtifactRef(componentId, artifacts),
      priority: typeof base.priority === 'number' ? base.priority : index + 1,
      encoding: isRecord(base.encoding) ? base.encoding : inferEncoding(request.prompt, componentId),
      layout: isRecord(base.layout) ? base.layout : inferLayout(request.prompt),
    };
  });
}

function selectedComponentIdsForRequest(request: Pick<GatewayRequest, 'selectedComponentIds' | 'uiState'>) {
  return uniqueStrings([
    ...(request.selectedComponentIds ?? []),
    ...toStringList(request.uiState?.selectedComponentIds),
  ]);
}

function componentsRequestedByPrompt(prompt: string) {
  return COMPONENT_ALIASES
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(prompt)))
    .filter((entry) => !componentNegated(prompt, entry.id))
    .map((entry) => entry.id);
}

function componentNegated(prompt: string, componentId: string) {
  const labels: Record<string, string[]> = {
    'paper-card-list': ['paper', '文献', '论文'],
    'molecule-viewer': ['molecule', 'structure', '结构', '分子'],
    'volcano-plot': ['volcano', '火山图'],
    'heatmap-viewer': ['heatmap', '热图'],
    'umap-viewer': ['umap'],
    'network-graph': ['network', '网络图', '知识图谱'],
    'data-table': ['table', '表格', '数据表'],
    'evidence-matrix': ['evidence matrix', '证据矩阵'],
    'execution-unit-table': ['execution unit', '执行单元', '可复现'],
    'notebook-timeline': ['timeline', 'notebook', '时间线', '研究记录'],
  };
  return (labels[componentId] ?? []).some((label) => {
    const escaped = escapeRegExp(label);
    return new RegExp(`(?:不需要|不要|无需|\\bwithout\\b|\\bno\\b)[^。；;,.，\\n]{0,32}${escaped}`, 'i').test(prompt)
      || new RegExp(`${escaped}[^。；;,.，\\n]{0,16}(?:不需要|不要|无需|\\bwithout\\b|\\bno\\b)`, 'i').test(prompt);
  });
}

function inferArtifactRef(componentId: string, artifacts: Array<Record<string, unknown>>) {
  if (componentId === 'evidence-matrix' || componentId === 'execution-unit-table' || componentId === 'notebook-timeline') {
    return firstArtifactRef(artifacts);
  }
  const targetType = componentTargetType(componentId, artifacts);
  if (targetType === 'research-report') return 'research-report';
  const direct = artifacts.find((artifact) => artifact.type === targetType || artifact.id === targetType);
  return refForArtifact(direct) ?? firstArtifactRef(artifacts);
}

function componentTargetType(componentId: string, artifacts: Array<Record<string, unknown>>) {
  if (componentId === 'paper-card-list') return 'paper-list';
  if (componentId === 'report-viewer') return 'research-report';
  if (componentId === 'molecule-viewer') return 'structure-summary';
  if (componentId === 'volcano-plot' || componentId === 'heatmap-viewer' || componentId === 'umap-viewer') return 'omics-differential-expression';
  if (componentId === 'network-graph') return 'knowledge-graph';
  if (componentId === 'data-table') {
    return artifacts.find((artifact) => artifact.type === 'sequence-alignment') ? 'sequence-alignment' : 'knowledge-graph';
  }
  return undefined;
}

function firstArtifactRef(artifacts: Array<Record<string, unknown>>) {
  return refForArtifact(artifacts[0]);
}

function refForArtifact(artifact?: Record<string, unknown>) {
  if (!artifact) return undefined;
  return typeof artifact.id === 'string' ? artifact.id : typeof artifact.type === 'string' ? artifact.type : undefined;
}

function inferEncoding(prompt: string, componentId: string) {
  const encoding: Record<string, unknown> = {};
  const colorBy = prompt.match(/(?:colorBy|按)\s*([A-Za-z0-9_\-\u4e00-\u9fa5]+)\s*(?:着色|color)/i)?.[1];
  const splitBy = prompt.match(/(?:splitBy|按)\s*([A-Za-z0-9_\-\u4e00-\u9fa5]+)\s*(?:分组|拆分|split|facet)/i)?.[1];
  const highlight = prompt.match(/(?:highlight|高亮|标记)\s*([A-Za-z0-9_,\-\s]+)/i)?.[1];
  if (colorBy && (componentId === 'umap-viewer' || componentId === 'network-graph')) encoding.colorBy = colorBy;
  if (splitBy) encoding.splitBy = splitBy;
  if (highlight) encoding.highlightSelection = highlight.split(/[\s,，]+/).filter(Boolean).slice(0, 12);
  return Object.keys(encoding).length ? encoding : undefined;
}

function inferLayout(prompt: string) {
  if (/side[-\s]?by[-\s]?side|并排|对比/.test(prompt)) return { mode: 'side-by-side', columns: 2 };
  if (/grid|网格/.test(prompt)) return { mode: 'grid', columns: 2 };
  return undefined;
}

function titleForComponent(componentId: string) {
  const titles: Record<string, string> = {
    'paper-card-list': '文献卡片',
    'molecule-viewer': '分子结构查看器',
    'volcano-plot': '火山图',
    'heatmap-viewer': '热图',
    'umap-viewer': 'UMAP',
    'network-graph': '知识网络',
    'data-table': '数据表',
    'evidence-matrix': '证据矩阵',
    'execution-unit-table': '可复现执行单元',
    'notebook-timeline': '研究记录',
    'unknown-artifact-inspector': 'Artifact Inspector',
  };
  return titles[componentId] ?? componentId;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
