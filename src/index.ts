import { CreateDropRequest, DropMetadata, Env, FileEntry } from './types';

// CORS response helper
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Deploy-Key, X-App-Version',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

// Generate secure random alphanumeric PIN
function generatePin(length = 4): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let pin = '';
  for (let i = 0; i < length; i++) {
    pin += chars[bytes[i] % chars.length];
  }
  return pin;
}

// Generate unique internal ID
function generateId(): string {
  return 'f_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4);
}

// Convert Base64 string to Uint8Array safely (for small metadata/legacy payloads)
function base64ToUint8Array(base64: string): Uint8Array {
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Chunk upload route: PUT /api/drop/:code/file/:fileId/chunk/:chunkIndex or PUT /api/drop/:code/file/:fileId
    if (pathname.startsWith('/api/drop/') && pathname.includes('/file/') && (request.method === 'PUT' || request.method === 'POST')) {
      const clean = pathname.replace('/api/drop/', '');
      const parts = clean.split('/');
      const code = parts[0]?.trim().toUpperCase();
      const fileId = parts[2]?.trim();
      const chunkIndex = parts[4] ? parseInt(parts[4], 10) : 0;
      return handleUploadChunk(code, fileId, chunkIndex, request, env);
    }

    // API Routes
    if (pathname === '/api/drop' && request.method === 'POST') {
      return handleCreateDrop(request, env);
    }

    if (pathname.startsWith('/api/drop/') && request.method === 'GET') {
      const code = pathname.replace('/api/drop/', '').trim().toUpperCase();
      const isPeek = url.searchParams.get('peek') === 'true';
      return handleGetDrop(code, isPeek, env);
    }

    if (pathname.startsWith('/api/file/') && request.method === 'GET') {
      const parts = pathname.replace('/api/file/', '').split('/');
      const code = parts[0]?.trim().toUpperCase();
      const fileId = parts[1]?.trim();
      const isDownload = url.searchParams.get('download') === 'true';
      return handleGetFile(code, fileId, isDownload, env);
    }

    if (pathname.startsWith('/api/drop/') && request.method === 'DELETE') {
      const code = pathname.replace('/api/drop/', '').trim().toUpperCase();
      return handleDeleteDrop(code, env);
    }

    // Database APK binary upload route (authenticated for CI/CD)
    if (pathname === '/api/apk/upload' && request.method === 'POST') {
      const deployKey = request.headers.get('X-Deploy-Key') || url.searchParams.get('key');
      if (deployKey !== 'atmr_drop_deploy_key_2026') {
        return jsonResponse({ error: 'Unauthorized: Invalid deploy key' }, 401);
      }

      try {
        const version = url.searchParams.get('version') || request.headers.get('X-App-Version') || 'latest';
        const buffer = await request.arrayBuffer();
        if (!buffer || buffer.byteLength === 0) {
          return jsonResponse({ error: 'Empty binary payload' }, 400);
        }

        // Store APK binary directly in Cloudflare KV Database (overwriting & replacing previous version)
        await env.ATMR_DROP_KV.put('latest_apk_binary', buffer);
        await env.ATMR_DROP_KV.put('latest_apk_meta', JSON.stringify({
          version: version.replace(/^v/, '').trim(),
          size: buffer.byteLength,
          uploadedAt: Date.now(),
        }));

        return jsonResponse({
          success: true,
          message: 'APK stored in KV database. Previous version replaced.',
          version,
          size: buffer.byteLength,
        });
      } catch (err: any) {
        return jsonResponse({ error: 'Failed to store APK in database: ' + (err.message || String(err)) }, 500);
      }
    }

    // Dedicated in-app APK streaming route: reads directly from KV Database with fallback
    if (pathname === '/api/apk/latest' || pathname === '/api/apk') {
      try {
        // 1. Try reading directly from KV Database
        const kvBinary = await env.ATMR_DROP_KV.get('latest_apk_binary', { type: 'arrayBuffer' });
        if (kvBinary && kvBinary.byteLength > 0) {
          return new Response(kvBinary, {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/vnd.android.package-archive',
              'Content-Disposition': 'attachment; filename="atmr-drop.apk"',
              'Content-Length': String(kvBinary.byteLength),
              'Cache-Control': 'public, max-age=60',
              'X-Source': 'Cloudflare-KV-Database',
            },
          });
        }

        // 2. Secondary fallback: Stream from GitHub Releases
        let downloadUrl = 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk';
        try {
          const ghRes = await fetch('https://api.github.com/repos/ATMRaven/atmr-drop/releases/latest', {
            headers: { 'User-Agent': 'atmr-drop-worker' },
          });
          if (ghRes.ok) {
            const ghData: any = await ghRes.json();
            if (ghData.assets?.[0]?.browser_download_url) {
              downloadUrl = ghData.assets[0].browser_download_url;
            }
          }
        } catch (e) {}

        const apkRes = await fetch(downloadUrl, {
          headers: { 'User-Agent': 'atmr-drop-worker' },
          redirect: 'follow',
        });

        if (!apkRes.ok) {
          return new Response('APK binary not available', { status: 404, headers: corsHeaders });
        }

        const headers: Record<string, string> = {
          ...corsHeaders,
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="atmr-drop.apk"',
          'Cache-Control': 'public, max-age=180',
          'X-Source': 'GitHub-Releases-Fallback',
        };

        const len = apkRes.headers.get('content-length');
        if (len) {
          headers['Content-Length'] = len;
        }

        return new Response(apkRes.body, {
          status: 200,
          headers,
        });
      } catch (err: any) {
        return new Response('Error streaming APK: ' + (err.message || String(err)), { status: 500, headers: corsHeaders });
      }
    }

    // Version check endpoint: checks database metadata first
    if (pathname === '/api/version') {
      try {
        let kvMeta: any = null;
        try {
          const metaStr = await env.ATMR_DROP_KV.get('latest_apk_meta');
          if (metaStr) kvMeta = JSON.parse(metaStr);
        } catch (e) {}

        const ghRes = await fetch('https://api.github.com/repos/ATMRaven/atmr-drop/releases/latest', {
          headers: { 'User-Agent': 'atmr-drop-worker' },
        });
        let ghTag = '';
        let ghNotes = '';
        let ghAssetUrl = '';
        let ghPage = '';

        if (ghRes.ok) {
          const ghData: any = await ghRes.json();
          ghTag = (ghData.tag_name || '').replace(/^v/, '').trim();
          ghNotes = ghData.body || '';
          ghAssetUrl = ghData.assets?.[0]?.browser_download_url || '';
          ghPage = ghData.html_url || '';
        }

        const effectiveVersion = kvMeta?.version || ghTag || '1.0.26';
        let cleanNotes = ghNotes;
        if (!cleanNotes || cleanNotes.includes('The Daily Drop') || cleanNotes.includes('Published by')) {
          cleanNotes = '• High-performance multi-part binary streaming: seamlessly upload and drop files up to 10 GB with 0 RAM overhead\n• Zero "Invalid string length" errors with native streaming file handles\n• Real-time upload status bar with live speed & transferred byte tracking\n• Instant drop pickup detection, celebratory audio chime & native push notifications\n• In-app direct APK self-installer';
        }

        return jsonResponse({
          version: effectiveVersion,
          downloadUrl: '/api/apk/latest',
          fallbackUrl: ghAssetUrl || 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk',
          releasePage: ghPage || 'https://github.com/ATMRaven/atmr-drop/releases/latest',
          mandatory: false,
          releaseNotes: cleanNotes || 'Performance enhancements and bug fixes.',
          source: kvMeta ? 'database' : 'github',
        });
      } catch (e) {}

      return jsonResponse({
        version: '1.0.26',
        downloadUrl: '/api/apk/latest',
        fallbackUrl: 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk',
        releasePage: 'https://github.com/ATMRaven/atmr-drop/releases/latest',
        mandatory: false,
        releaseNotes: '• High-performance multi-part binary streaming: seamlessly upload and drop files up to 10 GB with 0 RAM overhead\n• Zero "Invalid string length" errors with native streaming file handles\n• Real-time upload status bar with live speed & transferred byte tracking\n• Instant drop pickup detection, celebratory audio chime & native push notifications\n• In-app direct APK self-installer',
      });
    }

    // API Index / Discovery endpoint
    if (pathname === '/api' || pathname === '/api/') {
      return jsonResponse({
        service: 'THE DAILY DROP API',
        version: '1.0.0',
        creator: 'atmr',
        endpoints: {
          'POST /api/drop': 'Create a new encrypted wire drop metadata (text, files manifest, dynamic TTL, burnAfterRead)',
          'PUT /api/drop/:code/file/:fileId/chunk/:chunkIndex': 'Stream raw binary chunk for a file attachment (10 MB chunks)',
          'GET /api/drop/:code': 'Retrieve drop metadata and active files manifest by 4-digit PIN code',
          'GET /api/file/:code/:fileId': 'Stream or download individual file attachment binary',
          'DELETE /api/drop/:code': 'Manually delete drop from KV before expiry',
          'GET /api/health': 'Health check status',
        },
        directRoutePattern: 'https://drop.atmr.workers.dev/:pin',
      });
    }

    // Health check endpoint
    if (pathname === '/api/health') {
      return jsonResponse({ status: 'ok', app: 'atmr-drop', creator: 'atmr', timestamp: Date.now() });
    }

    // Check if the route is a direct drop link like /1234 or /7890
    const codeMatch = pathname.match(/^\/([a-zA-Z0-9]{4,8})$/);
    if (codeMatch && env.ASSETS) {
      const indexReq = new Request(new URL('/', request.url), request);
      return env.ASSETS.fetch(indexReq);
    }

    // Fallback to static assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('atmr-drop worker active. Assets binding not found.', { status: 200 });
  },
};

