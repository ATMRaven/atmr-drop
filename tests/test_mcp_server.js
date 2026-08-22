const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

async function testMCPServer() {
  console.log('🚀 Running MCP Server Protocol Integration Tests (Text & Files)...');
  const serverScript = path.join(__dirname, '..', 'mcp-server', 'index.js');

  const proc = spawn('node', [serverScript], {
    env: Object.assign({}, process.env, { ATMR_DROP_BASE_URL: 'http://127.0.0.1:8787' }),
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const rl = readline.createInterface({ input: proc.stdout, terminal: false });

  let nextId = 1;
  const pendingRequests = new Map();

  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.id && pendingRequests.has(msg.id)) {
        const { resolve, reject } = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    } catch (e) {}
  });

  function sendRPC(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pendingRequests.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  // 1. Initialize
  console.log('\n--- 1. Testing initialize ---');
  const initResult = await sendRPC('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });
  console.log('Server info:', initResult.serverInfo);
  assert.strictEqual(initResult.serverInfo.name, 'atmr-drop');

  // 2. List Tools
  console.log('\n--- 2. Testing tools/list ---');
  const listResult = await sendRPC('tools/list');
  console.log(`Discovered ${listResult.tools.length} MCP tools:`, listResult.tools.map(t => t.name));
  assert.strictEqual(listResult.tools.length, 6, 'Must expose 6 MCP tools');

  // 3. Call drop_send_text
  console.log('\n--- 3. Testing drop_send_text ---');
  const sendResult = await sendRPC('tools/call', {
    name: 'drop_send_text',
    arguments: {
      text: 'MCP Integration Text Payload 999',
      ttlMinutes: 20
    }
  });
  const textOut = sendResult.content[0].text;
  const pinMatch = textOut.match(/PIN\*\*:\s*`([A-Z0-9]{4})`/);
  assert(pinMatch, 'Must match 4-char PIN');
  const pin1 = pinMatch[1];
  console.log('Created Drop PIN 1:', pin1);

  // 4. Call drop_send_files
  console.log('\n--- 4. Testing drop_send_files ---');
  const tempFile = path.join(__dirname, 'temp_mcp_asset.txt');
  fs.writeFileSync(tempFile, 'MCP File Content Verification 2026');

  const sendFilesResult = await sendRPC('tools/call', {
    name: 'drop_send_files',
    arguments: {
      filePaths: [tempFile],
      note: 'Here is your requested asset file',
      ttlMinutes: 15
    }
  });
  console.log('File Drop Result:\n', sendFilesResult.content[0].text);
  const pinMatch2 = sendFilesResult.content[0].text.match(/PIN\*\*:\s*`([A-Z0-9]{4})`/);
  assert(pinMatch2, 'Must match 4-char PIN for file drop');
  const pin2 = pinMatch2[1];
  console.log('Created File Drop PIN 2:', pin2);

  // 5. Call drop_download_files
  console.log('\n--- 5. Testing drop_download_files ---');
  const mcpDownloadDir = path.join(__dirname, 'temp_mcp_downloads');
  if (fs.existsSync(mcpDownloadDir)) fs.rmSync(mcpDownloadDir, { recursive: true, force: true });
  fs.mkdirSync(mcpDownloadDir, { recursive: true });

  const dlResult = await sendRPC('tools/call', {
    name: 'drop_download_files',
    arguments: {
      pin: pin2,
      outputDirectory: mcpDownloadDir
    }
  });
  console.log('Download Result:\n', dlResult.content[0].text);
  assert(fs.existsSync(path.join(mcpDownloadDir, 'temp_mcp_asset.txt')), 'Downloaded file must exist');
  assert.strictEqual(fs.readFileSync(path.join(mcpDownloadDir, 'temp_mcp_asset.txt'), 'utf8'), 'MCP File Content Verification 2026');

  // 6. Delete both drops
  await sendRPC('tools/call', { name: 'drop_delete', arguments: { pin: pin1 } });
  await sendRPC('tools/call', { name: 'drop_delete', arguments: { pin: pin2 } });

  proc.kill();
  try {
    fs.unlinkSync(tempFile);
    fs.rmSync(mcpDownloadDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n✨ ALL MCP SERVER INTEGRATION TESTS (TEXT + FILES) PASSED 100%!');
}

testMCPServer().catch(err => {
  console.error('❌ MCP test failed:', err);
  process.exit(1);
});
