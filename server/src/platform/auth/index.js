/**
 * 文件：server/src/platform/auth/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：平台公共能力入口，隐藏内部实现细节。
 * 作者：hengguan
 */

/** Public authentication and RBAC platform contract. */
export { default as authPlugin } from '../../plugins/auth.js';
export {
  hashPassword, verifyPassword, validatePasswordComplexity,
  isPasswordExpired, getSecurityConfig,
} from '../../lib/password.js';
export { createCaptcha, verifyCaptcha } from '../../lib/captcha.js';
export { authorizeEntity, resolveEntityAccess } from '../../shared/authorization/entity-access.js';
export { MODULE_CONTRACT as authContract } from './contracts/index.js';
