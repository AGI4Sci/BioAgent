import type { AgentId } from '../data';
import { BIOAGENT_PROFILES } from '../agentProfiles';

const domainSignals: Record<AgentId, RegExp[]> = {
  literature: [/\b(pubmed|paper|literature|evidence|review|clinical trial|trial|文献|证据|综述|临床试验)\b/i],
  structure: [/\b(pdb|structure|alphafold|residue|ligand|pocket|binding|结构|残基|口袋|配体)\b/i],
  omics: [/\b(omics|rna|expression|differential|deseq2|scanpy|umap|crispr|screen|组学|表达|差异|筛选)\b/i],
  knowledge: [/\b(uniprot|chembl|opentargets|gene|protein|compound|drug|pathway|知识|药物|基因|蛋白|通路)\b/i],
};

export interface ScopeCheckResult {
  inScope: boolean;
  matchedAgents: AgentId[];
  unsupportedMatches: string[];
  handoffTargets: AgentId[];
  plan: string[];
  promptPrefix: string;
}

export function scopeCheck(agentId: AgentId, prompt: string): ScopeCheckResult {
  const profile = BIOAGENT_PROFILES[agentId];
  const normalized = prompt.toLowerCase();
  const matchedAgents = (Object.keys(domainSignals) as AgentId[])
    .filter((candidate) => domainSignals[candidate].some((pattern) => pattern.test(prompt)));
  const unsupportedMatches = profile.scopeDeclaration.unsupportedTasks
    .filter((task) => tokenOverlap(normalized, task.toLowerCase()) >= 2);
  const crossAgentTargets = matchedAgents.filter((candidate) => candidate !== agentId);
  const handoffTargets = uniqueAgents([
    ...crossAgentTargets,
    ...profile.scopeDeclaration.handoffTargets.filter((target) => crossAgentTargets.includes(target)),
  ]);
  const inScope = unsupportedMatches.length === 0 && crossAgentTargets.length <= 1;
  const plan = buildPlan(agentId, matchedAgents, handoffTargets, unsupportedMatches);
  return {
    inScope,
    matchedAgents,
    unsupportedMatches,
    handoffTargets,
    plan,
    promptPrefix: plan.length ? [
      'Scope check:',
      ...plan.map((item, index) => `${index + 1}. ${item}`),
      'Do not collapse this into an unverified giant script; return explicit boundaries and artifact handoff steps when needed.',
    ].join('\n') : '',
  };
}

export function promptWithScopeCheck(agentId: AgentId, prompt: string) {
  const result = scopeCheck(agentId, prompt);
  return result.promptPrefix ? `${result.promptPrefix}\n\nUser prompt:\n${prompt}` : prompt;
}

function buildPlan(agentId: AgentId, matchedAgents: AgentId[], handoffTargets: AgentId[], unsupportedMatches: string[]) {
  const plan: string[] = [];
  if (unsupportedMatches.length) {
    plan.push(`Current ${agentId} scope marks these as unsupported or requiring external confirmation: ${unsupportedMatches.join('; ')}.`);
  }
  const crossAgents = matchedAgents.filter((candidate) => candidate !== agentId);
  if (crossAgents.length > 1) {
    plan.push(`Request spans multiple domains (${matchedAgents.join(', ')}); produce a staged plan rather than a single monolithic analysis.`);
  } else if (crossAgents.length === 1) {
    plan.push(`Request includes ${crossAgents[0]} signals; identify the artifact needed for handoff before continuing.`);
  }
  if (handoffTargets.length) {
    plan.push(`Recommended handoff targets: ${handoffTargets.join(', ')}.`);
  }
  return plan;
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(left.split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
  return right.split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && leftTokens.has(token)).length;
}

function uniqueAgents(values: AgentId[]) {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

