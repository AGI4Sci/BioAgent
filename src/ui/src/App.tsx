import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  File,
  FileCode,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Lock,
  MessageSquare,
  Plus,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Target,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  scenarios,
  feasibilityRows,
  navItems,
  radarData,
  roleTabs,
  stats,
  type ScenarioId,
  type ClaimType,
  type EvidenceLevel,
  type PageId,
} from './data';
import { SCENARIO_SPECS, SCENARIO_PRESETS, componentManifest } from './scenarioSpecs';
import { scpMarkdownSkills } from './scpSkillCatalog';
import { timeline } from './demoData';
import { sendAgentMessageStream } from './api/agentClient';
import { sendBioAgentToolMessage } from './api/bioagentToolsClient';
import { buildExecutionBundle, evaluateExecutionBundleExport } from './exportPolicy';
import {
  makeId,
  nowIso,
  type AlignmentContractRecord,
  type BioAgentMessage,
  type BioAgentSession,
  type BioAgentWorkspaceState,
  type BioAgentConfig,
  type AgentStreamEvent,
  type EvidenceClaim,
  type NotebookRecord,
  type NormalizedAgentResponse,
  type RuntimeArtifact,
  type RuntimeExecutionUnit,
  type ScenarioRuntimeOverride,
  type UIManifestSlot,
} from './domain';
import { createSession, loadWorkspaceState, resetSession, saveWorkspaceState, versionSession } from './sessionStore';
import { loadBioAgentConfig, saveBioAgentConfig, updateConfig } from './config';
import { listWorkspace, loadPersistedWorkspaceState, mutateWorkspaceFile, persistWorkspaceState, type WorkspaceEntry } from './api/workspaceClient';
import { HeatmapViewer, MoleculeViewer, NetworkGraph, UmapViewer } from './visualizations';

const chartTheme = {
  bg: '#0A0F1A',
  card: '#0F1623',
  elevated: '#1A2332',
  border: '#243044',
  text: '#E8EDF5',
  muted: '#7B93B0',
  accent: '#00E5A0',
  teal: '#4ECDC4',
  coral: '#FF7043',
  amber: '#FFD54F',
};

function cx(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(' ');
}

function checksumText(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <section className={cx('card', onClick && 'clickable', className)} onClick={onClick}>
      {children}
    </section>
  );
}

function Badge({
  children,
  variant = 'info',
  glow = false,
}: {
  children: ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'coral';
  glow?: boolean;
}) {
  return <span className={cx('badge', `badge-${variant}`, glow && 'badge-glow')}>{children}</span>;
}

function IconButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <button className="icon-button" onClick={onClick} title={label} aria-label={label}>
      <Icon size={17} />
    </button>
  );
}

function titleFromPrompt(prompt: string) {
  const title = prompt.trim().replace(/\s+/g, ' ').slice(0, 36);
  return title || '新聊天';
}

