export function freshCodeDebugExecutionPromptPolicy(prompt: string) {
  const text = prompt.toLowerCase();
  const codeSignals = [
    /\bdebug\b/,
    /\bbug\b/,
    /\bpatch\b/,
    /\bmodify\b/,
    /\bedit\b/,
    /\brepair\b/,
    /\brerun\b/,
    /\bpytest\b/,
    /\bunit tests?\b/,
    /\bfailing tests?\b/,
    /\btest_[\w.-]+\.py\b/,
    /\b[\w.-]+\.py\b/,
    /读代码|调试|修复|修改代码|单测|运行测试|复跑/,
  ];
  const asksForScenarioArtifacts = /\b(evidence matrix|paper-list|paper list|notebook timeline|research report artifact)\b|证据矩阵|论文列表|全文|arxiv|pdf/.test(text);
  return codeSignals.some((pattern) => pattern.test(text)) && !asksForScenarioArtifacts;
}

export function workspaceCodeTaskPromptPolicy(prompt: string) {
  const text = prompt.toLowerCase();
  const hasCodeIntent = /\b(code|coding|repository|repo|module|source file|typescript|javascript|python|test helper|unit test|typecheck|patch|refactor|bug|runtime|gateway|manifest|validation|preflight|self-improvement)\b/.test(text)
    || /(?:代码|仓库|模块|源码|测试|补丁|修复|重构|类型检查|运行时|网关|清单|校验)/.test(prompt);
  const hasResearchRetrievalIntent = /\b(literature|papers?|pmid|doi|citation|bibliography|clinical trial|pubmed|openalex|evidence matrix|systematic review)\b/.test(text)
    || /(?:文献|论文|引用|证据矩阵|综述|临床试验)/.test(prompt);
  return hasCodeIntent && !hasResearchRetrievalIntent;
}
