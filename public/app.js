(function () {
  'use strict';

  // --- STATE ---
  let stagedFiles = [];
  let activeDropData = null;
  let countdownTimer = null;

  // --- SOUND SYNTHESIS (Flagship Audio Feedback) ---
  const audioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ? new (window.AudioContext || window.webkitAudioContext)() : null;

  function playChime(type) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'copy') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {}
  }

  // --- DOM ELEMENTS ---
  const tabSend = document.getElementById('tab-send');
  const tabReceive = document.getElementById('tab-receive');

  const viewSend = document.getElementById('view-send');
  const viewReceive = document.getElementById('view-receive');
  const viewShare = document.getElementById('view-share');
  const viewVault = document.getElementById('view-vault');

  // PIN inputs
  const pinCells = [
    document.getElementById('pin-digit-1'),
    document.getElementById('pin-digit-2'),
    document.getElementById('pin-digit-3'),
    document.getElementById('pin-digit-4')
  ];
  const btnFetchDrop = document.getElementById('btn-fetch-drop');

  // Send elements
  const inputText = document.getElementById('input-text');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const stagedChipsList = document.getElementById('staged-files-list');
  const selectTtl = document.getElementById('select-ttl');
  const checkBurn = document.getElementById('check-burn');
  const btnSendDrop = document.getElementById('btn-send-drop');
  const btnCamera = document.getElementById('btn-camera');

  // Share elements
  const btnCopyPin = document.getElementById('btn-copy-pin');
  const sharePinCode = document.getElementById('share-pin-code');
  const shareQrCanvas = document.getElementById('share-qrcode-canvas');
  const shareDirectUrl = document.getElementById('share-direct-url');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const shareTimeLeft = document.getElementById('share-time-left');
  const shareBurnBadge = document.getElementById('share-burn-badge');
  const btnCancelDrop = document.getElementById('btn-cancel-drop');
  const btnNewSend = document.getElementById('btn-new-send');

  // Vault / Receive elements
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

  // Camera modal
  const cameraModal = document.getElementById('camera-modal');
  const cameraVideo = document.getElementById('camera-video');
  const cameraCanvas = document.getElementById('camera-canvas');
  const btnCameraSnap = document.getElementById('btn-camera-snap');
  const btnCameraClose = document.getElementById('btn-camera-close');
  let mediaStream = null;

  // --- APP VERSION, ENVIRONMENT & API RESOLUTION ---
  const PROD_API_ORIGIN = 'https://drop.atmr.workers.dev';
  const APP_CURRENT_VERSION = (window.APP_VERSION || '1.0.9').replace(/^v/, '').trim();
  let isUpdateMandatory = false;

  function isCapacitorNative() {
    return (
      (typeof window.Capacitor !== 'undefined' && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:'
    );
  }

  function isMobileWeb() {
    if (isCapacitorNative()) return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 640;
  }

  function getApiUrl(path) {
    if (isCapacitorNative()) {
      return `${PROD_API_ORIGIN}${path.startsWith('/') ? path : '/' + path}`;
    }
    return path;
  }

  const updateModal = document.getElementById('update-modal');
  const updateModalOverlay = document.getElementById('update-modal-overlay');
  const updateTitle = document.getElementById('update-title');
  const updateDesc = document.getElementById('update-desc');
  const updateNotesText = document.getElementById('update-notes-text');
  const btnUpdateNow = document.getElementById('btn-update-now');
  const btnUpdateLater = document.getElementById('btn-update-later');

  // --- INITIALIZATION ---
  function init() {
    setupTabs();
    setupPinInputs();
    setupDropzone();
    setupCamera();
    setupActions();
    setupUpdateModal();
    setupMobileAppBanner();
    setupServiceWorker();
    checkDirectPinRoute();
    checkAppUpdate();
  }

  function isStandalonePwa() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  // --- SERVICE WORKER (PWA) ---
  function setupServiceWorker() {
    if ('serviceWorker' in navigator && !isCapacitorNative()) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registered successfully, scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }
  }

  // PWA Install Prompt Capture
  let deferredPwaPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    const banner = document.getElementById('mobile-app-banner');
    const bannerBtn = banner?.querySelector('.btn-banner-download');
    if (banner && bannerBtn && !isCapacitorNative() && !isStandalonePwa()) {
      banner.classList.remove('hidden');
      bannerBtn.textContent = 'Install App';
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPwaPrompt = null;
    const banner = document.getElementById('mobile-app-banner');
    if (banner) banner.classList.add('hidden');
    showToast('Drop App installed!');
  });

  // --- MOBILE WEB PROMO BANNER ---
  function setupMobileAppBanner() {
    const banner = document.getElementById('mobile-app-banner');
    const btnDismiss = document.getElementById('btn-dismiss-app-banner');
    const btnAction = banner?.querySelector('.btn-banner-download');
    if (!banner) return;

    // Never show promo banner inside the native installed app or installed standalone PWA
    if (isCapacitorNative() || isStandalonePwa()) {
      banner.classList.add('hidden');
      return;
    }

    const dismissed = localStorage.getItem('atmr_app_promo_dismissed') === 'true';
    if (isMobileWeb() && !dismissed) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }

    if (btnAction) {
      btnAction.addEventListener('click', async (e) => {
        if (deferredPwaPrompt) {
          e.preventDefault();
          deferredPwaPrompt.prompt();
          const { outcome } = await deferredPwaPrompt.userChoice;
          console.log('[PWA] User choice outcome:', outcome);
          deferredPwaPrompt = null;
          if (outcome === 'accepted') {
            banner.classList.add('hidden');
          }
        }
      });
    }

    if (btnDismiss) {
      btnDismiss.addEventListener('click', () => {
        banner.classList.add('hidden');
        localStorage.setItem('atmr_app_promo_dismissed', 'true');
      });
    }
  }

  // --- IN-APP UPDATE CHECKER (NATIVE MOBILE ONLY) ---
  async function checkAppUpdate() {
    // CRITICAL: Web app visitors are already running the latest web code; only prompt APK updates in native app
    if (!isCapacitorNative()) {
      return;
    }

    try {
      // Check Worker version API first
      let data = null;
      try {
        const res = await fetch(getApiUrl('/api/version'));
        if (res.ok) data = await res.json();
      } catch (e) {}

      // Fallback to GitHub Releases API if backend endpoint is unavailable
      if (!data || !data.version) {
        const ghRes = await fetch('https://api.github.com/repos/ATMRaven/atmr-drop/releases/latest');
        if (ghRes.ok) {
          const ghData = await ghRes.json();
          const tag = (ghData.tag_name || '').replace(/^v/, '').trim();
          data = {
            version: tag,
            downloadUrl: ghData.assets?.[0]?.browser_download_url || 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk',
            releaseNotes: ghData.body || 'Latest performance and security improvements.',
            mandatory: false
          };
        }
      }

      if (data && data.version) {
        const isNew = isNewerVersion(data.version, APP_CURRENT_VERSION);
        console.log(`[Version Check] Installed: v${APP_CURRENT_VERSION} | Latest: v${data.version} | Update needed: ${isNew}`);
        if (isNew) {
          displayUpdateModal(data);
        }
      }
    } catch (err) {
      console.warn('Update check failed (offline or rate limited):', err);
    }
  }

  function isNewerVersion(remote, local) {
    if (!remote || !local) return false;
    const rClean = remote.replace(/^v/, '').trim();
    const lClean = local.replace(/^v/, '').trim();
    if (rClean === lClean) return false;

    const rParts = rClean.split('.').map(n => parseInt(n, 10) || 0);
    const lParts = lClean.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
      const r = rParts[i] || 0;
      const l = lParts[i] || 0;
      if (r > l) return true;
      if (r < l) return false;
    }
    return false;
  }

  function displayUpdateModal(info) {
    isUpdateMandatory = !!info.mandatory;
    updateTitle.textContent = `Update Available (v${info.version})`;
    updateDesc.textContent = info.mandatory
      ? 'A critical update is required to continue.'
      : 'A new version of Drop is ready to install.';
    updateNotesText.textContent = info.releaseNotes || 'Bug fixes and performance enhancements.';
    btnUpdateNow.href = info.downloadUrl || 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk';

    if (info.mandatory) {
      btnUpdateLater.classList.add('hidden');
    } else {
      btnUpdateLater.classList.remove('hidden');
    }

    updateModal.classList.add('active');
    playChime('copy');
  }

  function setupUpdateModal() {
    btnUpdateLater.addEventListener('click', () => {
      updateModal.classList.remove('active');
    });

    updateModalOverlay.addEventListener('click', () => {
      if (!isUpdateMandatory) {
        updateModal.classList.remove('active');
      }
    });
  }

  // --- TAB NAVIGATION ---
  function switchTab(mode) {
    [viewSend, viewReceive, viewShare, viewVault].forEach(v => v.classList.remove('active'));

    if (mode === 'send') {
      tabSend.classList.add('active');
      tabReceive.classList.remove('active');
      viewSend.classList.add('active');
      inputText.focus();
    } else if (mode === 'receive') {
      tabReceive.classList.add('active');
      tabSend.classList.remove('active');
      viewReceive.classList.add('active');
      pinCells[0].focus();
    } else if (mode === 'share') {
      viewShare.classList.add('active');
    } else if (mode === 'vault') {
      viewVault.classList.add('active');
    }
  }

  function setupTabs() {
    tabSend.addEventListener('click', () => switchTab('send'));
    tabReceive.addEventListener('click', () => switchTab('receive'));
  }

  // --- PIN INPUTS ---
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
        showToast('Please enter full 4-digit PIN');
        return;
      }
      fetchDropByPin(pin);
    });
  }

  function getEnteredPin() {
    return pinCells.map(c => c.value).join('');
  }

  // --- DROPZONE & FILES ---
  function setupDropzone() {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== btnCamera && !btnCamera.contains(e.target)) {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', () => {
      handleFiles(fileInput.files);
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
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
    stagedChipsList.innerHTML = '';
    if (stagedFiles.length === 0) {
      stagedChipsList.classList.add('hidden');
      return;
    }

    stagedChipsList.classList.remove('hidden');

    stagedFiles.forEach((file, idx) => {
      const chip = document.createElement('div');
      chip.className = 'file-chip';
      chip.innerHTML = `
        <span class="chip-name">${escapeHtml(file.name)}</span>
        <span class="chip-size">${formatFileSize(file.size)}</span>
        <button type="button" class="chip-remove" data-idx="${idx}">&times;</button>
      `;
      stagedChipsList.appendChild(chip);
    });

    document.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        stagedFiles.splice(idx, 1);
        renderStagedFiles();
      });
    });
  }

  // --- CAMERA ---
  function setupCamera() {
    btnCamera.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        cameraVideo.srcObject = mediaStream;
        cameraModal.classList.add('active');
      } catch (err) {
        showToast('Camera unavailable');
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
      const filename = `photo_${Date.now()}.jpg`;

      stagedFiles.push({
        id: 'f_' + Math.random().toString(36).substring(2, 9),
        name: filename,
        type: 'image/jpeg',
        size: Math.round(base64.length * 0.75),
        dataBase64: base64
      });

      renderStagedFiles();
      closeCamera();
      showToast('Photo captured');
    });
  }

  function closeCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    cameraModal.classList.remove('active');
  }

  // --- SEND & SHARE ACTIONS ---
  function setupActions() {
    btnSendDrop.addEventListener('click', async () => {
      const text = inputText.value.trim();
      if (!text && stagedFiles.length === 0) {
        showToast('Please enter text or attach a file');
        return;
      }

      btnSendDrop.disabled = true;
      btnSendDrop.querySelector('.btn-text').textContent = 'Creating Drop...';

      try {
        const payload = {
          text: text || undefined,
          files: stagedFiles,
          ttlSeconds: parseInt(selectTtl.value, 10),
          burnAfterRead: checkBurn.checked
        };

        const res = await fetch(getApiUrl('/api/drop'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        let data;
        try {
          data = await res.json();
        } catch (jsonErr) {
          throw new Error('Server returned an invalid response. Please try again.');
        }

        if (!data || !data.success) throw new Error(data?.error || 'Failed to create drop');

        activeDropData = data;
        displayShareScreen(data);
        playChime('success');
        showToast('Drop created!');
      } catch (err) {
        showToast(err.message || 'Failed to send drop');
      } finally {
        btnSendDrop.disabled = false;
        btnSendDrop.querySelector('.btn-text').textContent = 'Create Drop';
      }
    });

    btnCopyPin.addEventListener('click', () => {
      if (activeDropData && activeDropData.code) {
        navigator.clipboard.writeText(activeDropData.code);
        playChime('copy');
        showToast(`PIN ${activeDropData.code} copied!`);
      }
    });

    btnCopyUrl.addEventListener('click', () => {
      if (shareDirectUrl.value) {
        navigator.clipboard.writeText(shareDirectUrl.value);
        playChime('copy');
        showToast('Link copied to clipboard');
      }
    });

    btnCancelDrop.addEventListener('click', async () => {
      if (activeDropData && activeDropData.code) {
        try {
          await fetch(getApiUrl(`/api/drop/${activeDropData.code}`), { method: 'DELETE' });
          showToast('Drop deleted');
        } catch (e) {}
      }
      resetForm();
      switchTab('send');
    });

    btnNewSend.addEventListener('click', () => {
      resetForm();
      switchTab('send');
    });

    btnCopyReceivedText.addEventListener('click', () => {
      const txt = receivedTextContent.textContent;
      if (txt) {
        navigator.clipboard.writeText(txt);
        showToast('Text copied');
      }
    });

    btnDownloadAllZip.addEventListener('click', downloadZip);

    btnReceiveAnother.addEventListener('click', () => {
      pinCells.forEach(c => c.value = '');
      switchTab('receive');
    });

    // Delegate click on individual file download buttons
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-download-file');
      if (!btn) return;
      e.preventDefault();
      const code = btn.dataset.code;
      const fileId = btn.dataset.id;
      const fileName = btn.dataset.name || 'download';
      await downloadSingleFile(code, fileId, fileName, btn);
    });
  }

  function displayShareScreen(data) {
    sharePinCode.textContent = data.code;
    const directUrl = data.directUrl || (isCapacitorNative() ? `${PROD_API_ORIGIN}/${data.code}` : `${window.location.origin}/${data.code}`);
    shareDirectUrl.value = directUrl;

    renderQr(directUrl);

    if (data.burnAfterRead) {
      shareBurnBadge.classList.remove('hidden');
    } else {
      shareBurnBadge.classList.add('hidden');
    }

    startExpiryCountdown(data.expiresAt, shareTimeLeft);
    switchTab('share');
  }

  function renderQr(url) {
    shareQrCanvas.innerHTML = '';
    try {
      if (typeof qrcode !== 'undefined') {
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        shareQrCanvas.innerHTML = qr.createImgTag(4, 6);
      }
    } catch (e) {
      shareQrCanvas.innerHTML = `<div style="padding:10px;font-size:12px;">${url}</div>`;
    }
  }

  // --- RETRIEVE DROP ---
  async function fetchDropByPin(code) {
    btnFetchDrop.disabled = true;
    showToast(`Loading PIN ${code}...`);

    try {
      const res = await fetch(getApiUrl(`/api/drop/${code}`));
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error('Invalid server response');
      }

      if (!data || !data.success) throw new Error(data?.error || 'Drop not found or expired');

      displayVaultScreen(data.drop);
      showToast('Drop retrieved!');
    } catch (err) {
      showToast(err.message || 'Retrieval failed');
      pinCells.forEach(c => c.value = '');
      pinCells[0].focus();
    } finally {
      btnFetchDrop.disabled = false;
    }
  }

  function displayVaultScreen(drop) {
    activeDropData = drop;

    startExpiryCountdown(drop.expiresAt, receiveExpiryText);
    if (drop.burnAfterRead) {
      receiveBurnNotice.classList.remove('hidden');
    } else {
      receiveBurnNotice.classList.add('hidden');
    }

    // Text
    if (drop.text) {
      receivedTextContainer.classList.remove('hidden');
      receivedTextContent.textContent = drop.text;
    } else {
      receivedTextContainer.classList.add('hidden');
    }

    const files = drop.files || [];
    const images = files.filter(f => f.type && f.type.startsWith('image/'));
    const nonImages = files.filter(f => !f.type || !f.type.startsWith('image/'));

    // Images
    if (images.length > 0) {
      receivedImagesContainer.classList.remove('hidden');
      imagesCount.textContent = images.length;
      receivedImagesGrid.innerHTML = '';

      images.forEach(img => {
        const fileUrl = img.dataBase64 || getApiUrl(`/api/file/${drop.code}/${img.id}`);
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.innerHTML = `
          <img src="${fileUrl}" class="gallery-img" alt="${escapeHtml(img.name)}" loading="lazy">
          <div class="gallery-item-footer">
            <span class="gallery-item-name" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</span>
            <button type="button" class="btn-ghost sm btn-download-file" data-code="${drop.code}" data-id="${img.id}" data-name="${escapeHtml(img.name)}">Save</button>
          </div>
        `;
        receivedImagesGrid.appendChild(item);
      });
    } else {
      receivedImagesContainer.classList.add('hidden');
    }

    // Files
    if (nonImages.length > 0) {
      receivedFilesContainer.classList.remove('hidden');
      filesCount.textContent = nonImages.length;
      receivedFilesList.innerHTML = '';

      nonImages.forEach(file => {
        const row = document.createElement('div');
        row.className = 'file-row';
        row.innerHTML = `
          <div class="file-row-info">
            <span class="file-row-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <span class="file-row-meta">${formatFileSize(file.size)}</span>
          </div>
          <button type="button" class="btn-secondary sm btn-download-file" data-code="${drop.code}" data-id="${file.id}" data-name="${escapeHtml(file.name)}">Download</button>
        `;
        receivedFilesList.appendChild(row);
      });
    } else {
      receivedFilesContainer.classList.add('hidden');
    }

    switchTab('vault');
  }

  // --- SINGLE FILE DOWNLOADER ---
  async function downloadSingleFile(code, fileId, fileName, btnEl) {
    const originalText = btnEl ? btnEl.textContent : '';
    if (btnEl) {
      btnEl.textContent = '...';
      btnEl.disabled = true;
    }

    try {
      showToast(`Downloading ${fileName}...`);
      const fileUrl = getApiUrl(`/api/file/${code}/${fileId}?download=true`);
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error('File download failed');

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      showToast('Download complete');
    } catch (err) {
      console.warn('Direct blob download fallback to window.open:', err);
      window.open(getApiUrl(`/api/file/${code}/${fileId}?download=true`), '_blank');
      showToast('Download started');
    } finally {
      if (btnEl) {
        btnEl.textContent = originalText;
        btnEl.disabled = false;
      }
    }
  }

  // --- ZIP ARCHIVER ---
  async function downloadZip() {
    if (!activeDropData || !activeDropData.files || !activeDropData.files.length) return;
    if (typeof JSZip === 'undefined') {
      showToast('Archiver unavailable');
      return;
    }

    btnDownloadAllZip.textContent = 'Downloading...';
    btnDownloadAllZip.disabled = true;

    try {
      const zip = new JSZip();

      for (let i = 0; i < activeDropData.files.length; i++) {
        const file = activeDropData.files[i];
        btnDownloadAllZip.textContent = `Zipping (${i + 1}/${activeDropData.files.length})...`;

        if (file.dataBase64) {
          const base64Data = file.dataBase64.includes(',') ? file.dataBase64.split(',')[1] : file.dataBase64;
          zip.file(file.name, base64Data, { base64: true });
        } else {
          const fileUrl = getApiUrl(`/api/file/${activeDropData.code}/${file.id}`);
          const res = await fetch(fileUrl);
          if (res.ok) {
            const blob = await res.blob();
            zip.file(file.name, blob);
          }
        }
      }

      if (activeDropData.text) {
        zip.file('note.txt', activeDropData.text);
      }

      btnDownloadAllZip.textContent = 'Compressing...';
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drop_${activeDropData.code || 'files'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast('ZIP downloaded');
    } catch (e) {
      console.error('ZIP error:', e);
      showToast('Compression failed');
    } finally {
      btnDownloadAllZip.textContent = 'Download All (.zip)';
      btnDownloadAllZip.disabled = false;
    }
  }

  // --- COUNTDOWN ---
  function startExpiryCountdown(expiresAtIso, targetEl) {
    if (countdownTimer) clearInterval(countdownTimer);
    if (!expiresAtIso || !targetEl) return;

    const expiryTime = new Date(expiresAtIso).getTime();

    function update() {
      const now = Date.now();
      const diff = Math.max(0, expiryTime - now);
      const totalSec = Math.floor(diff / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      targetEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      if (diff <= 0) {
        clearInterval(countdownTimer);
        targetEl.textContent = 'Expired';
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
  function resetForm() {
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
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function showToast(msg) {
    const shelf = document.getElementById('toast-container');
    if (!shelf) return;
    const toast = document.createElement('div');
    toast.className = 'clean-toast';
    toast.textContent = msg;
    shelf.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      toast.style.transition = 'all 150ms ease-out';
      setTimeout(() => toast.remove(), 150);
    }, 2800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
