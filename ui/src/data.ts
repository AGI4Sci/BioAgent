import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Database,
  Dna,
  FileText,
  FlaskConical,
  GitBranch,
  Microscope,
  Network,
  Shield,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type AgentId = 'literature' | 'structure' | 'omics' | 'knowledge';
export type PageId = 'dashboard' | 'workbench' | 'alignment' | 'timeline';
export type ClaimType = 'fact' | 'inference' | 'hypothesis';
export type EvidenceLevel = 'meta' | 'rct' | 'cohort' | 'case' | 'prediction';

export interface AgentViewConfig {
  id: AgentId;
  name: string;
  domain: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  tools: string[];
  status: 'active' | 'ready';
  defaultResult: string;
}

export const agents: AgentViewConfig[] = [
  {
    id: 'literature',
    name: '文献 Agent',
    domain: 'literature-research',
    desc: '文献检索、综述生成、证据矩阵与矛盾证据整理',
    icon: BookOpen,
    color: '#00E5A0',
    tools: ['PubMed', 'Semantic Scholar', 'EvidenceGraph'],
    status: 'active',
    defaultResult: 'paper-card-list',
  },
  {
    id: 'structure',
    name: '结构 Agent',
    domain: 'protein-structure',
    desc: '蛋白结构、结合口袋、pLDDT 置信度与分子查看器',
    icon: FlaskConical,
    color: '#FF7043',
    tools: ['PDB', 'AlphaFold DB', 'Mol*'],
    status: 'active',
    defaultResult: 'molecule-viewer',
  },
  {
    id: 'omics',
    name: '组学 Agent',
    domain: 'omics-analysis',
    desc: '差异表达、富集分析、热图、火山图与 UMAP 探索',
    icon: Dna,
    color: '#4ECDC4',
    tools: ['DESeq2', 'Scanpy', 'clusterProfiler'],
    status: 'ready',
    defaultResult: 'volcano-plot',
  },
  {
    id: 'knowledge',
    name: '知识库 Agent',
    domain: 'bio-knowledge',
    desc: 'UniProt、ChEMBL、OpenTargets、ClinicalTrials 知识查询',
    icon: Database,
    color: '#FFD54F',
    tools: ['UniProt', 'ChEMBL', 'OpenTargets'],
    status: 'ready',
    defaultResult: 'network-graph',
  },
];

export const navItems = [
  { id: 'dashboard' as const, label: '研究概览', icon: Activity },
  { id: 'workbench' as const, label: '单 Agent 工作台', icon: Brain },
  { id: 'alignment' as const, label: '对齐工作台', icon: Users },
  { id: 'timeline' as const, label: '研究时间线', icon: GitBranch },
];

export const componentManifest = {
  literature: ['conversation-panel', 'parameter-panel', 'paper-card-list', 'evidence-matrix', 'notebook-timeline'],
  structure: ['conversation-panel', 'parameter-panel', 'molecule-viewer', 'evidence-matrix', 'notebook-timeline'],
  omics: ['conversation-panel', 'parameter-panel', 'volcano-plot', 'heatmap-viewer', 'notebook-timeline'],
  knowledge: ['conversation-panel', 'parameter-panel', 'network-graph', 'data-table', 'notebook-timeline'],
} satisfies Record<AgentId, string[]>;

export const stats = [
  { label: '单 Agent Profiles', value: '4', icon: Brain, color: '#00E5A0' },
  { label: 'Execution Units', value: '18', icon: Shield, color: '#FF7043' },
  { label: 'Evidence Claims', value: '64', icon: FileText, color: '#4ECDC4' },
  { label: 'UI Components', value: '11', icon: BarChart3, color: '#FFD54F' },
];

export const messagesByAgent: Record<AgentId, Array<{
  role: 'user' | 'agent';
  content: string;
  confidence?: number;
  evidence?: EvidenceLevel;
  claimType?: ClaimType;
  expandable?: string;
}>> = {
  literature: [
    { role: 'user', content: '检索近三年关于 KRAS G12C 抑制剂耐药机制的文献，并标注证据强度。' },
    {
      role: 'agent',
      content:
        '已形成可审计文献证据矩阵：47 篇相关文献中，12 篇直接研究耐药机制。EGFR/MET 旁路激活是当前支持最强的机制，KRAS Y96D 二次突变和组织学转化为需要并排展示的备选机制。',
      confidence: 0.91,
      evidence: 'cohort',
      claimType: 'inference',
      expandable:
        'Step 1: PubMed/Semantic Scholar 检索 KRAS G12C resistance\nStep 2: 按证据等级分组 Meta/RCT/队列/案例\nStep 3: 生成 contradiction group：旁路激活 vs 二次突变\nStep 4: 输出 EvidenceGraph 与 PaperCardList manifest',
    },
  ],
  structure: [
    { role: 'user', content: '分析 PDB:7BZ5 的 Switch-II 口袋，以及 Y96D 突变对结合的影响。' },
    {
      role: 'agent',
      content:
        '结构记录已生成。7BZ5 分辨率 1.79 Å，Switch-II 口袋体积约 628 Å3。Y96D 位点靠近抑制剂结合构象核心区域，当前作为推断性风险标记，需要分子动力学或突变实验验证。',
      confidence: 0.94,
      evidence: 'rct',
      claimType: 'fact',
      expandable:
        'ExecutionUnit: structure.fetch-or-predict\nData fingerprint: PDB:7BZ5 + ligand 6SI\nUI slots: molecule-viewer, evidence-matrix, notebook-timeline',
    },
  ],
  omics: [
    { role: 'user', content: '对 RNA-seq 数据做差异表达，并展示火山图和富集结果。' },
    {
      role: 'agent',
      content:
        'DESeq2 record-only 执行单元已生成。示例结果显示 847 个差异基因，上调 492 个，下调 355 个；干扰素γ反应为最显著富集通路。当前结果是 mock 数据契约，用于验证 UIManifest 渲染。',
      confidence: 0.88,
      evidence: 'prediction',
      claimType: 'inference',
      expandable:
        'ExecutionUnit params: design=~condition, alpha=0.05, seed=1\nArtifacts: volcano-plot, enrichment-table, execution-unit.json',
    },
  ],
  knowledge: [
    { role: 'user', content: '查询 KRAS 靶点的成药性、已上市药物和临床试验。' },
    {
      role: 'agent',
      content:
        '已从 UniProt、ChEMBL、OpenTargets 和 ClinicalTrials 形成知识卡片。KRAS G12C 已有 sotorasib 与 adagrasib 上市，非共价泛 KRAS 抑制剂仍处于临床探索阶段。',
      confidence: 0.96,
      evidence: 'meta',
      claimType: 'fact',
    },
  ],
};

