export function extractPurePath(url?: string | null) {
  if (!url) return '';
  if (url.startsWith('/PAMS')) return url.slice('/PAMS'.length) || '/';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
  return url;
}
