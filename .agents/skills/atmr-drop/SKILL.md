---
name: atmr-drop
description: Cross-device ephemeral file, photo, text, and note sharing service powered by The Daily Drop (drop.atmr.workers.dev). Use whenever the user asks to send/share files, drop notes to their phone/computer, or whenever the user provides a 4-character PIN to download and inspect dropped assets.
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  tags: [file-transfer, drop, airdrop, webrtc, cloudflare, sharing, ephemeral]
---

# The Daily Drop Agent Skill (`atmr-drop`)

The Daily Drop is an ultra-fast cross-device sharing service hosted at `https://drop.atmr.workers.dev`.
It enables effortless bi-directional transfers using simple 4-character alphanumeric PINs (e.g. `3RFR`, `JYCS`).

---

## When to Use This Skill

### 1. Sending to the User (`Agent ➔ User`)
Trigger this skill whenever the user says:
- *"Send this file to my phone"*
- *"Drop this code/text so I can open it on my device"*
- *"Give me a drop link/PIN for this generated artifact"*
- *"Upload this image/report so I can scan it"*

**How to act:**
1. Call `drop_send_text` (for text notes, URLs, code snippets) or `drop_send_files` (for images, zip archives, documents, binaries).
2. Report the **4-character PIN** and **direct link** (`https://drop.atmr.workers.dev/<PIN>`) prominently to the user.

### 2. Receiving from the User (`User ➔ Agent`)
Trigger this skill whenever the user says:
- *"Here is the PIN: `3RFR`, check what's in it"*
- *"I dropped some files with code `ABCD`, download and read them"*
- *"Access my drop `#WXYZ`"*

**How to act:**
1. If the user sent a text note: Call `drop_receive_text` with the 4-character PIN.
2. If the user sent files: Call `drop_download_files` with the PIN and an `outputDirectory` (e.g. `./downloads` or active project subfolder), then inspect/read the downloaded files.

### 3. Checking Status or Deleting Drops
- Call `drop_check_status` with `pin` to inspect expiration time or see if a drop was picked up.
- Call `drop_delete` with `pin` if the user requests revoking or burning a drop.

---

## Available MCP Tools

| Tool | Purpose | Key Arguments |
|---|---|---|
| `drop_send_text` | Create a text/URL drop | `text` (required), `ttlMinutes` (default 15), `burnAfterRead` (default false), `customPin` (optional) |
| `drop_send_files` | Upload local disk files | `filePaths` (required array), `note` (optional), `ttlMinutes` (default 15), `burnAfterRead` (default false), `customPin` (optional) |
| `drop_receive_text` | Retrieve drop text & list files | `pin` (required 4-char string), `peek` (optional boolean, default false) |
| `drop_download_files` | Download all files from drop to local disk | `pin` (required), `outputDirectory` (optional path) |
| `drop_check_status` | Check if drop is active, remaining time & pickup state | `pin` (required) |
| `drop_delete` | Permanently burn/delete drop from server | `pin` (required) |

---

## CLI Alternative (Terminal)

You can also run the CLI directly via `node Z:\code\vibe code\uploader\bin\drop-cli.js`:
```bash
# Send text
node "Z:\code\vibe code\uploader\bin\drop-cli.js" send -t "Hello World" --ttl 15

# Send files
node "Z:\code\vibe code\uploader\bin\drop-cli.js" send path/to/file1.png path/to/file2.pdf

# Receive drop
node "Z:\code\vibe code\uploader\bin\drop-cli.js" get 3RFR --out ./downloads

# Check status
node "Z:\code\vibe code\uploader\bin\drop-cli.js" status 3RFR

# Delete drop
node "Z:\code\vibe code\uploader\bin\drop-cli.js" delete 3RFR
```
