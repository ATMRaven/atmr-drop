/**
 * The Daily Drop - MCP Tool Definitions & Handlers
 */

const path = require('path');
const fs = require('fs');
const { AtmrDropClient } = require('../sdk/atmr-drop-client');

const client = new AtmrDropClient();

const TOOL_DEFINITIONS = [
  {
    name: 'drop_send_text',
    description: 'Create a new drop containing a text note, code snippet, URL, or message, returning a 4-character PIN and direct link.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text content, message, code snippet, or URL to drop.'
        },
        ttlMinutes: {
          type: 'number',
          description: 'Expiration in minutes (e.g. 15, 60, 1440). Defaults to 15.',
          default: 15
        },
        burnAfterRead: {
          type: 'boolean',
          description: 'Whether the drop should self-destruct immediately after first retrieval. Defaults to false.',
          default: false
        },
        customPin: {
          type: 'string',
          description: 'Optional custom 4-character alphanumeric PIN (e.g. "CODE", "A7X9").'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'drop_send_files',
    description: 'Upload one or multiple local files to The Daily Drop, returning a 4-character PIN and direct download link.',
    inputSchema: {
      type: 'object',
      properties: {
        filePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of local file paths on disk to upload and share.'
        },
        note: {
          type: 'string',
          description: 'Optional text note or description attached with the files.'
        },
        ttlMinutes: {
          type: 'number',
          description: 'Expiration in minutes (default: 15).',
          default: 15
        },
        burnAfterRead: {
          type: 'boolean',
          description: 'Whether the drop should self-destruct after first download. Defaults to false.',
          default: false
        },
        customPin: {
          type: 'string',
          description: 'Optional custom 4-character alphanumeric PIN.'
        }
      },
      required: ['filePaths']
    }
  },
  {
    name: 'drop_receive_text',
    description: 'Retrieve the text note, link, or file list from a drop using its 4-character PIN.',
    inputSchema: {
      type: 'object',
      properties: {
        pin: {
          type: 'string',
          description: 'The 4-character alphanumeric PIN (e.g. "3RFR").'
        },
        peek: {
          type: 'boolean',
          description: 'If true, inspects the drop without triggering burn-after-reading destruction. Defaults to false.',
          default: false
        }
      },
      required: ['pin']
    }
  },
  {
    name: 'drop_download_files',
    description: 'Download all files from a drop into a local directory using its 4-character PIN.',
    inputSchema: {
      type: 'object',
      properties: {
        pin: {
          type: 'string',
          description: 'The 4-character alphanumeric PIN.'
        },
        outputDirectory: {
          type: 'string',
          description: 'The target directory on disk to save downloaded files. Defaults to "./downloads".'
        }
      },
      required: ['pin']
    }
  },
  {
    name: 'drop_check_status',
    description: 'Check whether a drop is active, expired, or picked up without consuming or burning it.',
    inputSchema: {
      type: 'object',
      properties: {
        pin: {
          type: 'string',
          description: 'The 4-character alphanumeric PIN.'
        }
      },
      required: ['pin']
    }
  },
  {
    name: 'drop_delete',
    description: 'Permanently revoke and delete a drop from the server using its 4-character PIN.',
    inputSchema: {
      type: 'object',
      properties: {
        pin: {
          type: 'string',
          description: 'The 4-character alphanumeric PIN to delete.'
        }
      },
      required: ['pin']
    }
  }
];

