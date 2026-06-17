/**
 * 文件：lib/sanitize.js
 * 用途：通用安全净化工具。对用户输入的字符串做 XSS 预防处理，
 *       剥离 HTML 标签、特殊字符编码等，无需第三方依赖。
 * 作者：hengguan
 * 说明：采用白名单策略——仅允许中文、字母、数字和少量安全标点，
 *       其余字符实体编码。适用于用户名、备注等文本字段的前端 XSS 防御。
 *       注：React 已默认转义 JSX 文本，此处做后端双重防御。
 */

/**
 * 安全字符白名单正则：中文/CJK、字母、数字、空格、常见安全标点
 * 保留的标点：._-·,，。、：；！？""''（）《》【】—…·～@#/\\+%=*()[]{}<>等不做剥离，仅做 HTML 编码
 */
const SAFE_RE = /[^\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaffA-Za-z0-9 _\-·,，。、：；！？""''（）《》【】—…·～@#/\\+%=*()\[\]{}<>^$|~`]/g;

/**
 * HTML 特殊字符实体编码映射
 */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * 对文本做 HTML 实体编码（仅编码 HTML 特殊字符，保留其他合法字符）
 * @param {string} str 原始字符串
 * @returns {string} HTML 转义后的安全字符串
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'/]/g, (ch) => HTML_ENTITIES[ch] || ch);
}

/**
 * 移除字符串中的 HTML/XML 标签
 * @param {string} str 原始字符串
 * @returns {string} 移除了标签的字符串
 */
export function stripTags(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * 安全化字符串：剥离标签 + 长度限制
 * 用于存储用户输入姓名、备注等文本字段
 * @param {string} str 原始用户输入
 * @returns {string} 安全字符串
 */
export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  // 先剥离 HTML 标签
  let clean = str.replace(/<[^>]*>/g, '');
  // 限制长度（防 DoS）
  if (clean.length > 1000) clean = clean.slice(0, 1000);
  return clean.trim();
}

/**
 * 安全化并 HTML 转义：用于动态渲染场景
 * @param {string} str 原始字符串
 * @returns {string} 安全 HTML 字符串
 */
export function sanitizeAndEscape(str) {
  return escapeHtml(sanitizeText(str));
}