function ActionButton({
  icon: Icon,
  children,
  variant = 'primary',
  onClick,
  disabled = false,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'coral';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={cx('action-button', `action-${variant}`)} onClick={onClick} disabled={disabled}>
      {Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

type ScenarioBuilderDraft = ScenarioRuntimeOverride & {
  baseScenarioId: ScenarioId;
  confidence: number;
  summary: string;
};

const scenarioIdBySkillDomain: Record<ScenarioRuntimeOverride['skillDomain'], ScenarioId> = {
  literature: 'literature-evidence-review',
  structure: 'structure-exploration',
  omics: 'omics-differential-exploration',
  knowledge: 'biomedical-knowledge-graph',
};

function inferScenarioDraft(description: string): ScenarioBuilderDraft {
  const text = description.trim();
  const normalized = text.toLowerCase();
  const skillDomain: ScenarioRuntimeOverride['skillDomain'] = /chembl|opentargets|drug|compound|disease|pathway|target priorit|target network|knowledge graph|知识图谱|疾病|化合物|药物|靶点|优先级/.test(normalized)
    ? 'knowledge'
    : /rna|scrna|omics|matrix|deseq|scanpy|umap|表达|差异|组学|单细胞/.test(normalized)
      ? 'omics'
      : /pdb|protein structure|structure|alphafold|ligand|residue|pocket|蛋白结构|结构|口袋|配体|残基/.test(normalized)
        ? 'structure'
        : /pubmed|paper|literature|review|evidence|文献|论文|综述|证据/.test(normalized)
          ? 'literature'
          : 'literature';
  const baseScenarioId = scenarioIdBySkillDomain[skillDomain];
  const base = SCENARIO_SPECS[baseScenarioId];
  const titleSeed = text.replace(/[。.!?？\n].*$/s, '').trim().slice(0, 24);
  const defaultComponents = base.componentPolicy.defaultComponents;
  return {
    baseScenarioId,
    confidence: text.length > 18 ? 0.82 : 0.62,
    summary: `${base.title} · ${defaultComponents.join(' / ')}`,
    title: titleSeed ? `${titleSeed}场景` : base.title,
    description: text || base.description,
    skillDomain,
    defaultComponents,
    allowedComponents: base.componentPolicy.allowedComponents,
    fallbackComponent: base.componentPolicy.fallbackComponent,
    scenarioMarkdown: [
      `# ${titleSeed || base.title}`,
      '',
      `用户目标：${text || base.description}`,
      '',
      `默认展示：${defaultComponents.join('、')}。`,
      '',
      `输入线索：${base.inputContract.map((item) => item.key).join('、')}。`,
      '',
      `输出 artifact：${base.outputArtifacts.map((item) => item.type).join('、')}。`,
      '',
      `边界：${base.scopeDeclaration.unsupportedTasks.slice(0, 3).join('；')}。`,
    ].join('\n'),
  };
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div className="section-title-wrap">
        {Icon ? (
          <div className="section-icon">
            <Icon size={18} />
          </div>
        ) : null}
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; icon?: LucideIcon }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <button key={tab.id} className={cx('tab', active === tab.id && 'active')} onClick={() => onChange(tab.id)}>
          {tab.icon ? <tab.icon size={14} /> : null}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function EvidenceTag({ level }: { level: EvidenceLevel }) {
  const labels: Record<EvidenceLevel, string> = {
    meta: 'Meta分析',
    rct: 'RCT/临床',
    cohort: '队列研究',
    case: '案例报告',
    experimental: '实验验证',
    review: '综述',
    database: '数据库',
    preprint: '预印本',
    prediction: '计算预测',
  };
  const variant: Record<EvidenceLevel, 'success' | 'info' | 'warning' | 'coral' | 'muted'> = {
    meta: 'success',
    rct: 'info',
    cohort: 'warning',
    case: 'coral',
    experimental: 'success',
    review: 'info',
    database: 'muted',
    preprint: 'warning',
    prediction: 'muted',
  };
  return <Badge variant={variant[level]}>{labels[level]}</Badge>;
}

function ClaimTag({ type }: { type: ClaimType }) {
  const labels: Record<ClaimType, string> = { fact: '事实', inference: '推断', hypothesis: '假设' };
  const variant: Record<ClaimType, 'success' | 'warning' | 'coral'> = {
    fact: 'success',
    inference: 'warning',
    hypothesis: 'coral',
  };
  return <Badge variant={variant[type]}>{labels[type]}</Badge>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? '#00E5A0' : pct >= 75 ? '#FFD54F' : '#FF7043';
  return (
    <div className="confidence">
      <div className="confidence-track">
        <div className="confidence-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ color }}>{pct}%</span>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toRecordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function findArtifact(session: BioAgentSession, ref?: string): RuntimeArtifact | undefined {
  if (!ref) return undefined;
  return session.artifacts.find((artifact) => artifact.id === ref || artifact.dataRef === ref || artifact.type === ref);
}

function exportJsonFile(name: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  exportBlob(name, blob);
}

function exportTextFile(name: string, content: string, contentType = 'text/plain') {
  exportBlob(name, new Blob([content], { type: `${contentType};charset=utf-8` }));
}

function exportBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function artifactMeta(artifact?: RuntimeArtifact) {
  if (!artifact) return 'empty';
  return `${artifact.type} · ${artifact.schemaVersion}`;
}

function artifactSource(artifact?: RuntimeArtifact): 'project-tool' | 'record-only' | 'empty' {
  if (!artifact) return 'empty';
  const mode = asString(artifact.metadata?.mode);
  const runner = asString(artifact.metadata?.runner);
  if (mode?.includes('record')) return 'record-only';
  if (runner?.includes('local-csv') || artifact.dataRef?.includes('.bioagent/omics/')) return 'project-tool';
  return 'project-tool';
}

function sourceVariant(source: ReturnType<typeof artifactSource>): 'success' | 'muted' | 'warning' {
  if (source === 'project-tool') return 'success';
  if (source === 'record-only') return 'warning';
  return 'muted';
}

function executionUnitForArtifact(session: BioAgentSession, artifact?: RuntimeArtifact): RuntimeExecutionUnit | undefined {
  if (!artifact) return undefined;
  return session.executionUnits.find((unit) => {
    const refs = [...(unit.artifacts ?? []), ...(unit.outputArtifacts ?? [])];
    return refs.includes(artifact.id) || refs.includes(artifact.type) || (artifact.dataRef ? refs.includes(artifact.dataRef) : false);
  });
}

function slotPayload(slot: UIManifestSlot, artifact?: RuntimeArtifact): Record<string, unknown> {
  if (isRecord(artifact?.data)) return artifact.data;
  return slot.props ?? {};
}

function viewCompositionSummary(slot: UIManifestSlot) {
  const encoding = slot.encoding ?? {};
  const parts = [
    encoding.colorBy ? `colorBy=${encoding.colorBy}` : undefined,
    encoding.splitBy ? `splitBy=${encoding.splitBy}` : undefined,
    encoding.overlayBy ? `overlayBy=${encoding.overlayBy}` : undefined,
    encoding.facetBy ? `facetBy=${encoding.facetBy}` : undefined,
    encoding.syncViewport ? 'syncViewport=true' : undefined,
    slot.layout?.mode ? `layout=${slot.layout.mode}` : undefined,
    slot.compare?.mode ? `compare=${slot.compare.mode}` : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
}

function applyViewTransforms(rows: Record<string, unknown>[], slot: UIManifestSlot) {
  return (slot.transform ?? []).reduce((current, transform) => {
    if (transform.type === 'filter' && transform.field) {
      return current.filter((row) => compareValue(row[transform.field ?? ''], transform.op ?? '==', transform.value));
    }
    if (transform.type === 'sort' && transform.field) {
      return [...current].sort((left, right) => String(left[transform.field ?? ''] ?? '').localeCompare(String(right[transform.field ?? ''] ?? '')));
    }
    if (transform.type === 'limit') {
      const limit = typeof transform.value === 'number' ? transform.value : Number(transform.value);
      return Number.isFinite(limit) && limit >= 0 ? current.slice(0, limit) : current;
    }
    return current;
  }, rows);
}

function compareValue(left: unknown, op: string, right: unknown) {
  const leftNumber = typeof left === 'number' ? left : typeof left === 'string' ? Number(left) : Number.NaN;
  const rightNumber = typeof right === 'number' ? right : typeof right === 'string' ? Number(right) : Number.NaN;
  if (op === '<=' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber <= rightNumber;
  if (op === '>=' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber >= rightNumber;
  if (op === '<' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber < rightNumber;
  if (op === '>' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber > rightNumber;
  if (op === '!=' || op === '!==') return String(left ?? '') !== String(right ?? '');
  return String(left ?? '') === String(right ?? '');
}

function arrayPayload(slot: UIManifestSlot, key: string, artifact?: RuntimeArtifact): Record<string, unknown>[] {
  const payload = artifact?.data ?? slot.props?.[key] ?? slot.props;
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (isRecord(payload) && Array.isArray(payload[key])) return payload[key].filter(isRecord);
  return [];
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function asNumberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry)) : [];
}

function asNumberMatrix(value: unknown): number[][] | undefined {
  if (!Array.isArray(value)) return undefined;
  const matrix = value.map(asNumberList).filter((row) => row.length > 0);
  return matrix.length ? matrix : undefined;
}

function pickEvidenceLevel(value: unknown): EvidenceLevel {
  const levels: EvidenceLevel[] = ['meta', 'rct', 'cohort', 'case', 'experimental', 'review', 'database', 'preprint', 'prediction'];
  return levels.includes(value as EvidenceLevel) ? value as EvidenceLevel : 'prediction';
}

function compactParams(params: string) {
  return params.length > 128 ? `${params.slice(0, 125)}...` : params;
}

function exportExecutionBundle(session: BioAgentSession) {
  const decision = evaluateExecutionBundleExport(session);
  if (!decision.allowed) {
    window.alert(`导出被 artifact policy 阻止：${decision.blockedArtifactIds.join(', ')}`);
    return;
  }
  exportJsonFile(`execution-units-${session.scenarioId}-${session.sessionId}.json`, buildExecutionBundle(session, decision));
}

const extensionTools = [
  { name: 'Workspace Runtime Gateway', detail: 'deterministic task dispatch / artifact JSON / ExecutionUnit', kind: 'runtime' },
  { name: 'MCP Tool Adapters', detail: 'fixed remote tool flows and connector contracts', kind: 'mcp' },
  { name: 'PubMed E-utilities', detail: 'literature search and paper-list artifacts', kind: 'database' },
  { name: 'RCSB / AlphaFold DB', detail: 'structure metadata, coordinate download and parsing', kind: 'database' },
  { name: 'UniProt / ChEMBL', detail: 'protein, compound and mechanism lookups', kind: 'database' },
  { name: 'NCBI BLAST URL API', detail: 'BLASTP sequence-alignment artifacts', kind: 'database' },
  { name: 'Python / R / Shell / CLI Runner', detail: 'workspace-local reproducible task execution', kind: 'runner' },
  { name: 'AgentServer Repair Bridge', detail: 'task generation and self-heal fallback', kind: 'fallback' },
];

const executableSeedSkills = [
  'literature.pubmed_search',
  'structure.rcsb_latest_or_entry',
  'omics.differential_expression',
  'knowledge.uniprot_chembl_lookup',
  'sequence.ncbi_blastp_search',
  'inspector.generic_file_table_log',
];

function Sidebar({
  page,
  setPage,
  scenarioId,
  setScenarioId,
  config,
  workspaceStatus,
  onWorkspacePathChange,
}: {
  page: PageId;
  setPage: (page: PageId) => void;
  scenarioId: ScenarioId;
  setScenarioId: (id: ScenarioId) => void;
  config: BioAgentConfig;
  workspaceStatus: string;
  onWorkspacePathChange: (value: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activePanel, setActivePanel] = useState<'navigation' | 'workspace' | 'extensions'>('navigation');
  const [sidebarWidth, setSidebarWidth] = useState(284);
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([]);
  const [workspaceError, setWorkspaceError] = useState('');
  const [selectedEntryPath, setSelectedEntryPath] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry?: WorkspaceEntry } | null>(null);
  const resizingRef = useRef(false);

  useEffect(() => {
    if (collapsed) return;
    function handleMouseMove(event: MouseEvent) {
      if (!resizingRef.current) return;
      const nextWidth = Math.min(420, Math.max(220, event.clientX));
      setSidebarWidth(nextWidth);
    }
    function handleMouseUp() {
      resizingRef.current = false;
    }
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [collapsed]);

  function handlePanelSwitch(panel: 'navigation' | 'workspace' | 'extensions') {
    setActivePanel(panel);
    setCollapsed(false);
  }

  useEffect(() => {
    if (activePanel !== 'workspace' || collapsed) return;
    void refreshWorkspace();
  }, [activePanel, collapsed, config.workspacePath, config.workspaceWriterBaseUrl]);

  useEffect(() => {
    if (!contextMenu) return;
    function closeMenu() {
      setContextMenu(null);
    }
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [contextMenu]);

  async function refreshWorkspace() {
    try {
      setWorkspaceError('');
      setWorkspaceEntries(await listWorkspace(config.workspacePath, config));
    } catch (err) {
      setWorkspaceEntries([]);
      setWorkspaceError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runWorkspaceAction(action: 'create-file' | 'create-folder' | 'rename' | 'delete', entry?: WorkspaceEntry) {
    const basePath = entry?.kind === 'folder' ? entry.path : config.workspacePath;
    const selectedPath = entry?.path || config.workspacePath;
    let targetPath = selectedPath;
    let renameTarget: string | undefined;
    if (action === 'create-file') {
      const name = window.prompt('新文件名', 'notes.md');
      if (!name) return;
      targetPath = `${basePath.replace(/\/+$/, '')}/${name}`;
    } else if (action === 'create-folder') {
      const name = window.prompt('新文件夹名', 'new-folder');
      if (!name) return;
      targetPath = `${basePath.replace(/\/+$/, '')}/${name}`;
    } else if (action === 'rename') {
      if (!entry) return;
      const name = window.prompt('重命名为', entry.name);
      if (!name || name === entry.name) return;
      renameTarget = `${entry.path.slice(0, -entry.name.length)}${name}`;
    } else if (action === 'delete') {
      if (!entry || !window.confirm(`删除 ${entry.name}？`)) return;
    }
    try {
      setWorkspaceError('');
      await mutateWorkspaceFile(config, action, { path: targetPath, targetPath: renameTarget });
      await refreshWorkspace();
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <aside className={cx('sidebar', collapsed && 'collapsed')} style={{ width: collapsed ? 46 : sidebarWidth }}>
      <div className="sidebar-activitybar">
        <div className="brand">
          <div className="brand-mark">BA</div>
        </div>
        <button
          className={cx('activity-item', activePanel === 'navigation' && !collapsed && 'active')}
          onClick={() => handlePanelSwitch('navigation')}
          title="导航"
          aria-label="导航"
        >
          <Target size={18} />
        </button>
        <button
          className={cx('activity-item', activePanel === 'workspace' && !collapsed && 'active')}
          onClick={() => handlePanelSwitch('workspace')}
          title="工作目录"
          aria-label="工作目录"
        >
          <FileText size={18} />
        </button>
        <button
          className={cx('activity-item', activePanel === 'extensions' && !collapsed && 'active')}
          onClick={() => handlePanelSwitch('extensions')}
          title="拓展"
          aria-label="拓展"
        >
          <Sparkles size={18} />
        </button>
        {collapsed ? (
          <button className="collapse-button top-toggle" onClick={() => setCollapsed(false)} title="展开侧栏" aria-label="展开侧栏">
            <ChevronRight size={16} />
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">
            <span>
              {activePanel === 'navigation' ? '导航' : activePanel === 'workspace' ? '资源管理器' : '拓展'}
            </span>
            <button className="panel-collapse-button" onClick={() => setCollapsed(true)} title="收起侧栏" aria-label="收起侧栏">
              <ChevronLeft size={16} />
            </button>
          </div>
          <div className="sidebar-panel-body">
            {activePanel === 'navigation' ? (
              <>
                <nav className="nav-section">
                  {navItems.map((item) => (
                    <button key={item.id} className={cx('nav-item', page === item.id && 'active')} onClick={() => setPage(item.id)}>
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </nav>
                <div className="scenario-list">
                  <div className="sidebar-label">场景模板</div>
                  {scenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      className={cx('scenario-nav', scenarioId === scenario.id && page === 'workbench' && 'active')}
                      onClick={() => {
                        setScenarioId(scenario.id);
                        setPage('workbench');
                      }}
                    >
                      <span className="scenario-nav-icon" style={{ color: scenario.color, background: `${scenario.color}16` }}>
                        <scenario.icon size={15} />
                      </span>
                      <span className="scenario-nav-copy">
                        <strong>{scenario.name}</strong>
                        <small>{SCENARIO_PRESETS[scenario.id].skillDomain} · {scenario.defaultResult}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {activePanel === 'workspace' ? (
              <div className="sidebar-tree">
                <div className="sidebar-label">当前工作目录</div>
                <input
                  className="workspace-path-editor"
                  value={config.workspacePath}
                  onChange={(event) => onWorkspacePathChange(event.target.value)}
                  onBlur={() => void refreshWorkspace()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void refreshWorkspace();
                  }}
                  title={workspaceStatus || 'BioAgent workspace path'}
                />
                <div className="workspace-toolbar">
                  <button onClick={() => void runWorkspaceAction('create-file')} title="新建文件" aria-label="新建文件"><FilePlus size={14} /></button>
                  <button onClick={() => void runWorkspaceAction('create-folder')} title="新建文件夹" aria-label="新建文件夹"><FolderPlus size={14} /></button>
                  <button onClick={() => void refreshWorkspace()} title="刷新" aria-label="刷新"><RefreshCw size={14} /></button>
                </div>
                {workspaceError ? <p className="workspace-error">{workspaceError}</p> : null}
                {workspaceEntries.map((entry) => (
                  <button
                    key={entry.path}
                    className={cx('tree-item', selectedEntryPath === entry.path && 'active')}
                    onClick={() => setSelectedEntryPath(entry.path)}
                    onDoubleClick={() => entry.kind === 'folder' && onWorkspacePathChange(entry.path)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setSelectedEntryPath(entry.path);
                      setContextMenu({ x: event.clientX, y: event.clientY, entry });
                    }}
                    title={entry.path}
                  >
                    {entry.kind === 'folder' ? <Folder size={14} /> : <File size={14} />}
                    <span>{entry.name}</span>
                  </button>
                ))}
                {contextMenu ? (
                  <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
                    <button onClick={() => void runWorkspaceAction('create-file', contextMenu.entry)}>新建文件</button>
                    <button onClick={() => void runWorkspaceAction('create-folder', contextMenu.entry)}>新建文件夹</button>
                    {contextMenu.entry ? <button onClick={() => void runWorkspaceAction('rename', contextMenu.entry)}>重命名</button> : null}
                    {contextMenu.entry ? <button onClick={() => void navigator.clipboard?.writeText(contextMenu.entry?.path || '')}>复制路径</button> : null}
                    {contextMenu.entry ? <button className="danger" onClick={() => void runWorkspaceAction('delete', contextMenu.entry)}>删除</button> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {activePanel === 'extensions' ? (
              <div className="sidebar-tree">
                <div className="extension-section">
                  <div className="sidebar-label">Tools</div>
                  <p className="extension-note">确定性的 MCP tool、数据库 connector、runtime runner 和修复流程。</p>
                  {extensionTools.map((tool) => (
                    <div key={tool.name} className="extension-row" title={`${tool.name}: ${tool.detail}`}>
                      <span className="extension-icon"><Settings size={13} /></span>
                      <span className="extension-copy">
                        <strong>{tool.name}</strong>
                        <small>{tool.kind} · {tool.detail}</small>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="extension-section">
                  <div className="sidebar-label">Skills</div>
                  <p className="extension-note">Markdown skill 是可读、可安装、可沉淀的任务知识；seed skill 带可执行入口。</p>
                  <div className="extension-subhead">
                    <span>Seed executable skills</span>
                    <code>{executableSeedSkills.length}</code>
                  </div>
                  {executableSeedSkills.map((skill) => (
                    <div key={skill} className="extension-row compact" title={`skills/seed/${skill}/skill.json`}>
                      <span className="extension-icon"><FileCode size={13} /></span>
                      <span className="extension-copy">
                        <strong>{skill}</strong>
                        <small>skills/seed executable manifest</small>
                      </span>
                    </div>
                  ))}
                  <div className="extension-subhead">
                    <span>SCP markdown skills</span>
                    <code>{scpMarkdownSkills.length}</code>
                  </div>
                  <div className="skill-catalog-list">
                    {scpMarkdownSkills.map((skill) => (
                      <div key={skill.id} className="extension-row compact" title={`${skill.description}\n${skill.path}`}>
                        <span className="extension-icon"><FileText size={13} /></span>
                        <span className="extension-copy">
                          <strong>{skill.name}</strong>
                          <small>{skill.description}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {!collapsed ? (
        <div
          className="resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整左侧栏宽度"
          onMouseDown={() => {
            resizingRef.current = true;
          }}
        />
      ) : null}
    </aside>
  );
}

function TopBar({
  onSearch,
  onSettingsOpen,
}: {
  onSearch: (query: string) => void;
  onSettingsOpen: () => void;
}) {
  const [query, setQuery] = useState('');
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch(query);
  }
  return (
    <header className="topbar">
      <form className="searchbox" onSubmit={handleSubmit}>
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索基因、通路、文献、Execution Unit..." />
      </form>
      <div className="topbar-actions">
        <Badge variant="info" glow>
          Scenario Runtime
        </Badge>
        <IconButton icon={Settings} label="设置" onClick={onSettingsOpen} />
      </div>
    </header>
  );
}

function SettingsDialog({
  config,
  onChange,
  onClose,
}: {
  config: BioAgentConfig;
  onChange: (patch: Partial<BioAgentConfig>) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="BioAgent 设置" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-head">
          <div>
            <h2>设置</h2>
            <p>统一配置 AgentServer、模型连接和本地 workspace。</p>
          </div>
          <IconButton icon={ChevronDown} label="关闭设置" onClick={onClose} />
        </div>
        <div className="settings-grid">
          <label>
            <span>AgentServer Base URL</span>
            <input value={config.agentServerBaseUrl} onChange={(event) => onChange({ agentServerBaseUrl: event.target.value })} />
          </label>
          <label>
            <span>Workspace Writer URL</span>
            <input value={config.workspaceWriterBaseUrl} onChange={(event) => onChange({ workspaceWriterBaseUrl: event.target.value })} />
          </label>
          <label className="wide">
            <span>Workspace Path</span>
            <input value={config.workspacePath} onChange={(event) => onChange({ workspacePath: event.target.value })} />
          </label>
          <label>
            <span>Model Provider</span>
            <select value={config.modelProvider} onChange={(event) => onChange({ modelProvider: event.target.value })}>
              <option value="native">native backend default</option>
              <option value="openai-compatible">openai-compatible</option>
              <option value="openrouter">openrouter</option>
              <option value="qwen">qwen</option>
              <option value="codex-chatgpt">codex-chatgpt</option>
              <option value="gemini">gemini</option>
            </select>
          </label>
          <label>
            <span>Model Name</span>
            <input value={config.modelName} onChange={(event) => onChange({ modelName: event.target.value })} placeholder="gpt-5.4 / local-model / ..." />
          </label>
          <label>
            <span>Model Base URL</span>
            <input value={config.modelBaseUrl} onChange={(event) => onChange({ modelBaseUrl: event.target.value })} placeholder="https://.../v1" />
          </label>
          <label>
            <span>API Key</span>
            <input type="password" value={config.apiKey} onChange={(event) => onChange({ apiKey: event.target.value })} placeholder="stored in local config.json" />
          </label>
          <label>
            <span>Timeout ms</span>
            <input
              type="number"
              min={30000}
              step={10000}
              value={config.requestTimeoutMs}
              onChange={(event) => onChange({ requestTimeoutMs: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="settings-save-state" role="status">
          <span className="status-dot online" />
          <span>
            已自动保存到本机浏览器。下一次 AgentServer 请求会使用当前模型：
            {' '}
            <strong>{config.modelProvider || 'native'}</strong>
            {config.modelName.trim() ? <code>{config.modelName.trim()}</code> : <em>backend default</em>}
          </span>
        </div>
      </section>
    </div>
  );
}

function Dashboard({
  setPage,
  setScenarioId,
  onApplyScenarioDraft,
}: {
  setPage: (page: PageId) => void;
  setScenarioId: (id: ScenarioId) => void;
  onApplyScenarioDraft: (scenarioId: ScenarioId, draft: ScenarioRuntimeOverride) => void;
}) {
  const [scenarioPrompt, setScenarioPrompt] = useState('我想比较KRAS G12D突变相关文献证据，并在需要时联动蛋白结构和知识图谱。');
  const [scenarioDraft, setScenarioDraft] = useState<ScenarioBuilderDraft>(() => inferScenarioDraft('我想比较KRAS G12D突变相关文献证据，并在需要时联动蛋白结构和知识图谱。'));
  const activityData = [
    { day: 'Mon', papers: 28, eus: 4 },
    { day: 'Tue', papers: 36, eus: 7 },
    { day: 'Wed', papers: 42, eus: 8 },
    { day: 'Thu', papers: 51, eus: 11 },
    { day: 'Fri', papers: 47, eus: 13 },
    { day: 'Sat', papers: 66, eus: 16 },
  ];
  return (
    <main className="page dashboard">
      <div className="page-heading">
        <h1>研究概览</h1>
        <p>场景 markdown 编译为 ScenarioSpec，LLM 只生成结构化 artifact 和 UIManifest，组件库负责专业展示。</p>
      </div>

      <div className="stats-grid">
        {stats.map((stat) => (
          <Card key={stat.label} className="stat-card">
            <div className="stat-icon" style={{ color: stat.color, background: `${stat.color}18` }}>
              <stat.icon size={18} />
            </div>
            <div>
              <div className="stat-value" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="stat-label">{stat.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <section className="scenario-builder">
        <div className="scenario-builder-copy">
          <Badge variant="info">AI Scenario Builder</Badge>
          <h2>描述你的研究场景，生成可编辑设置</h2>
          <p>从一句自然语言开始，系统会选择 skill domain、推荐组件集合，并生成 Scenario markdown 草案。</p>
        </div>
        <div className="scenario-builder-box">
          <textarea
            value={scenarioPrompt}
            onChange={(event) => setScenarioPrompt(event.target.value)}
            placeholder="例如：帮我构建一个场景，读取单细胞表达矩阵，比较处理组和对照组，并展示火山图、热图和UMAP。"
          />
          <div className="scenario-builder-actions">
            <ActionButton icon={Sparkles} onClick={() => setScenarioDraft(inferScenarioDraft(scenarioPrompt))}>生成场景设置</ActionButton>
            <ActionButton
              icon={Play}
              variant="secondary"
              onClick={() => {
                onApplyScenarioDraft(scenarioDraft.baseScenarioId, scenarioDraft);
                setScenarioId(scenarioDraft.baseScenarioId);
                setPage('workbench');
              }}
            >
              进入场景工作台
            </ActionButton>
          </div>
        </div>
        <div className="scenario-draft-preview">
          <div>
            <span>推荐场景</span>
            <strong>{scenarioDraft.title}</strong>
            <em>{scenarioDraft.summary} · confidence {Math.round(scenarioDraft.confidence * 100)}%</em>
          </div>
          <div className="component-pills">
            {scenarioDraft.defaultComponents.map((component) => <code key={component}>{component}</code>)}
          </div>
          <pre>{scenarioDraft.scenarioMarkdown}</pre>
        </div>
      </section>

      <div className="dashboard-grid">
        <Card className="wide">
          <SectionHeader icon={Shield} title="Scenario-first 架构状态" subtitle="所有场景共享同一套 chat / runtime / evidence / component registry" />
          <div className="principles">
            {[
              ['场景即契约', '用户可以用 markdown 描述目标、输入输出、组件集合和诚实边界。'],
              ['配置驱动 UI', '场景差异通过 ScenarioSpec + UIManifest + registry 表达。'],
              ['可复现执行', 'ExecutionUnit 记录代码、参数、环境、数据指纹和产物。'],
              ['组件库优先', 'LLM 选择已注册组件和 View Composition；动态 plugin 默认关闭。'],
            ].map(([title, text]) => (
              <div className="principle" key={title}>
                <Check size={16} />
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader icon={Target} title="最近活跃度" subtitle="workspace runtime events" />
          <div className="chart-220">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="bioArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#00E5A0" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="#00E5A0" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#243044" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: '#7B93B0', fontSize: 11 }} />
                <YAxis tick={{ fill: '#7B93B0', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1A2332', border: '1px solid #243044', borderRadius: 8 }} />
                <Area dataKey="papers" stroke="#00E5A0" fill="url(#bioArea)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <section>
        <SectionHeader title="模板库" subtitle="从稳定模板开始，也可以进入后继续编辑 Scenario 设置" />
        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <Card
              key={scenario.id}
              className="scenario-card"
              onClick={() => {
                setScenarioId(scenario.id);
                setPage('workbench');
              }}
            >
              <div className="scenario-card-top">
                <div className="scenario-card-icon" style={{ color: scenario.color, background: `${scenario.color}18` }}>
                  <scenario.icon size={23} />
                </div>
                <Badge variant="muted">{SCENARIO_PRESETS[scenario.id].skillDomain}</Badge>
              </div>
              <h3 style={{ color: scenario.color }}>{SCENARIO_PRESETS[scenario.id].title}</h3>
              <p>{SCENARIO_PRESETS[scenario.id].description}</p>
              <div className="tool-chips">
                {scenario.tools.map((tool) => (
                  <span key={tool}>{tool}</span>
                ))}
              </div>
              <div className="scenario-note">
                <code>{SCENARIO_PRESETS[scenario.id].id}</code>
                <span>{componentManifest[scenario.id].length} UI modules</span>
              </div>
              <div className="manifest-strip">
                {componentManifest[scenario.id].map((component) => (
                  <i key={component} title={component} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

function ChatPanel({
  scenarioId,
  role,
  config,
  session,
  input,
  savedScrollTop,
  onInputChange,
  onScrollTopChange,
  onSessionChange,
  onNewChat,
  onDeleteChat,
  archivedSessions,
  onRestoreArchivedSession,
  onEditMessage,
  onDeleteMessage,
  archivedCount,
  autoRunRequest,
  onAutoRunConsumed,
  scenarioOverride,
}: {
  scenarioId: ScenarioId;
  role: string;
  config: BioAgentConfig;
  session: BioAgentSession;
  input: string;
  savedScrollTop: number;
  onInputChange: (value: string) => void;
  onScrollTopChange: (value: number) => void;
  onSessionChange: (session: BioAgentSession) => void;
  onNewChat: () => void;
  onDeleteChat: () => void;
  archivedSessions: BioAgentSession[];
  onRestoreArchivedSession: (sessionId: string) => void;
  onEditMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  archivedCount: number;
  autoRunRequest?: HandoffAutoRunRequest;
  onAutoRunConsumed: (requestId: string) => void;
  scenarioOverride?: ScenarioRuntimeOverride;
}) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [composerHeight, setComposerHeight] = useState(88);
  const [streamEvents, setStreamEvents] = useState<AgentStreamEvent[]>([]);
  const [guidanceQueue, setGuidanceQueue] = useState<string[]>([]);
  const activeSessionRef = useRef(session);
  const guidanceQueueRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const messages = session.messages;
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];

  useEffect(() => {
    activeSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    guidanceQueueRef.current = guidanceQueue;
  }, [guidanceQueue]);

  useEffect(() => {
    setStreamEvents([]);
    setGuidanceQueue([]);
    setErrorText('');
  }, [scenarioId, session.sessionId]);

  useEffect(() => {
    if (autoScrollRef.current) {
      messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, isSending]);

  useEffect(() => {
    if (!autoRunRequest || autoRunRequest.targetScenario !== scenarioId || isSending) return;
    onAutoRunConsumed(autoRunRequest.id);
    window.setTimeout(() => {
      void runPrompt(autoRunRequest.prompt, activeSessionRef.current);
    }, 120);
  }, [scenarioId, autoRunRequest, isSending, onAutoRunConsumed]);

  useEffect(() => {
    setErrorText('');
    setExpanded(0);
    const element = messagesRef.current;
    if (element) {
      element.scrollTo({ top: savedScrollTop, behavior: 'auto' });
      autoScrollRef.current = savedScrollTop <= 0;
    }
  }, [scenarioId, savedScrollTop]);

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt) return;
    if (isSending) {
      handleRunningGuidance(prompt);
      return;
    }
    await runPrompt(prompt, session);
  }

  async function runPrompt(prompt: string, baseSession: BioAgentSession) {
    const userMessage: BioAgentMessage = {
      id: makeId('msg'),
      role: 'user',
      content: prompt,
      createdAt: nowIso(),
      status: 'completed',
    };
    const optimisticSession: BioAgentSession = {
      ...baseSession,
      title: baseSession.runs.length || baseSession.messages.some((message) => message.id.startsWith('msg'))
        ? baseSession.title
        : titleFromPrompt(prompt),
      messages: [...baseSession.messages, userMessage],
      updatedAt: nowIso(),
    };
    onSessionChange(optimisticSession);
    onInputChange('');
    setErrorText('');
    setStreamEvents([{
      id: makeId('evt'),
      type: 'queued',
      label: '已提交',
      detail: prompt,
      createdAt: nowIso(),
    }]);
    setIsSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const request = {
        scenarioId,
        agentName: scenario.name,
        agentDomain: scenario.domain,
        prompt,
        roleView: role,
        messages: optimisticSession.messages,
        artifacts: optimisticSession.artifacts,
        config,
        scenarioOverride,
      };
      let response: NormalizedAgentResponse;
      try {
        response = await sendBioAgentToolMessage(request, {
          onEvent(event) {
            setStreamEvents((current) => [...current.slice(-32), event]);
          },
        }, controller.signal);
      } catch (projectToolError) {
        const detail = projectToolError instanceof Error ? projectToolError.message : String(projectToolError);
        setStreamEvents((current) => [...current.slice(-32), {
          id: makeId('evt'),
          type: 'project-tool-fallback',
          label: '项目工具',
          detail: `BioAgent project tool unavailable, falling back to AgentServer: ${detail}`,
          createdAt: nowIso(),
          raw: { error: detail },
        }]);
        response = await sendAgentMessageStream(request, {
          onEvent(event) {
            setStreamEvents((current) => [...current.slice(-32), event]);
          },
        }, controller.signal);
      }
      const mergedSession = mergeAgentResponse(activeSessionRef.current, response);
      onSessionChange(mergedSession);
      activeSessionRef.current = mergedSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(message);
      onSessionChange({
        ...optimisticSession,
        messages: [
          ...optimisticSession.messages,
          {
            id: makeId('msg'),
            role: 'system',
            content: message,
            createdAt: nowIso(),
            status: 'failed',
          },
        ],
        runs: [
          ...optimisticSession.runs,
          {
            id: makeId('run'),
            scenarioId,
            status: 'failed',
            prompt,
            response: message,
            createdAt: nowIso(),
            completedAt: nowIso(),
          },
        ],
        updatedAt: nowIso(),
      });
    } finally {
      setIsSending(false);
      abortRef.current = null;
      const [nextGuidance, ...rest] = guidanceQueueRef.current;
      if (nextGuidance) {
        setGuidanceQueue(rest);
        window.setTimeout(() => {
          void runPrompt(nextGuidance, activeSessionRef.current);
        }, 80);
      }
    }
  }

  function handleRunningGuidance(prompt: string) {
    const now = nowIso();
    const guidanceMessage: BioAgentMessage = {
      id: makeId('msg'),
      role: 'user',
      content: `运行中引导：${prompt}`,
      createdAt: now,
      status: 'running',
    };
    const nextSession: BioAgentSession = {
      ...activeSessionRef.current,
      messages: [...activeSessionRef.current.messages, guidanceMessage],
      updatedAt: now,
    };
    activeSessionRef.current = nextSession;
    onSessionChange(nextSession);
    onInputChange('');
    setGuidanceQueue((current) => [...current, prompt]);
    setStreamEvents((current) => [...current.slice(-32), {
      id: makeId('evt'),
      type: 'guidance-queued',
      label: '引导已排队',
      detail: prompt,
      createdAt: now,
    }]);
  }

  function handleAbort() {
    abortRef.current?.abort();
  }

  function beginComposerResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    resizeStateRef.current = { startY: event.clientY, startHeight: composerHeight };
    const handleMove = (moveEvent: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = state.startY - moveEvent.clientY;
      const nextHeight = Math.max(36, Math.min(360, state.startHeight + delta));
      setComposerHeight(nextHeight);
    };
    const handleUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function mergeAgentResponse(baseSession: BioAgentSession, response: NormalizedAgentResponse): BioAgentSession {
    return {
      ...baseSession,
      messages: [...baseSession.messages, response.message],
      runs: [...baseSession.runs, response.run],
      uiManifest: response.uiManifest.length ? response.uiManifest : baseSession.uiManifest,
      claims: [...response.claims, ...baseSession.claims].slice(0, 24),
      executionUnits: [...response.executionUnits, ...baseSession.executionUnits].slice(0, 24),
      artifacts: [...response.artifacts, ...baseSession.artifacts].slice(0, 24),
      notebook: [...response.notebook, ...baseSession.notebook].slice(0, 24),
      updatedAt: nowIso(),
    };
  }

  function handleClear() {
    if (isSending) abortRef.current?.abort();
    onSessionChange(resetSession(scenarioId));
  }

  function handleExport() {
    exportJsonFile(`${scenarioId}-${session.sessionId}.json`, session);
  }

  function beginEditMessage(message: BioAgentMessage) {
    setEditingMessageId(message.id);
    setEditingContent(message.content);
  }

  function saveEditMessage() {
    const content = editingContent.trim();
    if (!editingMessageId || !content) return;
    onEditMessage(editingMessageId, content);
    setEditingMessageId(null);
    setEditingContent('');
  }

  function handleMessagesScroll() {
    const element = messagesRef.current;
    if (!element) return;
    autoScrollRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    onScrollTopChange(element.scrollTop);
  }

  return (
    <div className="chat-panel">
      <div className="panel-title compact">
        <div className="scenario-mini" style={{ background: `${scenario.color}18`, color: scenario.color }}>
          <scenario.icon size={18} />
        </div>
        <div>
          <strong>{scenario.name}</strong>
          <span>{session.title} · {scenario.tools.join(' / ')}</span>
        </div>
        <Badge variant="success" glow>在线</Badge>
        <Badge variant="muted">{session.versions.length} versions</Badge>
        {archivedCount ? <Badge variant="muted">{archivedCount} archived</Badge> : null}
        <div className="panel-actions">
          <IconButton icon={Plus} label="开启新聊天" onClick={onNewChat} />
          <IconButton icon={Clock} label="历史会话" onClick={() => setHistoryOpen((value) => !value)} />
          {isSending ? <IconButton icon={RefreshCw} label="取消请求" onClick={handleAbort} /> : null}
          <IconButton icon={Download} label="导出当前 Scenario 会话" onClick={handleExport} />
          <IconButton icon={Trash2} label="删除当前聊天" onClick={onDeleteChat} />
        </div>
      </div>

      {historyOpen ? (
        <SessionHistoryPanel
          currentSession={session}
          archivedSessions={archivedSessions}
          onRestore={(sessionId) => {
            onRestoreArchivedSession(sessionId);
            setHistoryOpen(false);
          }}
        />
      ) : null}

      <div className="messages" ref={messagesRef} onScroll={handleMessagesScroll}>
        {!messages.length ? (
          <div className="chat-empty">
            <MessageSquare size={18} />
            <strong>新聊天已就绪</strong>
            <span>输入研究问题后，当前 Scenario 会从一个干净上下文开始工作。</span>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div key={message.id} className={cx('message', message.role)}>
            <div className="message-body">
              <div className="message-meta">
                <strong>{message.role === 'user' ? '你' : message.role === 'system' ? '系统' : scenario.name}</strong>
                {message.confidence ? <ConfidenceBar value={message.confidence} /> : null}
                {message.evidence ? <EvidenceTag level={message.evidence} /> : null}
                {message.claimType ? <ClaimTag type={message.claimType} /> : null}
                {message.status === 'failed' ? <Badge variant="danger">failed</Badge> : null}
              </div>
              {editingMessageId === message.id ? (
                <div className="message-editor">
                  <textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} />
                  <div>
                    <button onClick={saveEditMessage}>保存</button>
                    <button onClick={() => setEditingMessageId(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <p>{message.content}</p>
              )}
              <div className="message-actions">
                <button onClick={() => beginEditMessage(message)}>编辑</button>
                <button onClick={() => onDeleteMessage(message.id)}>删除</button>
              </div>
              {message.expandable ? (
                <>
                  <button className="expand-link" onClick={() => setExpanded(expanded === index ? null : index)}>
                    {expanded === index ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {expanded === index ? '收起推理链' : '展开推理链'}
                  </button>
                  {expanded === index ? <pre className="reasoning">{message.expandable}</pre> : null}
                </>
              ) : null}
            </div>
          </div>
        ))}
        {isSending ? (
          <div className="message scenario">
            <div className="message-body">
              <div className="message-meta">
                <strong>{scenario.name}</strong>
                <Badge variant="info">running</Badge>
              </div>
              <p>正在调用 AgentServer...</p>
            </div>
          </div>
        ) : null}
      </div>

      {isSending || streamEvents.length ? (
        <div className="stream-events">
          <div className="stream-events-head">
            <span>流式事件</span>
            {guidanceQueue.length ? <Badge variant="warning">{guidanceQueue.length} 条引导排队</Badge> : null}
          </div>
          <div className="stream-events-list">
            {streamEvents.slice(-8).map((event) => (
              <div className="stream-event" key={event.id}>
                <Badge variant={event.type.includes('error') ? 'danger' : event.type.includes('guidance') ? 'warning' : 'info'}>{event.label}</Badge>
                {event.detail ? <span>{event.detail}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {errorText ? (
        <div className="composer-error">
          <span>{errorText}</span>
        </div>
      ) : null}
      <div className="composer">
        <div className="composer-resize-handle" onMouseDown={beginComposerResize} title="拖拽调整输入框高度" />
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void handleSend();
          }}
          placeholder={isSending ? '继续输入引导，Enter 后排队到当前推理之后...' : '输入研究问题...'}
          rows={1}
          style={{ height: `${composerHeight}px` }}
        />
        <ActionButton icon={Sparkles} onClick={handleSend} disabled={!input.trim()}>
          {isSending ? '引导' : '发送'}
        </ActionButton>
      </div>
    </div>
  );
}

function SessionHistoryPanel({
  currentSession,
  archivedSessions,
  onRestore,
}: {
  currentSession: BioAgentSession;
  archivedSessions: BioAgentSession[];
  onRestore: (sessionId: string) => void;
}) {
  const currentStats = sessionHistoryStats(currentSession);
  return (
    <div className="session-history-panel">
      <div className="session-history-head">
        <div>
          <strong>历史会话</strong>
          <span>当前：{currentSession.title}</span>
        </div>
        <Badge variant="muted">{currentStats}</Badge>
      </div>
      {!archivedSessions.length ? (
        <div className="empty-runtime-state compact">
          <Badge variant="muted">empty</Badge>
          <strong>暂无归档会话</strong>
          <p>点击开启新聊天或删除当前聊天后，旧会话会进入这里。</p>
        </div>
      ) : (
        <div className="session-history-list">
          {archivedSessions.map((item) => (
            <div className="session-history-row" key={item.sessionId}>
              <div className="session-history-copy">
                <strong>{item.title}</strong>
                <span>{formatSessionTime(item.updatedAt || item.createdAt)} · {sessionHistoryStats(item)}</span>
              </div>
              <ActionButton icon={Clock} variant="secondary" onClick={() => onRestore(item.sessionId)}>恢复</ActionButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function sessionHistoryStats(session: BioAgentSession) {
  const userMessages = session.messages.filter((message) => !message.id.startsWith('seed')).length;
  return `${userMessages} messages · ${session.artifacts.length} artifacts · ${session.executionUnits.length} units`;
}

function formatSessionTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'unknown time';
  return new Date(time).toLocaleString('zh-CN', { hour12: false });
}

type VolcanoPoint = {
  gene: string;
  logFC: number;
  negLogP: number;
  sig: boolean;
  category?: string;
};

function volcanoPointsFromPayload(payload: Record<string, unknown>, colorField?: string): VolcanoPoint[] | undefined {
  const records = toRecordList(payload.points);
  const points = records.flatMap((record, index) => {
    const logFC = asNumber(record.logFC) ?? asNumber(record.log2FC);
    const negLogP = asNumber(record.negLogP) ?? (asNumber(record.pValue) ? -Math.log10(Math.max(1e-300, asNumber(record.pValue) ?? 1)) : undefined);
    if (logFC === undefined || negLogP === undefined) return [];
    return [{
      gene: asString(record.gene) || asString(record.label) || `Gene${index + 1}`,
      logFC,
      negLogP,
      sig: typeof record.significant === 'boolean' ? record.significant : Math.abs(logFC) > 1.4 && negLogP > 3,
      category: colorField ? asString(record[colorField]) : undefined,
    }];
  });
  return points.length ? points : undefined;
}

function VolcanoChart({ points }: { points?: VolcanoPoint[] }) {
  const data = useMemo(() => points ?? [], [points]);
  if (!data.length) return <EmptyArtifactState title="没有 volcano points" detail="火山图需要 artifact.data.points，不会绘制 demo 基因点。" />;
  const categories = Array.from(new Set(data.map((point) => point.category).filter(Boolean)));
  const palette = ['#00E5A0', '#FF7043', '#4ECDC4', '#FFD54F', '#3D7AED'];
  return (
    <div className="chart-300">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        <ScatterChart margin={{ top: 10, right: 14, bottom: 24, left: 8 }}>
          <CartesianGrid stroke="#243044" strokeDasharray="3 3" />
          <XAxis dataKey="logFC" type="number" tick={{ fill: '#7B93B0', fontSize: 10 }} label={{ value: 'log2FC', position: 'bottom', fill: '#7B93B0' }} />
          <YAxis dataKey="negLogP" type="number" tick={{ fill: '#7B93B0', fontSize: 10 }} label={{ value: '-log10(p)', angle: -90, position: 'insideLeft', fill: '#7B93B0' }} />
          <Tooltip contentStyle={{ background: '#1A2332', border: '1px solid #243044', borderRadius: 8 }} />
          <Scatter data={data}>
            {data.map((entry) => (
              <Cell key={entry.gene} fill={entry.category ? palette[Math.max(0, categories.indexOf(entry.category)) % palette.length] : entry.sig ? (entry.logFC > 0 ? '#FF7043' : '#4ECDC4') : 'rgba(123,147,176,0.35)'} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function ResultsRenderer({
  scenarioId,
  session,
  onArtifactHandoff,
  collapsed,
  onToggleCollapse,
}: {
  scenarioId: ScenarioId;
  session: BioAgentSession;
  onArtifactHandoff: (targetScenario: ScenarioId, artifact: RuntimeArtifact) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [resultTab, setResultTab] = useState('primary');
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const tabs = [
    { id: 'primary', label: '结果视图' },
    { id: 'evidence', label: '证据矩阵' },
    { id: 'execution', label: 'ExecutionUnit' },
    { id: 'notebook', label: '研究记录' },
  ];

  return (
    <div className={cx('results-panel', collapsed && 'collapsed')}>
      <button
        className="results-collapse-button"
        type="button"
        onClick={onToggleCollapse}
        title={collapsed ? '展开结果面板' : '向右收缩结果面板'}
      >
        {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
      {!collapsed ? (
        <>
          <div className="result-tabs">
            <TabBar tabs={tabs} active={resultTab} onChange={setResultTab} />
          </div>
          <div className="result-content">
            {resultTab === 'primary' ? (
              <PrimaryResult scenarioId={scenarioId} session={session} onArtifactHandoff={onArtifactHandoff} />
            ) : resultTab === 'evidence' ? (
              <EvidenceMatrix claims={session.claims} />
            ) : resultTab === 'execution' ? (
              <ExecutionPanel session={session} executionUnits={session.executionUnits} />
            ) : (
              <NotebookTimeline scenarioId={scenario.id} notebook={session.notebook} />
            )}
          </div>
        </>
      ) : (
        <div className="results-collapsed-hint">结果</div>
      )}
    </div>
  );
}

function Workbench({
  scenarioId,
  config,
  session,
  draft,
  savedScrollTop,
  onDraftChange,
  onScrollTopChange,
  onSessionChange,
  onNewChat,
  onDeleteChat,
  archivedSessions,
  onRestoreArchivedSession,
  onEditMessage,
  onDeleteMessage,
  archivedCount,
  onArtifactHandoff,
  autoRunRequest,
  onAutoRunConsumed,
  scenarioOverride,
  onScenarioOverrideChange,
}: {
  scenarioId: ScenarioId;
  config: BioAgentConfig;
  session: BioAgentSession;
  draft: string;
  savedScrollTop: number;
  onDraftChange: (scenarioId: ScenarioId, value: string) => void;
  onScrollTopChange: (scenarioId: ScenarioId, value: number) => void;
  onSessionChange: (session: BioAgentSession) => void;
  onNewChat: (scenarioId: ScenarioId) => void;
  onDeleteChat: (scenarioId: ScenarioId) => void;
  archivedSessions: BioAgentSession[];
  onRestoreArchivedSession: (scenarioId: ScenarioId, sessionId: string) => void;
  onEditMessage: (scenarioId: ScenarioId, messageId: string, content: string) => void;
  onDeleteMessage: (scenarioId: ScenarioId, messageId: string) => void;
  archivedCount: number;
  onArtifactHandoff: (targetScenario: ScenarioId, artifact: RuntimeArtifact) => void;
  autoRunRequest?: HandoffAutoRunRequest;
  onAutoRunConsumed: (requestId: string) => void;
  scenarioOverride?: ScenarioRuntimeOverride;
  onScenarioOverrideChange: (scenarioId: ScenarioId, override: ScenarioRuntimeOverride) => void;
}) {
  const scenarioView = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const scenarioSpec = SCENARIO_PRESETS[scenarioId];
  const runtimeScenario = scenarioOverride ?? {
    title: scenarioSpec.title,
    description: scenarioSpec.description,
    skillDomain: scenarioSpec.skillDomain,
    scenarioMarkdown: scenarioSpec.scenarioMarkdown,
    defaultComponents: scenarioSpec.componentPolicy.defaultComponents,
    allowedComponents: scenarioSpec.componentPolicy.allowedComponents,
    fallbackComponent: scenarioSpec.componentPolicy.fallbackComponent,
  };
  const [role, setRole] = useState('biologist');
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  return (
    <main className="workbench">
      <div className="workbench-header">
        <div className="scenario-title">
          <div className="scenario-large-icon" style={{ color: scenarioView.color, background: `${scenarioView.color}18` }}>
            <scenarioView.icon size={24} />
          </div>
          <div>
            <h1 style={{ color: scenarioView.color }}>{runtimeScenario.title}</h1>
            <p>{runtimeScenario.description}</p>
          </div>
        </div>
        <div className="role-tabs">
          <span>角色视图</span>
          <TabBar tabs={roleTabs} active={role} onChange={setRole} />
        </div>
      </div>
      <ScenarioSettingsPanel
        scenarioId={scenarioId}
        scenario={runtimeScenario}
        expanded={settingsExpanded}
        onToggle={() => setSettingsExpanded((value) => !value)}
        onChange={(override) => onScenarioOverrideChange(scenarioId, override)}
      />
      <div className="manifest-banner">
        <span>UIManifest</span>
        {runtimeScenario.defaultComponents.map((component) => (
          <code key={component}>{component}</code>
        ))}
        <code>fallback={runtimeScenario.fallbackComponent}</code>
      </div>
      <div className={cx('workbench-grid', resultsCollapsed && 'results-collapsed')}>
        <ChatPanel
          scenarioId={scenarioId}
          role={role}
          config={config}
          session={session}
          input={draft}
          savedScrollTop={savedScrollTop}
          onInputChange={(value) => onDraftChange(scenarioId, value)}
          onScrollTopChange={(value) => onScrollTopChange(scenarioId, value)}
          onSessionChange={onSessionChange}
          onNewChat={() => onNewChat(scenarioId)}
          onDeleteChat={() => onDeleteChat(scenarioId)}
          archivedSessions={archivedSessions}
          onRestoreArchivedSession={(sessionId) => onRestoreArchivedSession(scenarioId, sessionId)}
          onEditMessage={(messageId, content) => onEditMessage(scenarioId, messageId, content)}
          onDeleteMessage={(messageId) => onDeleteMessage(scenarioId, messageId)}
          archivedCount={archivedCount}
          autoRunRequest={autoRunRequest}
          onAutoRunConsumed={onAutoRunConsumed}
          scenarioOverride={scenarioOverride}
        />
        <ResultsRenderer
          scenarioId={scenarioId}
          session={session}
          onArtifactHandoff={onArtifactHandoff}
          collapsed={resultsCollapsed}
          onToggleCollapse={() => setResultsCollapsed((value) => !value)}
        />
      </div>
    </main>
  );
}

function ScenarioSettingsPanel({
  scenarioId,
  scenario,
  expanded,
  onToggle,
  onChange,
}: {
  scenarioId: ScenarioId;
  scenario: ScenarioRuntimeOverride;
  expanded: boolean;
  onToggle: () => void;
  onChange: (override: ScenarioRuntimeOverride) => void;
}) {
  const builtin = SCENARIO_SPECS[scenarioId];
  const componentOptions = Array.from(new Set([...builtin.componentPolicy.allowedComponents, ...scenario.allowedComponents]));
  function patch(patchValue: Partial<ScenarioRuntimeOverride>) {
    onChange({ ...scenario, ...patchValue });
  }
  function toggleComponent(component: string) {
    const next = scenario.defaultComponents.includes(component)
      ? scenario.defaultComponents.filter((item) => item !== component)
      : [...scenario.defaultComponents, component];
    patch({ defaultComponents: next.length ? next : [scenario.fallbackComponent] });
  }
  return (
    <section className={cx('scenario-settings', expanded && 'expanded')}>
      <button className="scenario-settings-summary" onClick={onToggle}>
        <FileCode size={16} />
        <span>场景设置</span>
        <strong>{scenario.skillDomain}</strong>
        <em>{scenario.defaultComponents.join(' / ')}</em>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded ? (
        <div className="scenario-settings-body">
          <label>
            <span>场景名称</span>
            <input value={scenario.title} onChange={(event) => patch({ title: event.target.value })} />
          </label>
          <label>
            <span>Skill domain</span>
            <select value={scenario.skillDomain} onChange={(event) => patch({ skillDomain: event.target.value as ScenarioRuntimeOverride['skillDomain'] })}>
              <option value="literature">literature</option>
              <option value="structure">structure</option>
              <option value="omics">omics</option>
              <option value="knowledge">knowledge</option>
            </select>
          </label>
          <label className="wide">
            <span>场景描述</span>
            <input value={scenario.description} onChange={(event) => patch({ description: event.target.value })} />
          </label>
          <label className="wide">
            <span>Scenario markdown</span>
            <textarea value={scenario.scenarioMarkdown} onChange={(event) => patch({ scenarioMarkdown: event.target.value })} />
          </label>
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
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type RegistryRendererProps = {
  scenarioId: ScenarioId;
  session: BioAgentSession;
  slot: UIManifestSlot;
  artifact?: RuntimeArtifact;
};

type RegistryEntry = {
  label: string;
  render: (props: RegistryRendererProps) => ReactNode;
};

interface HandoffAutoRunRequest {
  id: string;
  targetScenario: ScenarioId;
  prompt: string;
}

function defaultSlotsForAgent(scenarioId: ScenarioId): UIManifestSlot[] {
  return SCENARIO_SPECS[scenarioId].defaultSlots;
}

function PaperCardList({ slot, artifact, session }: RegistryRendererProps) {
  const records = applyViewTransforms(arrayPayload(slot, 'papers', artifact), slot);
  const papers = records.map((record, index) => ({
    title: asString(record.title) || asString(record.name) || `Paper ${index + 1}`,
    source: asString(record.source) || asString(record.journal) || asString(record.venue) || 'unknown source',
    year: asString(record.year) || String(asNumber(record.year) ?? 'unknown'),
    url: asString(record.url),
    level: pickEvidenceLevel(record.evidenceLevel),
  }));
  if (!artifact || !papers.length) {
    return <EmptyArtifactState title="等待真实 paper-list" detail="文献结果区只展示当前会话的 PubMed / 文献工具 artifact，不再回退到 demo paper cards。" />;
  }
  return (
    <div className="stack">
      <ArtifactSourceBar artifact={artifact} session={session} />
      {viewCompositionSummary(slot) ? <div className="composition-strip"><code>{viewCompositionSummary(slot)}</code></div> : null}
      <div className="paper-list">
        {papers.map((paper) => (
          <Card key={`${paper.title}-${paper.source}`} className="paper-card">
            <div>
              <h3>{paper.url ? <a href={paper.url} target="_blank" rel="noreferrer">{paper.title}</a> : paper.title}</h3>
              <p>{paper.source} · {paper.year}</p>
            </div>
            <EvidenceTag level={paper.level} />
            <Badge variant="success">runtime</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MoleculeSlot({ slot, artifact, session }: RegistryRendererProps) {
  const payload = slotPayload(slot, artifact);
  const pdbId = asString(payload.pdbId) || asString(payload.pdb);
  const uniprotId = asString(payload.uniprotId);
  const ligand = asString(payload.ligand) || 'none';
  const residues = asStringList(payload.highlightResidues ?? payload.residues);
  const metrics = isRecord(payload.metrics) ? payload.metrics : payload;
  const dataRef = asString(artifact?.dataRef) || asString(payload.dataRef);
  const atoms = toRecordList(payload.atomCoordinates).flatMap((atom) => {
    const x = asNumber(atom.x);
    const y = asNumber(atom.y);
    const z = asNumber(atom.z);
    if (x === undefined || y === undefined || z === undefined) return [];
    return [{
      atomName: asString(atom.atomName),
      residueName: asString(atom.residueName),
      chain: asString(atom.chain),
      residueNumber: asString(atom.residueNumber),
      element: asString(atom.element),
      x,
      y,
      z,
      hetatm: atom.hetatm === true,
    }];
  });
  if (!artifact || (!pdbId && !uniprotId)) {
    return <EmptyArtifactState title="等待真实 structure-summary" detail="结构结果区需要 RCSB 或 AlphaFold DB artifact；没有 dataRef 时不会加载默认 7BZ5 结构。" />;
  }
  return (
    <div className="stack">
      <ArtifactSourceBar artifact={artifact} session={session} />
      <div className="slot-meta">
        <Badge variant="success">{artifactMeta(artifact)}</Badge>
        <code>{uniprotId ? `UniProt=${uniprotId}` : `PDB=${pdbId}`}</code>
        <code>ligand={ligand}</code>
        {dataRef ? <code title={dataRef}>dataRef={compactParams(dataRef)}</code> : <code>record-only structure</code>}
        {residues.length ? <code>residues={residues.join(',')}</code> : null}
        {slot.encoding?.highlightSelection ? <code>highlightSelection={Array.isArray(slot.encoding.highlightSelection) ? slot.encoding.highlightSelection.join(',') : slot.encoding.highlightSelection}</code> : null}
      </div>
      {dataRef ? (
        <div className="viz-card">
          <MoleculeViewer
            pdbId={pdbId || uniprotId}
            ligand={ligand}
            structureUrl={dataRef}
            highlightResidues={residues}
            pocketLabel={asString(payload.pocketLabel) || asString(payload.pocket) || 'Structure view'}
            atoms={atoms}
          />
        </div>
      ) : (
        <EmptyArtifactState title="缺少结构坐标 dataRef" detail="已保留结构摘要，但没有可加载坐标文件；请检查 project tool 输出。" />
      )}
      <MetricGrid metrics={metrics} />
    </div>
  );
}

function CanvasSlot({ slot, artifact, session, kind }: RegistryRendererProps & { kind: 'volcano' | 'heatmap' | 'umap' | 'network' }) {
  const payload = slotPayload(slot, artifact);
  const colorField = slot.encoding?.colorBy;
  const splitField = slot.encoding?.splitBy || slot.encoding?.facetBy;
  const networkNodes = toRecordList(payload.nodes).map((node) => ({
    id: asString(node.id),
    label: asString(node.label) || asString(node.name),
    type: colorField ? asString(node[colorField]) || asString(node.type) : asString(node.type),
  }));
  const networkEdges = toRecordList(payload.edges).map((edge) => ({
    source: asString(edge.source) || asString(edge.from),
    target: asString(edge.target) || asString(edge.to),
  }));
  const volcanoPoints = volcanoPointsFromPayload(payload, colorField);
  const heatmap = isRecord(payload.heatmap)
    ? asNumberMatrix(payload.heatmap.matrix ?? payload.heatmap.values)
    : asNumberMatrix(payload.matrix ?? payload.values);
  const umapPoints = toRecordList(payload.umap ?? payload.points).flatMap((point) => {
    const x = asNumber(point.x) ?? asNumber(point.umap1);
    const y = asNumber(point.y) ?? asNumber(point.umap2);
    return x === undefined || y === undefined ? [] : [{
      x,
      y,
      cluster: colorField ? asString(point[colorField]) || asString(point.cluster) || asString(point.group) : asString(point.cluster) || asString(point.group),
      label: asString(point.label),
    }];
  });
  if (!artifact) {
    return <EmptyArtifactState title="等待真实 runtime artifact" detail={`${kind} 组件不再使用 demo seed；请先运行当前 Scenario 生成 artifact。`} />;
  }
  const hasData = kind === 'volcano'
    ? Boolean(volcanoPoints?.length)
    : kind === 'heatmap'
      ? Boolean(heatmap)
      : kind === 'umap'
        ? Boolean(umapPoints.length)
        : Boolean(networkNodes.length);
  if (!hasData) {
    return <EmptyArtifactState title="artifact 缺少可视化数据" detail={`当前 ${artifact.type} 没有 ${kind} 所需字段；UI 已停止回退到 demo 图。`} />;
  }
  return (
    <div className="stack">
      <ArtifactSourceBar artifact={artifact} session={session} />
      <div className="slot-meta">
        <Badge variant="success">{artifactMeta(artifact)}</Badge>
        {networkNodes.length ? <code>{networkNodes.length} nodes</code> : null}
        {networkEdges.length ? <code>{networkEdges.length} edges</code> : null}
        {volcanoPoints?.length ? <code>{volcanoPoints.length} volcano points</code> : null}
        {umapPoints.length ? <code>{umapPoints.length} UMAP points</code> : null}
        {heatmap ? <code>{heatmap.length}x{heatmap[0]?.length ?? 0} heatmap</code> : null}
        {colorField ? <code>colorBy={colorField}</code> : null}
        {splitField ? <code>splitBy={splitField}</code> : null}
      </div>
      <Card className="viz-card">
        {kind === 'volcano' ? (
          <VolcanoChart points={volcanoPoints} />
        ) : kind === 'heatmap' ? (
          <HeatmapViewer matrix={heatmap} label={[asString(payload.label) || asString(isRecord(payload.heatmap) ? payload.heatmap.label : undefined), splitField ? `splitBy=${splitField}` : undefined].filter(Boolean).join(' · ') || undefined} />
        ) : kind === 'umap' ? (
          <UmapViewer points={umapPoints.length ? umapPoints : undefined} />
        ) : (
          <NetworkGraph nodes={networkNodes.length ? networkNodes : undefined} edges={networkEdges.length ? networkEdges : undefined} />
        )}
      </Card>
    </div>
  );
}

function DataTableSlot({ slot, artifact, session }: RegistryRendererProps) {
  const records = applyViewTransforms(arrayPayload(slot, 'rows', artifact), slot);
  const rows = records;
  if (!artifact || !rows.length) {
    return (
      <div className="stack">
        <ArtifactDownloads artifact={artifact} />
        <EmptyArtifactState title="等待真实 knowledge rows" detail="知识表格只展示 knowledge-graph artifact 中的 rows，不再填充 demo 药物或通路。" />
      </div>
    );
  }
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 5);
  return (
    <div className="stack">
      <ArtifactSourceBar artifact={artifact} session={session} />
      <ArtifactDownloads artifact={artifact} />
      {viewCompositionSummary(slot) ? <div className="composition-strip"><code>{viewCompositionSummary(slot)}</code></div> : null}
      <div className="artifact-table">
        <div className="artifact-table-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
          {columns.map((column) => <span key={column}>{column}</span>)}
        </div>
        {rows.map((row, index) => (
          <div className="artifact-table-row" key={index} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
            {columns.map((column) => <span key={column}>{String(row[column] ?? '-')}</span>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function UnknownArtifactInspector({ slot, artifact, session }: RegistryRendererProps) {
  const payload = artifact?.data ?? slot.props ?? {};
  const rows = Array.isArray(payload)
    ? payload.filter(isRecord)
    : isRecord(payload) && Array.isArray(payload.rows)
      ? payload.rows.filter(isRecord)
      : [];
  const unit = session ? executionUnitForArtifact(session, artifact) : undefined;
  const refs = [
    artifact?.dataRef ? { label: 'dataRef', value: artifact.dataRef } : undefined,
    unit?.codeRef ? { label: 'codeRef', value: unit.codeRef } : undefined,
    unit?.stdoutRef ? { label: 'stdoutRef', value: unit.stdoutRef } : undefined,
    unit?.stderrRef ? { label: 'stderrRef', value: unit.stderrRef } : undefined,
    unit?.outputRef ? { label: 'outputRef', value: unit.outputRef } : undefined,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  const columns = rows.length ? Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 6) : [];
  return (
    <div className="stack">
      <ArtifactSourceBar artifact={artifact} session={session} />
      <ArtifactDownloads artifact={artifact} />
      <div className="slot-meta">
        <Badge variant="warning">inspector</Badge>
        {artifact ? <code>{artifact.type}</code> : null}
        {viewCompositionSummary(slot) ? <code>{viewCompositionSummary(slot)}</code> : null}
      </div>
      {refs.length ? (
        <div className="inspector-ref-list">
          {refs.map((ref) => (
            <code key={`${ref.label}-${ref.value}`}>{ref.label}: {ref.value}</code>
          ))}
        </div>
      ) : null}
      {rows.length ? (
        <div className="artifact-table">
          <div className="artifact-table-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
            {columns.map((column) => <span key={column}>{column}</span>)}
          </div>
          {rows.slice(0, 20).map((row, index) => (
            <div className="artifact-table-row" key={index} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
              {columns.map((column) => <span key={column}>{String(row[column] ?? '-')}</span>)}
            </div>
          ))}
        </div>
      ) : (
        <pre className="inspector-json">{JSON.stringify(payload, null, 2)}</pre>
      )}
    </div>
  );
}

function ArtifactDownloads({ artifact }: { artifact?: RuntimeArtifact }) {
  const downloads = artifactDownloadItems(artifact);
  if (!downloads.length) return null;
  return (
    <div className="artifact-downloads">
      {downloads.map((item) => (
        <ActionButton
          key={`${item.name}-${item.path ?? item.key ?? ''}`}
          icon={Download}
          variant="secondary"
          onClick={() => exportTextFile(item.name, item.content, item.contentType)}
        >
          {item.name}{typeof item.rowCount === 'number' ? ` · ${item.rowCount} rows` : ''}
        </ActionButton>
      ))}
    </div>
  );
}

function artifactDownloadItems(artifact?: RuntimeArtifact) {
  const data = artifact?.data;
  const raw = isRecord(data) && Array.isArray(data.downloads) ? data.downloads : [];
  return raw
    .filter(isRecord)
    .map((item) => ({
      key: asString(item.key),
      name: asString(item.name) ?? asString(item.filename) ?? 'artifact-download.txt',
      path: asString(item.path),
      contentType: asString(item.contentType) ?? 'text/plain',
      rowCount: asNumber(item.rowCount),
      content: typeof item.content === 'string' ? item.content : '',
    }))
    .filter((item) => item.content.length > 0);
}

function EmptyArtifactState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-runtime-state">
      <Badge variant="muted">empty</Badge>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function ArtifactSourceBar({ artifact, session }: { artifact?: RuntimeArtifact; session?: BioAgentSession }) {
  const source = artifactSource(artifact);
  const unit = session ? executionUnitForArtifact(session, artifact) : undefined;
  if (!artifact) {
    return (
      <div className="artifact-source-bar">
        <Badge variant="muted">empty</Badge>
        <code>no runtime artifact</code>
      </div>
    );
  }
  return (
    <div className="artifact-source-bar">
      <Badge variant={sourceVariant(source)}>{source}</Badge>
      <code>{artifact.id}</code>
      <code>{artifact.type}</code>
      <code>schema={artifact.schemaVersion}</code>
      {artifact.dataRef ? <code title={artifact.dataRef}>dataRef={compactParams(artifact.dataRef)}</code> : null}
      {unit ? <code title={unit.params}>tool={unit.tool} · {unit.status}</code> : <code>audit warning: no ExecutionUnit</code>}
    </div>
  );
}

const componentRegistry: Record<string, RegistryEntry> = {
  'paper-card-list': { label: 'PaperCardList', render: (props) => <PaperCardList {...props} /> },
  'molecule-viewer': { label: 'MoleculeViewer', render: (props) => <MoleculeSlot {...props} /> },
  'volcano-plot': { label: 'VolcanoPlot', render: (props) => <CanvasSlot {...props} kind="volcano" /> },
  'heatmap-viewer': { label: 'HeatmapViewer', render: (props) => <CanvasSlot {...props} kind="heatmap" /> },
  'umap-viewer': { label: 'UmapViewer', render: (props) => <CanvasSlot {...props} kind="umap" /> },
  'network-graph': { label: 'NetworkGraph', render: (props) => <CanvasSlot {...props} kind="network" /> },
  'evidence-matrix': { label: 'EvidenceMatrix', render: ({ session }) => <EvidenceMatrix claims={session.claims} /> },
  'execution-unit-table': { label: 'ExecutionUnitTable', render: ({ session }) => <ExecutionPanel session={session} executionUnits={session.executionUnits} embedded /> },
  'notebook-timeline': { label: 'NotebookTimeline', render: ({ scenarioId, session }) => <NotebookTimeline scenarioId={scenarioId} notebook={session.notebook} /> },
  'data-table': { label: 'DataTable', render: (props) => <DataTableSlot {...props} /> },
  'unknown-artifact-inspector': { label: 'UnknownArtifactInspector', render: (props) => <UnknownArtifactInspector {...props} /> },
};

function PrimaryResult({
  scenarioId,
  session,
  onArtifactHandoff,
}: {
  scenarioId: ScenarioId;
  session: BioAgentSession;
  onArtifactHandoff: (targetScenario: ScenarioId, artifact: RuntimeArtifact) => void;
}) {
  const slots = (session.uiManifest.length ? session.uiManifest : defaultSlotsForAgent(scenarioId))
    .slice()
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .slice(0, 4);
  return (
    <div className="stack">
      <SectionHeader icon={FileText} title="动态结果区" subtitle="UIManifest -> component registry -> artifact/runtime data" />
      <ManifestDiagnostics slots={slots} />
      <div className="registry-grid">
        {slots.map((slot) => (
          <RegistrySlot
            key={`${slot.componentId}-${slot.artifactRef ?? slot.title ?? slot.priority ?? ''}`}
            scenarioId={scenarioId}
            session={session}
            slot={slot}
            onArtifactHandoff={onArtifactHandoff}
          />
        ))}
      </div>
    </div>
  );
}

function RegistrySlot({
  scenarioId,
  session,
  slot,
  onArtifactHandoff,
}: {
  scenarioId: ScenarioId;
  session: BioAgentSession;
  slot: UIManifestSlot;
  onArtifactHandoff: (targetScenario: ScenarioId, artifact: RuntimeArtifact) => void;
}) {
  const artifact = findArtifact(session, slot.artifactRef);
  const entry = componentRegistry[slot.componentId];
  const artifactSchema = artifact
    ? SCENARIO_SPECS[artifact.producerScenario].outputArtifacts.find((schema) => schema.type === artifact.type)
    : undefined;
  const handoffTargets = artifact && artifactSchema
    ? artifactSchema.consumers.filter((consumer) => consumer !== scenarioId)
    : [];
  if (!entry) {
    return (
      <Card className="registry-slot">
        <SectionHeader icon={AlertTriangle} title={slot.title ?? '未注册组件'} subtitle={slot.componentId} />
        <p className="empty-state">Scenario 返回了未知 componentId。当前使用通用 inspector 展示 artifact、manifest 和日志引用。</p>
        {slot.artifactRef && !artifact ? <p className="empty-state">artifactRef 未找到：{slot.artifactRef}</p> : null}
        <UnknownArtifactInspector scenarioId={scenarioId} session={session} slot={slot} artifact={artifact} />
      </Card>
    );
  }
  return (
    <Card className="registry-slot">
      <SectionHeader icon={Target} title={slot.title ?? entry.label} subtitle={`${slot.componentId}${slot.artifactRef ? ` -> ${slot.artifactRef}` : ''}`} />
      {viewCompositionSummary(slot) ? <div className="composition-strip"><code>{viewCompositionSummary(slot)}</code></div> : null}
      {slot.artifactRef && !artifact ? <p className="empty-state">artifactRef 未找到，组件保持 empty state，不使用 demo 数据。</p> : null}
      {entry.render({ scenarioId, session, slot, artifact })}
      {artifact && handoffTargets.length ? (
        <div className="handoff-actions">
          <span>发送 artifact 到</span>
          {handoffTargets.map((target) => {
            const targetScenario = scenarios.find((item) => item.id === target);
            return (
              <button key={target} onClick={() => onArtifactHandoff(target, artifact)}>
                {targetScenario?.name ?? target}
              </button>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

function ManifestDiagnostics({ slots }: { slots: Array<{ componentId: string; title?: string; artifactRef?: string }> }) {
  return (
    <div className="manifest-diagnostics">
      {slots.map((slot) => (
        <code key={`${slot.componentId}-${slot.artifactRef ?? slot.title ?? ''}`}>
          {slot.componentId}{slot.artifactRef ? ` -> ${slot.artifactRef}` : ''}
        </code>
      ))}
    </div>
  );
}

function MetricGrid({ metrics = {} }: { metrics?: Record<string, unknown> }) {
  const rows = [
    ['Pocket volume', asString(metrics.pocketVolume) || (asNumber(metrics.pocketVolume) ? `${asNumber(metrics.pocketVolume)} A3` : undefined), '#00E5A0'],
    ['pLDDT mean', asString(metrics.pLDDT) || asString(metrics.plddt) || (asNumber(metrics.pLDDT) ?? asNumber(metrics.plddt))?.toString(), '#4ECDC4'],
    ['Resolution', asString(metrics.resolution) || (asNumber(metrics.resolution) ? `${asNumber(metrics.resolution)} A` : undefined), '#FFD54F'],
    ['Mutation risk', asString(metrics.mutationRisk), '#FF7043'],
    ['Method', asString(metrics.method), '#B0C4D8'],
  ].filter((row): row is [string, string, string] => typeof row[1] === 'string' && row[1].trim().length > 0);
  if (!rows.length) {
    return <EmptyArtifactState title="没有结构指标" detail="structure-summary 未提供 metrics；UI 不再填充默认分辨率或 pLDDT。" />;
  }
  return (
    <div className="metric-grid">
      {rows.map(([label, value, color]) => (
        <Card className="metric" key={label}>
          <span>{label}</span>
          <strong style={{ color }}>{value}</strong>
        </Card>
      ))}
    </div>
  );
}

function EvidenceMatrix({ claims }: { claims: EvidenceClaim[] }) {
  const [expandedClaim, setExpandedClaim] = useState<string | null>(null);
  const rows = claims.map((claim) => ({
    id: claim.id,
    claim: claim.text,
    support: `${claim.supportingRefs.length} 条支持`,
    oppose: `${claim.opposingRefs.length} 条反向`,
    level: claim.evidenceLevel,
    type: claim.type,
    supportingRefs: claim.supportingRefs,
    opposingRefs: claim.opposingRefs,
    dependencyRefs: claim.dependencyRefs ?? [],
    updateReason: claim.updateReason,
  }));
  return (
    <div className="stack">
      <SectionHeader icon={Shield} title="EvidenceGraph" subtitle="Claim -> supporting / opposing evidence" />
      {!rows.length ? <EmptyArtifactState title="等待真实 claims" detail="证据矩阵只展示当前 run 的 claims，不再回退到 KRAS demo claims。" /> : null}
      {rows.map((row) => (
        <Card className="evidence-row" key={row.id}>
          <div className="evidence-main">
            <h3>{row.claim}</h3>
            <p>{row.support} · {row.oppose}{row.dependencyRefs.length ? ` · ${row.dependencyRefs.length} 条依赖` : ''}</p>
            {row.updateReason ? <p className="empty-state">updateReason: {row.updateReason}</p> : null}
            {row.supportingRefs.length || row.opposingRefs.length || row.dependencyRefs.length ? (
              <>
                <button className="expand-link source-toggle" onClick={() => setExpandedClaim(expandedClaim === row.id ? null : row.id)}>
                  {expandedClaim === row.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expandedClaim === row.id ? '收起来源' : '查看来源/依赖'}
                </button>
                {expandedClaim === row.id ? (
                  <div className="source-list">
                    {row.supportingRefs.map((ref) => <code key={`support-${ref}`}>+ {ref}</code>)}
                    {row.opposingRefs.map((ref) => <code key={`oppose-${ref}`}>- {ref}</code>)}
                    {row.dependencyRefs.map((ref) => <code key={`dependency-${ref}`}>depends-on {ref}</code>)}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          <EvidenceTag level={row.level} />
          <ClaimTag type={row.type} />
        </Card>
      ))}
    </div>
  );
}

function ExecutionPanel({
  session,
  executionUnits,
  embedded = false,
}: {
  session: BioAgentSession;
  executionUnits: RuntimeExecutionUnit[];
  embedded?: boolean;
}) {
  const rows = executionUnits;
  return (
    <div className="stack">
      <SectionHeader
        icon={Lock}
        title="可复现执行单元"
        subtitle={embedded ? '当前组件来自 UIManifest registry' : '代码 + 参数 + 环境 + 数据指纹'}
        action={<ActionButton icon={Download} variant="secondary" onClick={() => exportExecutionBundle(session)}>导出 JSON Bundle</ActionButton>}
      />
      {rows.length ? (
        <div className="eu-table">
          <div className="eu-head">
            <span>EU ID</span>
            <span>Tool</span>
            <span>Params</span>
            <span>Code Artifact</span>
            <span>Status</span>
            <span>Hash</span>
          </div>
          {rows.map((unit, index) => (
            <div className="eu-row" key={`${unit.id}-${unit.hash || index}-${index}`}>
              <code>{unit.id}</code>
              <span>{unit.tool}</span>
              <code title={unit.params}>{compactParams(unit.params)}</code>
              <code title={[unit.codeRef, unit.stdoutRef, unit.stderrRef].filter(Boolean).join('\n') || unit.code || ''}>
                {unit.codeRef || unit.language || unit.code || 'n/a'}
              </code>
              <Badge variant={executionStatusVariant(unit.status)}>{unit.status}</Badge>
              <code>{unit.hash}</code>
              {executionStatusDetail(unit) ? (
                <div className="eu-detail">
                  {executionStatusDetail(unit)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : <EmptyArtifactState title="等待真实 ExecutionUnit" detail="执行面板只展示当前会话的 runtime executionUnits，不再填充 demo 执行记录。" />}
      <Card className="code-card">
        <SectionHeader icon={FileCode} title="环境定义" />
        <pre>{executionEnvironmentText(rows)}</pre>
      </Card>
    </div>
  );
}

function executionStatusVariant(status: RuntimeExecutionUnit['status']): 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'coral' {
  if (status === 'done' || status === 'self-healed') return 'success';
  if (status === 'failed' || status === 'failed-with-reason') return 'danger';
  if (status === 'repair-needed') return 'warning';
  if (status === 'planned' || status === 'record-only') return 'muted';
  return 'info';
}

function executionStatusDetail(unit: RuntimeExecutionUnit) {
  const lines = [
    unit.attempt ? `attempt=${unit.attempt}` : undefined,
    unit.parentAttempt ? `parentAttempt=${unit.parentAttempt}` : undefined,
    unit.selfHealReason ? `selfHealReason=${unit.selfHealReason}` : undefined,
    unit.failureReason ? `failureReason=${unit.failureReason}` : undefined,
    unit.patchSummary ? `patchSummary=${unit.patchSummary}` : undefined,
    unit.diffRef ? `diffRef=${unit.diffRef}` : undefined,
    unit.stdoutRef ? `stdout=${unit.stdoutRef}` : undefined,
    unit.stderrRef ? `stderr=${unit.stderrRef}` : undefined,
    unit.outputRef ? `output=${unit.outputRef}` : undefined,
  ].filter(Boolean);
  return lines.length ? lines.join(' · ') : '';
}

function executionEnvironmentText(rows: RuntimeExecutionUnit[]) {
  if (!rows.length) return 'No runtime execution units yet.';
  return rows.map((unit) => [
    `id: ${unit.id}`,
    `tool: ${unit.tool}`,
    `language: ${unit.language || 'unspecified'}`,
    `codeRef: ${unit.codeRef || unit.code || 'n/a'}`,
    `entrypoint: ${unit.entrypoint || 'n/a'}`,
    `environment: ${unit.environment || 'n/a'}`,
    `stdoutRef: ${unit.stdoutRef || 'n/a'}`,
    `stderrRef: ${unit.stderrRef || 'n/a'}`,
    `outputRef: ${unit.outputRef || 'n/a'}`,
    `attempt: ${unit.attempt || 'n/a'}`,
    `parentAttempt: ${unit.parentAttempt || 'n/a'}`,
    `selfHealReason: ${unit.selfHealReason || 'n/a'}`,
    `failureReason: ${unit.failureReason || 'n/a'}`,
    `patchSummary: ${unit.patchSummary || 'n/a'}`,
    `diffRef: ${unit.diffRef || 'n/a'}`,
    `databases: ${(unit.databaseVersions ?? []).join(', ') || 'n/a'}`,
  ].join('\n')).join('\n\n');
}

function NotebookTimeline({ scenarioId, notebook = [] }: { scenarioId: ScenarioId; notebook?: NotebookRecord[] }) {
  const filtered = notebook;
  return (
    <div className="stack">
      <SectionHeader icon={Clock} title="研究记录" subtitle="从对话到可审计 notebook timeline" />
      {!filtered.length ? <EmptyArtifactState title="等待真实 notebook 记录" detail="Notebook 只展示当前会话运行产生的记录；全局 demo timeline 仅保留在研究时间线页面。" /> : null}
      <div className="timeline-list">
        {filtered.map((item) => {
          const scenario = scenarios.find((entry) => entry.id === item.scenario) ?? scenarios[0];
          return (
            <Card className="timeline-card" key={item.title}>
              <div className="timeline-dot" style={{ background: scenario.color }} />
              <div>
                <div className="timeline-meta">
                  <span>{item.time}</span>
                  <ClaimTag type={item.claimType} />
                  <ConfidenceBar value={item.confidence} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
                {item.updateReason ? <p className="empty-state">updateReason: {item.updateReason}</p> : null}
                {item.artifactRefs?.length || item.executionUnitRefs?.length || item.beliefRefs?.length || item.dependencyRefs?.length ? (
                  <div className="source-list">
                    {(item.artifactRefs ?? []).map((ref) => <code key={`artifact-${item.id}-${ref}`}>artifact {ref}</code>)}
                    {(item.executionUnitRefs ?? []).map((ref) => <code key={`eu-${item.id}-${ref}`}>execution {ref}</code>)}
                    {(item.beliefRefs ?? []).map((ref) => <code key={`belief-${item.id}-${ref}`}>belief {ref}</code>)}
                    {(item.dependencyRefs ?? []).map((ref) => <code key={`dependency-${item.id}-${ref}`}>depends-on {ref}</code>)}
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

type AlignmentContractData = AlignmentContractRecord['data'];

const defaultAlignmentContract: AlignmentContractData = {
  dataReality: '内部药敏样本约 200 例，包含 GDSC/CCLE 对齐后的表达矩阵、药物响应标签和基础质控记录。',
  aiAssessment: '特征维度显著高于样本量，主模型需要正则化、先验通路约束和外部数据预训练。',
  bioReality: '窄谱靶向药低响应率是生物学现实，需要按机制拆分模型，不能简单合并为一个泛化分类器。',
  feasibilityMatrix: feasibilityRows.map((row) => `${row.dim}: status=needs-data; source=AI-draft; AI=${row.ai}; Bio=${row.bio}; Action=${row.action}`).join('\n'),
  researchGoal: '聚焦 12 种药物的敏感性预测，排除 3 种极低响应率窄谱靶向药。',
  technicalRoute: 'GDSC/CCLE 预训练 + 内部数据微调，按机制拆分模型。',
  successCriteria: 'AUROC > 0.80，假阳性率 < 20%，至少 3 个命中完成实验验证。',
  knownRisks: '批次效应、药物机制差异和验证成本可能影响项目节奏。',
  recalibrationRecord: '模型在 2 种 HDAC 抑制剂上 AUROC 仅 0.58；共识为拆分模型并补充组蛋白修饰数据。',
  dataAssetsChecklist: 'needs-data: 列出表达矩阵、药敏标签、质控报告和外部公共数据 sourceRefs。',
  sampleSizeChecklist: 'needs-data: 按药物、癌种、批次统计样本量；低于阈值不得给出确定可行判断。',
  labelQualityChecklist: 'needs-data: 标注标签来源、缺失率、不平衡比例和人工复核状态。',
  batchEffectChecklist: 'needs-data: 记录 GDSC/CCLE/内部数据批次变量、校正策略和残余风险。',
  experimentalConstraints: 'needs-data: 记录预算、周期、可用细胞系、验证读出和失败重试条件。',
  feasibilitySourceNotes: 'unknown: 每个矩阵单元必须标注 user-input / artifact-statistic / literature-evidence / AI-draft。',
};

function AlignmentPage({
  contracts,
  onSaveContract,
}: {
  contracts: AlignmentContractRecord[];
  onSaveContract: (data: AlignmentContractData, reason: string, confirmationStatus?: AlignmentContractRecord['confirmationStatus']) => void;
}) {
  const [step, setStep] = useState(0);
  const latest = contracts[0];
  const [draft, setDraft] = useState<AlignmentContractData>(() => alignmentDraftData(latest));
  const [reason, setReason] = useState('alignment contract saved from workspace');
  const steps = ['数据摸底', '可行性评估', '方案共识', '持续校准'];
  useEffect(() => {
    setDraft(alignmentDraftData(latest));
  }, [latest?.id]);
  function updateField(field: keyof AlignmentContractData, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function saveDraft(nextReason = reason, confirmationStatus: AlignmentContractRecord['confirmationStatus'] = 'needs-data') {
    onSaveContract(draft, nextReason.trim() || 'alignment contract saved from workspace', confirmationStatus);
  }
  function restore(contract: AlignmentContractRecord) {
    setDraft(alignmentDraftData(contract));
    onSaveContract(contract.data, `restore alignment contract ${contract.id}`);
  }
  return (
    <main className="page">
      <div className="page-heading">
        <h1>跨领域对齐工作台</h1>
        <p>把 AI 专家的可行性判断和生物专家的实验现实放到同一个结构化工作台里。</p>
      </div>
      <div className="artifact-source-bar alignment-status">
        <Badge variant={latest ? 'success' : 'muted'}>{latest ? 'alignment-contract' : 'draft-only'}</Badge>
        {latest ? <code>{latest.id}</code> : <code>not saved</code>}
        {latest ? <code>checksum={latest.checksum}</code> : null}
        {latest ? <code>versions={contracts.length}</code> : null}
        {latest ? <code>authority={latest.decisionAuthority || 'researcher'}</code> : null}
        {latest ? <Badge variant={latest.confirmationStatus === 'user-confirmed' ? 'success' : latest.confirmationStatus === 'needs-data' ? 'warning' : 'muted'}>{latest.confirmationStatus || 'needs-data'}</Badge> : null}
      </div>
      <div className="stepper">
        {steps.map((name, index) => (
          <button key={name} className={cx(index === step && 'active', index < step && 'done')} onClick={() => setStep(index)}>
            <span>{index < step ? <Check size={13} /> : index + 1}</span>
            {name}
          </button>
        ))}
      </div>
      {step === 0 ? (
        <AlignmentSurvey draft={draft} onChange={updateField} />
      ) : step === 1 ? (
        <Feasibility draft={draft} onChange={updateField} />
      ) : step === 2 ? (
        <ProjectContract draft={draft} onChange={updateField} reason={reason} onReasonChange={setReason} onSave={() => saveDraft()} onConfirm={() => saveDraft('researcher confirmed alignment contract', 'user-confirmed')} />
      ) : (
        <Recalibration draft={draft} onChange={updateField} contracts={contracts} onRestore={restore} onSave={() => saveDraft('alignment recalibration saved')} />
      )}
    </main>
  );
}

function alignmentDraftData(contract?: AlignmentContractRecord): AlignmentContractData {
  return { ...defaultAlignmentContract, ...(contract?.data ?? {}) };
}

function AlignmentSurvey({
  draft,
  onChange,
}: {
  draft: AlignmentContractData;
  onChange: (field: keyof AlignmentContractData, value: string) => void;
}) {
  return (
    <div className="alignment-grid">
      <Card>
        <SectionHeader icon={Sparkles} title="AI 视角" subtitle="数据能力评估" />
        <Progress label="样本量" value={20} color="#FFD54F" detail="200 / 1000 ideal" />
        <Progress label="特征维度" value={100} color="#00E5A0" detail="20K genes" />
        <Progress label="标签平衡度" value={35} color="#FF7043" detail="3 drugs < 5%" />
        <EditableBlock label="AI assessment" value={draft.aiAssessment} onChange={(value) => onChange('aiAssessment', value)} />
        <EditableBlock label="Data assets checklist" value={draft.dataAssetsChecklist} onChange={(value) => onChange('dataAssetsChecklist', value)} rows={4} />
        <EditableBlock label="Sample size checklist" value={draft.sampleSizeChecklist} onChange={(value) => onChange('sampleSizeChecklist', value)} rows={4} />
      </Card>
      <Card>
        <SectionHeader icon={Target} title="生物视角" subtitle="数据来源与实验现实" />
        <Progress label="药物覆盖" value={100} color="#00E5A0" detail="15 / 15" />
        <Progress label="组学模态" value={60} color="#FFD54F" detail="3 / 5" />
        <Progress label="批次一致性" value={60} color="#FFD54F" detail="GDSC vs CCLE" />
        <EditableBlock label="Data reality" value={draft.dataReality} onChange={(value) => onChange('dataReality', value)} />
        <EditableBlock label="Bio reality" value={draft.bioReality} onChange={(value) => onChange('bioReality', value)} />
        <EditableBlock label="Label quality checklist" value={draft.labelQualityChecklist} onChange={(value) => onChange('labelQualityChecklist', value)} rows={4} />
        <EditableBlock label="Batch effect checklist" value={draft.batchEffectChecklist} onChange={(value) => onChange('batchEffectChecklist', value)} rows={4} />
      </Card>
    </div>
  );
}

function Progress({ label, value, color, detail }: { label: string; value: number; color: string; detail: string }) {
  return (
    <div className="progress-row">
      <div>
        <span>{label}</span>
        <em>{detail}</em>
      </div>
      <div className="progress-track">
        <i style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function Feasibility({
  draft,
  onChange,
}: {
  draft: AlignmentContractData;
  onChange: (field: keyof AlignmentContractData, value: string) => void;
}) {
  return (
    <div className="alignment-grid">
      <Card>
        <SectionHeader icon={Target} title="可行性矩阵" />
        <div className="feasibility-list">
          {feasibilityRows.map((row) => (
            <div className="feasibility-row" key={row.dim}>
              <div className="feasibility-top">
                <strong>{row.dim}</strong>
                <Badge variant="warning">needs-data</Badge>
              </div>
              <div className="dual-view">
                <span>AI draft: {row.ai}</span>
                <span>Bio input: {row.bio}</span>
              </div>
              <div className="slot-meta">
                <code>source=AI-draft</code>
                <code>state=unknown until sourceRefs are attached</code>
              </div>
              <p>{row.action}</p>
            </div>
          ))}
        </div>
        <EditableBlock label="Editable feasibility matrix" value={draft.feasibilityMatrix} onChange={(value) => onChange('feasibilityMatrix', value)} rows={8} />
        <EditableBlock label="Feasibility source notes" value={draft.feasibilitySourceNotes} onChange={(value) => onChange('feasibilitySourceNotes', value)} rows={5} />
      </Card>
      <Card>
        <SectionHeader title="双视角能力雷达" subtitle="AI vs Bio assessment" />
        <div className="chart-300">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#243044" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#7B93B0', fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fill: '#7B93B0', fontSize: 9 }} />
              <Radar dataKey="ai" name="AI" stroke="#4ECDC4" fill="#4ECDC4" fillOpacity={0.2} />
              <Radar dataKey="bio" name="Bio" stroke="#FF7043" fill="#FF7043" fillOpacity={0.18} />
              <Tooltip contentStyle={{ background: '#1A2332', border: '1px solid #243044', borderRadius: 8 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function ProjectContract({
  draft,
  onChange,
  reason,
  onReasonChange,
  onSave,
  onConfirm,
}: {
  draft: AlignmentContractData;
  onChange: (field: keyof AlignmentContractData, value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  onSave: () => void;
  onConfirm: () => void;
}) {
  const fields: Array<[keyof AlignmentContractData, string]> = [
    ['researchGoal', '研究目标'],
    ['technicalRoute', '技术路线'],
    ['successCriteria', '成功标准'],
    ['knownRisks', '已知风险'],
    ['experimentalConstraints', '实验约束'],
  ];
  return (
    <Card>
      <SectionHeader icon={FileText} title="项目契约草案" action={<ActionButton icon={FilePlus} variant="secondary" onClick={onSave}>保存契约</ActionButton>} />
      <div className="contract-grid">
        {fields.map(([field, label]) => (
          <EditableBlock key={field} label={label} value={draft[field]} onChange={(value) => onChange(field, value)} rows={4} />
        ))}
      </div>
      <div className="alignment-save-row">
        <label>
          <span>Version reason</span>
          <input value={reason} onChange={(event) => onReasonChange(event.target.value)} />
        </label>
        <Badge variant="warning">AI draft · needs-data until researcher confirmation</Badge>
        <ActionButton icon={FilePlus} onClick={onSave}>保存 alignment-contract</ActionButton>
        <ActionButton icon={Check} variant="secondary" onClick={onConfirm}>研究者确认保存</ActionButton>
      </div>
    </Card>
  );
}

function Recalibration({
  draft,
  onChange,
  contracts,
  onRestore,
  onSave,
}: {
  draft: AlignmentContractData;
  onChange: (field: keyof AlignmentContractData, value: string) => void;
  contracts: AlignmentContractRecord[];
  onRestore: (contract: AlignmentContractRecord) => void;
  onSave: () => void;
}) {
  return (
    <div className="alignment-grid">
      <Card>
        <SectionHeader icon={AlertTriangle} title="持续校准记录" subtitle="早期发现认知漂移和模型偏差" action={<ActionButton icon={FilePlus} variant="secondary" onClick={onSave}>保存校准</ActionButton>} />
        <EditableBlock label="Recalibration record" value={draft.recalibrationRecord} onChange={(value) => onChange('recalibrationRecord', value)} rows={8} />
      </Card>
      <Card>
        <SectionHeader icon={Clock} title="版本快照" subtitle="保存、查看和恢复 alignment-contract" />
        <div className="alignment-version-list">
          {contracts.length ? contracts.map((contract) => (
            <div className="alignment-version-row" key={contract.id}>
              <div>
                <strong>{contract.title}</strong>
                <p>{new Date(contract.updatedAt).toLocaleString('zh-CN', { hour12: false })} · {contract.reason}</p>
                <code>{contract.checksum}</code>
              </div>
              <ActionButton variant="ghost" onClick={() => onRestore(contract)}>恢复</ActionButton>
            </div>
          )) : <EmptyArtifactState title="等待保存契约" detail="保存后会生成 alignment-contract artifact，并同步到 workspace .bioagent/artifacts。" />}
        </div>
      </Card>
    </div>
  );
}

function EditableBlock({
  label,
  value,
  onChange,
  rows = 5,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="editable-block">
      <span>{label}</span>
      <textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TimelinePage({ alignmentContracts = [] }: { alignmentContracts?: AlignmentContractRecord[] }) {
  const alignmentItems = alignmentContracts.map((contract) => ({
    time: new Date(contract.updatedAt).toLocaleString('zh-CN', { hour12: false }),
    scenario: 'knowledge' as ScenarioId,
    title: contract.title,
    desc: `alignment-contract ${contract.id} · ${contract.reason} · checksum ${contract.checksum}`,
    claimType: 'fact' as ClaimType,
    confidence: 1,
  }));
  const items = [...alignmentItems, ...timeline];
  return (
    <main className="page">
      <div className="page-heading">
        <h1>研究时间线</h1>
        <p>聊天、工具、证据和执行单元最终都沉淀为可审计的研究记录。</p>
      </div>
      <div className="timeline-list">
        {items.map((item) => {
          const scenario = scenarios.find((entry) => entry.id === item.scenario) ?? scenarios[0];
          return (
            <Card className="timeline-card" key={`${item.time}-${item.title}`}>
              <div className="timeline-dot" style={{ background: scenario.color }} />
              <div>
                <div className="timeline-meta">
                  <span>{item.time}</span>
                  <Badge variant="info">{scenario.name}</Badge>
                  <ClaimTag type={item.claimType} />
                  <ConfidenceBar value={item.confidence} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

function handoffAutoRunPrompt(targetScenario: ScenarioId, artifact: RuntimeArtifact, sourceScenarioName: string, targetScenarioName: string): string {
  const focus = artifactFocusTerm(artifact);
  if (targetScenario === 'literature-evidence-review' && focus) {
    return `${focus} clinical trials，返回 paper-list JSON artifact、claims、ExecutionUnit。`;
  }
  if (targetScenario === 'structure-exploration' && focus) {
    return `分析 ${focus} 的结构，返回 structure-summary artifact、dataRef、质量指标和 ExecutionUnit。`;
  }
  if (targetScenario === 'biomedical-knowledge-graph' && focus) {
    return `${focus} gene/protein knowledge graph，返回 knowledge-graph、来源链接、数据库访问日期和 ExecutionUnit。`;
  }
  return [
    `消费 handoff artifact ${artifact.id} (${artifact.type})。`,
    `来源 Scenario: ${sourceScenarioName}。`,
    `请按${targetScenarioName}的 input contract 生成下一步 claims、ExecutionUnit、UIManifest 和 runtime artifact。`,
  ].join('\n');
}

function artifactFocusTerm(artifact: RuntimeArtifact): string | undefined {
  const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
  const data = isRecord(artifact.data) ? artifact.data : {};
  return asString(metadata.entity)
    || asString(metadata.accession)
    || asString(metadata.uniprotAccession)
    || asString(data.uniprotId)
    || asString(data.pdbId)
    || rowValue(data.rows, 'entity')
    || rowValue(data.rows, 'uniprot_accession')
    || nodeId(data.nodes, ['gene', 'protein']);
}

function rowValue(value: unknown, key: string): string | undefined {
  const rows = Array.isArray(value) ? value.filter(isRecord) : [];
  const found = rows.find((row) => asString(row.key)?.toLowerCase() === key.toLowerCase());
  return asString(found?.value);
}

function nodeId(value: unknown, preferredTypes: string[]): string | undefined {
  const nodes = Array.isArray(value) ? value.filter(isRecord) : [];
  const found = nodes.find((node) => {
    const type = asString(node.type)?.toLowerCase();
    return type ? preferredTypes.includes(type) : false;
  }) ?? nodes[0];
  return asString(found?.id) || asString(found?.label);
}

function shouldUsePersistedWorkspaceState(current: BioAgentWorkspaceState, persisted: BioAgentWorkspaceState) {
  const currentActivity = workspaceActivityScore(current);
  const persistedActivity = workspaceActivityScore(persisted);
  if (persistedActivity === 0) return false;
  if (currentActivity === 0) return true;
  if (persistedActivity > currentActivity) return true;
  if (persistedActivity < currentActivity) return false;
  const currentTime = Date.parse(current.updatedAt || '');
  const persistedTime = Date.parse(persisted.updatedAt || '');
  return Number.isFinite(persistedTime) && (!Number.isFinite(currentTime) || persistedTime >= currentTime);
}

function workspaceActivityScore(state: BioAgentWorkspaceState) {
  return Object.values(state.sessionsByScenario).reduce((total, session) => {
    return total + sessionActivityScore(session);
  }, state.archivedSessions.length + (state.alignmentContracts?.length ?? 0));
}

function sessionActivityScore(session: BioAgentSession) {
  const userMessages = session.messages.filter((message) => !message.id.startsWith('seed')).length;
  return userMessages
    + session.runs.length
    + session.artifacts.length
    + session.executionUnits.length
    + session.notebook.length;
}

export function BioAgentApp() {
  const [page, setPage] = useState<PageId>('dashboard');
  const [scenarioId, setScenarioId] = useState<ScenarioId>('literature-evidence-review');
  const [config, setConfig] = useState<BioAgentConfig>(() => loadBioAgentConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceState, setWorkspaceState] = useState<BioAgentWorkspaceState>(() => {
    const state = loadWorkspaceState();
    const loadedConfig = loadBioAgentConfig();
    return { ...state, workspacePath: loadedConfig.workspacePath || state.workspacePath };
  });
  const [workspaceStatus, setWorkspaceStatus] = useState('');
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [handoffAutoRun, setHandoffAutoRun] = useState<HandoffAutoRunRequest | undefined>();
  const [scenarioOverrides, setScenarioOverrides] = useState<Partial<Record<ScenarioId, ScenarioRuntimeOverride>>>({});
  const [drafts, setDrafts] = useState<Record<ScenarioId, string>>({
    'literature-evidence-review': '',
    'structure-exploration': '',
    'omics-differential-exploration': '',
    'biomedical-knowledge-graph': '',
  });
  const [messageScrollTops, setMessageScrollTops] = useState<Record<ScenarioId, number>>({
    'literature-evidence-review': 0,
    'structure-exploration': 0,
    'omics-differential-exploration': 0,
    'biomedical-knowledge-graph': 0,
  });

  const sessions = workspaceState.sessionsByScenario;
  const archivedSessionsByAgent = useMemo(() => scenarios.reduce((acc, scenario) => {
    acc[scenario.id] = workspaceState.archivedSessions
      .filter((session) => session.scenarioId === scenario.id)
      .sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt));
    return acc;
  }, {} as Record<ScenarioId, BioAgentSession[]>), [workspaceState.archivedSessions]);
  const archivedCountByAgent = useMemo(() => scenarios.reduce((acc, scenario) => {
    acc[scenario.id] = archivedSessionsByAgent[scenario.id].length;
    return acc;
  }, {} as Record<ScenarioId, number>), [archivedSessionsByAgent]);

  async function hydrateWorkspaceSnapshot(path: string, runtimeConfig: BioAgentConfig, mode: 'prefer-newer' | 'force' = 'prefer-newer') {
    const requestedPath = path.trim();
    setWorkspaceHydrated(false);
    try {
      const persisted = await loadPersistedWorkspaceState(requestedPath, runtimeConfig);
      if (persisted) {
        const restoredPath = persisted.workspacePath || requestedPath;
        setWorkspaceState((current) => {
          const incoming = { ...persisted, workspacePath: restoredPath };
          return mode === 'force' || shouldUsePersistedWorkspaceState(current, incoming) ? incoming : current;
        });
        if (restoredPath && runtimeConfig.workspacePath !== restoredPath) {
          setConfig((current) => {
            if (current.workspacePath === restoredPath) return current;
            const next = updateConfig(current, { workspacePath: restoredPath });
            saveBioAgentConfig(next);
            return next;
          });
        }
        setWorkspaceStatus(`已从 ${restoredPath || '最近工作区'}/.bioagent 恢复工作区`);
      } else {
        setWorkspaceStatus(requestedPath ? `未找到 ${requestedPath}/.bioagent/workspace-state.json` : '未找到最近工作区快照');
      }
    } catch (err) {
      setWorkspaceStatus(`Workspace snapshot 未加载：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setWorkspaceHydrated(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const workspacePath = config.workspacePath.trim();
    loadPersistedWorkspaceState(workspacePath, config)
      .then((persisted) => {
        if (cancelled) return;
        if (persisted) {
          const restoredPath = persisted.workspacePath || workspacePath;
          setWorkspaceState((current) => {
            const incoming = { ...persisted, workspacePath: restoredPath };
            return shouldUsePersistedWorkspaceState(current, incoming) ? incoming : current;
          });
          setConfig((current) => {
            if (current.workspacePath === restoredPath) return current;
            const next = updateConfig(current, { workspacePath: restoredPath });
            saveBioAgentConfig(next);
            return next;
          });
          setWorkspaceStatus(`已从 ${restoredPath}/.bioagent 恢复工作区`);
        } else {
          setWorkspaceStatus(workspacePath ? `未找到 ${workspacePath}/.bioagent/workspace-state.json` : '未找到最近工作区快照');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setWorkspaceStatus(`Workspace snapshot 未加载：${err instanceof Error ? err.message : String(err)}`);
        }
      })
      .finally(() => {
        if (!cancelled) setWorkspaceHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspaceHydrated) return;
    saveWorkspaceState(workspaceState);
    if (workspaceState.workspacePath.trim()) {
      persistWorkspaceState(workspaceState, config)
        .then(() => setWorkspaceStatus(`已同步到 ${workspaceState.workspacePath}/.bioagent`))
        .catch((err) => setWorkspaceStatus(`Workspace writer 未连接：${err instanceof Error ? err.message : String(err)}`));
    }
  }, [workspaceState, config, workspaceHydrated]);

  useEffect(() => {
    saveBioAgentConfig(config);
  }, [config]);

  function updateWorkspace(mutator: (state: BioAgentWorkspaceState) => BioAgentWorkspaceState) {
    setWorkspaceState((current) => ({
      ...mutator(current),
      updatedAt: nowIso(),
    }));
  }

  function updateSession(nextSession: BioAgentSession, reason = 'session update') {
    updateWorkspace((current) => ({
      ...current,
      sessionsByScenario: {
        ...current.sessionsByScenario,
        [nextSession.scenarioId]: versionSession(nextSession, reason),
      },
    }));
  }

  function setWorkspacePath(value: string) {
    const nextConfig = updateConfig(config, { workspacePath: value });
    setConfig(nextConfig);
    saveBioAgentConfig(nextConfig);
    updateWorkspace((current) => ({ ...current, workspacePath: value }));
    void hydrateWorkspaceSnapshot(value, nextConfig, 'force');
  }

  function updateRuntimeConfig(patch: Partial<BioAgentConfig>) {
    setConfig((current) => {
      const next = updateConfig(current, patch);
      saveBioAgentConfig(next);
      if ('workspacePath' in patch) {
        updateWorkspace((state) => ({ ...state, workspacePath: next.workspacePath }));
        void hydrateWorkspaceSnapshot(next.workspacePath, next, 'force');
      }
      return next;
    });
  }

  function updateDraft(nextScenarioId: ScenarioId, value: string) {
    setDrafts((current) => ({ ...current, [nextScenarioId]: value }));
  }

  function updateMessageScrollTop(nextScenarioId: ScenarioId, value: number) {
    setMessageScrollTops((current) => ({ ...current, [nextScenarioId]: value }));
  }

  function applyScenarioOverride(nextScenarioId: ScenarioId, override: ScenarioRuntimeOverride) {
    setScenarioOverrides((current) => ({ ...current, [nextScenarioId]: override }));
  }

  function newChat(nextScenarioId: ScenarioId) {
    updateWorkspace((current) => {
      const currentSession = versionSession(current.sessionsByScenario[nextScenarioId], 'new chat archived previous session');
      return {
        ...current,
        archivedSessions: [currentSession, ...current.archivedSessions].slice(0, 80),
        sessionsByScenario: {
          ...current.sessionsByScenario,
          [nextScenarioId]: createSession(nextScenarioId, `${scenarios.find((item) => item.id === nextScenarioId)?.name ?? nextScenarioId} 新聊天`),
        },
      };
    });
  }

  function deleteChat(nextScenarioId: ScenarioId) {
    updateWorkspace((current) => {
      const deleted = versionSession(current.sessionsByScenario[nextScenarioId], 'deleted current chat');
      return {
        ...current,
        archivedSessions: [{ ...deleted, title: `${deleted.title}（已删除）` }, ...current.archivedSessions].slice(0, 80),
        sessionsByScenario: {
          ...current.sessionsByScenario,
          [nextScenarioId]: resetSession(nextScenarioId),
        },
      };
    });
  }

  function restoreArchivedSession(nextScenarioId: ScenarioId, sessionId: string) {
    updateWorkspace((current) => {
      const restored = current.archivedSessions.find((session) => session.scenarioId === nextScenarioId && session.sessionId === sessionId);
      if (!restored) return current;
      const active = current.sessionsByScenario[nextScenarioId];
      const nextArchived = current.archivedSessions.filter((session) => session.sessionId !== sessionId);
      const archivedActive = sessionActivityScore(active) > 0
        ? [versionSession(active, `restored archived session ${sessionId}`), ...nextArchived]
        : nextArchived;
      return {
        ...current,
        archivedSessions: archivedActive.slice(0, 80),
        sessionsByScenario: {
          ...current.sessionsByScenario,
          [nextScenarioId]: {
            ...restored,
            updatedAt: nowIso(),
          },
        },
      };
    });
  }

  function editMessage(nextScenarioId: ScenarioId, messageId: string, content: string) {
    const session = workspaceState.sessionsByScenario[nextScenarioId];
    const nextSession: BioAgentSession = {
      ...session,
      messages: session.messages.map((message) => message.id === messageId ? { ...message, content, updatedAt: nowIso() } as BioAgentMessage : message),
      updatedAt: nowIso(),
    };
    updateSession(nextSession, `edit message ${messageId}`);
  }

  function deleteMessage(nextScenarioId: ScenarioId, messageId: string) {
    const session = workspaceState.sessionsByScenario[nextScenarioId];
    const nextSession: BioAgentSession = {
      ...session,
      messages: session.messages.filter((message) => message.id !== messageId),
      updatedAt: nowIso(),
    };
    updateSession(nextSession, `delete message ${messageId}`);
  }

  function handleSearch(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return;
    const matchedScenario = scenarios.find((scenario) =>
      normalized.includes(scenario.id)
      || normalized.includes(scenario.name.toLowerCase())
      || normalized.includes(scenario.domain.toLowerCase())
      || scenario.tools.some((tool) => normalized.includes(tool.toLowerCase())),
    );
    if (matchedScenario) {
      setScenarioId(matchedScenario.id);
      setPage('workbench');
      return;
    }
    if (normalized.includes('timeline') || normalized.includes('时间线') || normalized.includes('notebook')) {
      setPage('timeline');
      return;
    }
    if (normalized.includes('align') || normalized.includes('对齐')) {
      setPage('alignment');
      return;
    }
    setPage('workbench');
  }

  function handleArtifactHandoff(targetScenario: ScenarioId, artifact: RuntimeArtifact) {
    const sourceScenario = scenarios.find((item) => item.id === artifact.producerScenario);
    const target = scenarios.find((item) => item.id === targetScenario);
    const now = nowIso();
    const autoRunPrompt = handoffAutoRunPrompt(targetScenario, artifact, sourceScenario?.name ?? artifact.producerScenario, target?.name ?? targetScenario);
    const handoffMessage: BioAgentMessage = {
      id: makeId('handoff'),
      role: 'user',
      content: [
        `请基于来自${sourceScenario?.name ?? artifact.producerScenario}的 artifact 继续分析。`,
        `artifact id: ${artifact.id}`,
        `artifact type: ${artifact.type}`,
        `目标：按${target?.name ?? targetScenario}的 input contract 生成下一步 claims、ExecutionUnit 和 UIManifest。`,
      ].join('\n'),
      createdAt: now,
      status: 'completed',
    };
    setWorkspaceState((current) => {
      const targetSession = current.sessionsByScenario[targetScenario];
      const artifacts = targetSession.artifacts.some((item) => item.id === artifact.id)
        ? targetSession.artifacts
        : [artifact, ...targetSession.artifacts].slice(0, 24);
      const nextTargetSession = versionSession({
        ...targetSession,
        messages: [...targetSession.messages, handoffMessage],
        artifacts,
        notebook: [{
          id: makeId('note'),
          time: new Date(now).toLocaleString('zh-CN', { hour12: false }),
          scenario: targetScenario,
          title: `接收 ${artifact.type}`,
          desc: `来自 ${sourceScenario?.name ?? artifact.producerScenario} 的 ${artifact.id} 已进入当前 Scenario 上下文。`,
          claimType: 'fact' as const,
          confidence: 1,
          artifactRefs: [artifact.id],
          updateReason: 'artifact handoff',
        }, ...targetSession.notebook].slice(0, 24),
        updatedAt: now,
      }, `handoff artifact ${artifact.id}`);
      return {
        ...current,
        sessionsByScenario: {
          ...current.sessionsByScenario,
          [targetScenario]: nextTargetSession,
        },
        updatedAt: now,
      };
    });
    setScenarioId(targetScenario);
    setPage('workbench');
    setHandoffAutoRun({
      id: makeId('handoff-run'),
      targetScenario,
      prompt: autoRunPrompt,
    });
  }

  function consumeHandoffAutoRun(requestId: string) {
    setHandoffAutoRun((current) => current?.id === requestId ? undefined : current);
  }

  function saveAlignmentContract(data: AlignmentContractData, reason: string, confirmationStatus: AlignmentContractRecord['confirmationStatus'] = 'needs-data') {
    const now = nowIso();
    const checksum = checksumText(JSON.stringify(data));
    const id = makeId('alignment-contract');
    const contract: AlignmentContractRecord = {
      id,
      type: 'alignment-contract',
      schemaVersion: '1',
      title: `Alignment contract ${new Date(now).toLocaleString('zh-CN', { hour12: false })}`,
      createdAt: now,
      updatedAt: now,
      reason,
      checksum,
      sourceRefs: ['alignment-workspace:user-input', 'alignment-workspace:ai-draft'],
      assumptionRefs: ['assumption:data-quality-review-required', 'assumption:researcher-final-authority'],
      decisionAuthority: 'researcher',
      confirmationStatus,
      confirmedBy: confirmationStatus === 'user-confirmed' ? 'researcher' : undefined,
      confirmedAt: confirmationStatus === 'user-confirmed' ? now : undefined,
      sourceContractVersion: id,
      data,
    };
    updateWorkspace((current) => ({
      ...current,
      alignmentContracts: [contract, ...(current.alignmentContracts ?? [])].slice(0, 40),
    }));
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <Sidebar
        page={page}
        setPage={setPage}
        scenarioId={scenarioId}
        setScenarioId={setScenarioId}
        config={config}
        workspaceStatus={workspaceStatus}
        onWorkspacePathChange={setWorkspacePath}
      />
      <div className="main-shell">
        <TopBar onSearch={handleSearch} onSettingsOpen={() => setSettingsOpen(true)} />
        <div className="content-shell">
          {page === 'dashboard' ? (
            <Dashboard setPage={setPage} setScenarioId={setScenarioId} onApplyScenarioDraft={applyScenarioOverride} />
          ) : page === 'workbench' ? (
            <Workbench
              scenarioId={scenarioId}
              config={config}
              session={sessions[scenarioId]}
              draft={drafts[scenarioId]}
              savedScrollTop={messageScrollTops[scenarioId]}
              onDraftChange={updateDraft}
              onScrollTopChange={updateMessageScrollTop}
              onSessionChange={updateSession}
              onNewChat={newChat}
              onDeleteChat={deleteChat}
              archivedSessions={archivedSessionsByAgent[scenarioId]}
              onRestoreArchivedSession={restoreArchivedSession}
              onEditMessage={editMessage}
              onDeleteMessage={deleteMessage}
              archivedCount={archivedCountByAgent[scenarioId]}
              onArtifactHandoff={handleArtifactHandoff}
              autoRunRequest={handoffAutoRun}
              onAutoRunConsumed={consumeHandoffAutoRun}
              scenarioOverride={scenarioOverrides[scenarioId]}
              onScenarioOverrideChange={applyScenarioOverride}
            />
          ) : page === 'alignment' ? (
            <AlignmentPage contracts={workspaceState.alignmentContracts ?? []} onSaveContract={saveAlignmentContract} />
          ) : (
            <TimelinePage alignmentContracts={workspaceState.alignmentContracts ?? []} />
          )}
        </div>
      </div>
      {settingsOpen ? (
        <SettingsDialog
          config={config}
          onChange={updateRuntimeConfig}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