// Handler: Create Drop
async function handleCreateDrop(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as CreateDropRequest;

    const rawTtl = typeof body.ttlSeconds === 'number' ? body.ttlSeconds : 600;
    // Bound TTL between 60s (1 min) and 86400s (24 hours)
    const ttlSeconds = Math.max(60, Math.min(86400, Math.floor(rawTtl)));
    const burnAfterRead = Boolean(body.burnAfterRead);

    // Find an available unique 4-character PIN
    let code = '';
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generatePin(4);
      const existing = await env.ATMR_DROP_KV.get(`drop:${candidate}`);
      if (!existing) {
        code = candidate;
        break;
      }
      attempts++;
    }

    if (!code) {
      code = generatePin(6);
    }

    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    const fileEntries: FileEntry[] = [];

    // Process file manifests
    for (const f of body.files || []) {
      const fileId = f.id || generateId();
      const chunkCount = f.chunkCount || 1;
      const chunkSize = f.chunkSize || 10 * 1024 * 1024;
      const kvKey = `file:${code}:${fileId}:chunk:0`;

      // Handle legacy base64 if provided (backward compatibility)
      if (f.dataBase64) {
        try {
          const fileBytes = base64ToUint8Array(f.dataBase64);
          await env.ATMR_DROP_KV.put(kvKey, fileBytes, {
            expirationTtl: ttlSeconds,
            metadata: {
              name: f.name,
              type: f.type || 'application/octet-stream',
              size: f.size,
            },
          });
        } catch (e) {}
      }

      fileEntries.push({
        id: fileId,
        name: f.name,
        size: f.size,
        type: f.type || 'application/octet-stream',
        chunkCount,
        chunkSize,
        kvKey,
      });
    }

    const metadata: DropMetadata = {
      code,
      createdAt: now,
      expiresAt,
      ttlSeconds,
      burnAfterRead,
      retrievedCount: 0,
      text: body.text,
      textType: body.textType || 'plain',
      files: fileEntries,
      creator: 'atmr',
    };

    // Save drop metadata in KV with exact expiration TTL
    await env.ATMR_DROP_KV.put(`drop:${code}`, JSON.stringify(metadata), {
      expirationTtl: ttlSeconds,
    });

    const host = request.headers.get('host') || '';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const directUrl = `${protocol}://${host}/${code}`;

    return jsonResponse({
      success: true,
      code,
      directUrl,
      expiresAt,
      ttlSeconds,
      burnAfterRead,
      itemCount: (metadata.text ? 1 : 0) + fileEntries.length,
      fileCount: fileEntries.length,
      text: metadata.text,
      files: fileEntries,
    });
  } catch (err: any) {
    return jsonResponse({ error: 'Failed to create drop', details: err?.message || String(err) }, 500);
  }
}

