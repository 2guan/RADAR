/**
 * 文件：modules/release-apply/application/numbering.js
 * 说明：投产申请编号继续使用 code.release_apply 模板和 {版本年月}-10bg{序号} 默认格式。
 * 用途：投产申请模块的编号领域服务，按版本年月维护独立且可原子递增的变更编号序列。
 * 作者：hengguan
 */

import { all, getCodeSequenceNext, reserveCodeSequence } from '../../../platform/persistence/index.js';
import { getCodeRuleTemplate } from '../../reference-data/index.js';
import { codePrefix, formatCode, nextSequenceFromCodes } from '../../../shared/utils/code-template.js';

/** 首次使用某版本年月时，从既有投产申请编号继续序号。 */
async function initialSequence(ruleKey, prefix) {
  if (await getCodeSequenceNext(ruleKey, prefix) !== null) return 1;
  const rows = await all('SELECT change_code AS code FROM release_apply WHERE change_code LIKE ?', `${prefix}%`);
  return nextSequenceFromCodes(rows.map((row) => row.code), prefix);
}

/** 生成投产申请变更编号。 */
export async function generateReleaseApplyCode(yearMonth) {
  const 版本年月 = String(yearMonth || '').trim();
  const template = await getCodeRuleTemplate('code.release_apply', '{版本年月}-10bg{序号}');
  const prefix = codePrefix(template, { 版本年月 });
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.release_apply',
    prefix,
    initialValue: await initialSequence('code.release_apply', prefix),
  });
  return formatCode(template, { 版本年月 }, sequence);
}
