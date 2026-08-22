const { execSync } = require('child_process');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function testCLI() {
  console.log('🚀 Running CLI Automated Tests...');
  const cliPath = path.join(__dirname, '..', 'bin', 'drop-cli.js');

  // Test 1: Send Text via CLI
  console.log('\n--- 1. Testing drop send (text) ---');
  const rawSendOutput = execSync(`node "${cliPath}" send -t "CLI Test Drop Message" --ttl 10`, {
    env: Object.assign({}, process.env, { ATMR_DROP_BASE_URL: 'http://127.0.0.1:8787' })
  }).toString();

  const sendTextOutput = stripAnsi(rawSendOutput);
  console.log(sendTextOutput);
  assert(sendTextOutput.includes('PIN:'), 'Must output PIN');
  const pinMatch = sendTextOutput.match(/PIN:\s*([A-Z0-9]{4})/);
  assert(pinMatch, 'Must find 4-char PIN');
  const pin = pinMatch[1];
  console.log('Extracted PIN:', pin);

  // Test 2: Check Status via CLI
  console.log('\n--- 2. Testing drop status ---');
  const statusOutput = stripAnsi(execSync(`node "${cliPath}" status ${pin}`, {
    env: Object.assign({}, process.env, { ATMR_DROP_BASE_URL: 'http://127.0.0.1:8787' })
  }).toString());
  console.log(statusOutput);
  assert(statusOutput.includes('ACTIVE'), 'Status must be active');

  // Test 3: Get Drop via CLI
  console.log('\n--- 3. Testing drop get ---');
  const getOutput = stripAnsi(execSync(`node "${cliPath}" get ${pin} --peek`, {
    env: Object.assign({}, process.env, { ATMR_DROP_BASE_URL: 'http://127.0.0.1:8787' })
  }).toString());
  console.log(getOutput);
  assert(getOutput.includes('CLI Test Drop Message'), 'Must retrieve text');

  // Test 4: Delete Drop via CLI
  console.log('\n--- 4. Testing drop delete ---');
  const delOutput = stripAnsi(execSync(`node "${cliPath}" delete ${pin}`, {
    env: Object.assign({}, process.env, { ATMR_DROP_BASE_URL: 'http://127.0.0.1:8787' })
  }).toString());
  console.log(delOutput);
  assert(delOutput.includes('deleted'), 'Must confirm deletion');

  console.log('\n✨ ALL CLI TESTS PASSED CLEANLY!');
}

testCLI();
