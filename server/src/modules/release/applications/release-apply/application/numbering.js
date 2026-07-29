/**
 * 文件：server/src/modules/release/applications/release-apply/application/numbering.js
 * 说明：投产申请编号继续使用 code.release_apply 模板和 {版本年月}-10bg{序号[3]} 默认格式；预览不会占用序列。
 * 用途：投产申请模块的编号领域服务，按版本年月提供预览、保存确认和并发领号能力。
 * 作者：hengguan
 */

import { all, getCodeSequenceNext, reserveCodeSequence } from '../../../../../platform/persistence/index.js';
import { getCodeRuleTemplate } from '../../../../settings/reference-data/index.js';
import { codePrefix, codeTemplateValues, formatCode, nextSequenceFromCodes } from '../../../../../shared/utils/code-template.js';

/** 普通原子领号首次使用某版本年月时，从既有投产申请编号继续序号。 */
async function initialReservationSequence(ruleKey, prefix) {
  if (await getCodeSequenceNext(ruleKey, prefix) !== null) return 1;
  const rows = await all('SELECT change_code AS code FROM release_apply WHERE change_code LIKE ?', `${prefix}%`);
  return nextSequenceFromCodes(rows.map((row) => row.code), prefix);
}

/** 只读取已保存投产申请，供预览与保存时回收旧预览动作留下的空号。 */
async function nextUsedSequence(prefix) {
  const rows = await all('SELECT change_code AS code FROM release_apply WHERE change_code LIKE ?', `${prefix}%`);
  return nextSequenceFromCodes(rows.map((row) => row.code), prefix);
}

async function releaseApplyRule(releaseWindow, workItemCode) {
  const values = codeTemplateValues({ releaseWindow, workItemCode });
  const rawWindow = String(releaseWindow || '').trim();
  values.版本年月 = /^\d{8}$/.test(rawWindow) ? rawWindow.slice(0, 6) : values.当前年月;
  const template = await getCodeRuleTemplate('code.release_apply', '{版本年月}-10bg{序号[3]}');
  const prefix = codePrefix(template, values);
  return { values, template, prefix };
}

/** 生成投产申请变更编号。 */
export async function generateReleaseApplyCode(releaseWindow, workItemCode = '') {
  const { values, template, prefix } = await releaseApplyRule(releaseWindow, workItemCode);
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.release_apply',
    prefix,
    initialValue: await initialReservationSequence('code.release_apply', prefix),
  });
  return formatCode(template, values, sequence);
}

/** 返回下一个可用变更编号，仅用于界面预览，不写入序列表。 */
export async function previewReleaseApplyCode(releaseWindow, workItemCode = '') {
  const { values, template, prefix } = await releaseApplyRule(releaseWindow, workItemCode);
  return formatCode(template, values, await nextUsedSequence(prefix));
}

/** 保存投产申请时确认自动编号；手填编号不改变现有编号规则。 */
export async function claimReleaseApplyCode(releaseWindow, requestedCode = '', workItemCode = '') {
  const { values, template, prefix } = await releaseApplyRule(releaseWindow, workItemCode);
  const nextSequence = await nextUsedSequence(prefix);
  const previewCode = formatCode(template, values, nextSequence);
  if (String(requestedCode || '').trim() && String(requestedCode).trim() !== previewCode) return String(requestedCode).trim();
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.release_apply', prefix, initialValue: nextSequence, reconcile: true,
  });
  return formatCode(template, values, sequence);
}
