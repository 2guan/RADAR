import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Busboy from 'busboy';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const uploadDir = path.join(root, 'uploads');
const host = '0.0.0.0';
const port = 8091;
const maxSize = 50 * 1024 * 1024;
const previewableExtensions = new Set(['.doc', '.docx', '.xls', '.xlsx', '.pdf']);

await mkdir(uploadDir, { recursive: true });

function replyJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath, contentType = 'application/octet-stream', extraHeaders = {}) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': statSync(filePath).size,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  createReadStream(filePath).pipe(response);
}

function safeExtension(filename) {
  return path.extname(filename || '').toLowerCase();
}

/**
 * Browsers commonly send multipart `filename` as UTF-8 bytes. Busboy exposes
 * a non-extended filename parameter as Latin-1, which otherwise turns Chinese
 * names into mojibake such as “éæ±”. Keep genuine Unicode and ASCII names as-is.
 */
function normalizeOriginalFilename(filename) {
  const rawName = path.basename(filename || '');
  if (/[^\u0000-\u00ff]/.test(rawName)) return rawName;
  const decoded = Buffer.from(rawName, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? rawName : decoded;
}

function encodePreviewUrl(sourceUrl) {
  const encoded = Buffer.from(sourceUrl, 'utf8').toString('base64');
  return `http://localhost:8012/onlinePreview?url=${encodeURIComponent(encoded)}`;
}

async function receiveUpload(request) {
  return await new Promise((resolve, reject) => {
    let completedFile;
    let rejected;
    let tooLarge = false;
    let writeComplete = Promise.resolve();
    const parser = Busboy({ headers: request.headers, limits: { files: 1, fileSize: maxSize } });
    parser.on('file', (_field, stream, info) => {
      const extension = safeExtension(info.filename);
      if (!previewableExtensions.has(extension)) {
        rejected = '仅支持上传 DOC、DOCX、XLS、XLSX 或 PDF 文件';
        stream.resume();
        return;
      }
      const storedName = `${randomUUID()}${extension}`;
      const storedPath = path.join(uploadDir, storedName);
      stream.on('limit', () => { tooLarge = true; });
      writeComplete = new Promise((writeResolve, writeReject) => {
        const output = createWriteStream(storedPath);
        output.on('close', writeResolve);
        output.on('error', writeReject);
        stream.pipe(output);
      });
      completedFile = { storedName, storedPath, originalName: normalizeOriginalFilename(info.filename) };
    });
    parser.on('error', reject);
    parser.on('finish', async () => {
      try { await writeComplete; } catch (error) { return reject(error); }
      if (completedFile && (tooLarge || rejected)) await rm(completedFile.storedPath, { force: true });
      if (tooLarge) return reject(new Error('文件不能超过 50MB'));
      if (rejected) return reject(new Error(rejected));
      if (!completedFile) return reject(new Error('请选择一个文件'));
      resolve(completedFile);
    });
    request.pipe(parser);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && requestUrl.pathname === '/') return sendFile(response, path.join(publicDir, 'index.html'), 'text/html; charset=utf-8');
  if (request.method === 'GET' && requestUrl.pathname.startsWith('/files/')) {
    const name = path.basename(decodeURIComponent(requestUrl.pathname.slice('/files/'.length)));
    const displayName = path.basename(requestUrl.searchParams.get('fullfilename') || name);
    return sendFile(response, path.join(uploadDir, name), 'application/octet-stream', {
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`,
    });
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/upload') {
    try {
      const file = await receiveUpload(request);
      // kkFileView is on the same isolated Docker network and resolves this service as `demo`.
      const sourceUrl = `http://demo:${port}/files/${encodeURIComponent(file.storedName)}?fullfilename=${encodeURIComponent(file.originalName)}`;
      return replyJson(response, 201, { filename: file.originalName, previewUrl: encodePreviewUrl(sourceUrl) });
    } catch (error) {
      return replyJson(response, 400, { message: error.message || '上传失败' });
    }
  }
  response.writeHead(404).end();
});

server.listen(port, host, () => console.log(`Demo available at http://localhost:${port}`));
