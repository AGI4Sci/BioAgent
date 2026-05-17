import assert from 'node:assert/strict';

import { looksLikeComputerUseRequest } from '../../src/runtime/vision-sense/sense-provider.js';

assert.equal(
  looksLikeComputerUseRequest('第二轮：基于上一轮结论，请挑出最值得跟进的 5 篇论文。不要重新检索，继续使用上一轮上下文。'),
  false,
);
assert.equal(
  looksLikeComputerUseRequest('请继续使用上一轮上下文，把结果整理成两周研究计划。'),
  false,
);
assert.equal(
  looksLikeComputerUseRequest("The browser result shows ModuleNotFoundError for the generated code. Please repair it and use Python standard library plus numpy if available."),
  false,
);
assert.equal(
  looksLikeComputerUseRequest('Design a single-cell perturbation screen for drug resistance and review controls, sample size, power, and failure modes.'),
  false,
);
assert.equal(
  looksLikeComputerUseRequest('Review a CRISPR screen protocol and produce a preregistration-style experimental design.'),
  false,
);
assert.equal(
  looksLikeComputerUseRequest('请生成一个项目设计文档，每个文件控制在 400 words 内，并写入 workspace 目录。'),
  false,
);
assert.equal(
  looksLikeComputerUseRequest('点击浏览器里的搜索框并输入 KRAS G12D。'),
  true,
);
assert.equal(
  looksLikeComputerUseRequest('请控制浏览器打开网页并点击搜索框。'),
  true,
);
assert.equal(
  looksLikeComputerUseRequest('Open the desktop presentation app and create a GUI Agent slide through computer use.'),
  true,
);
assert.equal(
  looksLikeComputerUseRequest('Use the current screen to click the visible search field.'),
  true,
);

console.log('[ok] vision-sense only routes explicit GUI/computer-use intent');
