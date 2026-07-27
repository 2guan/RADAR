/**
 * 文件：modules/requirements/application/numbering.js
 * 说明：需求编号继续使用 code.requirement 模板和 RC_{投产窗口}_{序号} 默认格式；预览不会占用序列。
 * 用途：需求模块的编号领域服务，负责预览、保存确认和并发领号三种编号场景。
 * 作者：hengguan
 */

import { all, getCodeSequenceNext, reserveCodeSequence } from '../../../platform/persistence/index.js';
import { getCodeRuleTemplate } from '../../settings/reference-data/index.js';
import {
  codePrefix, formatCode, nextSequenceFromCodes, normalizeReleaseWindow,
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

async function requirementRule(releaseWindow) {
  const 投产窗口 = normalizeReleaseWindow(releaseWindow);
  const template = await getCodeRuleTemplate('code.requirement', 'RC_{投产窗口}_{序号}');
  const prefix = codePrefix(template, { 投产窗口 });
  return { 投产窗口, template, prefix };
}

/** 生成需求编号。 */
export async function generateRequirementCode(releaseWindow) {
  const { 投产窗口, template, prefix } = await requirementRule(releaseWindow);
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.requirement',
    prefix,
    initialValue: await initialReservationSequence('code.requirement', prefix),
  });
  return formatCode(template, { 投产窗口 }, sequence);
}

/** 返回下一个可用需求编号，仅用于展示，不写入 code_sequence。 */
export async function previewRequirementCode(releaseWindow) {
  const { 投产窗口, template, prefix } = await requirementRule(releaseWindow);
  return formatCode(template, { 投产窗口 }, await nextUsedSequence(prefix));
}

/** 保存新需求时确认自动编号；手工编号保持原样，自动预览编号才会在此刻正式占号。 */
export async function claimRequirementCode(releaseWindow, requestedCode = '') {
  const { 投产窗口, template, prefix } = await requirementRule(releaseWindow);
  const nextSequence = await nextUsedSequence(prefix);
  const previewCode = formatCode(template, { 投产窗口 }, nextSequence);
  if (String(requestedCode || '').trim() && String(requestedCode).trim() !== previewCode) return String(requestedCode).trim();
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.requirement', prefix, initialValue: nextSequence, reconcile: true,
  });
  return formatCode(template, { 投产窗口 }, sequence);
}
