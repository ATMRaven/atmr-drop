import { DropMetadata, FileEntry, CreateDropRequest, Env } from './types';

// Helper to generate a 4-digit numeric PIN or 4-char alphanumeric
function generatePin(length = 4): string {
  const digits = '0123456789';
  let pin = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    pin += digits[array[i] % digits.length];
  }
  return pin;
}

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// Convert base64 data URL or raw base64 to Uint8Array
function base64ToUint8Array(base64Str: string): Uint8Array {
  const cleanBase64 = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// CORS headers
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, X-Action',
  'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Content-Type',
};

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
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

    // Version check endpoint
    if (pathname === '/api/version') {
      try {
        const ghRes = await fetch('https://api.github.com/repos/ATMRaven/atmr-drop/releases/latest', {
          headers: { 'User-Agent': 'atmr-drop-worker' },
        });
        if (ghRes.ok) {
          const ghData: any = await ghRes.json();
          const tag = (ghData.tag_name || '').replace(/^v/, '').trim();
          let cleanNotes = ghData.body || '';
          if (cleanNotes.includes('The Daily Drop') || cleanNotes.includes('Published by')) {
            cleanNotes = '• Real-time in-app direct APK streaming downloader with live progress bar\n• Real-time upload status bar with speed & byte tracking\n• Instant drop pickup detection, audio chime & push notifications\n• Smart 1-hour expiration cap for files > 1 GB & 10 GB capacity\n• Performance optimizations and bug fixes';
          }
          return jsonResponse({
            version: tag,
            downloadUrl: ghData.assets?.[0]?.browser_download_url || 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk',
            releasePage: ghData.html_url || 'https://github.com/ATMRaven/atmr-drop/releases/latest',
            mandatory: false,
            releaseNotes: cleanNotes || 'Performance enhancements and bug fixes.',
          });
        }
      } catch (e) {}

      return jsonResponse({
        version: '1.0.20',
        downloadUrl: 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk',
        releasePage: 'https://github.com/ATMRaven/atmr-drop/releases/latest',
        mandatory: false,
        releaseNotes: '• Real-time in-app direct APK streaming downloader with live progress bar\n• Real-time upload status bar with speed & byte tracking\n• Instant drop pickup detection, audio chime & push notifications\n• Smart 1-hour expiration cap for files > 1 GB & 10 GB capacity\n• Performance optimizations and bug fixes',
      });
    }

    // API Index / Discovery endpoint
    if (pathname === '/api' || pathname === '/api/') {
      return jsonResponse({
        service: 'THE DAILY DROP API',
        version: '1.0.0',
        creator: 'atmr',
        endpoints: {
          'POST /api/drop': 'Create a new encrypted wire drop (text, files, dynamic TTL 60-86400s, burnAfterRead)',
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
      // Serve the SPA root page so client-side routing receives the drop code from window.location.pathname
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

    // Find an available unique 4-digit PIN
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
      // Fallback to 5-digit PIN
      code = generatePin(5);
    }

    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    const fileEntries: FileEntry[] = [];

    // Store files into R2 if available, or KV as fallback
    for (const f of body.files || []) {
      const fileId = generateId();
      const fileBytes = base64ToUint8Array(f.dataBase64);
      const kvKey = `file:${code}:${fileId}`;
      const r2Key = `drops/${code}/${fileId}`;

      if (env.ATMR_DROP_R2) {
        // Stream directly to R2
        await env.ATMR_DROP_R2.put(r2Key, fileBytes, {
          httpMetadata: {
            contentType: f.type || 'application/octet-stream',
          },
          customMetadata: {
            name: f.name,
            size: f.size.toString(),
          },
        });
      } else {
        // Store in KV
        await env.ATMR_DROP_KV.put(kvKey, fileBytes, {
          expirationTtl: ttlSeconds,
          metadata: {
            name: f.name,
            type: f.type || 'application/octet-stream',
            size: f.size,
          },
        });
      }

      fileEntries.push({
        id: fileId,
        name: f.name,
        size: f.size,
        type: f.type || 'application/octet-stream',
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
      // Already expired
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

// Handler: Stream File (R2 or KV)
async function handleGetFile(code: string, fileId: string, isDownload: boolean, env: Env): Promise<Response> {
  try {
    if (!code || !fileId) {
      return jsonResponse({ error: 'Missing code or file ID' }, 400);
    }

    const r2Key = `drops/${code}/${fileId}`;
    const kvKey = `file:${code}:${fileId}`;

    // Try R2 first
    if (env.ATMR_DROP_R2) {
      const r2Object = await env.ATMR_DROP_R2.get(r2Key);
      if (r2Object) {
        const meta = r2Object.customMetadata || {};
        const rawName = meta.name || `file-${fileId}`;
        const safeAsciiName = rawName.replace(/["\r\n\\]/g, '_');
        const encodedUtf8Name = encodeURIComponent(rawName);
        const contentType = r2Object.httpMetadata?.contentType || 'application/octet-stream';
        const dispositionType = isDownload ? 'attachment' : 'inline';

        return new Response(r2Object.body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `${dispositionType}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUtf8Name}`,
            'Content-Length': r2Object.size.toString(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            ...corsHeaders,
          },
        });
      }
    }

    // Fallback to KV
    const fileResult = await env.ATMR_DROP_KV.getWithMetadata<{ name: string; type: string; size: number }>(kvKey, {
      type: 'arrayBuffer',
    });

    if (!fileResult.value) {
      return jsonResponse({ error: 'File not found or expired' }, 404);
    }

    const meta = fileResult.metadata || { name: `file-${fileId}`, type: 'application/octet-stream', size: 0 };
    const rawName = meta.name || `file-${fileId}`;
    const safeAsciiName = rawName.replace(/["\r\n\\]/g, '_');
    const encodedUtf8Name = encodeURIComponent(rawName);
    const contentType = meta.type || 'application/octet-stream';
    const dispositionType = isDownload ? 'attachment' : 'inline';

    return new Response(fileResult.value, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${dispositionType}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedUtf8Name}`,
        'Content-Length': fileResult.value.byteLength.toString(),
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
        if (env.ATMR_DROP_R2) {
          await env.ATMR_DROP_R2.delete(`drops/${code}/${file.id}`);
        }
        await env.ATMR_DROP_KV.delete(file.kvKey);
      }
    }
    await env.ATMR_DROP_KV.delete(`drop:${code}`);
    return jsonResponse({ success: true, message: `Drop ${code} deleted` });
  } catch (err: any) {
    return jsonResponse({ error: 'Failed to delete drop', details: err?.message || String(err) }, 500);
  }
}
