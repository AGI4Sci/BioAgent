import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';

type Profile = 'literature' | 'structure' | 'omics' | 'knowledge';

interface ToolRequest {
  profile: Profile;
  prompt: string;
  workspacePath?: string;
  artifacts?: Array<Record<string, unknown>>;
}

interface ToolPayload {
  message: string;
  confidence: number;
  claimType: string;
  evidenceLevel: string;
  reasoningTrace: string;
  claims: Array<Record<string, unknown>>;
  uiManifest: Array<Record<string, unknown>>;
  executionUnits: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
}

const PROFILE_SET = new Set<Profile>(['literature', 'structure', 'omics', 'knowledge']);
const execFileAsync = promisify(execFile);

export async function runLegacyBioAgentTool(body: Record<string, unknown>): Promise<ToolPayload> {
  const profile = String(body.profile || '') as Profile;
  if (!PROFILE_SET.has(profile)) throw new Error(`Unsupported BioAgent profile: ${String(body.profile || '')}`);
  const request: ToolRequest = {
    profile,
    prompt: String(body.prompt || ''),
    workspacePath: typeof body.workspacePath === 'string' ? body.workspacePath : undefined,
    artifacts: Array.isArray(body.artifacts) ? body.artifacts.filter(isRecord) : [],
  };
  if (profile === 'literature') return runLiterature(request);
  if (profile === 'structure') return runStructure(request);
  if (profile === 'omics') return runOmics(request);
  return runKnowledge(request);
}

async function runLiterature(request: ToolRequest): Promise<ToolPayload> {
  const query = literatureQuery(request);
  const retmax = 5;
  const esearch = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  esearch.searchParams.set('db', 'pubmed');
  esearch.searchParams.set('term', query);
  esearch.searchParams.set('retmode', 'json');
  esearch.searchParams.set('retmax', String(retmax));
  const searchJson = await fetchJson(esearch);
  const ids = ((searchJson as { esearchresult?: { idlist?: string[] } }).esearchresult?.idlist ?? []).filter(Boolean);
  const papers = ids.length ? await pubmedSummaries(ids) : [];
  return {
    message: papers.length
      ? `PubMed returned ${papers.length} paper records for: ${query}`
      : `PubMed returned no paper records for: ${query}`,
    confidence: papers.length ? 0.86 : 0.55,
    claimType: papers.length ? 'fact' : 'inference',
    evidenceLevel: 'database',
    reasoningTrace: `BioAgent project tool queried PubMed E-utilities from the BioAgent workspace service with retmax=${retmax}.`,
    claims: papers.map((paper) => ({
      text: `${paper.title} (${paper.year}) was retrieved from PubMed for ${query}.`,
      type: 'fact',
      confidence: 0.84,
      evidenceLevel: 'database',
      supportingRefs: [`PMID:${paper.pmid}`],
      opposingRefs: [],
    })),
    uiManifest: [
      { componentId: 'paper-card-list', title: 'PubMed papers', artifactRef: 'paper-list', priority: 1 },
      { componentId: 'evidence-matrix', title: 'Evidence', artifactRef: 'paper-list', priority: 2 },
      { componentId: 'execution-unit-table', title: 'Execution units', artifactRef: 'paper-list', priority: 3 },
    ],
    executionUnits: [executionUnit('literature', 'PubMed.eutils.esearch+esummary', {
      query,
      retmax,
      database: 'pubmed',
    }, 'done', ['PubMed E-utilities'], ['paper-list'])],
    artifacts: [{
      id: 'paper-list',
      type: 'paper-list',
      producerAgent: 'literature',
      schemaVersion: '1',
      metadata: { query, retmax, source: 'PubMed', accessedAt: new Date().toISOString() },
      data: { query, papers },
    }],
  };
}

