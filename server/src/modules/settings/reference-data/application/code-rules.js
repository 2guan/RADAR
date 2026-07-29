/**
 * 文件：server/src/modules/settings/reference-data/application/code-rules.js
 * 说明：编号模板属于可配置的基础数据；空值时使用调用方声明的业务默认模板。
 * 用途：为各业务模块提供统一的编号规则读取契约，避免它们直接访问 app_config。
 * 作者：hengguan
 */

import { get } from '../../../../platform/persistence/index.js';

const WORK_ITEM_CODE_PLACEHOLDERS = ['{需求/工单编号}', '{需求编号}'];

/** 读取指定编号规则；历史未配置时保持原先的默认格式。 */
export async function getCodeRuleTemplate(key, fallback) {
  const row = await get('SELECT value FROM app_config WHERE key = ?', key);
  return String(row?.value || fallback);
}

/** 需求、工单尚未生成自身编号，不能将自身作为编号模板变量。 */
export function validateCodeRuleTemplate(key, template) {
  if (['code.requirement', 'code.ticket'].includes(key)
    && WORK_ITEM_CODE_PLACEHOLDERS.some((placeholder) => String(template || '').includes(placeholder))) {
    return `${key === 'code.requirement' ? '需求' : '工单'}编号规则不能使用 {需求/工单编号}`;
  }
  return null;
}
