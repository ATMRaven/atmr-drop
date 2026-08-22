/**
 * The Daily Drop SDK - Programmatic Client
 * Seamless file, image, text, and note transfers via drop.atmr.workers.dev
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DEFAULT_BASE_URL = 'https://drop.atmr.workers.dev';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per chunk

class AtmrDropClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.ATMR_DROP_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  /**
   * Helper: Send HTTP/HTTPS request
   */
  async _request(endpoint, options = {}, bodyBuffer = null) {
    const url = new URL(this.baseUrl + (endpoint.startsWith('/') ? endpoint : '/' + endpoint));
    const transport = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const headers = Object.assign({}, options.headers || {});
      if (bodyBuffer && !headers['Content-Length']) {
        headers['Content-Length'] = bodyBuffer.length;
      }

      const reqOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers
      };

      const req = transport.request(reqOptions, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || '';
          let data = rawBuffer;

          if (contentType.includes('application/json')) {
            try {
              data = JSON.parse(rawBuffer.toString('utf8'));
            } catch (e) {
              data = rawBuffer.toString('utf8');
            }
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            data,
            rawBuffer
          });
        });
      });

      req.on('error', (err) => reject(err));

      if (bodyBuffer) {
        req.write(bodyBuffer);
      }
      req.end();
    });
  }

  /**
   * Create a new drop (text and/or files)
   * @param {Object} params
   * @param {string} [params.text] Text note, code snippet, or link
   * @param {string[]} [params.files] List of local file paths
   * @param {number} [params.ttlSeconds=900] Expiration in seconds (default 15m)
   * @param {boolean} [params.burnAfterRead=false] Delete immediately upon retrieval
   * @param {string} [params.customPin] Custom 4-character alphanumeric PIN
   * @param {function} [params.onProgress] Upload progress callback (fileIndex, chunkIndex, percent)
   */
  async createDrop(params = {}) {
    const { text, files = [], ttlSeconds = 900, burnAfterRead = false, customPin, onProgress } = params;

    if (!text && (!files || files.length === 0)) {
      throw new Error('Drop must contain either text or at least one file.');
    }

    const fileObjects = [];
    const manifestFiles = [];

    for (let i = 0; i < files.length; i++) {
      const filePath = path.resolve(files[i]);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }
      const stat = fs.statSync(filePath);
      const name = path.basename(filePath);
      const id = 'f_' + Math.random().toString(36).substring(2, 9);
      const chunkCount = Math.max(1, Math.ceil(stat.size / CHUNK_SIZE));
      const mimeType = this._guessMimeType(name);

      fileObjects.push({
        id,
        name,
        filePath,
        size: stat.size,
        chunkCount,
        mimeType
      });

      manifestFiles.push({
        id,
        name,
        path: '',
        type: mimeType,
        size: stat.size,
        chunkCount,
        chunkSize: CHUNK_SIZE
      });
    }

    // 1. Post Manifest
    const payload = {
      customPin: customPin ? String(customPin).trim().toUpperCase() : undefined,
      text: text || undefined,
      textType: this._detectTextType(text),
      ttlSeconds: parseInt(ttlSeconds, 10) || 900,
      burnAfterRead: Boolean(burnAfterRead),
      isEncrypted: false,
      files: manifestFiles
    };

    const res = await this._request('/api/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, Buffer.from(JSON.stringify(payload), 'utf8'));

    if (res.status !== 200 || !res.data.success) {
      throw new Error(res.data.error || `Failed to create drop (HTTP ${res.status})`);
    }

    const dropData = res.data;

    // 2. Stream File Chunks
    for (let fIdx = 0; fIdx < fileObjects.length; fIdx++) {
      const file = fileObjects[fIdx];
      const fd = fs.openSync(file.filePath, 'r');
      try {
        for (let cIdx = 0; cIdx < file.chunkCount; cIdx++) {
          const start = cIdx * CHUNK_SIZE;
          const end = Math.min(file.size, start + CHUNK_SIZE);
          const chunkLen = end - start;
          const buffer = Buffer.alloc(chunkLen);
          fs.readSync(fd, buffer, 0, chunkLen, start);

          const chunkRes = await this._request(
            `/api/drop/${dropData.code}/file/${file.id}/chunk/${cIdx}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/octet-stream' }
            },
            buffer
          );

          if (chunkRes.status < 200 || chunkRes.status >= 300) {
            throw new Error(`Failed uploading chunk ${cIdx + 1}/${file.chunkCount} for ${file.name}`);
          }

          if (typeof onProgress === 'function') {
            onProgress({
              fileIndex: fIdx,
              fileName: file.name,
              chunkIndex: cIdx,
              totalChunks: file.chunkCount,
              percent: Math.round(((cIdx + 1) / file.chunkCount) * 100)
            });
          }
        }
      } finally {
        fs.closeSync(fd);
      }
    }

    return {
      success: true,
      code: dropData.code,
      directUrl: dropData.directUrl || `${this.baseUrl}/${dropData.code}`,
      expiresAt: dropData.expiresAt,
      ttlSeconds: dropData.ttlSeconds,
      burnAfterRead: dropData.burnAfterRead,
      files: manifestFiles,
      text: dropData.text || text
    };
  }

  /**
   * Retrieve drop details & text by PIN
   * @param {string} code 4-character PIN
   * @param {Object} [options]
   * @param {boolean} [options.peek=false] If true, prevents burn-after-reading drop deletion
   */
  async getDrop(code, options = {}) {
    const cleanPin = String(code).trim().toUpperCase();
    const query = options.peek ? '?peek=true' : '';
    const res = await this._request(`/api/drop/${cleanPin}${query}`);

    if (res.status === 404) {
      return { success: false, error: 'Drop not found or expired' };
    }
    if (res.status !== 200 || !res.data.success) {
      return { success: false, error: res.data.error || `HTTP ${res.status}` };
    }

    return res.data;
  }

  /**
   * Download a single file from a drop
   * @param {string} code 4-character PIN
   * @param {string} fileId File ID in manifest
   * @param {string} destPath Target destination file path
   */
  async downloadFile(code, fileId, destPath) {
    const cleanPin = String(code).trim().toUpperCase();
    const res = await this._request(`/api/file/${cleanPin}/${fileId}`);

    if (res.status !== 200) {
      throw new Error(`Failed to download file ${fileId} (HTTP ${res.status})`);
    }

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(destPath, res.rawBuffer);
    return {
      success: true,
      path: destPath,
      size: res.rawBuffer.length
    };
  }

  /**
   * Download all files attached to a drop into a directory
   * @param {string} code 4-character PIN
   * @param {string} outputDir Target output directory
   */
  async downloadAllFiles(code, outputDir) {
    const cleanPin = String(code).trim().toUpperCase();
    const dropInfo = await this.getDrop(cleanPin, { peek: true });

    if (!dropInfo.success || !dropInfo.drop) {
      throw new Error(dropInfo.error || 'Drop not found');
    }

    const files = dropInfo.drop.files || [];
    if (files.length === 0) {
      return [];
    }

    const targetDir = path.resolve(outputDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const downloaded = [];
    for (const f of files) {
      const relPath = f.path || f.name;
      const targetFile = path.join(targetDir, relPath);
      await this.downloadFile(cleanPin, f.id, targetFile);
      downloaded.push({
        id: f.id,
        name: f.name,
        path: targetFile,
        size: f.size
      });
    }

    return downloaded;
  }

  /**
   * Check status of a drop (non-destructive)
   * @param {string} code 4-character PIN
   */
  async checkStatus(code) {
    const cleanPin = String(code).trim().toUpperCase();
    const res = await this._request(`/api/drop/${cleanPin}?peek=true`);

    if (res.status === 404 || !res.data || !res.data.success) {
      return { active: false, status: 'expired_or_not_found' };
    }

    const drop = res.data.drop;
    const remainingSeconds = Math.max(0, Math.floor((drop.expiresAt - Date.now()) / 1000));

    return {
      active: remainingSeconds > 0,
      code: drop.code,
      expiresAt: drop.expiresAt,
      remainingSeconds,
      pickedUp: Boolean(drop.pickedUp),
      burnAfterRead: Boolean(drop.burnAfterRead),
      isEncrypted: Boolean(drop.isEncrypted),
      hasText: Boolean(drop.text),
      fileCount: (drop.files || []).length,
      files: (drop.files || []).map(f => ({ name: f.name, size: f.size, type: f.type }))
    };
  }

  /**
   * Permanently delete / revoke a drop
   * @param {string} code 4-character PIN
   */
  async deleteDrop(code) {
    const cleanPin = String(code).trim().toUpperCase();
    const res = await this._request(`/api/drop/${cleanPin}`, { method: 'DELETE' });

    if (res.status !== 200 || !res.data.success) {
      return { success: false, error: res.data?.error || `HTTP ${res.status}` };
    }

    return { success: true, message: `Drop #${cleanPin} permanently deleted` };
  }

  _detectTextType(text) {
    if (!text) return 'plain';
    const trimmed = text.trim();
    if (/^https?:\/\/[^\s]+$/.test(trimmed)) return 'url';
    return 'plain';
  }

  _guessMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const map = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.apk': 'application/vnd.android.package-archive',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg'
    };
    return map[ext] || 'application/octet-stream';
  }
}

module.exports = { AtmrDropClient };
