(function () {
  'use strict';

  // --- GLOBAL STATE ---
  let stagedFiles = [];
  let activeDropData = null;
  let countdownTimer = null;
  let bannerTimer = null;
  let historyRefreshTimer = null;
  let isExplicitNewSend = false;
  let currentE2EEKey = null; // CryptoKey for active drop
  let currentE2EEKeyB64 = null; // Base64url key string
  let activePeerConnection = null;
  let activeDataChannel = null;
  let isP2PConnected = false;
  let qrScannerStream = null;
  let qrScannerAnimId = null;

  const SENDER_STORAGE_KEY = 'atmr_active_sender_drop';
  const VAULT_HISTORY_KEY = 'atmr_drop_vault_history';

  // --- UNIVERSAL API BASE URL (MOBILE APP + WEB APP) ---
  const IS_NATIVE = Boolean(
    (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
    (typeof window !== 'undefined' && (window.location.origin === 'https://localhost' || window.location.origin === 'capacitor://localhost' || window.location.protocol === 'file:'))
  );
  const API_ORIGIN = IS_NATIVE ? 'https://drop.atmr.workers.dev' : '';

  function getApiUrl(path) {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const clean = path.startsWith('/') ? path : '/' + path;
    return `${API_ORIGIN}${clean}`;
  }

  function dataUrlToBlob(dataUrl) {
    try {
      const parts = dataUrl.split(',');
      const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
      const binaryStr = atob(parts[1]);
      const len = binaryStr.length;
      const u8arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        u8arr[i] = binaryStr.charCodeAt(i);
      }
      return new Blob([u8arr], { type: mime });
    } catch (e) {
      return null;
    }
  }

  function base64ToBlob(base64, mimeType = 'application/octet-stream') {
    try {
      const clean = base64.includes(',') ? base64.split(',')[1] : base64;
      const binaryStr = atob(clean);
      const len = binaryStr.length;
      const u8arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        u8arr[i] = binaryStr.charCodeAt(i);
      }
      return new Blob([u8arr], { type: mimeType });
    } catch (e) {
      return null;
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function triggerDirectDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // --- SOUND SYSTEM ---
  const audioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ? new (window.AudioContext || window.webkitAudioContext)() : null;
  const dropSounds = [
    new Audio('sounds/drop_1.mp3'),
    new Audio('sounds/drop_2.mp3'),
    new Audio('sounds/drop_3.mp3'),
    new Audio('sounds/drop_4.mp3'),
    new Audio('sounds/drop_5.mp3'),
    new Audio('sounds/drop_6.mp3'),
    new Audio('sounds/drop_7.mp3')
  ];
  dropSounds.forEach(s => { s.preload = 'auto'; });

  const soundPop = new Audio('sounds/drop_pop.mp3');
  soundPop.preload = 'auto';

  function getRandomDropSound() {
    const idx = Math.floor(Math.random() * dropSounds.length);
    return dropSounds[idx];
  }

  function playChime(type) {
    try {
      if (type === 'success') {
        const audio = getRandomDropSound();
        if (audio) {
          audio.currentTime = 0;
          audio.volume = 0.9;
          const playPromise = audio.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => playSyntheticChime('success'));
          }
          return;
        }
      } else {
        const audio = soundPop;
        if (audio) {
          audio.currentTime = 0;
          audio.volume = 0.85;
          const playPromise = audio.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => playSyntheticChime('copy'));
          }
          return;
        }
      }
    } catch (e) {}
    playSyntheticChime(type);
  }

  function playSyntheticChime(type) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      if (type === 'success') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2600, now);
        filter.frequency.exponentialRampToValueAtTime(700, now + 0.38);

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.08);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1174.66, now);
        osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.08);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(filter);
        filter.connect(audioCtx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.38);
        osc2.stop(now + 0.38);
      } else {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.05);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      }
    } catch (e) {}
  }

  // --- CRYPTO ENGINE: ZERO-KNOWLEDGE AES-256-GCM ---
  const CryptoEngine = {
    async generateKey() {
      return await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
    },
    async exportKeyB64(key) {
      const raw = await crypto.subtle.exportKey('raw', key);
      return btoa(String.fromCharCode(...new Uint8Array(raw)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    async importKeyB64(b64) {
      let base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return await crypto.subtle.importKey(
        'raw',
        bytes,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
    },
    async encryptBytes(buffer, key) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        buffer
      );
      const result = new Uint8Array(12 + ciphertext.byteLength);
      result.set(iv, 0);
      result.set(new Uint8Array(ciphertext), 12);
      return result;
    },
    async decryptBytes(encryptedBuffer, key) {
      const bytes = new Uint8Array(encryptedBuffer);
      if (bytes.byteLength < 12) throw new Error('Encrypted payload too short');
      const iv = bytes.slice(0, 12);
      const ciphertext = bytes.slice(12);
      return await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
    },
    async encryptText(text, key) {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(text);
      const encrypted = await this.encryptBytes(encoded, key);
      return btoa(String.fromCharCode(...encrypted));
    },
    async decryptText(b64, key) {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const decrypted = await this.decryptBytes(bytes, key);
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    }
  };

  // --- DOM ELEMENTS ---
  const tabSend = document.getElementById('tab-send');
  const tabReceive = document.getElementById('tab-receive');

  const viewSend = document.getElementById('view-send');
  const viewReceive = document.getElementById('view-receive');
  const viewShare = document.getElementById('view-share');
  const viewVault = document.getElementById('view-vault');

  // Header & Vault History
  const btnOpenHistory = document.getElementById('btn-open-history');
  const historyBadgeCount = document.getElementById('history-badge-count');
  const historyModal = document.getElementById('history-modal');
  const historyModalOverlay = document.getElementById('history-modal-overlay');
  const btnCloseHistory = document.getElementById('btn-close-history');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const historyFilterBtns = document.querySelectorAll('.history-filter-btn');

  // Active Drop Banner
  const activeDropBanner = document.getElementById('active-drop-banner');
  const activeBannerPin = document.getElementById('active-banner-pin');
  const activeBannerTime = document.getElementById('active-banner-time');
  const btnBannerView = document.getElementById('btn-banner-view');
  const btnBannerDismiss = document.getElementById('btn-banner-dismiss');

  // PIN inputs
  const pinCells = [
    document.getElementById('pin-digit-1'),
    document.getElementById('pin-digit-2'),
    document.getElementById('pin-digit-3'),
    document.getElementById('pin-digit-4')
  ];
  const btnFetchDrop = document.getElementById('btn-fetch-drop');
  const btnScanQr = document.getElementById('btn-scan-qr');

  // QR Scanner Modal
  const qrScannerModal = document.getElementById('qr-scanner-modal');
  const qrModalOverlay = document.getElementById('qr-modal-overlay');
  const btnCloseQrScanner = document.getElementById('btn-close-qr-scanner');
  const qrVideo = document.getElementById('qr-video');
  const qrCanvas = document.getElementById('qr-canvas');
  const qrStatusHint = document.getElementById('qr-status-hint');

  // Send elements
  const inputText = document.getElementById('input-text');
  const liveInputBar = document.getElementById('live-input-bar');
  const liveTagBadge = document.getElementById('live-tag-badge');
  const liveTagDesc = document.getElementById('live-tag-desc');
  const liveStats = document.getElementById('live-stats');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const folderInput = document.getElementById('folder-input');
  const btnFolderSnap = document.getElementById('btn-folder-snap');
  const btnCamera = document.getElementById('btn-camera');
  const stagedChipsList = document.getElementById('staged-files-list');

  // Advanced Options
  const btnToggleAdvanced = document.getElementById('btn-toggle-advanced');
  const advancedDrawer = document.getElementById('advanced-drawer');
  const inputCustomPin = document.getElementById('input-custom-pin');
  const checkE2EE = document.getElementById('check-e2ee');

  const selectTtl = document.getElementById('select-ttl');
  const ttlLimitNotice = document.getElementById('ttl-limit-notice');
  const checkBurn = document.getElementById('check-burn');
  const btnSendDrop = document.getElementById('btn-send-drop');

  // Progress Bar
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadProgressBar = document.getElementById('upload-progress-bar');
  const uploadStatusText = document.getElementById('upload-status-text');
  const uploadPercentBadge = document.getElementById('upload-percent-badge');
  const uploadBytesText = document.getElementById('upload-bytes-text');
  const uploadSpeedText = document.getElementById('upload-speed-text');

  // Share elements
  const sharePickupBanner = document.getElementById('share-pickup-banner');
  const sharePinCode = document.getElementById('share-pin-code');
  const shareTimeLeft = document.getElementById('share-time-left');
  const shareStatusDot = document.getElementById('share-status-dot');
  const shareStatusText = document.getElementById('share-status-text');
  const sharePayloadBadge = document.getElementById('share-payload-badge');
  const shareBadgeIcon = document.getElementById('share-badge-icon');
  const shareBadgeText = document.getElementById('share-badge-text');
  const sharePayloadStat = document.getElementById('share-payload-stat');
  const shareLinkBox = document.getElementById('share-link-box');
  const shareLinkDomain = document.getElementById('share-link-domain');
  const shareLinkUrl = document.getElementById('share-link-url');
  const shareLinkOpenBtn = document.getElementById('share-link-open-btn');
  const shareTextBox = document.getElementById('share-text-box');
  const shareTextSnippet = document.getElementById('share-text-snippet');
  const shareFilesBox = document.getElementById('share-files-box');
  const shareFilesChips = document.getElementById('share-files-chips');
  const shareE2eeBadge = document.getElementById('share-e2ee-badge');
  const shareP2pBadge = document.getElementById('share-p2p-badge');
  const shareP2pText = document.getElementById('share-p2p-text');
  const shareQrcodeCanvas = document.getElementById('share-qrcode-canvas');
  const shareDirectUrl = document.getElementById('share-direct-url');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const btnCopyPin = document.getElementById('btn-copy-pin');
  const shareBurnBadge = document.getElementById('share-burn-badge');
  const btnCancelDrop = document.getElementById('btn-cancel-drop');
  const btnNewSend = document.getElementById('btn-new-send');

  // Vault elements
  const receiveExpiryText = document.getElementById('receive-expiry-text');
  const receiveBurnNotice = document.getElementById('receive-burn-notice');
  const vaultE2eeBadge = document.getElementById('vault-e2ee-badge');
  const vaultP2pBadge = document.getElementById('vault-p2p-badge');
  const receivedLinkHero = document.getElementById('received-link-hero');
  const vaultLinkDomain = document.getElementById('vault-link-domain');
  const vaultLinkUrl = document.getElementById('vault-link-url');
  const vaultLinkOpenBtn = document.getElementById('vault-link-open-btn');
  const vaultLinkCopyBtn = document.getElementById('vault-link-copy-btn');
  const receivedTextContainer = document.getElementById('received-text-container');
  const receivedTextLabel = document.getElementById('received-text-label');
  const receivedTextBadge = document.getElementById('received-text-badge');
  const btnOpenReceivedLink = document.getElementById('btn-open-received-link');
  const btnCopyReceivedText = document.getElementById('btn-copy-received-text');
  const receivedTextContent = document.getElementById('received-text-content');
  const receivedImagesContainer = document.getElementById('received-images-container');
  const imagesCount = document.getElementById('images-count');
  const receivedImagesGrid = document.getElementById('received-images-grid');
  const receivedFilesContainer = document.getElementById('received-files-container');
  const filesCount = document.getElementById('files-count');
  const receivedFilesList = document.getElementById('received-files-list');
  const btnDownloadAllZip = document.getElementById('btn-download-all-zip');
  const btnReceiveAnother = document.getElementById('btn-receive-another');

  // Mobile App Banner
  const mobileAppBanner = document.getElementById('mobile-app-banner');
  const btnDismissAppBanner = document.getElementById('btn-dismiss-app-banner');

  // Camera Modal elements
  const cameraModal = document.getElementById('camera-modal');
  const cameraVideo = document.getElementById('camera-video');
  const cameraCanvas = document.getElementById('camera-canvas');
  const btnCameraClose = document.getElementById('btn-camera-close');
  const btnCameraSnap = document.getElementById('btn-camera-snap');
  let cameraStream = null;

  // --- INITIALIZATION ---
  function init() {
    setupTabs();
    setupPinInputs();
    setupSendForm();
    setupDropzone();
    setupAdvancedOptions();
    setupCamera();
    setupQrScanner();
    setupVaultHistory();
    setupFileInspector();
    setupInfoModal();
    setupInAppUpdater();
    setupMobileAppBanner();
    setupNativeSendIntent();
    checkDirectUrlOrActiveDrop();
    updateHistoryBadge();
    const footerVersionVal = document.getElementById('footer-version-val');
    const CURRENT_VERSION = window.APP_VERSION || (window.APP_CONFIG && window.APP_CONFIG.version) || '1.0.33';
    if (footerVersionVal) footerVersionVal.textContent = CURRENT_VERSION;
  }

  // --- TABS & VIEWS ---
  function setupTabs() {
    tabSend.addEventListener('click', () => switchTab('send'));
    tabReceive.addEventListener('click', () => switchTab('receive'));
  }

  function switchTab(tab) {
    if (tab === 'send') {
      tabSend.classList.add('active');
      tabReceive.classList.remove('active');
      showView('send');
    } else {
      tabReceive.classList.add('active');
      tabSend.classList.remove('active');
      showView('receive');
      setTimeout(() => { if (pinCells[0]) pinCells[0].focus(); }, 100);
    }
  }

  function showView(viewName) {
    [viewSend, viewReceive, viewShare, viewVault].forEach(v => {
      if (v) v.classList.remove('active');
    });

    if (viewName === 'send') {
      viewSend.classList.add('active');
      updateActiveBanner();
    } else if (viewName === 'receive') {
      viewReceive.classList.add('active');
    } else if (viewName === 'share') {
      viewShare.classList.add('active');
    } else if (viewName === 'vault') {
      viewVault.classList.add('active');
    }
  }

  // --- 4-BOX PIN INPUTS & PASTE AUTO-DISTRIBUTION ---
  function setupPinInputs() {
    pinCells.forEach((cell, idx) => {
      cell.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
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

      // Flawless 4-Character Alphanumeric Paste Handler
      cell.addEventListener('paste', (e) => {
        e.preventDefault();
        const rawPaste = (e.clipboardData || window.clipboardData).getData('text').trim();
        
        // Extract 4-char PIN even if a full URL like https://drop.atmr.workers.dev/A4G4#key=... was pasted
        let clean = rawPaste.toUpperCase();
        const urlMatch = clean.match(/\/([A-Z0-9]{4})(?:#|$|\?)/);
        if (urlMatch) {
          clean = urlMatch[1];
        } else {
          clean = clean.replace(/[^A-Z0-9]/g, '').slice(0, 4);
        }

        // Check if paste contained E2EE key in hash
        const keyMatch = rawPaste.match(/#key=([A-Za-z0-9_-]+)/);
        if (keyMatch) {
          currentE2EEKeyB64 = keyMatch[1];
        }

        if (clean) {
          clean.split('').forEach((char, i) => {
            if (pinCells[i]) pinCells[i].value = char;
          });
          if (clean.length === 4) {
            pinCells[3].focus();
            fetchDropByPin(clean);
          } else if (pinCells[clean.length]) {
            pinCells[clean.length].focus();
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

    if (btnScanQr) {
      btnScanQr.addEventListener('click', openQrScanner);
    }
  }

  function getEnteredPin() {
    return pinCells.map(c => c.value.trim().toUpperCase()).join('');
  }

  function clearPinInputs() {
    pinCells.forEach(c => { c.value = ''; });
  }

  // --- CAMERA QR CODE SCANNER ---
  function setupQrScanner() {
    if (!qrScannerModal) return;

    if (btnCloseQrScanner) {
      btnCloseQrScanner.addEventListener('click', closeQrScanner);
    }
    if (qrModalOverlay) {
      qrModalOverlay.addEventListener('click', closeQrScanner);
    }
  }

  async function openQrScanner() {
    qrScannerModal.classList.add('show');
    qrScannerModal.setAttribute('aria-hidden', 'false');
    qrStatusHint.textContent = 'Point camera at sender\'s QR code';

    try {
      qrScannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
      });
      qrVideo.srcObject = qrScannerStream;
      qrVideo.play();
      startQrScanningLoop();
    } catch (err) {
      qrStatusHint.textContent = 'Camera access denied or unavailable';
      showToast('Camera permission required to scan QR');
    }
  }

  function closeQrScanner() {
    if (qrScannerAnimId) {
      cancelAnimationFrame(qrScannerAnimId);
      qrScannerAnimId = null;
    }
    if (qrScannerStream) {
      qrScannerStream.getTracks().forEach(t => t.stop());
      qrScannerStream = null;
    }
    qrScannerModal.classList.remove('show');
    qrScannerModal.setAttribute('aria-hidden', 'true');
  }

  function startQrScanningLoop() {
    let barcodeDetector = null;
    if ('BarcodeDetector' in window) {
      try {
        barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) {}
    }

    const ctx = qrCanvas ? qrCanvas.getContext('2d', { willReadFrequently: true }) : null;

    async function scan() {
      if (!qrScannerStream || qrVideo.readyState !== qrVideo.HAVE_ENOUGH_DATA) {
        qrScannerAnimId = requestAnimationFrame(scan);
        return;
      }

      // 1. Try Native BarcodeDetector
      if (barcodeDetector) {
        try {
          const barcodes = await barcodeDetector.detect(qrVideo);
          if (barcodes && barcodes.length > 0) {
            handleScannedQrResult(barcodes[0].rawValue);
            return;
          }
        } catch (e) {}
      }

      // 2. Fallback to embedded jsQR
      if (ctx && typeof window.jsQR === 'function') {
        qrCanvas.width = qrVideo.videoWidth;
        qrCanvas.height = qrVideo.videoHeight;
        ctx.drawImage(qrVideo, 0, 0, qrCanvas.width, qrCanvas.height);
        const imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });
        if (code && code.data) {
          handleScannedQrResult(code.data);
          return;
        }
      }

      qrScannerAnimId = requestAnimationFrame(scan);
    }

    qrScannerAnimId = requestAnimationFrame(scan);
  }

  function handleScannedQrResult(qrText) {
    if (!qrText) return;
    playChime('copy');
    closeQrScanner();

    // Parse PIN and E2EE key
    let pin = '';
    const urlMatch = qrText.match(/\/([A-Z0-9]{4})(?:#|$|\?)/i);
    if (urlMatch) {
      pin = urlMatch[1].toUpperCase();
    } else {
      const clean = qrText.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (clean.length === 4) pin = clean;
    }

    const keyMatch = qrText.match(/#key=([A-Za-z0-9_-]+)/);
    if (keyMatch) {
      currentE2EEKeyB64 = keyMatch[1];
    }

    if (pin && pin.length === 4) {
      pin.split('').forEach((char, i) => {
        if (pinCells[i]) pinCells[i].value = char;
      });
      showToast(`Scanned PIN: ${pin} 🎯`);
      fetchDropByPin(pin);
    } else {
      showToast('Scanned QR does not contain a valid Drop PIN');
    }
  }

  // --- ADVANCED OPTIONS (CUSTOM 4-CHAR PIN & E2EE) ---
  function setupAdvancedOptions() {
    if (btnToggleAdvanced && advancedDrawer) {
      btnToggleAdvanced.addEventListener('click', () => {
        const isHidden = advancedDrawer.classList.contains('hidden');
        advancedDrawer.classList.toggle('hidden', !isHidden);
        btnToggleAdvanced.classList.toggle('open', isHidden);
      });
    }

    if (inputCustomPin) {
      inputCustomPin.addEventListener('input', (e) => {
        inputCustomPin.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      });
    }
  }

  // --- NATIVE ANDROID SHARE SHEET (SendIntent Plugin) ---
  function setupNativeSendIntent() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SendIntent) {
      const SendIntent = window.Capacitor.Plugins.SendIntent;

      // Handle initial shared data on cold startup
      SendIntent.getSharedData().then(result => {
        if (result && result.hasData) {
          processIncomingSendIntent(result);
        }
      }).catch(() => {});

      // Handle subsequent shared data when app is already in memory
      SendIntent.addListener('sendIntentReceived', (data) => {
        processIncomingSendIntent(data);
      });
    }
  }

  function processIncomingSendIntent(data) {
    if (!data) return;
    switchTab('send');

    if (data.type === 'text' && data.text) {
      inputText.value = data.text;
      detectLiveInput();
      showToast('Shared text received from Android Sheet 📥');
    } else if (data.type === 'files' && Array.isArray(data.files)) {
      data.files.forEach(f => {
        const id = 'f_' + Math.random().toString(36).substring(2, 9);
        let blobOrHandle = null;

        if (f.blob instanceof Blob) {
          blobOrHandle = f.blob;
        } else if (f.dataUrl) {
          blobOrHandle = dataUrlToBlob(f.dataUrl);
        } else if (f.dataBase64) {
          blobOrHandle = base64ToBlob(f.dataBase64, f.type);
        }
        if (!blobOrHandle) {
          blobOrHandle = new Blob([new Uint8Array(0)], { type: f.type || 'application/octet-stream' });
        }

        stagedFiles.push({
          id,
          name: f.name || 'shared_file',
          path: f.path || '',
          type: f.type || 'application/octet-stream',
          size: f.size || blobOrHandle.size,
          fileHandle: blobOrHandle
        });
      });

      renderStagedChips();
      checkTotalStagedSize();
      showToast(`Staged ${data.files.length} file(s) from Share Sheet 📥`);
    }
  }

  // --- DROPZONE & FOLDER UPLOADS ---
  function setupDropzone() {
    fileInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    if (folderInput) {
      folderInput.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    dropzone.addEventListener('click', (e) => {
      if (e.target.closest('#btn-camera') || e.target.closest('#btn-folder-snap') || e.target === fileInput || e.target === folderInput) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleFiles(fileInput.files);
      }
      fileInput.value = '';
    });

    if (folderInput && btnFolderSnap) {
      btnFolderSnap.addEventListener('click', (e) => {
        e.stopPropagation();
        folderInput.click();
      });

      folderInput.addEventListener('change', () => {
        if (folderInput.files && folderInput.files.length > 0) {
          handleFiles(folderInput.files, true);
        }
        folderInput.value = '';
      });
    }

    // Drag & Drop with Recursive Directory Traversal
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

    dropzone.addEventListener('drop', async (e) => {
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const filesWithPaths = [];
        const queue = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.webkitGetAsEntry) {
            const entry = item.webkitGetAsEntry();
            if (entry) queue.push(traverseFileTree(entry, ''));
          } else if (item.getAsFile) {
            const f = item.getAsFile();
            if (f) filesWithPaths.push({ file: f, path: '' });
          }
        }

        const results = await Promise.all(queue);
        results.flat().forEach(f => filesWithPaths.push(f));

        if (filesWithPaths.length > 0) {
          handleTraversedFiles(filesWithPaths);
        }
      } else if (e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    });
  }

  // Recursive Directory Traversal via webkitGetAsEntry
  async function traverseFileTree(item, path) {
    if (item.isFile) {
      return new Promise(resolve => {
        item.file(file => {
          resolve([{ file, path: path + file.name }]);
        });
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const entries = await new Promise(resolve => {
        const allEntries = [];
        function read() {
          dirReader.readEntries(result => {
            if (result.length === 0) resolve(allEntries);
            else {
              allEntries.push(...result);
              read();
            }
          });
        }
        read();
      });

      const subFiles = await Promise.all(
        entries.map(e => traverseFileTree(e, path + item.name + '/'))
      );
      return subFiles.flat();
    }
    return [];
  }

  function handleTraversedFiles(filesWithPaths) {
    filesWithPaths.forEach(({ file, path }) => {
      const id = 'f_' + Math.random().toString(36).substring(2, 9);
      stagedFiles.push({
        id,
        name: file.name,
        path: path || '',
        type: file.type || 'application/octet-stream',
        size: file.size,
        fileHandle: file
      });
    });
    renderStagedChips();
    checkTotalStagedSize();
  }

  function handleFiles(fileList, isFolder = false) {
    Array.from(fileList).forEach(file => {
      const id = 'f_' + Math.random().toString(36).substring(2, 9);
      const relativePath = file.webkitRelativePath || '';
      stagedFiles.push({
        id,
        name: file.name,
        path: relativePath,
        type: file.type || 'application/octet-stream',
        size: file.size,
        fileHandle: file
      });
    });
    renderStagedChips();
    checkTotalStagedSize();
  }

  function renderStagedChips() {
    stagedChipsList.innerHTML = '';
    if (stagedFiles.length === 0) {
      stagedChipsList.classList.add('hidden');
      return;
    }
    stagedChipsList.classList.remove('hidden');

    stagedFiles.forEach((f, idx) => {
      const chip = document.createElement('div');
      chip.className = 'staged-chip';
      const isDir = Boolean(f.path && f.path.includes('/'));
      chip.innerHTML = `
        <span class="chip-name" style="cursor:pointer;" title="Click to inspect preview: ${escapeHtml(f.path || f.name)}">
          ${isDir ? '📁 ' : ''}${escapeHtml(f.name)}
        </span>
        <span class="chip-size">${formatBytes(f.size)}</span>
        <button type="button" class="btn-remove-chip" data-idx="${idx}" title="Remove file">&times;</button>
      `;

      chip.querySelector('.chip-name').onclick = () => {
        openFileInspector(f.fileHandle || f, null, null);
      };

      stagedChipsList.appendChild(chip);
    });

    stagedChipsList.querySelectorAll('.btn-remove-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
        stagedFiles.splice(idx, 1);
        renderStagedChips();
        checkTotalStagedSize();
      });
    });
  }

  function checkTotalStagedSize() {
    const totalBytes = stagedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    const ONE_GB = 1024 * 1024 * 1024;

    if (totalBytes >= ONE_GB) {
      ttlLimitNotice.classList.remove('hidden');
      if (selectTtl.value === '86400') {
        selectTtl.value = '3600';
      }
      selectTtl.querySelector('option[value="86400"]').disabled = true;
    } else {
      ttlLimitNotice.classList.add('hidden');
      const opt24 = selectTtl.querySelector('option[value="86400"]');
      if (opt24) opt24.disabled = false;
    }
  }

  // --- SEND FORM SUBMISSION & RESUMABLE CHUNK STREAMING ---
  function setupSendForm() {
    inputText.addEventListener('input', detectLiveInput);

    btnSendDrop.addEventListener('click', async () => {
      const text = inputText.value.trim();
      if (!text && stagedFiles.length === 0) {
        showToast('Please add text or select files');
        return;
      }

      btnSendDrop.disabled = true;
      btnSendDrop.querySelector('.btn-text').textContent = 'Preparing Drop...';

      try {
        let isEncrypted = checkE2EE ? checkE2EE.checked : false;
        let e2eeKey = null;
        let e2eeKeyB64 = null;

        if (isEncrypted) {
          e2eeKey = await CryptoEngine.generateKey();
          e2eeKeyB64 = await CryptoEngine.exportKeyB64(e2eeKey);
          currentE2EEKey = e2eeKey;
          currentE2EEKeyB64 = e2eeKeyB64;
        }

        const customPin = inputCustomPin ? inputCustomPin.value.trim().toUpperCase() : '';
        const ttlSeconds = parseInt(selectTtl.value, 10);
        const burnAfterRead = checkBurn.checked;

        // Process files manifest
        const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per chunk
        const manifestFiles = [];

        for (const file of stagedFiles) {
          const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
          manifestFiles.push({
            id: file.id,
            name: file.name,
            path: file.path || '',
            type: file.type,
            size: file.size,
            chunkCount,
            chunkSize: CHUNK_SIZE
          });
        }

        // Encrypt text note if E2EE
        let processedText = text;
        if (text && isEncrypted && e2eeKey) {
          processedText = await CryptoEngine.encryptText(text, e2eeKey);
        }

        // Step 1: POST metadata manifest
        const payload = {
          customPin: customPin || undefined,
          text: processedText || undefined,
          textType: detectTextType(text),
          ttlSeconds,
          burnAfterRead,
          isEncrypted,
          files: manifestFiles
        };

        const res = await fetch(getApiUrl('/api/drop'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to create drop');
        }

        // Step 2: Stream binary chunks if files are present
        if (stagedFiles.length > 0) {
          await uploadFileChunksWithProgress(data.code, stagedFiles, CHUNK_SIZE, e2eeKey);
        }

        playChime('success');
        activeDropData = data;
        isExplicitNewSend = false;

        // Embed E2EE key in URL hash fragment
        if (isEncrypted && e2eeKeyB64) {
          data.directUrl += `#key=${e2eeKeyB64}`;
          data.e2eeKeyB64 = e2eeKeyB64;
        }

        // Persist sender state and add to Vault History
        localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(data));
        addDropToVaultHistory({
          code: data.code,
          createdAt: Date.now(),
          expiresAt: data.expiresAt,
          ttlSeconds: data.ttlSeconds,
          burnAfterRead: data.burnAfterRead,
          isEncrypted,
          e2eeKeyB64,
          direction: 'sent',
          title: text ? text.slice(0, 40) : `${stagedFiles.length} file(s)`,
          fileCount: stagedFiles.length,
          status: 'active'
        });

        renderShareScreen(data);
        showView('share');
        showToast(`Drop #${data.code} created! 🚀`);

        // Start WebRTC P2P listener & pickup watcher
        initWebRTCSender(data.code);
        startPickupWatcher(data.code);

      } catch (err) {
        showToast(err.message || 'Error creating drop');
        uploadProgressContainer.classList.add('hidden');
      } finally {
        btnSendDrop.disabled = false;
        btnSendDrop.querySelector('.btn-text').textContent = 'Create Drop';
      }
    });
  }

  // Multi-Part Chunk Upload with Real-Time Speed & Resume capability
  async function uploadFileChunksWithProgress(code, files, chunkSize, e2eeKey) {
    uploadProgressContainer.classList.remove('hidden');
    uploadProgressBar.style.width = '0%';
    uploadPercentBadge.textContent = '0%';

    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    let bytesUploadedAcrossFiles = 0;
    const startTime = Date.now();

    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const file = files[fIdx];
      const chunkCount = Math.max(1, Math.ceil(file.size / chunkSize));

      for (let cIdx = 0; cIdx < chunkCount; cIdx++) {
        const start = cIdx * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        let chunkBlob = file.fileHandle.slice(start, end);

        // Encrypt chunk if E2EE
        if (e2eeKey) {
          const buffer = await chunkBlob.arrayBuffer();
          const encrypted = await CryptoEngine.encryptBytes(buffer, e2eeKey);
          chunkBlob = new Blob([encrypted], { type: 'application/octet-stream' });
        }

        uploadStatusText.textContent = `Uploading ${file.name} (Chunk ${cIdx + 1}/${chunkCount})...`;

        await uploadSingleChunkXHR(code, file.id, cIdx, chunkBlob, (chunkLoaded) => {
          const currentTotal = bytesUploadedAcrossFiles + chunkLoaded;
          const pct = Math.min(99, Math.round((currentTotal / (totalBytes || 1)) * 100));
          uploadProgressBar.style.width = pct + '%';
          uploadPercentBadge.textContent = pct + '%';

          uploadBytesText.textContent = `${formatBytes(currentTotal)} / ${formatBytes(totalBytes)}`;
          const elapsedSec = (Date.now() - startTime) / 1000;
          if (elapsedSec > 0.3) {
            const speed = currentTotal / elapsedSec;
            uploadSpeedText.textContent = `${formatBytes(speed)}/s`;
          }
        });

        bytesUploadedAcrossFiles += (end - start);
      }
    }

    uploadProgressBar.style.width = '100%';
    uploadPercentBadge.textContent = '100%';
    uploadStatusText.textContent = 'Upload complete!';
    setTimeout(() => { uploadProgressContainer.classList.add('hidden'); }, 800);
  }

  function uploadSingleChunkXHR(code, fileId, chunkIndex, blob, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = getApiUrl(`/api/drop/${code}/file/${fileId}/chunk/${chunkIndex}`);
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Chunk upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error uploading chunk'));
      xhr.send(blob);
    });
  }

  // --- WEBRTC P2P DIRECT LAN ACCELERATOR ("ZERO CLOUD" MODE) ---
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };

  function initWebRTCSender(code) {
    if (!window.RTCPeerConnection) return;
    try {
      activePeerConnection = new RTCPeerConnection(rtcConfig);
      activeDataChannel = activePeerConnection.createDataChannel('atmr_p2p_channel');

      activeDataChannel.onopen = () => {
        isP2PConnected = true;
        shareP2pBadge.classList.remove('hidden');
        shareP2pText.textContent = '⚡ Direct P2P Connected (100 MB/s)';
        showToast('Direct P2P LAN Channel Established! ⚡');
      };

      activePeerConnection.onicecandidate = (e) => {
        if (e.candidate) {
          sendWebRTCSignal(code, 'sender', 'candidate', e.candidate);
        }
      };

      // Listen for incoming offers from receiver
      pollWebRTCSignals(code, 'sender', async (signal) => {
        if (signal.type === 'offer') {
          if (activePeerConnection && activePeerConnection.signalingState === 'stable') {
            try {
              await activePeerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
              const answer = await activePeerConnection.createAnswer();
              await activePeerConnection.setLocalDescription(answer);
              await sendWebRTCSignal(code, 'sender', 'answer', answer);
            } catch (e) {}
          }
        } else if (signal.type === 'candidate' && signal.payload) {
          try {
            await activePeerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
          } catch (e) {}
        }
      });
    } catch (e) {}
  }

  async function initWebRTCReceiver(code) {
    if (!window.RTCPeerConnection) return;
    try {
      activePeerConnection = new RTCPeerConnection(rtcConfig);

      activePeerConnection.ondatachannel = (e) => {
        activeDataChannel = e.channel;
        activeDataChannel.onopen = () => {
          isP2PConnected = true;
          vaultP2pBadge.classList.remove('hidden');
          showToast('Direct P2P LAN Connected! ⚡');
        };
      };

      activePeerConnection.onicecandidate = (e) => {
        if (e.candidate) {
          sendWebRTCSignal(code, 'receiver', 'candidate', e.candidate);
        }
      };

      const offer = await activePeerConnection.createOffer();
      await activePeerConnection.setLocalDescription(offer);
      await sendWebRTCSignal(code, 'receiver', 'offer', offer);

      // Poll for answer
      pollWebRTCSignals(code, 'receiver', async (signal) => {
        if (signal.type === 'answer') {
          if (activePeerConnection && activePeerConnection.signalingState === 'have-local-offer') {
            try {
              await activePeerConnection.setRemoteDescription(new RTCSessionDescription(signal.payload));
            } catch (e) {}
          }
        } else if (signal.type === 'candidate' && signal.payload) {
          try {
            await activePeerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
          } catch (e) {}
        }
      });
    } catch (e) {}
  }

  async function sendWebRTCSignal(code, from, type, payload) {
    try {
      await fetch(getApiUrl(`/api/webrtc/${code}/signal`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, type, payload })
      });
    } catch (e) {}
  }

  function pollWebRTCSignals(code, forPeer, onSignal) {
    let active = true;
    const interval = setInterval(async () => {
      if (!active) return;
      try {
        const res = await fetch(getApiUrl(`/api/webrtc/${code}/signal?for=${forPeer}`));
        if (res.ok) {
          const data = await res.json();
          if (data.signals && data.signals.length > 0) {
            for (const sig of data.signals) {
              onSignal(sig);
            }
          }
        }
      } catch (e) {}
    }, 1500);

    setTimeout(() => { clearInterval(interval); active = false; }, 45000);
  }

  // --- RETRIEVE DROP & ZERO-KNOWLEDGE DECRYPTION ---
  async function fetchDropByPin(pin) {
    btnFetchDrop.disabled = true;
    btnFetchDrop.textContent = 'Decrypting...';

    try {
      const res = await fetch(getApiUrl(`/api/drop/${pin}`));
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Drop not found or expired');
      }

      playChime('success');
      clearPinInputs();

      // Check for E2EE key in URL hash or prompt
      let e2eeKey = null;
      if (data.drop.isEncrypted) {
        const hashKey = window.location.hash.match(/#key=([A-Za-z0-9_-]+)/);
        const keyB64 = currentE2EEKeyB64 || (hashKey ? hashKey[1] : null);
        if (keyB64) {
          e2eeKey = await CryptoEngine.importKeyB64(keyB64);
        }
      }

      // Decrypt text if E2EE
      if (data.drop.isEncrypted && data.drop.text && e2eeKey) {
        try {
          data.drop.text = await CryptoEngine.decryptText(data.drop.text, e2eeKey);
        } catch (e) {}
      }

      // Add to Vault History
      addDropToVaultHistory({
        code: data.drop.code,
        createdAt: data.drop.createdAt || Date.now(),
        expiresAt: data.drop.expiresAt,
        ttlSeconds: data.drop.ttlSeconds,
        burnAfterRead: data.drop.burnAfterRead,
        isEncrypted: data.drop.isEncrypted,
        direction: 'received',
        title: data.drop.text ? data.drop.text.slice(0, 40) : `${data.drop.files?.length || 0} file(s)`,
        fileCount: data.drop.files?.length || 0,
        status: data.drop.burnAfterRead ? 'burned' : 'active'
      });

      renderVaultScreen(data.drop, e2eeKey);
      showView('vault');
      showToast(`Drop #${data.drop.code} decrypted! 🔓`);

      // Try WebRTC P2P connection to sender if active
      initWebRTCReceiver(data.drop.code);

    } catch (err) {
      showToast(err.message || 'Failed to retrieve drop');
    } finally {
      btnFetchDrop.disabled = false;
      btnFetchDrop.textContent = 'Retrieve Drop';
    }
  }

  // --- SHARE SCREEN RENDERING ---
  function renderShareScreen(data) {
    sharePinCode.textContent = data.code;
    shareDirectUrl.value = data.directUrl;

    if (data.burnAfterRead) {
      shareBurnBadge.classList.remove('hidden');
    } else {
      shareBurnBadge.classList.add('hidden');
    }

    if (data.isEncrypted) {
      shareE2eeBadge.classList.remove('hidden');
    } else {
      shareE2eeBadge.classList.add('hidden');
    }

    // Generate QR Code
    if (shareQrcodeCanvas && typeof window.QRCode === 'function') {
      shareQrcodeCanvas.innerHTML = '';
      new window.QRCode(shareQrcodeCanvas, {
        text: data.directUrl,
        width: 170,
        height: 170,
        colorDark: '#ffffff',
        colorLight: '#0b0e14',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    }

    // Start Countdown
    startCountdown(data.expiresAt, shareTimeLeft, () => {
      shareStatusText.textContent = 'Expired';
      shareStatusDot.style.background = '#ef4444';
      showToast(`Drop #${data.code} has expired`);
    });

    btnCopyPin.onclick = () => {
      navigator.clipboard.writeText(data.code);
      playChime('copy');
      showToast(`PIN ${data.code} copied! 📋`);
    };

    btnCopyUrl.onclick = () => {
      navigator.clipboard.writeText(data.directUrl);
      playChime('copy');
      showToast('Direct link copied! 🔗');
    };

    btnCancelDrop.onclick = async () => {
      if (confirm(`Revoke and immediately delete drop #${data.code}?`)) {
        await fetch(getApiUrl(`/api/drop/${data.code}`), { method: 'DELETE' });
        localStorage.removeItem(SENDER_STORAGE_KEY);
        activeDropData = null;
        updateVaultHistoryStatus(data.code, 'burned');
        showToast(`Drop #${data.code} revoked`);
        switchTab('send');
      }
    };

    btnNewSend.onclick = () => {
      isExplicitNewSend = true;
      stagedFiles = [];
      inputText.value = '';
      renderStagedChips();
      detectLiveInput();
      showView('send');
    };
  }

  // --- VAULT SCREEN RENDERING ---
  function renderVaultScreen(drop, e2eeKey) {
    if (drop.burnAfterRead) {
      receiveBurnNotice.classList.remove('hidden');
    } else {
      receiveBurnNotice.classList.add('hidden');
    }

    if (drop.isEncrypted) {
      vaultE2eeBadge.classList.remove('hidden');
    } else {
      vaultE2eeBadge.classList.add('hidden');
    }

    // Text & Links
    if (drop.text) {
      receivedTextContainer.classList.remove('hidden');
      receivedTextContent.textContent = drop.text;
      const urls = extractUrls(drop.text);
      if (urls.length > 0) {
        btnOpenReceivedLink.classList.remove('hidden');
        btnOpenReceivedLink.href = urls[0];
        receivedTextBadge.classList.remove('hidden');
      } else {
        btnOpenReceivedLink.classList.add('hidden');
        receivedTextBadge.classList.add('hidden');
      }

      btnCopyReceivedText.onclick = () => {
        navigator.clipboard.writeText(drop.text);
        playChime('copy');
        showToast('Text copied to clipboard! 📋');
      };
    } else {
      receivedTextContainer.classList.add('hidden');
    }

    // Photos & Files
    const files = drop.files || [];
    const images = files.filter(f => f.type && f.type.startsWith('image/'));
    const nonImages = files.filter(f => !f.type || !f.type.startsWith('image/'));

    // Images Grid
    if (images.length > 0) {
      receivedImagesContainer.classList.remove('hidden');
      imagesCount.textContent = images.length;
      receivedImagesGrid.innerHTML = '';

      images.forEach(async (img) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.title = 'Click to inspect in full-screen lightbox';
        const fileUrl = getApiUrl(`/api/file/${drop.code}/${img.id}`);

        const imgWrap = document.createElement('div');
        imgWrap.className = 'gallery-img-wrap';

        const imgEl = document.createElement('img');
        imgEl.className = 'gallery-img';
        imgEl.alt = img.name;
        imgEl.loading = 'lazy';

        const hoverBadge = document.createElement('div');
        hoverBadge.className = 'gallery-hover-badge';
        hoverBadge.innerHTML = `<span class="badge-icon">🔍</span><span>Inspect</span>`;

        imgWrap.appendChild(imgEl);
        imgWrap.appendChild(hoverBadge);

        const footer = document.createElement('div');
        footer.className = 'gallery-item-footer';
        footer.innerHTML = `
          <span class="gallery-item-name" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</span>
          <div class="gallery-item-actions">
            <button type="button" class="btn-gallery-action btn-inspect-action" title="Inspect image">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              <span>Inspect</span>
            </button>
            <button type="button" class="btn-gallery-action btn-save-action" title="Save file">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Save</span>
            </button>
          </div>
        `;

        item.onclick = (e) => {
          if (!e.target.closest('.btn-save-action')) {
            openFileInspector(img, drop.code, e2eeKey);
          }
        };

        if (drop.isEncrypted && e2eeKey) {
          try {
            const res = await fetch(fileUrl);
            const cipherBuf = await res.arrayBuffer();
            const plainBuf = await CryptoEngine.decryptBytes(cipherBuf, e2eeKey);
            const blob = new Blob([plainBuf], { type: img.type || 'image/jpeg' });
            const blobUrl = URL.createObjectURL(blob);
            imgEl.src = blobUrl;
            footer.querySelector('.btn-save-action').onclick = (e) => {
              e.stopPropagation();
              downloadBlob(blob, img.name);
            };
          } catch (e) {
            imgEl.alt = 'Decryption failed';
          }
        } else {
          imgEl.src = fileUrl;
          footer.querySelector('.btn-save-action').onclick = (e) => {
            e.stopPropagation();
            triggerDirectDownload(fileUrl + '?download=true', img.name);
          };
        }

        item.appendChild(imgWrap);
        item.appendChild(footer);
        receivedImagesGrid.appendChild(item);
      });
    } else {
      receivedImagesContainer.classList.add('hidden');
    }

    // Files List (Preserves Directory Structure + Instant Inspection)
    if (nonImages.length > 0) {
      receivedFilesContainer.classList.remove('hidden');
      filesCount.textContent = nonImages.length;
      receivedFilesList.innerHTML = '';

      nonImages.forEach(file => {
        const row = document.createElement('div');
        row.className = 'file-row';
        const isDir = Boolean(file.path && file.path.includes('/'));
        const fileUrl = getApiUrl(`/api/file/${drop.code}/${file.id}?download=true`);

        row.innerHTML = `
          <div class="file-row-left" style="cursor:pointer;" title="Click to inspect preview">
            <span class="file-icon">${isDir ? '📁' : '📄'}</span>
            <div class="file-info">
              <span class="file-name" title="${escapeHtml(file.path || file.name)}">${escapeHtml(file.name)}</span>
              <span class="file-meta">${isDir ? escapeHtml(file.path) + ' • ' : ''}${formatBytes(file.size)}</span>
            </div>
          </div>
          <div class="file-row-actions">
            <button type="button" class="btn-ghost sm btn-inspect-file" title="Inspect / preview without downloading">👁️ Inspect</button>
            <button type="button" class="btn-secondary sm btn-download-file">Download</button>
          </div>
        `;

        row.querySelector('.file-row-left').onclick = () => {
          openFileInspector(file, drop.code, e2eeKey);
        };

        row.querySelector('.btn-inspect-file').onclick = () => {
          openFileInspector(file, drop.code, e2eeKey);
        };

        row.querySelector('.btn-download-file').onclick = async (e) => {
          const btn = e.currentTarget;
          if (drop.isEncrypted && e2eeKey) {
            btn.disabled = true;
            btn.textContent = 'Decrypting...';
            try {
              const res = await fetch(getApiUrl(`/api/file/${drop.code}/${file.id}`));
              const cipherBuf = await res.arrayBuffer();
              const plainBuf = await CryptoEngine.decryptBytes(cipherBuf, e2eeKey);
              const blob = new Blob([plainBuf], { type: file.type || 'application/octet-stream' });
              downloadBlob(blob, file.name);
            } catch (err) {
              showToast('Decryption failed');
            } finally {
              btn.disabled = false;
              btn.textContent = 'Download';
            }
          } else {
            triggerDirectDownload(fileUrl, file.name);
          }
        };

        receivedFilesList.appendChild(row);
      });

      // "Download All as ZIP" via JSZip (preserving directory paths)
      if (btnDownloadAllZip && typeof window.JSZip === 'function') {
        btnDownloadAllZip.onclick = async () => {
          btnDownloadAllZip.disabled = true;
          btnDownloadAllZip.textContent = 'Zipping...';
          try {
            const zip = new window.JSZip();
            for (const file of files) {
              const res = await fetch(getApiUrl(`/api/file/${drop.code}/${file.id}`));
              let blob = null;
              if (drop.isEncrypted && e2eeKey) {
                const cipherBuf = await res.arrayBuffer();
                const plainBuf = await CryptoEngine.decryptBytes(cipherBuf, e2eeKey);
                blob = new Blob([plainBuf], { type: file.type || 'application/octet-stream' });
              } else {
                blob = await res.blob();
              }
              const zipPath = file.path || file.name;
              zip.file(zipPath, blob);
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, `drop-${drop.code}-files.zip`);
            showToast('ZIP archive downloaded! 📦');
          } catch (err) {
            showToast('Failed to bundle ZIP');
          } finally {
            btnDownloadAllZip.disabled = false;
            btnDownloadAllZip.textContent = 'Download All (.zip)';
          }
        };
      }
    } else {
      receivedFilesContainer.classList.add('hidden');
    }

    // Start Countdown on Receiver Vault
    if (receiveExpiryText) {
      startCountdown(drop.expiresAt, receiveExpiryText, () => {
        receiveExpiryText.textContent = 'Expired';
        receiveExpiryText.style.color = '#ef4444';
        showToast(`Drop #${drop.code} has expired`);
      });
    }

    // Delete Drop From Server button: ONLY visible and usable by the Drop Creator (Sender)
    const btnDeleteVault = document.getElementById('btn-delete-vault-drop');
    const isSender = isSenderOfDrop(drop.code);

    if (btnDeleteVault) {
      if (isSender) {
        btnDeleteVault.classList.remove('hidden');
        btnDeleteVault.onclick = async () => {
          if (confirm(`Permanently delete and burn drop #${drop.code} from server?`)) {
            btnDeleteVault.disabled = true;
            btnDeleteVault.textContent = 'Deleting...';
            try {
              await fetch(getApiUrl(`/api/drop/${drop.code}`), { method: 'DELETE' });
              localStorage.removeItem(SENDER_STORAGE_KEY);
              activeDropData = null;
              updateVaultHistoryStatus(drop.code, 'burned');
              showToast(`Drop #${drop.code} permanently deleted 🗑️`);
              switchTab('send');
            } catch (err) {
              showToast('Failed to delete drop');
            } finally {
              btnDeleteVault.disabled = false;
              btnDeleteVault.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete From Server';
            }
          }
        };
      } else {
        btnDeleteVault.classList.add('hidden');
      }
    }

    btnReceiveAnother.onclick = () => {
      switchTab('receive');
    };
  }

  function isSenderOfDrop(code) {
    if (!code) return false;
    if (activeDropData && activeDropData.code === code) return true;
    try {
      const activeSaved = localStorage.getItem(SENDER_STORAGE_KEY);
      if (activeSaved) {
        const parsed = JSON.parse(activeSaved);
        if (parsed && parsed.code === code) return true;
      }
      const history = getVaultHistory();
      const item = history.find(h => h.code === code);
      if (item && item.direction === 'sent') return true;
    } catch (e) {}
    return false;
  }

  // --- DEDICATED VAULT HISTORY SYSTEM ---
  function setupVaultHistory() {
    if (!btnOpenHistory) return;

    btnOpenHistory.addEventListener('click', openVaultHistory);
    if (btnCloseHistory) btnCloseHistory.addEventListener('click', closeVaultHistory);
    if (historyModalOverlay) historyModalOverlay.addEventListener('click', closeVaultHistory);

    if (btnClearHistory) {
      btnClearHistory.addEventListener('click', () => {
        if (confirm('Clear all local drop history?')) {
          localStorage.removeItem(VAULT_HISTORY_KEY);
          renderVaultHistoryList('all');
          updateHistoryBadge();
          showToast('History cleared');
        }
      });
    }

    historyFilterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        historyFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter');
        renderVaultHistoryList(filter);
      });
    });
  }

  function getVaultHistory() {
    try {
      const raw = localStorage.getItem(VAULT_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function addDropToVaultHistory(item) {
    const list = getVaultHistory().filter(h => h.code !== item.code);
    list.unshift(item);
    if (list.length > 50) list.pop();
    localStorage.setItem(VAULT_HISTORY_KEY, JSON.stringify(list));
    updateHistoryBadge();
  }

  function updateVaultHistoryStatus(code, status) {
    const list = getVaultHistory();
    const item = list.find(h => h.code === code);
    if (item) {
      item.status = status;
      localStorage.setItem(VAULT_HISTORY_KEY, JSON.stringify(list));
      updateHistoryBadge();
    }
  }

  function updateHistoryBadge() {
    const list = getVaultHistory();
    const activeCount = list.filter(h => h.status === 'active' && (!h.expiresAt || h.expiresAt > Date.now())).length;
    if (historyBadgeCount) {
      if (activeCount > 0) {
        historyBadgeCount.textContent = activeCount;
        historyBadgeCount.classList.remove('hidden');
      } else {
        historyBadgeCount.classList.add('hidden');
      }
    }
  }

  function openVaultHistory() {
    historyModal.classList.add('show');
    historyModal.setAttribute('aria-hidden', 'false');
    renderVaultHistoryList('all');
  }

  function closeVaultHistory() {
    historyModal.classList.remove('show');
    historyModal.setAttribute('aria-hidden', 'true');
  }

  function renderVaultHistoryList(filter = 'all') {
    const list = getVaultHistory();
    const now = Date.now();

    const filtered = list.filter(item => {
      if (filter === 'sent') return item.direction === 'sent';
      if (filter === 'received') return item.direction === 'received';
      return true;
    });

    historyList.innerHTML = '';
    if (filtered.length === 0) {
      historyEmpty.classList.remove('hidden');
      return;
    }
    historyEmpty.classList.add('hidden');

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';
      const isExpired = item.expiresAt && item.expiresAt <= now;
      let statusClass = item.status || 'active';
      if (isExpired && statusClass === 'active') statusClass = 'expired';

      card.innerHTML = `
        <div class="history-card-top">
          <div class="history-pin-wrap">
            <span class="history-pin-badge">#${item.code}</span>
            <span class="history-direction-tag">${item.direction || 'drop'}</span>
          </div>
          <span class="history-status-pill ${statusClass}">${statusClass.toUpperCase()}</span>
        </div>
        <div class="history-card-content">${escapeHtml(item.title || 'Drop Payload')}</div>
        <div class="history-card-actions">
          <span>${formatTimeAgo(item.createdAt)}</span>
          ${item.direction === 'sent' && statusClass === 'active' ? `<button type="button" class="history-btn-revoke" data-code="${item.code}">Revoke</button>` : ''}
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.history-btn-revoke')) return;
        closeVaultHistory();
        fetchDropByPin(item.code);
      });

      const revokeBtn = card.querySelector('.history-btn-revoke');
      if (revokeBtn) {
        revokeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const code = revokeBtn.getAttribute('data-code');
          if (confirm(`Revoke and wipe drop #${code}?`)) {
            await fetch(getApiUrl(`/api/drop/${code}`), { method: 'DELETE' });
            updateVaultHistoryStatus(code, 'burned');
            renderVaultHistoryList(filter);
            showToast(`Drop #${code} revoked`);
          }
        });
      }

      historyList.appendChild(card);
    });
  }

  // --- PICKUP WATCHER ---
  function startPickupWatcher(code) {
    let active = true;
    const interval = setInterval(async () => {
      if (!active || !activeDropData || activeDropData.code !== code) {
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch(getApiUrl(`/api/drop/${code}?peek=true`));
        if (res.ok) {
          const data = await res.json();
          if (data.drop && data.drop.pickedUp) {
            sharePickupBanner.classList.remove('hidden');
            shareStatusText.textContent = 'Picked up 🎉';
            shareStatusDot.style.background = '#38bdf8';
            updateVaultHistoryStatus(code, 'pickedUp');
            playChime('success');
            clearInterval(interval);
            active = false;
          }
        }
      } catch (e) {}
    }, 2000);
  }

  // --- HELPERS ---
  function detectLiveInput() {
    const val = inputText.value.trim();
    if (!val) {
      liveInputBar.classList.add('hidden');
      return;
    }
    liveInputBar.classList.remove('hidden');
    liveStats.textContent = `${val.length} chars`;

    const urls = extractUrls(val);
    if (urls.length > 0) {
      liveTagBadge.textContent = '🔗 Link';
      try {
        liveTagDesc.textContent = new URL(urls[0]).hostname;
      } catch (e) {
        liveTagDesc.textContent = 'web link';
      }
    } else {
      liveTagBadge.textContent = '📝 Note';
      liveTagDesc.textContent = 'plain text';
    }
  }

  function detectTextType(text) {
    if (!text) return 'plain';
    const urls = extractUrls(text);
    if (urls.length > 0 && urls[0] === text.trim()) return 'url';
    return 'plain';
  }

  function extractUrls(text) {
    if (!text) return [];
    const matches = text.match(/https?:\/\/[^\s]+/g);
    return matches || [];
  }

  function startCountdown(expiresAt, element, onExpire) {
    if (!element) return;
    if (element._countdownInterval) {
      clearInterval(element._countdownInterval);
      element._countdownInterval = null;
    }

    if (!expiresAt) {
      element.textContent = '--:--';
      return;
    }

    const exp = typeof expiresAt === 'string' ? parseInt(expiresAt, 10) : expiresAt;
    const expMs = exp < 10000000000 ? exp * 1000 : exp;

    function formatTime(remainingSec) {
      if (remainingSec <= 0) return '00:00';
      if (remainingSec >= 3600) {
        const h = Math.floor(remainingSec / 3600);
        const m = Math.floor((remainingSec % 3600) / 60);
        const s = remainingSec % 60;
        return `${h}h ${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
      }
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function tick() {
      const now = Date.now();
      const remainingSec = Math.max(0, Math.floor((expMs - now) / 1000));
      element.textContent = formatTime(remainingSec);
      if (remainingSec <= 0) {
        clearInterval(element._countdownInterval);
        element._countdownInterval = null;
        if (typeof onExpire === 'function') onExpire();
      }
    }

    tick();
    element._countdownInterval = setInterval(tick, 1000);
  }

  function updateActiveBanner() {
    try {
      const raw = localStorage.getItem(SENDER_STORAGE_KEY);
      if (raw) {
        const drop = JSON.parse(raw);
        if (drop && drop.expiresAt > Date.now()) {
          activeBannerPin.textContent = drop.code;
          activeDropBanner.classList.remove('hidden');

          const activeBannerTime = document.getElementById('active-banner-time');
          if (activeBannerTime) {
            startCountdown(drop.expiresAt, activeBannerTime, () => {
              activeDropBanner.classList.add('hidden');
            });
          }

          btnBannerView.onclick = () => {
            activeDropData = drop;
            renderShareScreen(drop);
            showView('share');
          };

          const btnBannerDelete = document.getElementById('btn-banner-delete');
          if (btnBannerDelete) {
            btnBannerDelete.onclick = async (e) => {
              e.stopPropagation();
              if (confirm(`Delete active drop #${drop.code}?`)) {
                await fetch(getApiUrl(`/api/drop/${drop.code}`), { method: 'DELETE' });
                localStorage.removeItem(SENDER_STORAGE_KEY);
                activeDropData = null;
                activeDropBanner.classList.add('hidden');
                updateVaultHistoryStatus(drop.code, 'burned');
                showToast(`Drop #${drop.code} deleted`);
              }
            };
          }

          btnBannerDismiss.onclick = () => {
            activeDropBanner.classList.add('hidden');
          };
        } else {
          activeDropBanner.classList.add('hidden');
        }
      }
    } catch (e) {}
  }

  function checkDirectUrlOrActiveDrop() {
    let path = window.location.pathname.replace(/^\//, '').toUpperCase();
    if (!path || path.length !== 4) {
      const hashMatch = window.location.hash.match(/^#([A-Za-z0-9]{4})/);
      if (hashMatch) path = hashMatch[1].toUpperCase();
    }
    if (path.length === 4 && /^[A-Z0-9]{4}$/.test(path)) {
      switchTab('receive');
      path.split('').forEach((c, i) => { if (pinCells[i]) pinCells[i].value = c; });
      fetchDropByPin(path);
    }
  }

  function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'clean-toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // --- CAMERA PHOTO SNAP ---
  function setupCamera() {
    if (!btnCamera || !cameraModal) return;
    btnCamera.addEventListener('click', openCamera);
    btnCameraClose.addEventListener('click', closeCamera);
    btnCameraSnap.addEventListener('click', capturePhoto);
  }

  async function openCamera() {
    cameraModal.classList.add('show');
    cameraModal.setAttribute('aria-hidden', 'false');
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cameraVideo.srcObject = cameraStream;
      cameraVideo.play();
    } catch (e) {
      showToast('Camera access failed');
      closeCamera();
    }
  }

  function closeCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    cameraModal.classList.remove('show');
    cameraModal.setAttribute('aria-hidden', 'true');
  }

  function capturePhoto() {
    if (!cameraStream) return;
    cameraCanvas.width = cameraVideo.videoWidth;
    cameraCanvas.height = cameraVideo.videoHeight;
    const ctx = cameraCanvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0);

    cameraCanvas.toBlob(blob => {
      if (blob) {
        const id = 'f_' + Math.random().toString(36).substring(2, 9);
        const fileName = `photo_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        stagedFiles.push({
          id,
          name: fileName,
          path: '',
          type: 'image/jpeg',
          size: file.size,
          fileHandle: file
        });
        renderStagedChips();
        checkTotalStagedSize();
        playChime('copy');
        showToast('Photo captured! 📷');
      }
      closeCamera();
    }, 'image/jpeg', 0.9);
  }

  // --- UNIVERSAL FILE & IMAGE INSPECTOR ENGINE ---
  let activeInspectorObjectUrl = null;
  let activeInspectorText = null;
  let activeInspectorBlob = null;
  let activeInspectorFile = null;
  let currentZoom = 1;
  let isDraggingImg = false;
  let startX = 0, startY = 0, currentTranslateX = 0, currentTranslateY = 0;

  function setupFileInspector() {
    const inspectorModal = document.getElementById('inspector-modal');
    const inspectorModalOverlay = document.getElementById('inspector-modal-overlay');
    const btnCloseInspector = document.getElementById('btn-close-inspector');
    const btnInspectorCopy = document.getElementById('btn-inspector-copy');
    const btnInspectorDownload = document.getElementById('btn-inspector-download');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');

    if (btnCloseInspector) btnCloseInspector.addEventListener('click', closeFileInspector);
    if (inspectorModalOverlay) inspectorModalOverlay.addEventListener('click', closeFileInspector);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && inspectorModal && inspectorModal.classList.contains('show')) {
        closeFileInspector();
      }
    });

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => adjustZoom(0.25));
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => adjustZoom(-0.25));
    }
    if (btnZoomReset) {
      btnZoomReset.addEventListener('click', () => resetZoom());
    }

    if (btnInspectorCopy) {
      btnInspectorCopy.addEventListener('click', async () => {
        if (activeInspectorText) {
          navigator.clipboard.writeText(activeInspectorText);
          playChime('copy');
          showToast('Content copied to clipboard! 📋');
        } else if (activeInspectorBlob && activeInspectorBlob.type && activeInspectorBlob.type.startsWith('image/')) {
          try {
            if (navigator.clipboard && window.ClipboardItem) {
              await navigator.clipboard.write([
                new ClipboardItem({ [activeInspectorBlob.type]: activeInspectorBlob })
              ]);
              playChime('copy');
              showToast('Image copied to clipboard! 🖼️');
            } else {
              showToast('Direct image clipboard copy not supported in this browser');
            }
          } catch (e) {
            showToast('Could not copy image');
          }
        }
      });
    }

    if (btnInspectorDownload) {
      btnInspectorDownload.addEventListener('click', () => {
        if (activeInspectorBlob && activeInspectorFile) {
          downloadBlob(activeInspectorBlob, activeInspectorFile.name);
        } else if (activeInspectorFile && activeInspectorFile.dropCode && activeInspectorFile.id) {
          triggerDirectDownload(getApiUrl(`/api/file/${activeInspectorFile.dropCode}/${activeInspectorFile.id}?download=true`), activeInspectorFile.name);
        }
      });
    }
  }

  function closeFileInspector() {
    const inspectorModal = document.getElementById('inspector-modal');
    if (inspectorModal) {
      inspectorModal.classList.remove('show');
      inspectorModal.setAttribute('aria-hidden', 'true');
    }
    if (activeInspectorObjectUrl) {
      URL.revokeObjectURL(activeInspectorObjectUrl);
      activeInspectorObjectUrl = null;
    }
    activeInspectorText = null;
    activeInspectorBlob = null;
    activeInspectorFile = null;
    currentZoom = 1;
    currentTranslateX = 0;
    currentTranslateY = 0;
  }

  function adjustZoom(delta) {
    currentZoom = Math.min(4, Math.max(0.25, currentZoom + delta));
    applyImageTransform();
  }

  function resetZoom() {
    currentZoom = 1;
    currentTranslateX = 0;
    currentTranslateY = 0;
    applyImageTransform();
  }

  function applyImageTransform() {
    const img = document.getElementById('inspector-display-img');
    const zoomLevelEl = document.getElementById('inspector-zoom-level');
    if (img) {
      img.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentZoom})`;
    }
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${Math.round(currentZoom * 100)}%`;
    }
  }

  async function openFileInspector(file, dropCode = null, e2eeKey = null) {
    const inspectorModal = document.getElementById('inspector-modal');
    const inspectorFileIcon = document.getElementById('inspector-file-icon');
    const inspectorFileName = document.getElementById('inspector-file-name');
    const inspectorFileSize = document.getElementById('inspector-file-size');
    const inspectorFileType = document.getElementById('inspector-file-type');
    const inspectorDimBadge = document.getElementById('inspector-dim-badge');
    const inspectorModalBody = document.getElementById('inspector-modal-body');
    const inspectorImageControls = document.getElementById('inspector-image-controls');
    const inspectorCodeStats = document.getElementById('inspector-code-stats');
    const inspectorCopyLabel = document.getElementById('inspector-copy-label');

    if (!inspectorModal) return;

    closeFileInspector();
    activeInspectorFile = Object.assign({}, file, { dropCode });

    // Identify category & extension
    const fileName = file.name || 'file';
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    let mimeType = file.type || '';
    const isImage = mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
    const isPdf = mimeType === 'application/pdf' || ext === 'pdf';
    const isAudio = mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext);
    const isVideo = mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(ext);
    const isCodeOrText = mimeType.startsWith('text/') || mimeType === 'application/json' ||
      ['txt', 'js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'py', 'md', 'csv', 'tsv', 'xml', 'svg', 'yml', 'yaml', 'sh', 'bash', 'sql', 'rs', 'go', 'c', 'cpp', 'h', 'java', 'kt', 'php', 'rb', 'log', 'env', 'toml', 'ini', 'conf', 'diff', 'patch'].includes(ext);

    // Set Header Metadata
    inspectorFileName.textContent = fileName;
    inspectorFileSize.textContent = formatBytes(file.size || 0);
    inspectorFileType.textContent = ext ? ext.toUpperCase() : (mimeType || 'FILE');
    inspectorDimBadge.classList.add('hidden');
    inspectorImageControls.classList.add('hidden');
    inspectorCodeStats.classList.add('hidden');

    if (isImage) {
      inspectorFileIcon.textContent = '🖼️';
      inspectorCopyLabel.textContent = 'Copy Image';
    } else if (isPdf) {
      inspectorFileIcon.textContent = '📕';
      inspectorCopyLabel.textContent = 'Copy Link';
    } else if (isAudio) {
      inspectorFileIcon.textContent = '🎵';
      inspectorCopyLabel.textContent = 'Copy';
    } else if (isVideo) {
      inspectorFileIcon.textContent = '🎬';
      inspectorCopyLabel.textContent = 'Copy';
    } else if (isCodeOrText) {
      inspectorFileIcon.textContent = '📄';
      inspectorCopyLabel.textContent = 'Copy Text';
    } else {
      inspectorFileIcon.textContent = '📦';
      inspectorCopyLabel.textContent = 'Copy';
    }

    // Show initial spinner
    inspectorModalBody.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px;">
        <div class="upload-spinner" style="width:36px;height:36px;border-width:3px;"></div>
        <span style="font-size:0.88rem;color:#94a3b8;">Loading preview...</span>
      </div>
    `;

    inspectorModal.classList.add('show');
    inspectorModal.setAttribute('aria-hidden', 'false');

    try {
      let blob = null;

      // 1. Get Blob: Local File vs Remote Server Drop
      if (file instanceof File || file instanceof Blob) {
        blob = file;
      } else if (file.fileHandle instanceof File || file.fileHandle instanceof Blob) {
        blob = file.fileHandle;
      } else if (dropCode && file.id) {
        const fileUrl = getApiUrl(`/api/file/${dropCode}/${file.id}`);
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (e2eeKey) {
          const cipherBuf = await res.arrayBuffer();
          const plainBuf = await CryptoEngine.decryptBytes(cipherBuf, e2eeKey);
          blob = new Blob([plainBuf], { type: mimeType || 'application/octet-stream' });
        } else {
          blob = await res.blob();
        }
      }

      if (!blob) throw new Error('File data could not be loaded');
      activeInspectorBlob = blob;

      // 2. Render Viewer based on Category
      if (isImage) {
        activeInspectorObjectUrl = URL.createObjectURL(blob);
        inspectorModalBody.innerHTML = `
          <div class="inspector-image-container" id="inspector-img-container">
            <img src="${activeInspectorObjectUrl}" class="inspector-display-img" id="inspector-display-img" alt="${escapeHtml(fileName)}" />
          </div>
        `;

        const displayImg = document.getElementById('inspector-display-img');
        const imgContainer = document.getElementById('inspector-img-container');

        displayImg.onload = () => {
          inspectorDimBadge.textContent = `${displayImg.naturalWidth} × ${displayImg.naturalHeight}`;
          inspectorDimBadge.classList.remove('hidden');
        };

        inspectorImageControls.classList.remove('hidden');
        resetZoom();

        // Mouse Wheel Zoom
        imgContainer.addEventListener('wheel', (e) => {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.15 : -0.15;
          adjustZoom(delta);
        }, { passive: false });

        // Pan/Drag
        imgContainer.addEventListener('mousedown', (e) => {
          if (currentZoom > 1) {
            isDraggingImg = true;
            startX = e.clientX - currentTranslateX;
            startY = e.clientY - currentTranslateY;
          }
        });
        window.addEventListener('mousemove', (e) => {
          if (isDraggingImg) {
            currentTranslateX = e.clientX - startX;
            currentTranslateY = e.clientY - startY;
            applyImageTransform();
          }
        });
        window.addEventListener('mouseup', () => { isDraggingImg = false; });

      } else if (isCodeOrText) {
        const text = await blob.text();
        activeInspectorText = text;
        const lines = text.split('\n');

        const lineNumbersHtml = lines.map((_, i) => `<div>${i + 1}</div>`).join('');
        const escapedContent = escapeHtml(text);

        inspectorModalBody.innerHTML = `
          <div class="inspector-code-wrapper">
            <div class="inspector-line-numbers">${lineNumbersHtml}</div>
            <pre class="inspector-code-content"><code>${escapedContent}</code></pre>
          </div>
        `;

        const inspectorLineCount = document.getElementById('inspector-line-count');
        const inspectorCharCount = document.getElementById('inspector-char-count');
        if (inspectorLineCount) inspectorLineCount.textContent = `${lines.length} lines`;
        if (inspectorCharCount) inspectorCharCount.textContent = `${text.length} chars`;
        inspectorCodeStats.classList.remove('hidden');

      } else if (isPdf) {
        activeInspectorObjectUrl = URL.createObjectURL(blob);
        inspectorModalBody.innerHTML = `
          <iframe src="${activeInspectorObjectUrl}#toolbar=1" class="inspector-pdf-frame" title="PDF Preview"></iframe>
        `;

      } else if (isAudio) {
        activeInspectorObjectUrl = URL.createObjectURL(blob);
        inspectorModalBody.innerHTML = `
          <div class="inspector-media-box">
            <span style="font-size:3rem;">🎵</span>
            <span style="font-weight:600;color:#fff;">${escapeHtml(fileName)}</span>
            <audio controls autoplay class="inspector-audio-player" src="${activeInspectorObjectUrl}"></audio>
          </div>
        `;

      } else if (isVideo) {
        activeInspectorObjectUrl = URL.createObjectURL(blob);
        inspectorModalBody.innerHTML = `
          <div class="inspector-media-box">
            <video controls autoplay playsinline class="inspector-video-player" src="${activeInspectorObjectUrl}"></video>
          </div>
        `;

      } else {
        inspectorModalBody.innerHTML = `
          <div class="inspector-binary-card">
            <span class="inspector-binary-icon">📦</span>
            <span class="inspector-binary-title">${escapeHtml(fileName)}</span>
            <span class="inspector-binary-desc">
              Binary File (${formatBytes(file.size || 0)})<br>
              Direct in-browser inspection is not supported for this file format.<br>
              Click <strong>Save</strong> at the top right to download.
            </span>
          </div>
        `;
      }

    } catch (err) {
      inspectorModalBody.innerHTML = `
        <div style="padding:32px;text-align:center;color:#f87171;">
          <span style="font-size:2.5rem;display:block;margin-bottom:8px;">⚠️</span>
          <strong>Failed to load preview</strong>
          <p style="font-size:0.82rem;color:#94a3b8;margin-top:4px;">${escapeHtml(err.message || 'File could not be inspected')}</p>
        </div>
      `;
    }
  }

  // --- MOBILE BANNER & UPDATER ---
  function setupMobileAppBanner() {
    if (!mobileAppBanner) return;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isNativeCapacitor = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isMobile && !isNativeCapacitor && !sessionStorage.getItem('dismissed_banner')) {
      mobileAppBanner.classList.remove('hidden');
    }
    if (btnDismissAppBanner) {
      btnDismissAppBanner.addEventListener('click', () => {
        mobileAppBanner.classList.add('hidden');
        sessionStorage.setItem('dismissed_banner', 'true');
      });
    }
  }

  function setupInAppUpdater() {
    const btnCheckUpdate = document.getElementById('btn-check-update');
    const updateModal = document.getElementById('update-modal');
    const btnUpdateNow = document.getElementById('btn-update-now');
    const btnUpdateLater = document.getElementById('btn-update-later');
    const updateTitle = document.getElementById('update-title');
    const updateDesc = document.getElementById('update-desc');
    const updateNotesText = document.getElementById('update-notes-text');
    const modalDownloadProgress = document.getElementById('modal-download-progress-container');
    const modalProgressBar = document.getElementById('modal-download-progress-bar');
    const modalStatusText = document.getElementById('modal-download-status-text');
    const modalPercentBadge = document.getElementById('modal-download-percent-badge');
    const modalBytesText = document.getElementById('modal-download-bytes-text');
    const modalSpeedText = document.getElementById('modal-download-speed-text');

    const CURRENT_VERSION = window.APP_VERSION || (window.APP_CONFIG && window.APP_CONFIG.version) || '1.0.33';
    const footerVersionVal = document.getElementById('footer-version-val');
    if (footerVersionVal) footerVersionVal.textContent = CURRENT_VERSION;

    if (btnCheckUpdate) {
      btnCheckUpdate.addEventListener('click', () => checkVersion(true));
    }
    if (btnUpdateLater) {
      btnUpdateLater.addEventListener('click', () => {
        updateModal.classList.remove('show');
      });
    }

    async function checkVersion(manual = false) {
      try {
        const res = await fetch(getApiUrl('/api/version'));
        if (!res.ok) return;
        const info = await res.json();
        if (isVersionGreater(info.version, CURRENT_VERSION)) {
          showUpdateModal(info);
        } else if (manual) {
          showToast(`You are on the latest version (v${CURRENT_VERSION}) ✨`);
        }
      } catch (e) {}
    }

    function showUpdateModal(info) {
      updateTitle.textContent = `Update to v${info.version}`;
      updateDesc.textContent = `New features & improvements available.`;
      updateNotesText.textContent = info.releaseNotes || 'Bug fixes and performance improvements.';
      updateModal.classList.add('show');

      btnUpdateNow.onclick = async () => {
        const isNative = Boolean(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ApkInstaller);
        const downloadUrl = getApiUrl(info.downloadUrl);

        if (isNative) {
          btnUpdateNow.disabled = true;
          modalDownloadProgress.classList.remove('hidden');
          const ApkInstaller = window.Capacitor.Plugins.ApkInstaller;

          const progressSub = await ApkInstaller.addListener('downloadProgress', (p) => {
            modalProgressBar.style.width = p.percent + '%';
            modalPercentBadge.textContent = p.percent + '%';
            modalBytesText.textContent = `${formatBytes(p.loaded)} / ${formatBytes(p.total)}`;
          });

          try {
            await ApkInstaller.downloadAndInstall({ url: downloadUrl });
          } catch (err) {
            window.location.href = downloadUrl;
          } finally {
            progressSub.remove();
          }
        } else {
          window.location.href = downloadUrl;
        }
      };
    }

    function isVersionGreater(remote, local) {
      const r = (remote || '').replace(/^v/, '').split('.').map(Number);
      const l = (local || '').replace(/^v/, '').split('.').map(Number);
      for (let i = 0; i < Math.max(r.length, l.length); i++) {
        const rv = r[i] || 0;
        const lv = l[i] || 0;
        if (rv > lv) return true;
        if (rv < lv) return false;
      }
      return false;
    }

    setTimeout(() => checkVersion(false), 2000);
  }

  // --- ABOUT APP & WHAT'S NEW MODAL SYSTEM ---
  function setupInfoModal() {
    const btnOpenInfo = document.getElementById('btn-open-info');
    const infoModal = document.getElementById('info-modal');
    const infoModalOverlay = document.getElementById('info-modal-overlay');
    const btnCloseInfo = document.getElementById('btn-close-info');
    const tabInfoAbout = document.getElementById('tab-info-about');
    const tabInfoChangelog = document.getElementById('tab-info-changelog');
    const infoTabAbout = document.getElementById('info-tab-about');
    const infoTabChangelog = document.getElementById('info-tab-changelog');
    const changelogTimelineList = document.getElementById('changelog-timeline-list');
    const btnCheckUpdate = document.getElementById('btn-check-update');

    if (btnOpenInfo) {
      btnOpenInfo.addEventListener('click', () => openInfoModal('about'));
    }

    // Clicking footer version pill opens What's New changelog
    if (btnCheckUpdate) {
      btnCheckUpdate.addEventListener('click', (e) => {
        e.preventDefault();
        openInfoModal('changelog');
      });
    }

    if (btnCloseInfo) btnCloseInfo.addEventListener('click', closeInfoModal);
    if (infoModalOverlay) infoModalOverlay.addEventListener('click', closeInfoModal);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && infoModal && infoModal.classList.contains('show')) {
        closeInfoModal();
      }
    });

    if (tabInfoAbout && tabInfoChangelog) {
      tabInfoAbout.addEventListener('click', () => switchInfoTab('about'));
      tabInfoChangelog.addEventListener('click', () => switchInfoTab('changelog'));
    }

    renderChangelogTimeline();

    function openInfoModal(initialTab = 'about') {
      if (!infoModal) return;
      switchInfoTab(initialTab);
      infoModal.classList.add('show');
      infoModal.setAttribute('aria-hidden', 'false');
    }

    function closeInfoModal() {
      if (!infoModal) return;
      infoModal.classList.remove('show');
      infoModal.setAttribute('aria-hidden', 'true');
    }

    function switchInfoTab(tabName) {
      if (tabName === 'about') {
        if (tabInfoAbout) tabInfoAbout.classList.add('active');
        if (tabInfoChangelog) tabInfoChangelog.classList.remove('active');
        if (infoTabAbout) infoTabAbout.classList.add('active');
        if (infoTabChangelog) infoTabChangelog.classList.remove('active');
      } else {
        if (tabInfoAbout) tabInfoAbout.classList.remove('active');
        if (tabInfoChangelog) tabInfoChangelog.classList.add('active');
        if (infoTabAbout) infoTabAbout.classList.remove('active');
        if (infoTabChangelog) infoTabChangelog.classList.add('active');
      }
    }

    function renderChangelogTimeline() {
      if (!changelogTimelineList) return;
      const history = window.APP_CHANGELOG || [];
      if (!history.length) {
        changelogTimelineList.innerHTML = '<p class="text-muted" style="text-align:center; padding: 20px;">No changelog entries found.</p>';
        return;
      }

      changelogTimelineList.innerHTML = history.map((item, idx) => {
        const isLatest = idx === 0 || item.isLatest;
        const bullets = (item.highlights || []).map(h => `<li>${escapeHtml(h)}</li>`).join('');
        return `
          <div class="changelog-card ${isLatest ? 'latest-version' : ''}">
            <div class="changelog-card-header">
              <div class="changelog-ver-wrap">
                <span class="changelog-ver-pill">v${escapeHtml(item.version)}</span>
                ${item.badge ? `<span class="changelog-tag">${escapeHtml(item.badge)}</span>` : ''}
              </div>
              <span class="changelog-date">${escapeHtml(item.date || '')}</span>
            </div>
            <ul class="changelog-list">
              ${bullets}
            </ul>
          </div>
        `;
      }).join('');
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