export const paperCards = [
  { title: 'KRAS G12C acquired resistance landscape', source: 'Cancer Discovery', year: '2024', level: 'cohort' as EvidenceLevel },
  { title: 'Adagrasib and sotorasib clinical response comparison', source: 'Nature Medicine', year: '2024', level: 'rct' as EvidenceLevel },
  { title: 'EGFR-MET bypass activation in KRAS inhibitor escape', source: 'JCO', year: '2023', level: 'case' as EvidenceLevel },
];

export const executionUnits = [
  { id: 'EU-001', tool: 'literature.search', params: 'query=KRAS G12C resistance, max=50', status: 'done', hash: 'a3f2c9...', time: '1.8s' },
  { id: 'EU-002', tool: 'evidence.reduce', params: 'levels=meta,rct,cohort,case', status: 'done', hash: 'b7d1e4...', time: '0.6s' },
  { id: 'EU-003', tool: 'structure.fetch', params: 'pdb=7BZ5, ligand=6SI', status: 'done', hash: 'c8e5f2...', time: '2.1s' },
  { id: 'EU-004', tool: 'omics.deseq2', params: 'design=~condition, alpha=0.05', status: 'planned', hash: '-', time: '-' },
];

export const timeline = [
  { time: '2026-04-19 14:30', agent: 'literature' as AgentId, title: 'KRAS G12C 耐药文献综述', desc: '47 篇文献进入证据矩阵，识别 3 类耐药机制', claimType: 'inference' as ClaimType, confidence: 0.91 },
  { time: '2026-04-19 15:05', agent: 'structure' as AgentId, title: '7BZ5 结合口袋分析', desc: 'Switch-II 口袋体积和关键残基已归档', claimType: 'fact' as ClaimType, confidence: 0.94 },
  { time: '2026-04-19 15:40', agent: 'omics' as AgentId, title: '差异表达 mock 契约', desc: '火山图、热图、UMAP 组件契约完成验证', claimType: 'inference' as ClaimType, confidence: 0.82 },
  { time: '2026-04-19 16:10', agent: 'knowledge' as AgentId, title: 'KRAS 知识库卡片', desc: 'UniProt / ChEMBL / OpenTargets 视图进入 manifest', claimType: 'fact' as ClaimType, confidence: 0.96 },
];

export const feasibilityRows = [
  { dim: '样本量', ai: '200 样本可支持基础建模', bio: '每个样本成本高，无法轻易扩充', action: '公共数据预训练 + 内部数据微调', status: 'caution' },
  { dim: '标签质量', ai: '3 种药物标签严重不平衡', bio: '窄谱药物响应率本身极低', action: '拆分建模，避免混入主任务', status: 'ok' },
  { dim: '特征维度', ai: '20K 基因 vs 200 样本存在过拟合', bio: '需要保留通路相关基因', action: '先验知识驱动特征筛选', status: 'caution' },
  { dim: '成功标准', ai: 'AUROC > 0.8', bio: '假阳性率 < 20% 才值得验证', action: 'AI 指标 + 实验验证双阈值', status: 'ok' },
];

export const radarData = [
  { subject: '数据充分性', ai: 65, bio: 80 },
  { subject: '任务可行性', ai: 72, bio: 90 },
  { subject: '工具成熟度', ai: 88, bio: 70 },
  { subject: '团队经验', ai: 60, bio: 85 },
  { subject: '时间预算', ai: 45, bio: 55 },
  { subject: '验证可行', ai: 70, bio: 75 },
];

export const roleTabs = [
  { id: 'biologist', label: '实验生物学家', icon: Microscope },
  { id: 'bioinformatician', label: '生信分析师', icon: Dna },
  { id: 'pi', label: 'PI', icon: Target },
  { id: 'clinical', label: '临床医生', icon: Network },
];
