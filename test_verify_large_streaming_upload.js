const crypto = require('crypto');

const BASE_URL = 'http://127.0.0.1:8787';

async function runTest() {
  console.log('--- Testing Multi-Part Streaming Upload & Stitching ---');

  // Generate 25 MB dummy binary data (3 chunks: 10MB, 10MB, 5MB)
  const CHUNK_SIZE = 10 * 1024 * 1024;
  const TOTAL_SIZE = 25 * 1024 * 1024; // 25 MB
  console.log(`Generating test buffer of ${TOTAL_SIZE / (1024 * 1024)} MB...`);
  
  const testBuffer = Buffer.alloc(TOTAL_SIZE);
  for (let i = 0; i < TOTAL_SIZE; i += 1024) {
    testBuffer.write(`ATMR_DROP_CHUNK_TEST_OFFSET_${i}_`, i, 'utf-8');
  }

  const expectedHash = crypto.createHash('sha256').update(testBuffer).digest('hex');
  console.log(`Original SHA256: ${expectedHash}`);

  // Step 1: Create drop metadata
  const fileId = 'f_test_300mb_sim';
  const chunkCount = Math.ceil(TOTAL_SIZE / CHUNK_SIZE);
  console.log(`Chunk count: ${chunkCount}`);

  const metaRes = await fetch(`${BASE_URL}/api/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Testing large file multi-chunk upload',
      ttlSeconds: 600,
      burnAfterRead: false,
      files: [
        {
          id: fileId,
          name: 'autoclaw-1.17.2-setup.exe',
          type: 'application/x-msdownload',
          size: TOTAL_SIZE,
          chunkCount: chunkCount,
          chunkSize: CHUNK_SIZE
        }
      ]
    })
  });

  const metaData = await metaRes.json();
  console.log('Drop created:', metaData);
  if (!metaData.success || !metaData.code) {
    throw new Error('Drop creation failed: ' + JSON.stringify(metaData));
  }

  const code = metaData.code;

  // Step 2: Upload chunks
  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(TOTAL_SIZE, start + CHUNK_SIZE);
    const chunkBuffer = testBuffer.subarray(start, end);

    console.log(`Uploading chunk ${i + 1}/${chunkCount} (${chunkBuffer.length} bytes)...`);
    const uploadRes = await fetch(`${BASE_URL}/api/drop/${code}/file/${fileId}/chunk/${i}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: chunkBuffer
    });

    const uploadData = await uploadRes.json();
    console.log(`Chunk ${i} uploaded:`, uploadData);
    if (!uploadData.success) {
      throw new Error(`Chunk ${i} upload failed: ` + JSON.stringify(uploadData));
    }
  }

  // Step 3: Verify metadata retrieval
  console.log('Fetching drop manifest...');
  const dropRes = await fetch(`${BASE_URL}/api/drop/${code}?peek=true`);
  const dropData = await dropRes.json();
  console.log('Drop manifest:', dropData);
  if (!dropData.success || dropData.drop.files.length !== 1) {
    throw new Error('Invalid drop manifest');
  }

  // Step 4: Stream stitched file download
  console.log(`Streaming stitched file from ${BASE_URL}/api/file/${code}/${fileId}...`);
  const fileRes = await fetch(`${BASE_URL}/api/file/${code}/${fileId}`);
  console.log(`File download status: ${fileRes.status}, Content-Length: ${fileRes.headers.get('content-length')}`);

  const downloadedArrayBuffer = await fileRes.arrayBuffer();
  const downloadedBuffer = Buffer.from(downloadedArrayBuffer);
  console.log(`Downloaded ${downloadedBuffer.length} bytes (expected ${TOTAL_SIZE})`);

  if (downloadedBuffer.length !== TOTAL_SIZE) {
    throw new Error(`Downloaded length mismatch: got ${downloadedBuffer.length}, expected ${TOTAL_SIZE}`);
  }

  const downloadedHash = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
  console.log(`Downloaded SHA256: ${downloadedHash}`);

  if (downloadedHash !== expectedHash) {
    throw new Error(`SHA256 checksum mismatch! Corruption in chunk stitching.`);
  }

  console.log('✅ PERFECT MATCH! Multi-part streaming upload, chunk storage & streaming download fully verified!');

  // Clean up
  await fetch(`${BASE_URL}/api/drop/${code}`, { method: 'DELETE' });
  console.log('Cleaned up test drop.');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
