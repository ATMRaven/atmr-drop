/**
 * ATMR DROP • ART DECO / GATSBY CLIENT LOGIC
 * Seamless cross-device encrypted file, photo and text sharing.
 */

(function () {
  'use strict';

  // --- STATE ---
  let stagedFiles = [];
  let activeDropData = null;
  let countdownTimer = null;
  let audioCtx = null;

  // --- DOM ELEMENTS ---
  const headerDateEl = document.getElementById('deco-edition-date');
  const navReceiveBtn = document.getElementById('nav-mode-receive');
  const navSendBtn = document.getElementById('nav-mode-send');

  const viewReceiveInput = document.getElementById('view-receive-input');
  const viewSend = document.getElementById('view-send');
  const viewShare = document.getElementById('view-share');
  const viewReceiveContent = document.getElementById('view-receive-content');

  // PIN inputs
  const pinCells = [
    document.getElementById('pin-digit-1'),
    document.getElementById('pin-digit-2'),
    document.getElementById('pin-digit-3'),
    document.getElementById('pin-digit-4')
  ];
  const btnFetchDrop = document.getElementById('btn-fetch-drop');

  // Send view elements
  const inputText = document.getElementById('input-text');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const stagedManifest = document.getElementById('staged-files-list');
  const stagedItemsUl = document.getElementById('staged-files-items');
  const fileCountBadge = document.getElementById('file-count-badge');
  const selectTtl = document.getElementById('select-ttl');
  const checkBurn = document.getElementById('check-burn');
  const btnSendDrop = document.getElementById('btn-send-drop');
  const btnCamera = document.getElementById('btn-camera');

  // Share view elements
  const sharePinCode = document.getElementById('share-pin-code');
  const shareQrCanvas = document.getElementById('share-qrcode-canvas');
  const shareDirectUrl = document.getElementById('share-direct-url');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const shareTimeLeft = document.getElementById('share-time-left');
  const shareBurnBadge = document.getElementById('share-burn-badge');
  const btnCancelDrop = document.getElementById('btn-cancel-drop');
  const btnNewSend = document.getElementById('btn-new-send');

  // Receive view elements
  const receiveExpiryText = document.getElementById('receive-expiry-text');
  const receiveBurnNotice = document.getElementById('receive-burn-notice');
  const receivedTextContainer = document.getElementById('received-text-container');
  const receivedTextContent = document.getElementById('received-text-content');
  const btnCopyReceivedText = document.getElementById('btn-copy-received-text');
  const receivedImagesContainer = document.getElementById('received-images-container');
  const receivedImagesGrid = document.getElementById('received-images-grid');
  const imagesCount = document.getElementById('images-count');
  const receivedFilesContainer = document.getElementById('received-files-container');
  const receivedFilesList = document.getElementById('received-files-list');
  const filesCount = document.getElementById('files-count');
  const btnDownloadAllZip = document.getElementById('btn-download-all-zip');
  const btnReceiveAnother = document.getElementById('btn-receive-another');

  // Modal Camera
  const cameraModal = document.getElementById('camera-modal');
  const cameraVideo = document.getElementById('camera-video');
  const cameraCanvas = document.getElementById('camera-canvas');
  const btnCameraSnap = document.getElementById('btn-camera-snap');
  const btnCameraClose = document.getElementById('btn-camera-close');
  let mediaStream = null;

  // --- INIT ---
  function init() {
    initDynamicDate();
    setupNavigation();
    setupPinInputs();
    setupKeypad();
    setupDropzone();
    setupCamera();
    setupActions();
    checkDirectPinRoute();
  }

  function initDynamicDate() {
    if (!headerDateEl) return;
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', options).toUpperCase();
    headerDateEl.textContent = `${dateStr} • LUXURY METROPOLIS EDITION`;
  }

  // --- AUDIO SYNTHESIS (METALLIC CHIME & CLICK) ---
  function playSound(type) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'click') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.05);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'success') {
        // Metallic Gold Chime (Arpeggio)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else if (type === 'retrieve') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      // Ignore audio failure
    }
  }

  // --- NAVIGATION ---
  function showView(viewId) {
    [viewReceiveInput, viewSend, viewShare, viewReceiveContent].forEach(v => {
      if (v) v.classList.remove('active');
    });

    if (viewId === 'receive') {
      viewReceiveInput.classList.add('active');
      navReceiveBtn.classList.add('active');
      navSendBtn.classList.remove('active');
      pinCells[0].focus();
    } else if (viewId === 'send') {
      viewSend.classList.add('active');
      navSendBtn.classList.add('active');
      navReceiveBtn.classList.remove('active');
    } else if (viewId === 'share') {
      viewShare.classList.add('active');
    } else if (viewId === 'content') {
      viewReceiveContent.classList.add('active');
    }
  }

  function setupNavigation() {
    navReceiveBtn.addEventListener('click', () => {
      playSound('click');
      showView('receive');
    });
    navSendBtn.addEventListener('click', () => {
      playSound('click');
      showView('send');
    });
  }

  // --- PIN INPUT HANDLING ---
  function setupPinInputs() {
    pinCells.forEach((cell, idx) => {
      cell.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        cell.value = val ? val[val.length - 1] : '';

        if (cell.value && idx < pinCells.length - 1) {
          pinCells[idx + 1].focus();
        }

        const fullPin = getEnteredPin();
        if (fullPin.length === 4) {
          fetchDropByPin(fullPin);
        }
      });

      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !cell.value && idx > 0) {
          pinCells[idx - 1].focus();
        } else if (e.key === 'Enter') {
          const fullPin = getEnteredPin();
          if (fullPin.length === 4) {
            fetchDropByPin(fullPin);
          }
        }
      });

      cell.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text').trim();
        const digits = paste.replace(/\D/g, '').slice(0, 4);
        if (digits) {
          digits.split('').forEach((d, i) => {
            if (pinCells[i]) pinCells[i].value = d;
          });
          if (digits.length === 4) {
            fetchDropByPin(digits);
          } else if (pinCells[digits.length]) {
            pinCells[digits.length].focus();
          }
        }
      });
    });

    btnFetchDrop.addEventListener('click', () => {
      const pin = getEnteredPin();
      if (pin.length !== 4) {
        showToast('Please enter complete 4-digit PIN code');
        return;
      }
      fetchDropByPin(pin);
    });
  }

  function setupKeypad() {
    document.querySelectorAll('.deco-btn-key').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound('click');
        const key = btn.dataset.key;
        if (key === 'clear') {
          pinCells.forEach(c => c.value = '');
          pinCells[0].focus();
        } else if (key === 'backspace') {
          for (let i = pinCells.length - 1; i >= 0; i--) {
            if (pinCells[i].value) {
              pinCells[i].value = '';
              pinCells[i].focus();
              break;
            }
          }
        } else {
          // Number key
          for (let i = 0; i < pinCells.length; i++) {
            if (!pinCells[i].value) {
              pinCells[i].value = key;
              if (i < pinCells.length - 1) {
                pinCells[i + 1].focus();
              } else {
                const fullPin = getEnteredPin();
                if (fullPin.length === 4) {
                  fetchDropByPin(fullPin);
                }
              }
              break;
            }
          }
        }
      });
    });
  }

  function getEnteredPin() {
    return pinCells.map(c => c.value).join('');
  }

  // --- DROPZONE & FILE HANDLING ---
  function setupDropzone() {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== btnCamera && !btnCamera.contains(e.target)) {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', () => {
      handleFiles(fileInput.files);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        handleFiles(dt.files);
      }
    });
  }

  async function handleFiles(files) {
    for (const file of Array.from(files)) {
      if (stagedFiles.some(f => f.name === file.name && f.size === file.size)) continue;

      const base64 = await readFileAsBase64(file);
      stagedFiles.push({
        id: 'f_' + Math.random().toString(36).substring(2, 9),
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataBase64: base64
      });
    }
    renderStagedFiles();
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renderStagedFiles() {
    stagedItemsUl.innerHTML = '';
    if (stagedFiles.length === 0) {
      stagedManifest.classList.add('hidden');
      return;
    }

    stagedManifest.classList.remove('hidden');
    fileCountBadge.textContent = stagedFiles.length;

    stagedFiles.forEach((file, idx) => {
      const li = document.createElement('li');
      li.className = 'manifest-item';
      li.innerHTML = `
        <span class="manifest-item-name">${escapeHtml(file.name)}</span>
        <div>
          <span class="manifest-item-size">${formatFileSize(file.size)}</span>
          <button type="button" class="manifest-item-remove" data-idx="${idx}" title="Remove file">&times;</button>
        </div>
      `;
      stagedItemsUl.appendChild(li);
    });

    document.querySelectorAll('.manifest-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        stagedFiles.splice(idx, 1);
        renderStagedFiles();
      });
    });
  }

  // --- CAMERA CAPTURE ---
  function setupCamera() {
    btnCamera.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        cameraVideo.srcObject = mediaStream;
        cameraModal.classList.add('active');
      } catch (err) {
        showToast('Camera access denied or unavailable');
      }
    });

    btnCameraClose.addEventListener('click', closeCamera);

    btnCameraSnap.addEventListener('click', () => {
      if (!mediaStream) return;
      cameraCanvas.width = cameraVideo.videoWidth || 640;
      cameraCanvas.height = cameraVideo.videoHeight || 480;
      const ctx = cameraCanvas.getContext('2d');
      ctx.drawImage(cameraVideo, 0, 0);

      const base64 = cameraCanvas.toDataURL('image/jpeg', 0.85);
      const filename = `snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;

      stagedFiles.push({
        id: 'f_' + Math.random().toString(36).substring(2, 9),
        name: filename,
        type: 'image/jpeg',
        size: Math.round(base64.length * 0.75),
        dataBase64: base64
      });

      renderStagedFiles();
      closeCamera();
      showToast('Photograph captured and staged');
      playSound('success');
    });
  }

  function closeCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    cameraModal.classList.remove('active');
  }

  // --- TRANSMIT DROP ACTION ---
  function setupActions() {
    btnSendDrop.addEventListener('click', async () => {
      const text = inputText.value.trim();
      if (!text && stagedFiles.length === 0) {
        showToast('Please enter text or attach at least one file');
        return;
      }

      btnSendDrop.disabled = true;
      btnSendDrop.querySelector('.btn-text').textContent = 'ENCRYPTING & DISPATCHING...';

      try {
        const payload = {
          text: text || undefined,
          files: stagedFiles,
          ttlSeconds: parseInt(selectTtl.value, 10),
          burnAfterRead: checkBurn.checked
        };

        const res = await fetch('/api/drop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to dispatch drop');
        }

        activeDropData = data;
        displayShareReceipt(data);
        playSound('success');
        showToast('Wire Dispatch Broadcasted Successfully!');
      } catch (err) {
        showToast(err.message || 'Transmission failed');
      } finally {
        btnSendDrop.disabled = false;
        btnSendDrop.querySelector('.btn-text').textContent = 'TRANSMIT WIRE DISPATCH';
      }
    });

    btnCopyUrl.addEventListener('click', () => {
      if (!shareDirectUrl.value) return;
      navigator.clipboard.writeText(shareDirectUrl.value);
      playSound('click');
      showToast('Direct dispatch URL copied to clipboard');
    });

    btnCancelDrop.addEventListener('click', async () => {
      if (!activeDropData || !activeDropData.code) return;
      try {
        await fetch(`/api/drop/${activeDropData.code}`, { method: 'DELETE' });
        showToast('Dispatch purged from vault');
      } catch (e) {
        // Ignore
      }
      resetSendForm();
      showView('send');
    });

    btnNewSend.addEventListener('click', () => {
      resetSendForm();
      showView('send');
    });

    btnCopyReceivedText.addEventListener('click', () => {
      const text = receivedTextContent.textContent;
      if (text) {
        navigator.clipboard.writeText(text);
        playSound('click');
        showToast('Memorandum copied to clipboard');
      }
    });

    btnDownloadAllZip.addEventListener('click', downloadAllFilesAsZip);

    btnReceiveAnother.addEventListener('click', () => {
      pinCells.forEach(c => c.value = '');
      showView('receive');
    });
  }

  function displayShareReceipt(data) {
    sharePinCode.textContent = data.code;
    const directUrl = `${window.location.origin}/${data.code}`;
    shareDirectUrl.value = directUrl;

    // Render Optical QR Matrix
    renderQrCode(directUrl);

    // Burn badge
    if (data.burnAfterRead) {
      shareBurnBadge.classList.remove('hidden');
    } else {
      shareBurnBadge.classList.add('hidden');
    }

    // Start Countdown
    startExpiryCountdown(data.expiresAt, shareTimeLeft);

    showView('share');
  }

  function renderQrCode(url) {
    shareQrCanvas.innerHTML = '';
    try {
      if (typeof QRCode !== 'undefined') {
        new QRCode(shareQrCanvas, {
          text: url,
          width: 170,
          height: 170,
          colorDark: '#0A0A0A',
          colorLight: '#FFFFFF',
          correctLevel: QRCode.CorrectLevel.M
        });
      } else {
        shareQrCanvas.innerHTML = `<div style="padding: 20px; font-size: 0.8rem; color: #000;">${url}</div>`;
      }
    } catch (e) {
      shareQrCanvas.innerHTML = `<div style="padding: 20px; font-size: 0.8rem; color: #000;">${url}</div>`;
    }
  }

  // --- RETRIEVE DROP BY PIN ---
  async function fetchDropByPin(code) {
    playSound('retrieve');
    btnFetchDrop.disabled = true;
    showToast(`Decrypting Wire PIN: ${code}...`);

    try {
      const res = await fetch(`/api/drop/${code}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Invalid or expired wire code');
      }

      displayDecryptedDrop(data.drop);
      playSound('success');
      showToast('Wire Decrypted & Verified!');
    } catch (err) {
      showToast(err.message || 'Retrieval failed');
      pinCells.forEach(c => c.value = '');
      pinCells[0].focus();
    } finally {
      btnFetchDrop.disabled = false;
    }
  }

  function displayDecryptedDrop(drop) {
    activeDropData = drop;

    // Expiry and Burn status
    startExpiryCountdown(drop.expiresAt, receiveExpiryText, 'EXPIRING IN: ');
    if (drop.burnAfterRead) {
      receiveBurnNotice.classList.remove('hidden');
    } else {
      receiveBurnNotice.classList.add('hidden');
    }

    // Decrypted Text
    if (drop.text) {
      receivedTextContainer.classList.remove('hidden');
      receivedTextContent.textContent = drop.text;
    } else {
      receivedTextContainer.classList.add('hidden');
    }

    // Separate Images & Files
    const files = drop.files || [];
    const images = files.filter(f => f.type && f.type.startsWith('image/'));
    const nonImages = files.filter(f => !f.type || !f.type.startsWith('image/'));

    // Render Images
    if (images.length > 0) {
      receivedImagesContainer.classList.remove('hidden');
      imagesCount.textContent = images.length;
      receivedImagesGrid.innerHTML = '';

      images.forEach(img => {
        const card = document.createElement('div');
        card.className = 'received-image-card';
        card.innerHTML = `
          <img src="${img.dataBase64}" class="received-img-preview" alt="${escapeHtml(img.name)}">
          <div class="received-img-footer">
            <span class="received-img-name">${escapeHtml(img.name)}</span>
            <a href="${img.dataBase64}" download="${escapeHtml(img.name)}" class="deco-btn deco-btn-outline xs">SAVE</a>
          </div>
        `;
        receivedImagesGrid.appendChild(card);
      });
    } else {
      receivedImagesContainer.classList.add('hidden');
    }

    // Render Files
    if (nonImages.length > 0) {
      receivedFilesContainer.classList.remove('hidden');
      filesCount.textContent = nonImages.length;
      receivedFilesList.innerHTML = '';

      nonImages.forEach(file => {
        const row = document.createElement('div');
        row.className = 'received-file-row';
        row.innerHTML = `
          <div class="received-file-info">
            <span class="received-file-name">${escapeHtml(file.name)}</span>
            <span class="received-file-meta">${formatFileSize(file.size)} • ${file.type || 'Document'}</span>
          </div>
          <a href="${file.dataBase64}" download="${escapeHtml(file.name)}" class="deco-btn deco-btn-outline xs">DOWNLOAD</a>
        `;
        receivedFilesList.appendChild(row);
      });
    } else {
      receivedFilesContainer.classList.add('hidden');
    }

    showView('content');
  }

  // --- ZIP ARCHIVE CREATION ---
  async function downloadAllFilesAsZip() {
    if (!activeDropData || !activeDropData.files || !activeDropData.files.length) return;
    if (typeof JSZip === 'undefined') {
      showToast('Archiver library unavailable');
      return;
    }

    btnDownloadAllZip.textContent = 'ARCHIVING...';
    btnDownloadAllZip.disabled = true;

    try {
      const zip = new JSZip();
      for (const file of activeDropData.files) {
        const base64Data = file.dataBase64.split(',')[1];
        zip.file(file.name, base64Data, { base64: true });
      }

      if (activeDropData.text) {
        zip.file('memorandum.txt', activeDropData.text);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wire_dispatch_${activeDropData.code || 'archive'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      playSound('success');
      showToast('ZIP Archive Downloaded');
    } catch (e) {
      showToast('ZIP compression failed');
    } finally {
      btnDownloadAllZip.textContent = 'DOWNLOAD ALL (ZIP)';
      btnDownloadAllZip.disabled = false;
    }
  }

  // --- COUNTDOWN TIMER ---
  function startExpiryCountdown(expiresAtIso, targetEl, prefix = '') {
    if (countdownTimer) clearInterval(countdownTimer);
    if (!expiresAtIso || !targetEl) return;

    const expiryTime = new Date(expiresAtIso).getTime();

    function update() {
      const now = Date.now();
      const diff = Math.max(0, expiryTime - now);
      const totalSec = Math.floor(diff / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      targetEl.textContent = `${prefix}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      if (diff <= 0) {
        clearInterval(countdownTimer);
        targetEl.textContent = `${prefix}EXPIRED`;
      }
    }

    update();
    countdownTimer = setInterval(update, 1000);
  }

  // --- DIRECT PIN ROUTE ---
  function checkDirectPinRoute() {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (/^\d{4}$/.test(path)) {
      path.split('').forEach((d, i) => {
        if (pinCells[i]) pinCells[i].value = d;
      });
      fetchDropByPin(path);
    }
  }

  // --- HELPERS ---
  function resetSendForm() {
    inputText.value = '';
    stagedFiles = [];
    renderStagedFiles();
    fileInput.value = '';
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function showToast(msg) {
    const shelf = document.getElementById('toast-container');
    if (!shelf) return;
    const toast = document.createElement('div');
    toast.className = 'deco-toast';
    toast.innerHTML = `<span class="toast-diamond">◆</span> <span>${escapeHtml(msg)}</span>`;
    shelf.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 300ms ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Run on DOM loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
