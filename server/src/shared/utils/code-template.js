/**
 * 文件：server/src/shared/utils/code-template.js
 * 说明：仅处理编号模板的变量替换、日期归一化和历史编号尾号解析，不访问数据库或业务表。
 * 用途：为各业务模块复用稳定的编号格式规则，保持原有模板和三位补零输出完全兼容。
 * 作者：hengguan
 */

/** 生成 YYYYMMDD 格式的当前日期，供缺失投产窗口时兼容旧行为。 */
function currentDateStr() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** 将非法或空的投产窗口回退为当前日期。 */
export function normalizeReleaseWindow(releaseWindow) {
  const value = String(releaseWindow || '').trim();
  return /^\d{8}$/.test(value) ? value : currentDateStr();
}

/** 将业务变量替换进模板；序号由调用方单独传入，便于先计算固定前缀。 */
export function applyCodeTemplate(template, values = {}) {
  const workItemCode = values['需求/工单编号'] ?? values.需求编号;
  const compatibleValues = workItemCode === undefined
    ? values
    : { ...values, '需求/工单编号': workItemCode, 需求编号: workItemCode };
  return Object.entries(compatibleValues).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value ?? '')),
    String(template || ''),
  );
}

/** 返回模板固定部分，作为编号序列的隔离维度。 */
export function codePrefix(template, values) {
  return applyCodeTemplate(template, { ...values, 序号: '' });
}

/** 保留既有三位补零规则，并允许序号超过三位时自然扩展。 */
export function formatCode(template, values, sequence) {
  return applyCodeTemplate(template, { ...values, 序号: String(sequence).padStart(3, '0') });
}

/** 从已有编号集中计算历史最大值后的下一序号，只接受纯数字尾号。 */
export function nextSequenceFromCodes(codes, prefix) {
  let max = 0;
  for (const code of codes) {
    const value = String(code || '');
    if (!value.startsWith(prefix)) continue;
    const tail = value.slice(prefix.length);
    if (!/^\d+$/.test(tail)) continue;
    const number = Number(tail);
    if (Number.isSafeInteger(number) && number > max) max = number;
  }
  return max + 1;
}
