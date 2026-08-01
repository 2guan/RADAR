/**
 * 文件：server/src/modules/tickets/application/numbering.js
 * 说明：工单编号使用与投产点无关的日期模板；首次领号会扫描历史记录。
 * 用途：工单模块的编号领域服务，负责将业务模板、历史数据和平台序列表组合为唯一编号。
 * 作者：hengguan
 */

import { all, getCodeSequenceNext, reserveCodeSequence } from '../../../platform/persistence/index.js';
import { getCodeRuleTemplate } from '../../settings/reference-data/index.js';
import { badRequest } from '../../../platform/runtime/index.js';
import {
  codePrefix, codeTemplateValues, formatCode, nextSequenceFromCodes,
} from '../../../shared/utils/code-template.js';

/** 首次领号仅扫描同一固定前缀的历史工单，兼容已存在数据库。 */
async function initialSequence(ruleKey, prefix) {
  if (await getCodeSequenceNext(ruleKey, prefix) !== null) return 1;
  const rows = await all('SELECT ticket_code AS code FROM ticket WHERE ticket_code LIKE ?', `${prefix}%`);
  return nextSequenceFromCodes(rows.map((row) => row.code), prefix);
}

/** 生成工单编号。 */
export async function generateTicketCode() {
  const template = await getCodeRuleTemplate('code.ticket', 'TK_{当前年月日}_{序号[3]}');
  if (/\{投产点(?:（投产窗口）)?\}|\{投产窗口\}/.test(template)) throw badRequest('工单编号规则不再支持投产点占位符');
  const values = codeTemplateValues();
  const prefix = codePrefix(template, values);
  const sequence = await reserveCodeSequence({
    ruleKey: 'code.ticket',
    prefix,
    initialValue: await initialSequence('code.ticket', prefix),
  });
  return formatCode(template, values, sequence);
}

export async function ticketCodeRequiresReleasePoint() { return false; }