// Handler: Upload Binary Chunk
async function handleUploadChunk(
  code: string,
  fileId: string,
  chunkIndex: number,
  request: Request,
  env: Env
): Promise<Response> {
  try {
    if (!code || !fileId) {
      return jsonResponse({ error: 'Missing code or file ID' }, 400);
    }

    const raw = await env.ATMR_DROP_KV.get(`drop:${code}`);
    if (!raw) {
      return jsonResponse({ error: 'Drop not found or expired' }, 404);
    }

    const drop: DropMetadata = JSON.parse(raw);
    const ttlSeconds = Math.max(60, Math.floor((drop.expiresAt - Date.now()) / 1000));

    const buffer = await request.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return jsonResponse({ error: 'Empty chunk payload' }, 400);
    }

    const chunkKey = `file:${code}:${fileId}:chunk:${chunkIndex}`;
    await env.ATMR_DROP_KV.put(chunkKey, buffer, {
      expirationTtl: ttlSeconds,
    });

    return jsonResponse({
      success: true,
      code,
      fileId,
      chunkIndex,
      bytes: buffer.byteLength,
    });
  } catch (err: any) {
    return jsonResponse({ error: 'Failed to upload chunk: ' + (err.message || String(err)) }, 500);
  }
}

// Handler: Retrieve Drop
async function handleGetDrop(code: string, isPeek: boolean, env: Env): Promise<Response> {
  try {
    if (!code) {
      return jsonResponse({ error: 'Code is required' }, 400);
    }

    const raw = await env.ATMR_DROP_KV.get(`drop:${code}`);
    if (!raw) {
      // If drop not in KV, check if it was just burned and marked as picked up
      if (isPeek) {
        const pickupRaw = await env.ATMR_DROP_KV.get(`pickup:${code}`);
        if (pickupRaw) {
          const pData = JSON.parse(pickupRaw);
          return jsonResponse({
            success: true,
            drop: {
              code,
              pickedUp: true,
              pickedUpAt: pData.pickedUpAt,
              retrievedCount: 1,
              remainingSeconds: 0,
            },
          });
        }
      }
      return jsonResponse({ error: 'Drop not found or has expired' }, 404);
    }

    const drop: DropMetadata = JSON.parse(raw);
    const now = Date.now();
    const remainingSeconds = Math.max(0, Math.floor((drop.expiresAt - now) / 1000));

    if (remainingSeconds <= 0) {
      await handleDeleteDrop(code, env);
      return jsonResponse({ error: 'Drop has expired' }, 404);
    }

    // If receiver is fetching (not just a sender peek)
    if (!isPeek) {
      drop.retrievedCount = (drop.retrievedCount || 0) + 1;
      drop.pickedUpAt = drop.pickedUpAt || now;

      if (drop.burnAfterRead) {
        // Record pickup marker for 120 seconds so sender receives pickup confirmation
        await env.ATMR_DROP_KV.put(`pickup:${code}`, JSON.stringify({ pickedUp: true, pickedUpAt: now }), {
          expirationTtl: 120,
        });
        // Immediately delete drop PIN metadata from KV so no subsequent sessions can retrieve it
        await env.ATMR_DROP_KV.delete(`drop:${code}`);
      } else {
        // Update retrieved count and pickedUpAt timestamp in KV
        await env.ATMR_DROP_KV.put(`drop:${code}`, JSON.stringify(drop), {
          expirationTtl: remainingSeconds,
        });
      }
    }

    return jsonResponse({
      success: true,
      drop: {
        ...drop,
        pickedUp: (drop.retrievedCount || 0) > 0,
        remainingSeconds,
      },
    });
  } catch (err: any) {
    return jsonResponse({ error: 'Failed to fetch drop', details: err?.message || String(err) }, 500);
  }
}