async function handleToolCall(name, args = {}) {
  switch (name) {
    case 'drop_send_text': {
      const { text, ttlMinutes = 15, burnAfterRead = false, customPin } = args;
      if (!text) throw new Error('Missing required parameter: text');
      
      const drop = await client.createDrop({
        text,
        ttlSeconds: (parseInt(ttlMinutes, 10) || 15) * 60,
        burnAfterRead: Boolean(burnAfterRead),
        customPin
      });

      return {
        content: [
          {
            type: 'text',
            text: `### ✨ Drop Created Successfully!\n\n- **PIN**: \`${drop.code}\`\n- **Direct Link**: [${drop.directUrl}](${drop.directUrl})\n- **Expires In**: ${ttlMinutes} minutes\n- **Burn After Reading**: ${drop.burnAfterRead ? 'Yes 🔥' : 'No'}\n\n**Payload Summary**:\n\`\`\`\n${text}\n\`\`\``
          }
        ]
      };
    }

    case 'drop_send_files': {
      const { filePaths = [], note = '', ttlMinutes = 15, burnAfterRead = false, customPin } = args;
      if (!Array.isArray(filePaths) || filePaths.length === 0) {
        throw new Error('filePaths must be a non-empty array of file paths.');
      }

      const drop = await client.createDrop({
        text: note,
        files: filePaths,
        ttlSeconds: (parseInt(ttlMinutes, 10) || 15) * 60,
        burnAfterRead: Boolean(burnAfterRead),
        customPin
      });

      const fileListStr = drop.files.map(f => `  • **${f.name}** (${formatBytes(f.size)})`).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `### 📦 Files Dropped Successfully!\n\n- **PIN**: \`${drop.code}\`\n- **Direct Link**: [${drop.directUrl}](${drop.directUrl})\n- **Expires In**: ${ttlMinutes} minutes\n- **Burn After Reading**: ${drop.burnAfterRead ? 'Yes 🔥' : 'No'}\n- **Files (${drop.files.length})**:\n${fileListStr}${note ? `\n\n**Attached Note**:\n${note}` : ''}`
          }
        ]
      };
    }

    case 'drop_receive_text': {
      const { pin, peek = false } = args;
      if (!pin) throw new Error('Missing required parameter: pin');

      const res = await client.getDrop(pin, { peek });
      if (!res.success || !res.drop) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Drop \`#${pin.toUpperCase()}\` was not found or has already expired/burned.`
            }
          ]
        };
      }

      const drop = res.drop;
      const fileLines = (drop.files || []).map(f => `  • ${f.name} (${formatBytes(f.size)})`).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `### 🔓 Drop #${drop.code} Content\n\n- **Status**: ${drop.remainingSeconds > 0 ? 'Active' : 'Expired'}\n- **Time Remaining**: ${Math.floor(drop.remainingSeconds / 60)}m ${drop.remainingSeconds % 60}s\n- **Burn on Read**: ${drop.burnAfterRead ? 'Yes' : 'No'}\n\n${drop.text ? `**Text / Note**:\n\`\`\`\n${drop.text}\n\`\`\`\n` : ''}${drop.files?.length > 0 ? `**Attached Files (${drop.files.length})**:\n${fileLines}\n*(Use \`drop_download_files\` to save them to disk)*` : ''}`
          }
        ]
      };
    }

    case 'drop_download_files': {
      const { pin, outputDirectory = './downloads' } = args;
      if (!pin) throw new Error('Missing required parameter: pin');

      const downloaded = await client.downloadAllFiles(pin, outputDirectory);
      if (downloaded.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No files attached to Drop \`#${pin.toUpperCase()}\`.`
            }
          ]
        };
      }

      const listStr = downloaded.map(f => `  ✓ **${f.name}** -> \`${f.path}\` (${formatBytes(f.size)})`).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `### 📥 Files Downloaded Successfully!\n\nDownloaded ${downloaded.length} file(s) from Drop \`#${pin.toUpperCase()}\` to \`${path.resolve(outputDirectory)}\`:\n\n${listStr}`
          }
        ]
      };
    }

    case 'drop_check_status': {
      const { pin } = args;
      if (!pin) throw new Error('Missing required parameter: pin');

      const status = await client.checkStatus(pin);
      if (!status.active) {
        return {
          content: [
            {
              type: 'text',
              text: `Drop \`#${pin.toUpperCase()}\`: **EXPIRED OR NOT FOUND**`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `### ℹ️ Drop #${status.code} Status\n\n- **State**: 🟢 Active\n- **Remaining Time**: ${Math.floor(status.remainingSeconds / 60)}m ${status.remainingSeconds % 60}s\n- **Picked Up**: ${status.pickedUp ? 'Yes 🎉' : 'No'}\n- **Burn After Read**: ${status.burnAfterRead ? 'Yes 🔥' : 'No'}\n- **Has Text**: ${status.hasText ? 'Yes' : 'No'}\n- **Attached Files**: ${status.fileCount}`
          }
        ]
      };
    }

    case 'drop_delete': {
      const { pin } = args;
      if (!pin) throw new Error('Missing required parameter: pin');

      const res = await client.deleteDrop(pin);
      return {
        content: [
          {
            type: 'text',
            text: res.success ? `✓ Drop \`#${pin.toUpperCase()}\` was permanently deleted and wiped from the server.` : `❌ Error: ${res.error}`
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

module.exports = { TOOL_DEFINITIONS, handleToolCall };
