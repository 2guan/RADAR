/**
 * 文件：server/src/platform/runtime/node-localstorage-shim.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：RADAR 后端业务或平台逻辑。
 * 作者：hengguan
 */

/**
 * `docx` consults global localStorage for its deprecation configuration.
 * Node 25 exposes it through a getter that warns without a storage path.
 * Provide the minimal in-memory API only when Node exposes that getter.
 */
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

if (!descriptor || typeof descriptor.get === 'function') {
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(String(key)) ?? null,
      setItem: (key, value) => values.set(String(key), String(value)),
      removeItem: (key) => values.delete(String(key)),
      clear: () => values.clear(),
    },
  });
}
