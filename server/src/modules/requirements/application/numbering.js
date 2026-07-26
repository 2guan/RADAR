/**
 * 文件：modules/requirements/application/numbering.js
 * 说明：需求编号继续使用 code.requirement 模板和 RC_{投产窗口}_{序号} 默认格式；首次领号会扫描历史记录。
 * 用途：需求模块的编号领域服务，负责将业务模板、历史数据和平台序列表组合为唯一编号。
 * 作者：hengguan
 */

import { all, getCodeSequenceNext, reserveCodeSequence } from '../../../platform/persistence/index.js';
import { getCodeRuleTemplate } from '../../reference-data/index.js';
import {
  codePrefix, formatCode, nextSequenceFromCodes, normalizeReleaseWindow,
} from '../../../shared/utils/code-template.js';

/** 为首次建立的序列计算历史数据之后的起始值，后续请求不再扫描业务表。 */
async function initialSequence(ruleKey, prefix) {
  if (await getCodeSequenceNext(ruleKey, prefix) !== null) return 1;
  const rows = await all('SELECT req_code AS code FROM requirement WHERE req_code LIKE ?', `${prefix}%`);
  return nextSequenceFromCodes(rows.map((row) => row.code), prefix);
}

/** 生成需求编号。 */
export async function generateRequirementCode(releaseWindow) {
  const 投产窗口 = normalizeReleaseWindow(releaseWindow);
  const template = await getCodeRuleTemplate('code.requirement', 'RC_{投产窗口}_{序号}');
  const prefix = codePrefix(template, { 投产窗口 });
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.requirement',
    prefix,
    initialValue: await initialSequence('code.requirement', prefix),
  });
  return formatCode(template, { 投产窗口 }, sequence);
}
