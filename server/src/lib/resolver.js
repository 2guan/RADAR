/**
 * 文件：lib/resolver.js
 * 用途：数据库兼容性识别解析器。用于 Excel 导入时，将“系统名称/系统编号”、“字典属性值/显示值”、
 *       “投产日期”等输入文本转换回系统内码或数据库 ID，支持大小写与空格容错。
 * 作者：hengguan
 * 说明：提供字典、系统编号、多系统和投产点的兼容性转换辅助函数，主要供 Excel 导入模块使用。
 */

import { get, all } from '../db/index.js';

/**
 * 兼容性解析字典项的属性值（attr_value）
 * @param {string} category 字典分类
 * @param {string} text 属性值或显示值
 * @returns {string|null} 解析出的属性值，若无匹配则保留原文本进行后续常规校验
 */
export function resolveDictAttr(category, text) {
  if (!text) return null;
  const val = String(text).trim();
  const row = get(
    'SELECT attr_value FROM dict_item WHERE category = ? AND (LOWER(attr_value) = LOWER(?) OR LOWER(display_value) = LOWER(?))',
    category, val, val
  );
  return row ? row.attr_value : val;
}

/**
 * 兼容性解析系统编号（sys_code）
 * @param {string} text 系统编号或系统名称
 * @returns {string|null} 系统编号，若无匹配则保留原文本
 */
export function resolveSystemCode(text) {
  if (!text) return null;
  const val = String(text).trim();
  const row = get(
    'SELECT sys_code FROM system WHERE LOWER(sys_code) = LOWER(?) OR LOWER(sys_name) = LOWER(?)',
    val, val
  );
  return row ? row.sys_code : val;
}

/**
 * 兼容性解析多系统（JSON 数组）
 * @param {string} text 逗号/分号/换行分隔的多系统文本（系统编号或系统名称）
 * @returns {string} 序列化后的 JSON 系统编号数组
 */
export function resolveSystemCodes(text) {
  if (!text) return '[]';
  const parts = String(text).split(/[,,，;；\n]/).map(p => p.trim()).filter(Boolean);
  const codes = parts.map(p => resolveSystemCode(p) || p);
  return JSON.stringify(codes);
}

/**
 * 兼容性解析投产点 ID（release_point_id）
 * @param {string} text 投产日期（如 20260815）
 * @returns {number|null} 投产点 ID
 */
export function resolveReleasePoint(text) {
  if (!text) return null;
  const val = String(text).trim();
  const row = get('SELECT id FROM release_point WHERE release_date = ?', val);
  return row ? row.id : null;
}

/**
 * 格式化导出附件列表
 * @param {object[]} attachments 实体关联的全部附件数组
 * @param {string} fieldKey 附件的字段键（例如 '需求说明书', '概要设计' 等）
 * @returns {string} 格式化后的字符串，形如 "文件名1(路径1); 文件名2(路径2)"
 */
export function formatAttachments(attachments, fieldKey) {
  if (!Array.isArray(attachments)) return '';
  const list = attachments.filter(a => a.field_key === fieldKey);
  if (!list.length) return '';
  return list.map(a => (a.kind === 'file' ? a.filename : a.path_text)).join('\n');
}

