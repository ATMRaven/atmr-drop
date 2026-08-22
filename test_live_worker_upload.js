async function testLiveWorker() {
  console.log('🌐 Testing Live Cloudflare Worker (https://drop.atmr.workers.dev)...');

  // 1. Text drop
  console.log('1. Testing POST /api/drop with text...');
  const res1 = await fetch('https://drop.atmr.workers.dev/api/drop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Live test text note',
      ttlSeconds: 300,
    })
  });
  const data1 = await res1.json();
  console.log('Response 1:', res1.status, data1);

  // 2. File drop with chunk upload
  console.log('2. Testing POST /api/drop with file manifest...');
  const fileId = 'f_test_' + Date.now();
  const fileBytes = new Uint8Array(1024 * 100); // 100 KB
  fileBytes.fill(65);

  const res2 = await fetch('https://drop.atmr.workers.dev/api/drop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'File drop live test',
      ttlSeconds: 300,
      files: [{
        id: fileId,
        name: 'test_file.bin',
        path: '',
        type: 'application/octet-stream',
        size: fileBytes.byteLength,
        chunkCount: 1,
        chunkSize: 10 * 1024 * 1024
      }]
    })
  });
  const data2 = await res2.json();
  console.log('Response 2 (Create Drop):', res2.status, data2);

  if (!data2.code) {
    throw new Error('Failed to create drop on live worker');
  }

  // 3. Upload chunk
  console.log(`3. Testing PUT /api/drop/${data2.code}/file/${fileId}/chunk/0...`);
  const res3 = await fetch(`https://drop.atmr.workers.dev/api/drop/${data2.code}/file/${fileId}/chunk/0`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: fileBytes
  });
  const data3 = await res3.json();
  console.log('Response 3 (Upload Chunk):', res3.status, data3);

  // 4. Download file
  console.log(`4. Testing GET /api/file/${data2.code}/${fileId}...`);
  const res4 = await fetch(`https://drop.atmr.workers.dev/api/file/${data2.code}/${fileId}`);
  const downloadedBuf = await res4.arrayBuffer();
  console.log('Response 4 (Download File):', res4.status, 'Downloaded bytes:', downloadedBuf.byteLength);

  if (downloadedBuf.byteLength !== fileBytes.byteLength) {
    throw new Error(`Size mismatch: expected ${fileBytes.byteLength}, got ${downloadedBuf.byteLength}`);
  }

  console.log('✅ Live Worker backend API is completely operational!');
}

testLiveWorker().catch(err => {
  console.error('❌ Live Worker test failed:', err);
  process.exit(1);
});
