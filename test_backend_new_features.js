const assert = require('assert');

async function testBackend() {
  console.log('Testing custom PIN reservation & duplicate prevention...');
  
  // 1. Create drop with custom 4-character PIN
  const customPin = 'TEST';
  const createRes1 = await fetch('http://127.0.0.1:8787/api/drop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customPin,
      text: 'Secret LAN and E2EE payload',
      isEncrypted: true,
      ttlSeconds: 300,
    }),
  });
  const data1 = await createRes1.json();
  console.log('Custom PIN creation response:', data1);
  assert.strictEqual(data1.success, true);
  assert.strictEqual(data1.code, customPin);
  assert.strictEqual(data1.isEncrypted, true);

  // 2. Attempt duplicate custom PIN -> should return 409 Conflict
  const createRes2 = await fetch('http://127.0.0.1:8787/api/drop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customPin,
      text: 'Second drop with same PIN',
    }),
  });
  assert.strictEqual(createRes2.status, 409);
  const data2 = await createRes2.json();
  console.log('Duplicate PIN 409 response:', data2);
  assert(data2.error.includes('already taken'));

  // 3. Test WebRTC Signaling Exchange
  console.log('Testing WebRTC signaling pipeline...');
  // Receiver sends offer
  const sendSigRes = await fetch(`http://127.0.0.1:8787/api/webrtc/${customPin}/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'receiver',
      type: 'offer',
      payload: { sdp: 'v=0\r\no=- 1234 2 IN IP4 127.0.0.1...' },
    }),
  });
  const sendSigData = await sendSigRes.json();
  console.log('Receiver sent offer:', sendSigData);
  assert.strictEqual(sendSigData.success, true);

  // Sender polls for signals
  const pollSigRes = await fetch(`http://127.0.0.1:8787/api/webrtc/${customPin}/signal?for=sender`);
  const pollSigData = await pollSigRes.json();
  console.log('Sender polled signals:', pollSigData);
  assert.strictEqual(pollSigData.success, true);
  assert.strictEqual(pollSigData.signals.length, 1);
  assert.strictEqual(pollSigData.signals[0].type, 'offer');

  // Sender sends answer
  await fetch(`http://127.0.0.1:8787/api/webrtc/${customPin}/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'sender',
      type: 'answer',
      payload: { sdp: 'v=0\r\no=- 5678 2 IN IP4 127.0.0.1...' },
    }),
  });

  // Receiver polls for answer
  const pollAnsRes = await fetch(`http://127.0.0.1:8787/api/webrtc/${customPin}/signal?for=receiver`);
  const pollAnsData = await pollAnsRes.json();
  console.log('Receiver polled answer:', pollAnsData);
  assert.strictEqual(pollAnsData.success, true);
  assert.strictEqual(pollAnsData.signals.length, 1);
  assert.strictEqual(pollAnsData.signals[0].type, 'answer');

  // 4. Test Drop Deletion / Instant Revocation
  console.log('Testing instant drop deletion/revocation...');
  const delRes = await fetch(`http://127.0.0.1:8787/api/drop/${customPin}`, {
    method: 'DELETE',
  });
  const delData = await delRes.json();
  console.log('Delete response:', delData);
  assert.strictEqual(delData.success, true);

  // Verify drop is gone
  const getRes = await fetch(`http://127.0.0.1:8787/api/drop/${customPin}`);
  assert.strictEqual(getRes.status, 404);

  console.log('✅ All backend tests for WebRTC signaling, custom PINs, and drop revocation PASSED!');
}

testBackend().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
