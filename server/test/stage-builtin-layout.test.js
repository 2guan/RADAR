/**
 * 文件：server/test/stage-builtin-layout.test.js
 * 说明：守护由输入项配置驱动的详情字段网格，防止重复或状态字段声明形成空白槽位。
 * 用途：静态核对所有 StageBuiltinFields 容器的字段声明；运行时仍由前端公共组件做去重保护。
 * 作者：Codex
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const EDITORS = [
  { name: '需求分析', file: new URL('../../web/src/modules/requirements/components/RequirementEditor.jsx', import.meta.url) },
  { name: '工单分析', file: new URL('../../web/src/modules/tickets/components/TicketEditor.jsx', import.meta.url) },
  { name: '开发与测试任务', file: new URL('../../web/src/shared/workflow/TaskEditor.jsx', import.meta.url) },
];

function fieldsInStageBuiltinBlocks(source) {
  const blocks = [];
  let start = source.indexOf('<StageBuiltinFields');
  while (start >= 0) {
    const end = source.indexOf('</StageBuiltinFields>', start);
    assert.notEqual(end, -1, 'StageBuiltinFields 必须有闭合标签');
    const block = source.slice(start, end);
    const keys = [...block.matchAll(/<StageBuiltin(?:Catalog)?Field\b[^>]*\bfieldKey="([^"]+)"/g)].map((match) => match[1]);
    blocks.push(keys);
    start = source.indexOf('<StageBuiltinFields', end + 1);
  }
  return blocks;
}

test('详情字段网格不包含重复或状态字段槽位', async () => {
  for (const editor of EDITORS) {
    const source = await readFile(editor.file, 'utf8');
    const blocks = fieldsInStageBuiltinBlocks(source);
    assert.ok(blocks.length, `${editor.name}应声明 StageBuiltinFields`);
    for (const keys of blocks) {
      assert.equal(new Set(keys).size, keys.length, `${editor.name}存在重复 fieldKey：${keys.join(', ')}`);
      assert.ok(!keys.includes('status'), `${editor.name}的状态字段必须由详情顶部承载`);
    }
  }
});
