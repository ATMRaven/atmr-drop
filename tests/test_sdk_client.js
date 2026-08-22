const { AtmrDropClient } = require('../sdk/atmr-drop-client');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testSDK() {
  console.log('🚀 Running SDK Unit Tests...');
  const client = new AtmrDropClient({ baseUrl: 'http://127.0.0.1:8787' });

  // Test 1: Send text drop
  console.log('\n--- 1. Testing Text Drop Creation ---');
  const textDrop = await client.createDrop({
    text: 'Automated SDK Test Note 123',
    ttlSeconds: 600,
    burnAfterRead: false
  });
  console.log('Created Text Drop:', textDrop);
  assert(textDrop.success, 'Drop creation must succeed');
  assert(textDrop.code && textDrop.code.length === 4, 'PIN must be 4 characters');
  assert(textDrop.directUrl.includes(textDrop.code), 'Direct URL must include PIN');

  // Test 2: Retrieve text drop (peek mode)
  console.log('\n--- 2. Testing Text Drop Retrieval (Peek) ---');
  const retrieved = await client.getDrop(textDrop.code, { peek: true });
  console.log('Retrieved Drop:', retrieved);
  assert(retrieved.success, 'Retrieval must succeed');
  assert.strictEqual(retrieved.drop.text, 'Automated SDK Test Note 123');

  // Test 3: Send file drop with multi-part chunks
  console.log('\n--- 3. Testing Multi-File Drop Creation & Upload ---');
  const dummyFile1 = path.join(__dirname, 'temp_test_file1.txt');
  const dummyFile2 = path.join(__dirname, 'temp_test_file2.bin');
  fs.writeFileSync(dummyFile1, 'Hello world file content for SDK test');
  fs.writeFileSync(dummyFile2, Buffer.alloc(1024 * 150, 0x55)); // 150 KB binary file

  const fileDrop = await client.createDrop({
    text: 'Files attached drop',
    files: [dummyFile1, dummyFile2],
    ttlSeconds: 900
  });
  console.log('Created File Drop:', fileDrop);
  assert(fileDrop.success, 'File drop must succeed');
  assert.strictEqual(fileDrop.files.length, 2, 'Must have 2 files');

  // Test 4: Download all files from drop
  console.log('\n--- 4. Testing File Downloads ---');
  const downloadDir = path.join(__dirname, 'temp_downloads');
  if (fs.existsSync(downloadDir)) fs.rmSync(downloadDir, { recursive: true, force: true });
  fs.mkdirSync(downloadDir, { recursive: true });

  const downloadedFiles = await client.downloadAllFiles(fileDrop.code, downloadDir);
  console.log('Downloaded files:', downloadedFiles);
  assert.strictEqual(downloadedFiles.length, 2, 'Must download 2 files');
  assert(fs.existsSync(path.join(downloadDir, 'temp_test_file1.txt')), 'File 1 must exist on disk');
  assert(fs.existsSync(path.join(downloadDir, 'temp_test_file2.bin')), 'File 2 must exist on disk');
  assert.strictEqual(fs.readFileSync(path.join(downloadDir, 'temp_test_file1.txt'), 'utf8'), 'Hello world file content for SDK test');

  // Test 5: Check Status
  console.log('\n--- 5. Testing Status Check ---');
  const status = await client.checkStatus(fileDrop.code);
  console.log('Drop status:', status);
  assert.strictEqual(status.active, true);
  assert.strictEqual(status.fileCount, 2);

  // Test 6: Delete Drop
  console.log('\n--- 6. Testing Drop Deletion ---');
  const del = await client.deleteDrop(fileDrop.code);
  assert(del.success, 'Delete must succeed');

  const afterDel = await client.getDrop(fileDrop.code, { peek: true });
  assert.strictEqual(afterDel.success, false, 'Deleted drop should not be found');

  // Cleanup
  try {
    fs.unlinkSync(dummyFile1);
    fs.unlinkSync(dummyFile2);
    fs.rmSync(downloadDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n✨ ALL SDK TESTS PASSED SUCCESSFULLY!');
}

testSDK().catch(err => {
  console.error('❌ SDK test failed:', err);
  process.exit(1);
});