function literatureQuery(request: ToolRequest) {
  const fromArtifact = request.artifacts?.map((artifact) => {
    const data = isRecord(artifact.dataPreview) ? artifact.dataPreview : isRecord(artifact.data) ? artifact.data : {};
    const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
    return stringValue(metadata.entity)
      || stringValue(metadata.accession)
      || stringValue(data.uniprotId)
      || rowValue(data.rows, 'entity')
      || nodeValue(data.nodes);
  }).find(Boolean);
  const prompt = request.prompt || fromArtifact || 'KRAS G12D pancreatic cancer targeted therapy';
  if (/clinical trials?/i.test(prompt) && fromArtifact) return `${fromArtifact} clinical trials`;
  return prompt
    .replace(/返回.*$/u, '')
    .replace(/请|文献|证据|近三年|三年|paper-list|JSON|artifact|claims|ExecutionUnit/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || String(fromArtifact || 'KRAS G12D pancreatic cancer targeted therapy');
}

async function pubmedSummaries(ids: string[]) {
  const esummary = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  esummary.searchParams.set('db', 'pubmed');
  esummary.searchParams.set('id', ids.join(','));
  esummary.searchParams.set('retmode', 'json');
  const summaryJson = await fetchJson(esummary) as { result?: Record<string, Record<string, unknown>> };
  return ids.map((pmid) => {
    const record = summaryJson.result?.[pmid] ?? {};
    const authors = Array.isArray(record.authors)
      ? record.authors.map((author) => isRecord(author) ? stringValue(author.name) : undefined).filter(Boolean)
      : [];
    return {
      pmid,
      title: stringValue(record.title) || `PMID ${pmid}`,
      authors,
      journal: stringValue(record.fulljournalname) || stringValue(record.source) || 'PubMed',
      year: String(stringValue(record.pubdate)?.match(/\d{4}/)?.[0] || ''),
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      abstract: stringValue(record.sorttitle) || stringValue(record.title) || '',
      evidenceLevel: 'database',
    };
  });
}

async function runStructure(request: ToolRequest): Promise<ToolPayload> {
  const workspace = resolve(request.workspacePath || process.cwd());
  const runId = createHash('sha1').update(`structure:${request.prompt}:${Date.now()}`).digest('hex').slice(0, 12);
  const taskRel = `.bioagent/tasks/structure-${runId}.py`;
  const inputRel = `.bioagent/task-inputs/structure-${runId}.json`;
  const outputRel = `.bioagent/task-results/structure-${runId}.json`;
  const stdoutRel = `.bioagent/logs/structure-${runId}.stdout.log`;
  const stderrRel = `.bioagent/logs/structure-${runId}.stderr.log`;
  await mkdir(join(workspace, '.bioagent', 'structures'), { recursive: true });
  await mkdir(join(workspace, '.bioagent', 'tasks'), { recursive: true });
  await mkdir(join(workspace, '.bioagent', 'task-inputs'), { recursive: true });
  await mkdir(join(workspace, '.bioagent', 'task-results'), { recursive: true });
  await mkdir(join(workspace, '.bioagent', 'logs'), { recursive: true });
  const taskTemplate = await readFile(resolve(process.cwd(), 'scripts', 'python_tasks', 'structure_task.py'), 'utf8');
  const pythonCommand = await pythonCommandForWorkspace(workspace);
  await writeFile(join(workspace, taskRel), taskTemplate);
  await writeFile(join(workspace, inputRel), JSON.stringify({
    prompt: request.prompt,
    workspacePath: workspace,
    runId,
    attempt: 1,
    taskCodeRef: taskRel,
    inputRef: inputRel,
    outputRef: outputRel,
    stdoutRef: stdoutRel,
    stderrRef: stderrRel,
    pythonCommand,
  }, null, 2));
  try {
    const result = await execFileAsync(pythonCommand, [join(workspace, taskRel), join(workspace, inputRel), join(workspace, outputRel)], {
      cwd: workspace,
      maxBuffer: 32 * 1024 * 1024,
    });
    await writeFile(join(workspace, stdoutRel), result.stdout || '');
    await writeFile(join(workspace, stderrRel), result.stderr || '');
    return await readPythonTaskPayload(workspace, outputRel, taskRel, stdoutRel, stderrRel);
  } catch (error) {
    const maybe = isRecord(error) ? error : {};
    await writeFile(join(workspace, stdoutRel), typeof maybe.stdout === 'string' ? maybe.stdout : '');
    await writeFile(join(workspace, stderrRel), typeof maybe.stderr === 'string' ? maybe.stderr : errorMessage(error));
    if (await fileExists(join(workspace, outputRel))) {
      return readPythonTaskPayload(workspace, outputRel, taskRel, stdoutRel, stderrRel);
    }
    return pythonTaskFailurePayload(request.prompt, taskRel, stdoutRel, stderrRel, outputRel, errorMessage(error));
  }
}

async function readPythonTaskPayload(
  workspace: string,
  outputRel: string,
  taskRel: string,
  stdoutRel: string,
  stderrRel: string,
): Promise<ToolPayload> {
  const text = await readFile(join(workspace, outputRel), 'utf8');
  const parsed = JSON.parse(text) as ToolPayload;
  const executionUnits = Array.isArray(parsed.executionUnits) ? parsed.executionUnits : [];
  return {
    message: String(parsed.message || 'Python structure task completed.'),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    claimType: String(parsed.claimType || 'fact'),
    evidenceLevel: String(parsed.evidenceLevel || 'runtime'),
    reasoningTrace: String(parsed.reasoningTrace || ''),
    claims: Array.isArray(parsed.claims) ? parsed.claims : [],
    uiManifest: Array.isArray(parsed.uiManifest) ? parsed.uiManifest : [],
    executionUnits: executionUnits.map((unit) => isRecord(unit) ? {
      language: 'python',
      codeRef: taskRel,
      stdoutRef: stdoutRel,
      stderrRef: stderrRel,
      outputRef: outputRel,
      ...unit,
    } : unit),
    artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
  };
}

async function pythonCommandForWorkspace(workspace: string) {
  const candidates = [
    join(workspace, '.venv-bioagent', 'bin', 'python'),
    join(workspace, '.venv-bioagent-omics', 'bin', 'python'),
    join(workspace, '.venv', 'bin', 'python'),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return 'python3';
}

function pythonTaskFailurePayload(
  prompt: string,
  taskRel: string,
  stdoutRel: string,
  stderrRel: string,
  outputRel: string,
  reason: string,
): ToolPayload {
  return {
    message: `Python structure task failed: ${reason}`,
    confidence: 0.2,
    claimType: 'fact',
    evidenceLevel: 'runtime',
    reasoningTrace: [
      'BioAgent launched a workspace-local Python task, but it failed before producing a valid structure artifact.',
      `taskCodeRef=${taskRel}`,
      `stdoutRef=${stdoutRel}`,
      `stderrRef=${stderrRel}`,
      `outputRef=${outputRel}`,
      'No demo, default PDB entry, or record-only result was substituted.',
    ].join('\n'),
    claims: [{
      text: 'The structure task failed before producing real coordinates.',
      type: 'fact',
      confidence: 0.2,
      evidenceLevel: 'runtime',
      supportingRefs: [],
      opposingRefs: [],
    }],
    uiManifest: [
      { componentId: 'molecule-viewer', title: 'Structure', artifactRef: 'structure-summary', priority: 1 },
      { componentId: 'execution-unit-table', title: 'Execution units', artifactRef: 'structure-summary', priority: 2 },
    ],
    executionUnits: [{
      id: `EU-${sha1(`python-structure:${prompt}:${reason}`).slice(0, 8)}`,
      tool: 'bioagent.python.structure_task',
      params: JSON.stringify({ prompt, reason }),
      status: 'failed',
      hash: sha1(`${taskRel}:${stderrRel}`).slice(0, 12),
      code: `python ${taskRel}`,
      language: 'python',
      codeRef: taskRel,
      entrypoint: 'main',
      stdoutRef: stdoutRel,
      stderrRef: stderrRel,
      outputRef: outputRel,
      attempt: 1,
      time: 'runtime',
      environment: 'python3',
      inputData: [prompt],
      artifacts: [],
      outputArtifacts: [],
    }],
    artifacts: [],
  };
}

async function runKnowledge(request: ToolRequest): Promise<ToolPayload> {
  const entity = knowledgeEntity(request);
  const entityKind = knowledgeEntityKind(request.prompt);
  if (entityKind === 'compound') {
    return runChEMBLCompound(entity, request.prompt);
  }
  if (entityKind !== 'gene' && entityKind !== 'protein') {
    return unsupportedKnowledge(entity, entityKind, request.prompt);
  }
  const query = `(gene_exact:${entity}) AND (organism_id:9606) AND (reviewed:true)`;
  const url = new URL('https://rest.uniprot.org/uniprotkb/search');
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('size', '1');
  const json = await fetchJson(url) as { results?: Array<Record<string, unknown>> };
  const record = json.results?.find(isRecord) ?? {};
  const accession = stringValue(record.primaryAccession) || entity;
  const protein = isRecord(record.proteinDescription)
    && isRecord(record.proteinDescription.recommendedName)
    && isRecord(record.proteinDescription.recommendedName.fullName)
    ? stringValue(record.proteinDescription.recommendedName.fullName.value)
    : accession;
  const functionComment = Array.isArray(record.comments)
    ? record.comments.map((comment) => isRecord(comment) && Array.isArray(comment.texts) && isRecord(comment.texts[0]) ? stringValue(comment.texts[0].value) : undefined).find(Boolean)
    : undefined;
  return {
    message: `UniProt returned reviewed human entry ${accession} for ${entity}.`,
    confidence: record.primaryAccession ? 0.88 : 0.58,
    claimType: 'fact',
    evidenceLevel: 'database',
    reasoningTrace: `BioAgent project tool queried UniProt REST with exact reviewed human gene disambiguation.`,
    claims: [{
      text: `${entity} maps to UniProt accession ${accession}.`,
      type: 'fact',
      confidence: record.primaryAccession ? 0.88 : 0.58,
      evidenceLevel: 'database',
      supportingRefs: [`UniProt:${accession}`],
      opposingRefs: [],
    }],
    uiManifest: [
      { componentId: 'network-graph', title: 'Knowledge graph', artifactRef: 'knowledge-graph', priority: 1 },
      { componentId: 'data-table', title: 'Knowledge cards', artifactRef: 'knowledge-graph', priority: 2 },
      { componentId: 'execution-unit-table', title: 'Execution units', artifactRef: 'knowledge-graph', priority: 3 },
    ],
    executionUnits: [executionUnit('knowledge', 'UniProt.uniprotkb.search', { query, size: 1 }, 'done', ['UniProt current'], ['knowledge-graph'])],
    artifacts: [{
      id: 'knowledge-graph',
      type: 'knowledge-graph',
      producerAgent: 'knowledge',
      schemaVersion: '1',
      metadata: { entity, accession, source: 'UniProt', accessedAt: new Date().toISOString() },
      data: {
        nodes: [
          { id: entity, label: entity, type: 'gene', confidence: 0.9, sourceRefs: [`https://rest.uniprot.org/uniprotkb/${accession}`] },
          { id: accession, label: protein || accession, type: 'protein', confidence: 0.88, sourceRefs: [`https://rest.uniprot.org/uniprotkb/${accession}`] },
          { id: 'UniProt', label: 'UniProt', type: 'database', confidence: 0.95, sourceRefs: ['https://rest.uniprot.org/uniprotkb/search'] },
        ],
        edges: [
          { source: entity, target: accession, relation: 'encodes', evidenceLevel: 'database', supportingRefs: [`UniProt:${accession}`] },
          { source: accession, target: 'UniProt', relation: 'sourced_from', evidenceLevel: 'database', supportingRefs: ['UniProt REST'] },
        ],
        rows: [
          { key: 'entity', value: entity, source: 'prompt' },
          { key: 'uniprot_accession', value: accession, source: 'UniProt' },
          { key: 'protein_name', value: protein, source: 'UniProt' },
          { key: 'function', value: functionComment || 'review needed', source: 'UniProt' },
        ],
      },
    }],
  };
}

async function runChEMBLCompound(entity: string, prompt: string): Promise<ToolPayload> {
  const accessedAt = new Date().toISOString();
  const searchUrl = new URL('https://www.ebi.ac.uk/chembl/api/data/molecule/search.json');
  searchUrl.searchParams.set('q', entity);
  const searchJson = await fetchJson(searchUrl) as { molecules?: Array<Record<string, unknown>> };
  const molecules = Array.isArray(searchJson.molecules) ? searchJson.molecules.filter(isRecord) : [];
  const molecule = molecules.find((item) => stringValue(item.pref_name)?.toLowerCase() === entity.toLowerCase()) ?? molecules[0];
  if (!molecule) return unsupportedKnowledge(entity, 'compound', prompt);
  const chemblId = stringValue(molecule.molecule_chembl_id) || entity;
  const prefName = stringValue(molecule.pref_name) || entity;
  const moleculeUrl = `https://www.ebi.ac.uk/chembl/explore/compound/${chemblId}`;
  const mechanismUrl = new URL('https://www.ebi.ac.uk/chembl/api/data/mechanism.json');
  mechanismUrl.searchParams.set('molecule_chembl_id', chemblId);
  const indicationUrl = new URL('https://www.ebi.ac.uk/chembl/api/data/drug_indication.json');
  indicationUrl.searchParams.set('molecule_chembl_id', chemblId);
  const [mechanismJson, indicationJson] = await Promise.all([
    fetchJson(mechanismUrl).catch(() => ({ mechanisms: [] })),
    fetchJson(indicationUrl).catch(() => ({ drug_indications: [] })),
  ]) as [{ mechanisms?: Array<Record<string, unknown>> }, { drug_indications?: Array<Record<string, unknown>> }];
  const mechanism = Array.isArray(mechanismJson.mechanisms) ? mechanismJson.mechanisms.find(isRecord) : undefined;
  const indication = Array.isArray(indicationJson.drug_indications) ? indicationJson.drug_indications.find(isRecord) : undefined;
  const targetId = stringValue(mechanism?.target_chembl_id);
  const targetLabel = stringValue(mechanism?.mechanism_of_action) || targetId || 'target not reported';
  const disease = stringValue(indication?.efo_term) || stringValue(indication?.mesh_heading) || 'indication not reported';
  const sourceRefs = [
    moleculeUrl,
    firstRefUrl(mechanism?.mechanism_refs),
    firstRefUrl(indication?.indication_refs),
  ].filter((item): item is string => Boolean(item));
  return {
    message: `ChEMBL returned compound ${prefName} (${chemblId})${targetId ? ` with target ${targetId}` : ''}.`,
    confidence: 0.86,
    claimType: 'fact',
    evidenceLevel: 'database',
    reasoningTrace: `BioAgent project tool queried ChEMBL molecule search, mechanism, and drug indication endpoints for compound entity "${entity}".`,
    claims: [{
      text: `${prefName} maps to ChEMBL compound ${chemblId}${targetId ? ` and mechanism target ${targetId}` : ''}.`,
      type: 'fact',
      confidence: 0.86,
      evidenceLevel: 'database',
      supportingRefs: [`ChEMBL:${chemblId}`, ...sourceRefs],
      opposingRefs: [],
    }],
    uiManifest: [
      { componentId: 'network-graph', title: 'ChEMBL compound graph', artifactRef: 'knowledge-graph', priority: 1 },
      { componentId: 'data-table', title: 'ChEMBL compound card', artifactRef: 'knowledge-graph', priority: 2 },
      { componentId: 'execution-unit-table', title: 'Execution units', artifactRef: 'knowledge-graph', priority: 3 },
    ],
    executionUnits: [executionUnit('knowledge', 'ChEMBL.molecule.search+mechanism+indication', { entity, chemblId }, 'done', ['ChEMBL current'], ['knowledge-graph'])],
    artifacts: [{
      id: 'knowledge-graph',
      type: 'knowledge-graph',
      producerAgent: 'knowledge',
      schemaVersion: '1',
      metadata: { entity, entityKind: 'compound', chemblId, source: 'ChEMBL', accessedAt, sourceRefs },
      data: {
        nodes: [
          { id: chemblId, label: prefName, type: 'compound', confidence: 0.9, sourceRefs: [moleculeUrl] },
          ...(targetId ? [{ id: targetId, label: targetLabel, type: 'target', confidence: 0.82, sourceRefs }] : []),
          ...(disease !== 'indication not reported' ? [{ id: disease, label: disease, type: 'disease', confidence: 0.74, sourceRefs }] : []),
          { id: 'ChEMBL', label: 'ChEMBL', type: 'database', confidence: 0.95, sourceRefs: ['https://www.ebi.ac.uk/chembl/'] },
        ],
        edges: [
          ...(targetId ? [{ source: chemblId, target: targetId, relation: stringValue(mechanism?.action_type) || 'has_mechanism', evidenceLevel: 'database', supportingRefs: sourceRefs }] : []),
          ...(disease !== 'indication not reported' ? [{ source: chemblId, target: disease, relation: 'has_indication', evidenceLevel: 'database', supportingRefs: sourceRefs }] : []),
          { source: chemblId, target: 'ChEMBL', relation: 'sourced_from', evidenceLevel: 'database', supportingRefs: [moleculeUrl] },
        ],
        rows: [
          { key: 'entity', value: entity, source: 'prompt' },
          { key: 'chembl_id', value: chemblId, source: 'ChEMBL' },
          { key: 'pref_name', value: prefName, source: 'ChEMBL' },
          { key: 'max_phase', value: String(molecule.max_phase ?? 'unknown'), source: 'ChEMBL' },
          { key: 'first_approval', value: String(molecule.first_approval ?? 'unknown'), source: 'ChEMBL' },
          { key: 'mechanism', value: targetLabel, source: 'ChEMBL mechanism' },
          { key: 'target_chembl_id', value: targetId || 'not reported', source: 'ChEMBL mechanism' },
          { key: 'indication', value: disease, source: 'ChEMBL drug_indication' },
          { key: 'source_url', value: moleculeUrl, source: 'ChEMBL' },
          { key: 'accessedAt', value: accessedAt, source: 'BioAgent project tool' },
        ],
      },
    }],
  };
}

function unsupportedKnowledge(entity: string, entityKind: string, prompt: string): ToolPayload {
  const accessedAt = new Date().toISOString();
  return {
    message: `BioAgent knowledge project tool does not yet support ${entityKind} query "${entity}" with a real database connector. No demo drug or trial nodes were generated.`,
    confidence: 1,
    claimType: 'fact',
    evidenceLevel: 'database',
    reasoningTrace: `Entity disambiguation classified prompt as ${entityKind}; UniProt gene/protein lookup and ChEMBL compound lookup are enabled. Missing disease or clinical-trial connectors remain explicit failed-with-reason states.`,
    claims: [{
      text: `${entityKind} query "${entity}" is unsupported until a real ${entityKind} connector is added.`,
      type: 'fact',
      confidence: 1,
      evidenceLevel: 'database',
      supportingRefs: ['BioAgent.knowledge.unsupported'],
      opposingRefs: [],
    }],
    uiManifest: [
      { componentId: 'data-table', title: 'Unsupported knowledge source', artifactRef: 'knowledge-graph', priority: 1 },
      { componentId: 'execution-unit-table', title: 'Execution units', artifactRef: 'knowledge-graph', priority: 2 },
    ],
    executionUnits: [{
      ...executionUnit('knowledge', 'BioAgent.knowledge.unsupported', { entity, entityKind, prompt }, 'failed-with-reason', ['BioAgent connector registry'], ['knowledge-graph']),
      failureReason: `No real ${entityKind} connector is configured.`,
    }],
    artifacts: [{
      id: 'knowledge-graph',
      type: 'knowledge-graph',
      producerAgent: 'knowledge',
      schemaVersion: '1',
      metadata: {
        entity,
        entityKind,
        source: 'unsupported',
        accessedAt,
        unsupportedConnectors: ['ChEMBL', 'OpenTargets', 'ClinicalTrials'],
      },
      data: {
        nodes: [],
        edges: [],
        rows: [
          { key: 'entity', value: entity, source: 'prompt' },
          { key: 'entity_type', value: entityKind, source: 'BioAgent disambiguation' },
          { key: 'status', value: 'unsupported', source: 'BioAgent connector registry' },
          { key: 'required_connector', value: connectorForKind(entityKind), source: 'BioAgent connector registry' },
          { key: 'accessedAt', value: accessedAt, source: 'BioAgent project tool' },
        ],
      },
    }],
  };
}

function firstRefUrl(value: unknown) {
  const refs = Array.isArray(value) ? value.filter(isRecord) : [];
  return stringValue(refs[0]?.ref_url);
}

function knowledgeEntity(request: ToolRequest) {
  const kind = knowledgeEntityKind(request.prompt);
  const fromPrompt = kind === 'gene' || kind === 'protein'
    ? request.prompt.match(/\b[A-Z0-9]{2,12}\b/)?.[0]
    : request.prompt.match(/\b(sotorasib|adagrasib|osimertinib|imatinib|trastuzumab|[A-Za-z][A-Za-z0-9-]{3,})\b/)?.[0];
  const fromArtifact = request.artifacts?.map((artifact) => {
    const data = isRecord(artifact.dataPreview) ? artifact.dataPreview : isRecord(artifact.data) ? artifact.data : {};
    const metadata = isRecord(artifact.metadata) ? artifact.metadata : {};
    return stringValue(metadata.entity) || rowValue(data.rows, 'entity') || nodeValue(data.nodes);
  }).find(Boolean);
  return fromPrompt || String(fromArtifact || 'TP53');
}

function knowledgeEntityKind(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (/\b(compound|drug|inhibitor|sotorasib|adagrasib|chembl)\b/.test(normalized)) return 'compound';
  if (/\b(disease|cancer|tumou?r|carcinoma|opentargets)\b/.test(normalized)) return 'disease';
  if (/\b(trial|clinicaltrials|nct\d+)\b/.test(normalized)) return 'clinical-trial';
  if (/\b(protein|uniprot|accession)\b/.test(normalized)) return 'protein';
  return 'gene';
}

function connectorForKind(kind: string) {
  return {
    compound: 'ChEMBL',
    disease: 'OpenTargets',
    'clinical-trial': 'ClinicalTrials',
  }[kind] || 'UniProt';
}

async function runOmics(request: ToolRequest): Promise<ToolPayload> {
  const workspace = resolve(request.workspacePath || process.cwd());
  const params = omicsParams(request.prompt);
  if (!params.matrixRef || !params.metadataRef) throw new Error('matrixRef and metadataRef are required for BioAgent omics project tool');
  const runtime = await omicsRuntimeAvailability(workspace);
  const matrixPath = safeWorkspacePath(workspace, params.matrixRef);
  const metadataPath = safeWorkspacePath(workspace, params.metadataRef);
  const matrix = parseMatrix(await readFile(matrixPath, 'utf8'));
  const metadata = parseCsv(await readFile(metadataPath, 'utf8'));
  const runId = createHash('sha1').update(`${Date.now()}:${params.matrixRef}:${params.metadataRef}`).digest('hex').slice(0, 12);
  const outputDir = join(workspace, '.bioagent', 'omics');
  await mkdir(outputDir, { recursive: true });
  const runnerResult = await runOmicsDifferential({
    workspace,
    matrixPath,
    metadataPath,
    matrix,
    metadata,
    params,
    runtime,
    runId,
  });
  const run = runnerResult.run;
  const outputRel = `.bioagent/omics/omics-differential-${runId}.json`;
  const logRel = `.bioagent/omics/omics-differential-${runId}.log.json`;
  const artifactData = {
    points: run.points,
    heatmap: {
      label: `${params.caseGroup} vs ${params.controlGroup}`,
      matrix: run.heatmap,
      genes: run.points.slice(0, 12).map((point) => point.gene),
      samples: matrix.samples,
    },
    umap: run.umap,
  };
  await writeFile(join(workspace, outputRel), JSON.stringify(artifactData, null, 2));
  await writeFile(join(workspace, logRel), JSON.stringify({
    runner: runnerResult.runner,
    requestedRunner: params.runner,
    effectiveRunner: runnerResult.runner,
    runnerSelection: runtime.selectedRunner,
    runtime,
    params,
    inputFingerprints: {
      matrix: sha1(await readFile(matrixPath)),
      metadata: sha1(await readFile(metadataPath)),
    },
    softwareVersions: runnerResult.softwareVersions,
    warnings: runnerResult.warnings,
    note: runnerResult.runner === 'omics.local-csv-differential'
      ? 'Project-local bounded CSV differential runner. Install Scanpy/DESeq2 in the BioAgent workspace for publication-grade analysis.'
      : 'Production omics runner executed from the BioAgent workspace service.',
  }, null, 2));
  return {
    message: `BioAgent omics project tool identified ${run.significantCount} genes passing alpha=${params.alpha}.`,
    confidence: 0.78,
    claimType: 'inference',
    evidenceLevel: 'experimental',
    reasoningTrace: `Read matrix=${params.matrixRef} and metadata=${params.metadataRef} inside BioAgent workspace; executed ${runnerResult.runner}; wrote ${outputRel} and ${logRel}.`,
    claims: [{
      text: `${run.significantCount} genes pass alpha=${params.alpha} in the bounded CSV differential run.`,
      type: 'inference',
      confidence: 0.78,
      evidenceLevel: 'experimental',
      supportingRefs: ['omics-differential-expression'],
      opposingRefs: [],
    }],
    uiManifest: [
      { componentId: 'volcano-plot', title: 'Volcano', artifactRef: 'omics-differential-expression', priority: 1 },
      { componentId: 'heatmap-viewer', title: 'Heatmap', artifactRef: 'omics-differential-expression', priority: 2 },
      { componentId: 'umap-viewer', title: 'UMAP', artifactRef: 'omics-differential-expression', priority: 3 },
      { componentId: 'execution-unit-table', title: 'Execution units', artifactRef: 'omics-differential-expression', priority: 4 },
    ],
    executionUnits: [executionUnit('omics', runnerResult.runner, params, 'done', runnerResult.softwareVersions, ['omics-differential-expression'])],
    artifacts: [{
      id: 'omics-differential-expression',
      type: 'omics-differential-expression',
      producerAgent: 'omics',
      schemaVersion: '1',
      dataRef: outputRel,
      metadata: {
        runner: runnerResult.runner,
        requestedRunner: params.runner,
        effectiveRunner: runnerResult.runner,
        selectedRunner: runtime.selectedRunner,
        runtimePolicy: runtime.policy,
        runtimeAvailability: runtime.checks,
        warnings: runnerResult.warnings,
        softwareVersions: runnerResult.softwareVersions,
        normalizationMethod: runnerResult.normalizationMethod,
        statisticalModel: runnerResult.statisticalModel,
        designMatrix: params.designFormula,
        outputRef: outputRel,
        logRef: logRel,
      },
      data: artifactData,
    }],
  };
}

interface OmicsRuntimeAvailability {
  policy: {
    pythonEnv: string;
    pythonCommand: string;
    rEnv: string;
    rscriptCommand: string;
    rLibrary: string;
    installScope: string;
    fallbackRunner: string;
  };
  checks: Record<string, Record<string, unknown>>;
  selectedRunner: string;
  warnings: string[];
}

interface OmicsRunnerInput {
  workspace: string;
  matrixPath: string;
  metadataPath: string;
  matrix: ReturnType<typeof parseMatrix>;
  metadata: Array<Record<string, string>>;
  params: ReturnType<typeof omicsParams>;
  runtime: OmicsRuntimeAvailability;
  runId: string;
}

interface OmicsRunnerResult {
  runner: string;
  run: ReturnType<typeof differential>;
  normalizationMethod: string;
  statisticalModel: string;
  softwareVersions: string[];
  warnings: string[];
}

async function runOmicsDifferential(input: OmicsRunnerInput): Promise<OmicsRunnerResult> {
  const warnings = [...input.runtime.warnings];
  const requestedRunner = input.params.runner;
  const selectedRunner = requestedRunner && omicsRunnerAvailable(input.runtime, requestedRunner)
    ? requestedRunner
    : input.runtime.selectedRunner;
  if (requestedRunner && requestedRunner !== selectedRunner) {
    warnings.push(`Requested runner ${requestedRunner} is unavailable; selected ${selectedRunner}.`);
  }
  if (selectedRunner === 'scanpy.rank_genes_groups') {
    try {
      return {
        runner: 'scanpy.rank_genes_groups',
        run: await runScanpyDifferential(input),
        normalizationMethod: 'Scanpy normalize_total + log1p',
        statisticalModel: 'Scanpy rank_genes_groups t-test',
        softwareVersions: runnerVersions(input.runtime, ['python', 'scanpy']),
        warnings,
      };
    } catch (error) {
      warnings.push(`Scanpy runner failed; falling back to omics.local-csv-differential: ${errorMessage(error)}`);
    }
  }
  if (selectedRunner === 'DESeq2') {
    try {
      return {
        runner: 'DESeq2',
        run: await runRPackageDifferential(input, 'DESeq2'),
        normalizationMethod: 'DESeq2 size-factor normalization',
        statisticalModel: `DESeq2 Wald test with design ${input.params.designFormula}`,
        softwareVersions: runnerVersions(input.runtime, ['rscript', 'deseq2']),
        warnings,
      };
    } catch (error) {
      warnings.push(`DESeq2 runner failed; falling back to omics.local-csv-differential: ${errorMessage(error)}`);
    }
  }
  if (selectedRunner === 'edgeR') {
    try {
      return {
        runner: 'edgeR',
        run: await runRPackageDifferential(input, 'edgeR'),
        normalizationMethod: 'edgeR calcNormFactors TMM normalization',
        statisticalModel: 'edgeR quasi-likelihood GLM two-group contrast',
        softwareVersions: runnerVersions(input.runtime, ['rscript', 'edger']),
        warnings,
      };
    } catch (error) {
      warnings.push(`edgeR runner failed; falling back to omics.local-csv-differential: ${errorMessage(error)}`);
    }
  }
  return {
    runner: 'omics.local-csv-differential',
    run: differential(input.matrix, input.metadata, input.params),
    normalizationMethod: 'log2(count + 1) group mean difference',
    statisticalModel: 'Welch t-test approximation with Benjamini-Hochberg FDR',
    softwareVersions: ['BioAgent project CSV runner'],
    warnings,
  };
}

function omicsRunnerAvailable(runtime: OmicsRuntimeAvailability, runner: string) {
  if (runner === 'scanpy.rank_genes_groups') return runtime.checks.scanpy?.available === true;
  if (runner === 'DESeq2') return runtime.checks.deseq2?.available === true;
  if (runner === 'edgeR') return runtime.checks.edger?.available === true;
  if (runner === 'omics.local-csv-differential') return true;
  return false;
}

function omicsParams(prompt: string) {
  const get = (key: string) => prompt.match(new RegExp(`${key}=([^\\s]+)`))?.[1];
  return {
    matrixRef: get('matrixRef') || '',
    metadataRef: get('metadataRef') || '',
    groupColumn: get('groupColumn') || 'condition',
    caseGroup: get('caseGroup') || 'treated',
    controlGroup: get('controlGroup') || 'control',
    designFormula: get('designFormula') || '~condition',
    alpha: Number(get('alpha') || 0.05),
    runner: normalizeOmicsRunner(get('runner')),
  };
}

function normalizeOmicsRunner(value: string | undefined) {
  const normalized = value?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'scanpy' || normalized === 'scanpy.rank_genes_groups') return 'scanpy.rank_genes_groups';
  if (normalized === 'deseq2') return 'DESeq2';
  if (normalized === 'edger' || normalized === 'edgeR'.toLowerCase()) return 'edgeR';
  if (normalized === 'local' || normalized === 'omics.local-csv-differential') return 'omics.local-csv-differential';
  return value;
}

async function omicsRuntimeAvailability(workspace: string) {
  const venvPython = join(workspace, '.venv-bioagent-omics', 'bin', 'python');
  const pythonCommand = await fileExists(venvPython) ? venvPython : 'python3';
  const localRscript = join(workspace, '.bioagent', 'r-env', 'bin', 'Rscript');
  const rscriptCommand = await fileExists(localRscript) ? localRscript : 'Rscript';
  const policy = {
    pythonEnv: join(workspace, '.venv-bioagent-omics'),
    pythonCommand,
    rEnv: join(workspace, '.bioagent', 'r-env'),
    rscriptCommand,
    rLibrary: join(workspace, '.bioagent', 'r-lib'),
    installScope: 'BioAgent workspace only',
    fallbackRunner: 'omics.local-csv-differential',
  };
  const [python, scanpy, rscript, deseq2, edger] = await Promise.all([
    commandVersion(pythonCommand, ['--version']),
    pythonModuleVersion('scanpy', pythonCommand),
    commandVersion(rscriptCommand, ['--version']),
    rPackageVersion('DESeq2', rscriptCommand, policy.rLibrary),
    rPackageVersion('edgeR', rscriptCommand, policy.rLibrary),
  ]);
  const checks = { python, scanpy, rscript, deseq2, edger };
  const selectedRunner = scanpy.available ? 'scanpy.rank_genes_groups' : deseq2.available ? 'DESeq2' : edger.available ? 'edgeR' : 'omics.local-csv-differential';
  const warnings = selectedRunner === 'omics.local-csv-differential'
    ? ['Scanpy/DESeq2/edgeR unavailable in BioAgent workspace; using bounded CSV fallback runner.']
    : [`${selectedRunner} detected in BioAgent workspace; production runner will be attempted before fallback.`];
  return { policy, checks, selectedRunner, warnings };
}

async function commandVersion(command: string, args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 5000 });
    return { available: true, command, version: `${stdout || stderr}`.trim().split(/\r?\n/)[0] || 'available' };
  } catch (error) {
    return { available: false, command, error: error instanceof Error ? error.message : String(error) };
  }
}

