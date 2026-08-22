const { AtmrDropClient } = require('../sdk/atmr-drop-client');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const readline = require('readline');

async function testLiveProduction() {
  console.log('🌐 Running Live End-to-End Test against https://drop.atmr.workers.dev...');

  const client = new AtmrDropClient({ baseUrl: 'https://drop.atmr.workers.dev' });

  // 1. Send live drop with SDK
  const dummyFilePath = path.join(__dirname, 'live_production_test.txt');
  fs.writeFileSync(dummyFilePath, 'The Daily Drop Production Verification ' + new Date().toISOString());

  console.log('\n--- 1. Creating Drop on Production Worker ---');
  const drop = await client.createDrop({
    text: 'Live E2E Verification Note via MCP API',
    files: [dummyFilePath],
    ttlSeconds: 600
  });

  console.log('Live Drop Created:', drop);
  assert(drop.success && drop.code.length === 4);

  // 2. Retrieve drop with MCP Server over Stdio
  console.log('\n--- 2. Retrieving Drop via MCP Server Stdio JSON-RPC ---');
  const serverScript = path.join(__dirname, '..', 'mcp-server', 'index.js');
  const proc = spawn('node', [serverScript], {
    env: Object.assign({}, process.env, { ATMR_DROP_BASE_URL: 'https://drop.atmr.workers.dev' }),
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

  // Initialize MCP
  await sendRPC('initialize', { protocolVersion: '2024-11-05', capabilities: {} });

  // Call drop_receive_text
  const receiveResult = await sendRPC('tools/call', {
    name: 'drop_receive_text',
    arguments: { pin: drop.code, peek: true }
  });
  console.log('MCP receive output:\n', receiveResult.content[0].text);
  assert(receiveResult.content[0].text.includes('Live E2E Verification Note'));

  // Call drop_download_files
  const outDir = path.join(__dirname, 'temp_live_downloads');
  const dlResult = await sendRPC('tools/call', {
    name: 'drop_download_files',
    arguments: { pin: drop.code, outputDirectory: outDir }
  });
  console.log('MCP download output:\n', dlResult.content[0].text);
  assert(fs.existsSync(path.join(outDir, 'live_production_test.txt')));

  // Call drop_delete
  console.log('\n--- 3. Deleting Drop via MCP Server ---');
  const delResult = await sendRPC('tools/call', {
    name: 'drop_delete',
    arguments: { pin: drop.code }
  });
  console.log('MCP delete output:\n', delResult.content[0].text);

  proc.kill();
  try {
    fs.unlinkSync(dummyFilePath);
    fs.rmSync(outDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n🎉 PRODUCTION LIVE END-TO-END VERIFICATION SUCCEEDED 100%!');
}

testLiveProduction().catch(err => {
  console.error('❌ Production live test failed:', err);
  process.exit(1);
});
