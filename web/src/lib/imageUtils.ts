export const UPLOAD_ACCEPT_STRING = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';

export function isDocumentFile(file: File | { name?: string; type?: string } | string) {
  const name = typeof file === 'string' ? file : file.name || '';
  const type = typeof file === 'string' ? '' : file.type || '';
  return !type.startsWith('image/') || /\.(pdf|docx?|xlsx?|txt|zip|rar)$/i.test(name);
}

export function getFileTypeEmoji(fileName = '') {
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName)) return '图片';
  if (/\.pdf$/i.test(fileName)) return 'PDF';
  if (/\.docx?$/i.test(fileName)) return 'Word';
  if (/\.xlsx?$/i.test(fileName)) return 'Excel';
  return '文件';
}

export function validateUploadFile(file: File) {
  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) return '文件大小不能超过 20MB';
  return '';
}

export async function compressImage(file: File) {
  return file;
}

export function getDocThumbDataUrl(fileName = '') {
  const label = getFileTypeEmoji(fileName).slice(0, 5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="102" height="102" viewBox="0 0 102 102"><rect width="102" height="102" fill="#f5f7fb"/><rect x="26" y="16" width="50" height="68" fill="#fff" stroke="#cfd8e3"/><path d="M62 16v16h14" fill="none" stroke="#cfd8e3"/><text x="51" y="61" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#56657a">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
