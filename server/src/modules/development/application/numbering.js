/**
 * 文件：server/src/modules/development/application/numbering.js
 * 说明：开发与测试任务共用平台序列表，但通过规则键和前缀隔离，保留各自原有模板格式。
 * 用途：交付模块的任务编号领域服务，生成开发任务和各测试类型任务的唯一编号。
 * 作者：hengguan
 */

import { all, getCodeSequenceNext, reserveCodeSequence } from '../../../platform/persistence/index.js';
import { getCodeRuleTemplate } from '../../settings/reference-data/index.js';
import { codePrefix, formatCode, nextSequenceFromCodes } from '../../../shared/utils/code-template.js';

/** 在序列表首次建立时，从历史任务编号中恢复下一序号。 */
async function initialSequence(ruleKey, prefix, table) {
  if (await getCodeSequenceNext(ruleKey, prefix) !== null) return 1;
  const rows = await all(`SELECT task_code AS code FROM ${table} WHERE task_code LIKE ?`, `${prefix}%`);
  return nextSequenceFromCodes(rows.map((row) => row.code), prefix);
}

/** 生成开发任务编号。 */
export async function generateDevTaskCode(reqCode) {
  const 需求编号 = String(reqCode || '').trim();
  const template = await getCodeRuleTemplate('code.dev', 'RW_{需求编号}_{序号}');
  const prefix = codePrefix(template, { 需求编号 });
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.dev',
    prefix,
    initialValue: await initialSequence('code.dev', prefix, 'dev_task'),
  });
  return formatCode(template, { 需求编号 }, sequence);
}

/** 生成指定测试类型的任务编号。 */
export async function generateTestTaskCode(testType, reqCode) {
  const 类型 = String(testType || '').trim();
  const 需求编号 = String(reqCode || '').trim();
  const ruleKey = `code.test.${类型}`;
  const template = await getCodeRuleTemplate(ruleKey, `${类型}_{需求编号}_{序号}`);
  const prefix = codePrefix(template, { 类型, 需求编号 });
  const sequence = await reserveCodeSequence({
    ruleKey,
    prefix,
    initialValue: await initialSequence(ruleKey, prefix, 'test_task'),
  });
  return formatCode(template, { 类型, 需求编号 }, sequence);
}
