/**
 * 文件：server/src/platform/notifications/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：平台公共能力入口，隐藏内部实现细节。
 * 作者：hengguan
 */

/** Reserved notification platform contract. No provider is enabled until a requirement approves one. */
export async function notify() {
  throw new Error('Notification provider is not configured');
}