// Handler: Stream File (Multi-chunk KV or direct)
async function handleGetFile(code: string, fileId: string, isDownload: boolean, env: Env): Promise<Response> {
  try {
    if (!code || !fileId) {
      return jsonResponse({ error: 'Missing code or file ID' }, 400);
    }

    const raw = await env.ATMR_DROP_KV.get(`drop:${code}`);
    let fileMeta: FileEntry | undefined;
    if (raw) {
      const drop: DropMetadata = JSON.parse(raw);
      fileMeta = drop.files.find((f) => f.id === fileId);
    }

    const rawName = fileMeta?.name || `file-${fileId}`;
    const safeAsciiName = rawName.replace(/["\r\n\\]/g, '_');
    const encodedUtf8Name = encodeURIComponent(rawName);
    const contentType = fileMeta?.type || 'application/octet-stream';
    const dispositionType = isDownload ? 'attachment' : 'inline';
    const chunkCount = fileMeta?.chunkCount || 1;

    // Multi-part streaming for chunked files
    if (chunkCount > 1) {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for (let i = 0; i < chunkCount; i++) {
              const chunkKey = `file:${code}:${fileId}:chunk:${i}`;
              const chunk = await env.ATMR_DROP_KV.get(chunkKey, { type: 'arrayBuffer' });
              if (chunk && chunk.byteLength > 0) {
                controller.enqueue(new Uint8Array(chunk));
              } else {
                break;
              }
            }
          } catch (e) {
            controller.error(e);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `${dispositionType}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUtf8Name}`,
          'Content-Length': fileMeta?.size ? fileMeta.size.toString() : '',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...corsHeaders,
        },
      });
    }

    // Single chunk (chunk:0) or legacy key fallback
    let chunk0 = await env.ATMR_DROP_KV.get(`file:${code}:${fileId}:chunk:0`, { type: 'arrayBuffer' });
    if (!chunk0) {
      chunk0 = await env.ATMR_DROP_KV.get(`file:${code}:${fileId}`, { type: 'arrayBuffer' });
    }

    if (!chunk0) {
      return jsonResponse({ error: 'File not found or expired' }, 404);
    }

    return new Response(chunk0, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${dispositionType}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUtf8Name}`,
        'Content-Length': chunk0.byteLength.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...corsHeaders,
      },
    });
  } catch (err: any) {
    return jsonResponse({ error: 'Failed to download file', details: err?.message || String(err) }, 500);
  }
}

// Handler: Delete Drop
async function handleDeleteDrop(code: string, env: Env): Promise<Response> {
  try {
    const raw = await env.ATMR_DROP_KV.get(`drop:${code}`);
    if (raw) {
      const drop: DropMetadata = JSON.parse(raw);
      for (const file of drop.files) {
        const count = file.chunkCount || 1;
        for (let i = 0; i < count; i++) {
          await env.ATMR_DROP_KV.delete(`file:${code}:${file.id}:chunk:${i}`);
        }
        await env.ATMR_DROP_KV.delete(`file:${code}:${file.id}`);
      }
    }
    await env.ATMR_DROP_KV.delete(`drop:${code}`);
    return jsonResponse({ success: true, message: `Drop ${code} deleted` });
  } catch (err: any) {
    return jsonResponse({ error: 'Failed to delete drop', details: err?.message || String(err) }, 500);
  }
}