async function pythonModuleVersion(moduleName: string, pythonCommand = 'python3') {
  try {
    const code = `import ${moduleName} as m; print(getattr(m, "__version__", "available"))`;
    const { stdout } = await execFileAsync(pythonCommand, ['-c', code], { timeout: 5000 });
    return { available: true, module: moduleName, version: stdout.trim() || 'available' };
  } catch (error) {
    return { available: false, module: moduleName, error: error instanceof Error ? error.message : String(error) };
  }
}

async function rPackageVersion(packageName: string, rscriptCommand = 'Rscript', rLibrary?: string) {
  try {
    const code = `cat(as.character(packageVersion("${packageName}")))`;
    const { stdout } = await execFileAsync(rscriptCommand, ['-e', code], {
      timeout: 5000,
      env: rLibrary ? { ...process.env, R_LIBS_USER: rLibrary } : process.env,
    });
    return { available: true, package: packageName, version: stdout.trim() || 'available' };
  } catch (error) {
    return { available: false, package: packageName, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runScanpyDifferential(input: OmicsRunnerInput) {
  const outputPath = join(input.workspace, '.bioagent', 'omics', `scanpy-rank-genes-${input.runId}.json`);
  const code = `
import json
import math
import sys

import numpy as np
import pandas as pd
import scanpy as sc

matrix_path, metadata_path, output_path, group_column, case_group, control_group, alpha = sys.argv[1:8]
raw = pd.read_csv(matrix_path)
gene_column = raw.columns[0]
genes = raw[gene_column].astype(str).tolist()
counts = raw.drop(columns=[gene_column]).apply(pd.to_numeric, errors="coerce").fillna(0)
metadata = pd.read_csv(metadata_path)
sample_column = "sample" if "sample" in metadata.columns else ("sampleId" if "sampleId" in metadata.columns else metadata.columns[0])
metadata = metadata.set_index(sample_column)
metadata = metadata.reindex(counts.columns)
if group_column not in metadata.columns:
    raise ValueError(f"metadata is missing group column {group_column}")
adata = sc.AnnData(X=counts.T.to_numpy(dtype=float))
adata.obs_names = list(counts.columns)
adata.var_names = genes
adata.obs[group_column] = metadata[group_column].astype(str).fillna("unknown").to_numpy()
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.tl.rank_genes_groups(adata, groupby=group_column, groups=[case_group], reference=control_group, method="t-test")
ranked = adata.uns["rank_genes_groups"]
names = ranked["names"][case_group]
logfc = ranked["logfoldchanges"][case_group]
pvals = ranked["pvals"][case_group]
padj = ranked["pvals_adj"][case_group]
points = []
for i, gene in enumerate(names):
    pvalue = float(pvals[i]) if math.isfinite(float(pvals[i])) else 1.0
    fdr = float(padj[i]) if math.isfinite(float(padj[i])) else 1.0
    points.append({
        "gene": str(gene),
        "logFC": float(logfc[i]) if math.isfinite(float(logfc[i])) else 0.0,
        "pValue": pvalue,
        "fdr": fdr,
        "significant": fdr <= float(alpha),
    })
try:
    if adata.n_obs >= 3 and adata.n_vars >= 2:
        sc.pp.pca(adata, n_comps=min(2, adata.n_obs - 1, adata.n_vars - 1))
        sc.pp.neighbors(adata, n_neighbors=max(2, min(10, adata.n_obs - 1)))
        sc.tl.umap(adata)
        coords = adata.obsm["X_umap"]
    else:
        raise ValueError("not enough samples for UMAP")
except Exception:
    coords = np.column_stack([np.arange(adata.n_obs), np.asarray(adata.X).mean(axis=1)])
umap = [
    {"sample": str(adata.obs_names[i]), "x": float(coords[i, 0]), "y": float(coords[i, 1]), "cluster": str(adata.obs[group_column].iloc[i])}
    for i in range(adata.n_obs)
]
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump({"points": points, "umap": umap}, handle)
`;
  await execFileAsync(input.runtime.policy.pythonCommand, ['-c', code, input.matrixPath, input.metadataPath, outputPath, input.params.groupColumn, input.params.caseGroup, input.params.controlGroup, String(input.params.alpha)], {
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10,
  });
  const raw = JSON.parse(await readFile(outputPath, 'utf8')) as { points?: Array<Record<string, unknown>>; umap?: Array<Record<string, unknown>> };
  return completeDifferentialRun(differentialPoints(raw.points), input.matrix, input.metadata, input.params, umapPoints(raw.umap));
}

async function runRPackageDifferential(input: OmicsRunnerInput, packageName: 'DESeq2' | 'edgeR') {
  const outputPath = join(input.workspace, '.bioagent', 'omics', `${packageName.toLowerCase()}-differential-${input.runId}.csv`);
  const code = packageName === 'DESeq2' ? deseq2RunnerCode() : edgeRRunnerCode();
  await execFileAsync(input.runtime.policy.rscriptCommand, ['-e', code, input.matrixPath, input.metadataPath, outputPath, input.params.groupColumn, input.params.caseGroup, input.params.controlGroup, input.params.designFormula], {
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10,
    env: { ...process.env, R_LIBS_USER: input.runtime.policy.rLibrary },
  });
  const rows = parseCsv(await readFile(outputPath, 'utf8'));
  return completeDifferentialRun(differentialPoints(rows), input.matrix, input.metadata, input.params);
}

function deseq2RunnerCode() {
  return `
args <- commandArgs(TRUE)
matrix_path <- args[[1]]
metadata_path <- args[[2]]
output_path <- args[[3]]
group_column <- args[[4]]
case_group <- args[[5]]
control_group <- args[[6]]
design_formula <- args[[7]]
suppressPackageStartupMessages(library(DESeq2))
counts_raw <- read.csv(matrix_path, check.names=FALSE)
genes <- as.character(counts_raw[[1]])
counts <- as.matrix(counts_raw[, -1, drop=FALSE])
rownames(counts) <- genes
storage.mode(counts) <- "numeric"
metadata <- read.csv(metadata_path, check.names=FALSE)
sample_column <- if ("sample" %in% names(metadata)) "sample" else if ("sampleId" %in% names(metadata)) "sampleId" else names(metadata)[[1]]
rownames(metadata) <- metadata[[sample_column]]
metadata <- metadata[colnames(counts), , drop=FALSE]
metadata[[group_column]] <- relevel(factor(metadata[[group_column]]), ref=control_group)
dds <- DESeqDataSetFromMatrix(countData=round(counts), colData=metadata, design=as.formula(design_formula))
dds <- estimateSizeFactors(dds)
dds <- tryCatch(
  estimateDispersions(dds, quiet=TRUE),
  error=function(e) {
    dds2 <- estimateDispersionsGeneEst(dds)
    dispersions(dds2) <- mcols(dds2)$dispGeneEst
    dds2
  }
)
dds <- nbinomWaldTest(dds, quiet=TRUE)
res <- results(dds, contrast=c(group_column, case_group, control_group))
out <- data.frame(gene=rownames(res), logFC=res$log2FoldChange, pValue=res$pvalue, fdr=res$padj)
write.csv(out, output_path, row.names=FALSE)
`;
}

function edgeRRunnerCode() {
  return `
args <- commandArgs(TRUE)
matrix_path <- args[[1]]
metadata_path <- args[[2]]
output_path <- args[[3]]
group_column <- args[[4]]
case_group <- args[[5]]
control_group <- args[[6]]
suppressPackageStartupMessages(library(edgeR))
counts_raw <- read.csv(matrix_path, check.names=FALSE)
genes <- as.character(counts_raw[[1]])
counts <- as.matrix(counts_raw[, -1, drop=FALSE])
rownames(counts) <- genes
storage.mode(counts) <- "numeric"
metadata <- read.csv(metadata_path, check.names=FALSE)
sample_column <- if ("sample" %in% names(metadata)) "sample" else if ("sampleId" %in% names(metadata)) "sampleId" else names(metadata)[[1]]
rownames(metadata) <- metadata[[sample_column]]
metadata <- metadata[colnames(counts), , drop=FALSE]
group <- relevel(factor(metadata[[group_column]]), ref=control_group)
y <- DGEList(counts=round(counts), group=group)
y <- calcNormFactors(y)
design <- model.matrix(~group)
y <- estimateDisp(y, design)
fit <- glmQLFit(y, design)
qlf <- glmQLFTest(fit, coef=2)
table <- topTags(qlf, n=Inf, sort.by="PValue")$table
out <- data.frame(gene=rownames(table), logFC=table$logFC, pValue=table$PValue, fdr=table$FDR)
write.csv(out, output_path, row.names=FALSE)
`;
}

function parseCsv(text: string) {
  const [headerLine = '', ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(',').map(csvCell);
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(',').map(csvCell);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

function csvCell(item: string) {
  const trimmed = item.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1).replace(/""/g, '"') : trimmed;
}

function parseMatrix(text: string) {
  const rows = parseCsv(text);
  const headers = Object.keys(rows[0] ?? {});
  const geneKey = headers[0] || 'gene';
  const samples = headers.slice(1);
  return {
    samples,
    rows: rows.map((row) => ({
      gene: String(row[geneKey]),
      values: samples.map((sample) => Number(row[sample] || 0)),
    })).filter((row) => row.gene),
  };
}

function differential(matrix: ReturnType<typeof parseMatrix>, metadata: Array<Record<string, string>>, params: ReturnType<typeof omicsParams>) {
  const sampleGroups = new Map(metadata.map((row) => [row.sample || row.sampleId || row.id, row[params.groupColumn]]));
  const caseIndexes = matrix.samples.map((sample, index) => sampleGroups.get(sample) === params.caseGroup ? index : -1).filter((index) => index >= 0);
  const controlIndexes = matrix.samples.map((sample, index) => sampleGroups.get(sample) === params.controlGroup ? index : -1).filter((index) => index >= 0);
  if (!caseIndexes.length || !controlIndexes.length) throw new Error(`No samples found for caseGroup=${params.caseGroup} and controlGroup=${params.controlGroup}`);
  const points = matrix.rows.map((row) => {
    const cases = caseIndexes.map((index) => row.values[index]);
    const controls = controlIndexes.map((index) => row.values[index]);
    const logFC = mean(cases.map(log2p1)) - mean(controls.map(log2p1));
    const pValue = welchApproxP(cases, controls);
    return { gene: row.gene, logFC, pValue, fdr: pValue, significant: false };
  }).sort((a, b) => a.pValue - b.pValue);
  return completeDifferentialRun(points, matrix, metadata, params);
}

function completeDifferentialRun(
  pointsInput: Array<Record<string, unknown>>,
  matrix: ReturnType<typeof parseMatrix>,
  metadata: Array<Record<string, string>>,
  params: ReturnType<typeof omicsParams>,
  umapInput: Array<Record<string, unknown>> = [],
) {
  const points = pointsInput.map((point) => ({
    gene: stringValue(point.gene) || stringValue(point.name) || '',
    logFC: finiteNumber(point.logFC) ?? finiteNumber(point.log2FoldChange) ?? 0,
    pValue: finiteNumber(point.pValue) ?? finiteNumber(point.pvalue) ?? finiteNumber(point.PValue) ?? 1,
    fdr: finiteNumber(point.fdr) ?? finiteNumber(point.padj) ?? finiteNumber(point.FDR) ?? Number.NaN,
    significant: false,
  })).filter((point) => point.gene).sort((a, b) => a.pValue - b.pValue);
  const m = points.length;
  for (let index = 0; index < points.length; index += 1) {
    if (!Number.isFinite(points[index].fdr)) points[index].fdr = Math.min(1, points[index].pValue * m / (index + 1));
    points[index].significant = points[index].fdr <= params.alpha;
  }
  const sampleGroups = new Map(metadata.map((row) => [row.sample || row.sampleId || row.id, row[params.groupColumn]]));
  const topGenes = points.slice(0, 12).map((point) => point.gene);
  const heatmap = topGenes.map((gene) => matrix.rows.find((row) => row.gene === gene)?.values ?? []);
  const fallbackUmap = matrix.samples.map((sample, index) => ({
    x: index - (matrix.samples.length - 1) / 2,
    y: matrix.rows.reduce((sum, row) => sum + row.values[index], 0) / Math.max(1, matrix.rows.length),
    cluster: sampleGroups.get(sample) || 'unknown',
    sample,
  }));
  const umap = umapInput.length ? umapInput.map((point, index) => ({
    x: finiteNumber(point.x) ?? finiteNumber(point.umap1) ?? index,
    y: finiteNumber(point.y) ?? finiteNumber(point.umap2) ?? 0,
    cluster: stringValue(point.cluster) || stringValue(point.group) || 'unknown',
    sample: stringValue(point.sample) || stringValue(point.label) || matrix.samples[index] || `sample-${index + 1}`,
  })) : fallbackUmap;
  return {
    points,
    significantCount: points.filter((point) => point.significant).length,
    heatmap,
    umap,
  };
}

function differentialPoints(rows: unknown) {
  return Array.isArray(rows) ? rows.filter(isRecord) : [];
}

function umapPoints(rows: unknown) {
  return Array.isArray(rows) ? rows.filter(isRecord) : [];
}

function runnerVersions(runtime: OmicsRuntimeAvailability, keys: string[]) {
  return keys.flatMap((key) => {
    const check = runtime.checks[key];
    if (!isRecord(check) || check.available !== true) return [];
    const label = stringValue(check.command) || stringValue(check.module) || stringValue(check.package) || key;
    return [`${label} ${stringValue(check.version) || 'available'}`];
  });
}

function executionUnit(agentId: Profile, tool: string, params: unknown, status: string, databaseVersions: string[], artifacts: string[]) {
  const hash = sha1(JSON.stringify({ tool, params })).slice(0, 10);
  return {
    id: `EU-${agentId}-${hash}`,
    tool,
    params: JSON.stringify(params),
    status,
    hash,
    time: new Date().toISOString(),
    environment: 'BioAgent project workspace service',
    databaseVersions,
    artifacts,
    outputArtifacts: artifacts,
  };
}

function safeWorkspacePath(workspace: string, ref: string) {
  const target = resolve(workspace, ref);
  if (!target.startsWith(workspace)) throw new Error(`Path escapes workspace: ${ref}`);
  return target;
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchJson(input: string | URL, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${String(input)}`);
  return response.json();
}

function rowValue(value: unknown, key: string) {
  const rows = Array.isArray(value) ? value.filter(isRecord) : [];
  const found = rows.find((row) => stringValue(row.key)?.toLowerCase() === key.toLowerCase());
  return stringValue(found?.value);
}

function nodeValue(value: unknown) {
  const nodes = Array.isArray(value) ? value.filter(isRecord) : [];
  const found = nodes.find((node) => ['gene', 'protein'].includes(String(node.type || '').toLowerCase())) ?? nodes[0];
  return stringValue(found?.id) || stringValue(found?.label);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function variance(values: number[]) {
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(1, values.length - 1);
}

function welchApproxP(left: number[], right: number[]) {
  const denominator = Math.sqrt(variance(left) / Math.max(1, left.length) + variance(right) / Math.max(1, right.length)) || 1;
  const t = Math.abs((mean(left) - mean(right)) / denominator);
  return Math.max(1e-6, Math.min(1, Math.exp(-t)));
}

function log2p1(value: number) {
  return Math.log2(Math.max(0, value) + 1);
}

function sha1(value: string | Buffer) {
  return createHash('sha1').update(value).digest('hex');
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function finiteNumber(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
