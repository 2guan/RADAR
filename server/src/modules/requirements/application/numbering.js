/**
 * 文件：server/src/modules/requirements/application/numbering.js
 * 说明：需求编号使用与投产点无关的日期模板；预览不会占用序列。
 * 用途：需求模块的编号领域服务，负责预览、保存确认和并发领号三种编号场景。
 * 作者：hengguan
 */

import { all, getCodeSequenceNext, reserveCodeSequence } from '../../../platform/persistence/index.js';
import { getCodeRuleTemplate } from '../../settings/reference-data/index.js';
import { badRequest } from '../../../platform/runtime/index.js';
import {
  codePrefix, codeTemplateValues, formatCode, nextSequenceFromCodes,
} from '../../../shared/utils/code-template.js';

/** 为普通原子领号计算起始值；已有序列表时不再扫描历史业务表。 */
async function initialReservationSequence(ruleKey, prefix) {
  if (await getCodeSequenceNext(ruleKey, prefix) !== null) return 1;
  const rows = await all('SELECT req_code AS code FROM requirement WHERE req_code LIKE ?', `${prefix}%`);
  return nextSequenceFromCodes(rows.map((row) => row.code), prefix);
}

/** 只依据已保存记录计算下一个可用编号，用于不占号的界面预览和实际保存校正。 */
async function nextUsedSequence(prefix) {
  const rows = await all('SELECT req_code AS code FROM requirement WHERE req_code LIKE ?', `${prefix}%`);
  return nextSequenceFromCodes(rows.map((row) => row.code), prefix);
}

async function requirementRule() {
  const template = await getCodeRuleTemplate('code.requirement', 'RC_{当前年月日}_{序号[3]}');
  if (/\{投产点(?:（投产窗口）)?\}|\{投产窗口\}/.test(template)) throw badRequest('需求编号规则不再支持投产点占位符');
  const values = codeTemplateValues();
  const prefix = codePrefix(template, values);
  return { values, template, prefix };
}

/** 需求编号不再依赖投产点。 */
export async function requirementCodeRequiresReleasePoint() { return false; }

/** 生成需求编号。 */
export async function generateRequirementCode() {
  const { values, template, prefix } = await requirementRule();
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.requirement',
    prefix,
    initialValue: await initialReservationSequence('code.requirement', prefix),
  });
  return formatCode(template, values, sequence);
}

/** 返回下一个可用需求编号，仅用于展示，不写入 code_sequence。 */
export async function previewRequirementCode() {
  const { values, template, prefix } = await requirementRule();
  return formatCode(template, values, await nextUsedSequence(prefix));
}

/** 保存新需求时确认自动编号；手工编号保持原样，自动预览编号才会在此刻正式占号。 */
export async function claimRequirementCode(requestedCode = '') {
  const { values, template, prefix } = await requirementRule();
  const nextSequence = await nextUsedSequence(prefix);
  const previewCode = formatCode(template, values, nextSequence);
  if (String(requestedCode || '').trim() && String(requestedCode).trim() !== previewCode) return String(requestedCode).trim();
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.requirement', prefix, initialValue: nextSequence, reconcile: true,
  });
  return formatCode(template, values, sequence);
}
