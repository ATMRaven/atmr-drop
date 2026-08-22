#!/usr/bin/env node

/**
 * The Daily Drop CLI
 * Fast command-line interface for drop.atmr.workers.dev
 */

const path = require('path');
const fs = require('fs');
const { AtmrDropClient } = require('../sdk/atmr-drop-client');

const client = new AtmrDropClient();

function printHelp() {
  console.log(`
\x1b[1m\x1b[36mThe Daily Drop CLI\x1b[0m (drop.atmr.workers.dev)

\x1b[1mUSAGE:\x1b[0m
  drop send [files...] [-t <text>] [--ttl <minutes>] [--burn] [--pin <PIN>]
  drop get <PIN> [--out <dir>] [--peek]
  drop status <PIN>
  drop delete <PIN>

\x1b[1mCOMMANDS:\x1b[0m
  \x1b[32msend\x1b[0m     Create a new drop with files, text, notes, or links
  \x1b[32mget\x1b[0m      Retrieve drop text and download all attached files
  \x1b[32mstatus\x1b[0m   Check drop active status, expiry, and pickup state
  \x1b[32mdelete\x1b[0m   Permanently revoke and delete a drop by PIN

\x1b[1mOPTIONS:\x1b[0m
  -t, --text <string>       Text note or link to include in drop
  --ttl <minutes>           Expiration in minutes (default: 15)
  --burn                    Burn-after-reading (self-destruct on download)
  --pin <PIN>               Request a specific 4-character PIN
  --out <dir>               Target directory for downloaded files (default: ./)
  --peek                    Inspect without triggering burn-after-reading
  -h, --help                Show this help message
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const command = args[0].toLowerCase();

  try {
    if (command === 'send') {
      let text = '';
      let ttlMinutes = 15;
      let burnAfterRead = false;
      let customPin = undefined;
      const files = [];

      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-t' || arg === '--text') {
          text = args[++i] || '';
        } else if (arg === '--ttl') {
          ttlMinutes = parseInt(args[++i], 10) || 15;
        } else if (arg === '--burn') {
          burnAfterRead = true;
        } else if (arg === '--pin') {
          customPin = args[++i];
        } else if (!arg.startsWith('-')) {
          files.push(arg);
        }
      }

      if (!text && files.length === 0) {
        console.error('\x1b[31mError:\x1b[0m Please provide text (-t "...") or at least one file path.');
        process.exit(1);
      }

      console.log('🚀 Creating drop...');
      const drop = await client.createDrop({
        text,
        files,
        ttlSeconds: ttlMinutes * 60,
        burnAfterRead,
        customPin,
        onProgress: (p) => {
          process.stdout.write(`\rUploading ${p.fileName}: chunk ${p.chunkIndex + 1}/${p.totalChunks} (${p.percent}%)`);
        }
      });

      if (files.length > 0) console.log('');
      console.log(`\n\x1b[32m✨ Drop Created Successfully!\x1b[0m`);
      console.log(`\x1b[1mPIN:\x1b[0m        \x1b[36m${drop.code}\x1b[0m`);
      console.log(`\x1b[1mDirect URL:\x1b[0m ${drop.directUrl}`);
      console.log(`\x1b[1mExpires in:\x1b[0m ${ttlMinutes} minutes`);
      if (drop.burnAfterRead) console.log(`\x1b[33m🔥 Burn-after-reading enabled\x1b[0m`);
      if (drop.files.length > 0) {
        console.log(`\x1b[1mFiles (${drop.files.length}):\x1b[0m`);
        drop.files.forEach(f => console.log(`  • ${f.name} (${formatBytes(f.size)})`));
      }

    } else if (command === 'get') {
      const pin = args[1];
      if (!pin || pin.startsWith('-')) {
        console.error('\x1b[31mError:\x1b[0m Please provide a 4-character PIN.');
        process.exit(1);
      }

      let outDir = './';
      let peek = false;

      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--out' || args[i] === '-o') {
          outDir = args[++i] || './';
        } else if (args[i] === '--peek') {
          peek = true;
        }
      }

      console.log(`🔍 Retrieving drop #${pin.toUpperCase()}...`);
      const res = await client.getDrop(pin, { peek });

      if (!res.success || !res.drop) {
        console.error(`\x1b[31mError:\x1b[0m ${res.error || 'Drop not found or expired'}`);
        process.exit(1);
      }

      const drop = res.drop;
      console.log(`\n\x1b[32m🔓 Drop #${drop.code} Retrieved!\x1b[0m`);
      if (drop.text) {
        console.log(`\n\x1b[1mText Note:\x1b[0m\n${drop.text}\n`);
      }

      if (drop.files && drop.files.length > 0) {
        console.log(`\x1b[1mDownloading ${drop.files.length} attached file(s) to ${outDir}...\x1b[0m`);
        const downloaded = await client.downloadAllFiles(drop.code, outDir);
        downloaded.forEach(f => console.log(`  ✓ Saved ${f.name} -> ${f.path} (${formatBytes(f.size)})`));
      }

    } else if (command === 'status') {
      const pin = args[1];
      if (!pin) {
        console.error('\x1b[31mError:\x1b[0m Please provide a 4-character PIN.');
        process.exit(1);
      }

      const status = await client.checkStatus(pin);
      if (!status.active) {
        console.log(`Drop #${pin.toUpperCase()}: \x1b[31mEXPIRED OR NOT FOUND\x1b[0m`);
      } else {
        console.log(`\x1b[32mDrop #${status.code} is ACTIVE\x1b[0m`);
        console.log(`  Remaining Time: ${Math.floor(status.remainingSeconds / 60)}m ${status.remainingSeconds % 60}s`);
        console.log(`  Picked Up:      ${status.pickedUp ? 'Yes 🎉' : 'No'}`);
        console.log(`  Burn on Read:   ${status.burnAfterRead ? 'Yes 🔥' : 'No'}`);
        console.log(`  Files:          ${status.fileCount}`);
        if (status.files) {
          status.files.forEach(f => console.log(`    • ${f.name} (${formatBytes(f.size)})`));
        }
      }

    } else if (command === 'delete') {
      const pin = args[1];
      if (!pin) {
        console.error('\x1b[31mError:\x1b[0m Please provide a 4-character PIN.');
        process.exit(1);
      }

      const res = await client.deleteDrop(pin);
      if (res.success) {
        console.log(`\x1b[32m✓ Drop #${pin.toUpperCase()} permanently deleted from server\x1b[0m`);
      } else {
        console.error(`\x1b[31mError:\x1b[0m ${res.error}`);
      }

    } else {
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
    }
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

main();
