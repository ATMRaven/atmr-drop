(function () {
  'use strict';

  // --- STATE ---
  let stagedFiles = [];
  let activeDropData = null;
  let countdownTimer = null;
  let bannerTimer = null;
  let isExplicitNewSend = false;
  const SENDER_STORAGE_KEY = 'atmr_active_sender_drop';

  // --- SOUND SYSTEM (7-Variant Random Drop Audio + Harmonic Web Audio Fallback) ---
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
  dropSounds.forEach(s => {
    s.preload = 'auto';
  });

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
        // Dual-tone harmonic resonant waterdrop chime
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2600, now);
        filter.frequency.exponentialRampToValueAtTime(700, now + 0.38);

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1174.66, now); // D6
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
        // Subtle haptic pop
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

  // --- DOM ELEMENTS ---
  const tabSend = document.getElementById('tab-send');
  const tabReceive = document.getElementById('tab-receive');

  const viewSend = document.getElementById('view-send');
  const viewReceive = document.getElementById('view-receive');
  const viewShare = document.getElementById('view-share');
  const viewVault = document.getElementById('view-vault');

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

  // Send elements
  const inputText = document.getElementById('input-text');
  const liveInputBar = document.getElementById('live-input-bar');
  const liveTagBadge = document.getElementById('live-tag-badge');
  const liveTagDesc = document.getElementById('live-tag-desc');
  const liveStats = document.getElementById('live-stats');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const stagedChipsList = document.getElementById('staged-files-list');
  const selectTtl = document.getElementById('select-ttl');
  const ttlLimitNotice = document.getElementById('ttl-limit-notice');
  const checkBurn = document.getElementById('check-burn');
  const btnSendDrop = document.getElementById('btn-send-drop');
  const btnCamera = document.getElementById('btn-camera');

  // Real-time Upload Progress elements
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadStatusText = document.getElementById('upload-status-text');
  const uploadPercentBadge = document.getElementById('upload-percent-badge');
  const uploadProgressBar = document.getElementById('upload-progress-bar');
  const uploadBytesText = document.getElementById('upload-bytes-text');
  const uploadSpeedText = document.getElementById('upload-speed-text');

  // Share elements
  const sharePickupBanner = document.getElementById('share-pickup-banner');
  const shareStatusDot = document.getElementById('share-status-dot');
  const shareStatusText = document.getElementById('share-status-text');
  const btnCopyPin = document.getElementById('btn-copy-pin');
  const sharePinCode = document.getElementById('share-pin-code');
  const shareDropInfo = document.getElementById('share-drop-info');
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
  const receivedLinkHero = document.getElementById('received-link-hero');
  const vaultLinkDomain = document.getElementById('vault-link-domain');
  const vaultLinkUrl = document.getElementById('vault-link-url');
  const vaultLinkOpenBtn = document.getElementById('vault-link-open-btn');
  const vaultLinkCopyBtn = document.getElementById('vault-link-copy-btn');
  const receivedTextContainer = document.getElementById('received-text-container');
  const receivedTextLabel = document.getElementById('received-text-label');
  const receivedTextBadge = document.getElementById('received-text-badge');
  const btnOpenReceivedLink = document.getElementById('btn-open-received-link');
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
  const APP_CURRENT_VERSION = (window.APP_VERSION || '1.0.13').replace(/^v/, '').trim();
  let isUpdateMandatory = false;

  function isCapacitorNative() {
    if (typeof window.Capacitor !== 'undefined') {
      if (typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return true;
      if (window.Capacitor.platform === 'android' || window.Capacitor.platform === 'ios') return true;
    }
    if (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:') return true;
    if (window.location.hostname === 'localhost' && window.location.port === '') return true;
    if (/Android.*wv/i.test(navigator.userAgent) || (navigator.userAgent.includes('Android') && navigator.userAgent.includes('Version/4.0'))) return true;
    return false;
  }

  function isMobileWeb() {
    if (isCapacitorNative()) return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 640;
  }

  function getApiUrl(path) {
    if (!path) return PROD_API_ORIGIN;
    if (typeof path === 'string' && (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:'))) {
      return path;
    }
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    if (isCapacitorNative() || (window.location.hostname === 'localhost' && window.location.port === '')) {
      return `${PROD_API_ORIGIN}${cleanPath}`;
    }
    return cleanPath;
  }

  // --- ACTIVE DROP SENDER STORAGE & RECOVERY ---
  function getActiveSenderDrop() {
    try {
      const raw = localStorage.getItem(SENDER_STORAGE_KEY);
      if (!raw) return null;
      const drop = JSON.parse(raw);
      if (drop && drop.code && drop.expiresAt && Number(drop.expiresAt) > Date.now()) {
        return drop;
      }
      clearActiveSenderDrop();
    } catch (e) {}
    return null;
  }

  function saveActiveSenderDrop(drop) {
    try {
      localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(drop));
    } catch (e) {}
    activeDropData = drop;
    updateActiveDropBanner();
  }

  function clearActiveSenderDrop() {
    try {
      localStorage.removeItem(SENDER_STORAGE_KEY);
    } catch (e) {}
    activeDropData = null;
    updateActiveDropBanner();
  }

  function updateActiveDropBanner() {
    if (!activeDropBanner) return;
    const active = getActiveSenderDrop();
    if (active) {
      activeDropBanner.classList.remove('hidden');
      if (activeBannerPin) activeBannerPin.textContent = active.code;
      if (activeBannerTime) {
        const leftSec = Math.max(0, Math.floor((Number(active.expiresAt) - Date.now()) / 1000));
        const m = Math.floor(leftSec / 60);
        const s = leftSec % 60;
        activeBannerTime.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left`;
      }
      if (!bannerTimer) {
        bannerTimer = setInterval(() => {
          const cur = getActiveSenderDrop();
          if (!cur) {
            clearInterval(bannerTimer);
            bannerTimer = null;
            activeDropBanner.classList.add('hidden');
          } else if (activeBannerTime) {
            const leftSec = Math.max(0, Math.floor((Number(cur.expiresAt) - Date.now()) / 1000));
            const m = Math.floor(leftSec / 60);
            const s = leftSec % 60;
            activeBannerTime.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left`;
          }
        }, 1000);
      }
    } else {
      activeDropBanner.classList.add('hidden');
      if (bannerTimer) {
        clearInterval(bannerTimer);
        bannerTimer = null;
      }
    }
  }

  const updateModal = document.getElementById('update-modal');
  const updateModalOverlay = document.getElementById('update-modal-overlay');
  const updateTitle = document.getElementById('update-title');
  const updateDesc = document.getElementById('update-desc');
  const updateNotesText = document.getElementById('update-notes-text');
  const modalDownloadProgressContainer = document.getElementById('modal-download-progress-container');
  const modalDownloadStatusText = document.getElementById('modal-download-status-text');
  const modalDownloadPercentBadge = document.getElementById('modal-download-percent-badge');
  const modalDownloadProgressBar = document.getElementById('modal-download-progress-bar');
  const modalDownloadBytesText = document.getElementById('modal-download-bytes-text');
  const modalDownloadSpeedText = document.getElementById('modal-download-speed-text');
  const btnUpdateNow = document.getElementById('btn-update-now');
  const btnUpdateLater = document.getElementById('btn-update-later');
  const btnCheckUpdate = document.getElementById('btn-check-update');
  const footerVersionVal = document.getElementById('footer-version-val');
  let currentRemoteDownloadUrl = '';
  let currentRemoteFallbackUrl = '';
  let currentRemoteVersion = '';

  // --- CONTENT ANALYSIS & URL HELPERS ---
  function extractUrls(text) {
    if (!text || typeof text !== 'string') return [];
    const urlRegex = /(https?:\/\/[^\s<>"'`()]+|www\.[^\s<>"'`()]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s<>"'`()]*)?)/gi;
    const matches = text.match(urlRegex) || [];
    const results = [];
    const seen = new Set();

    for (const m of matches) {
      let raw = m.replace(/[.,;!?)]+$/, '');
      if (raw.length < 4 || seen.has(raw)) continue;
      seen.add(raw);

      let href = raw;
      if (!/^https?:\/\//i.test(href)) {
        href = 'https://' + href;
      }

      let domain = '';
      try {
        const u = new URL(href);
        domain = u.hostname.replace(/^www\./i, '');
      } catch (e) {
        domain = raw.split('/')[0].replace(/^www\./i, '');
      }

      results.push({ raw, href, domain });
    }
    return results;
  }

  function isPureUrl(text) {
    if (!text) return false;
    const trimmed = text.trim();
    const urls = extractUrls(trimmed);
    if (urls.length === 1) {
      const remainder = trimmed.replace(urls[0].raw, '').trim();
      return remainder.length === 0;
    }
    return false;
  }

  function isCodeSnippet(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try { JSON.parse(trimmed); return true; } catch (e) {}
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try { JSON.parse(trimmed); return true; } catch (e) {}
    }
    const codePatterns = [
      /^(import|export|const|let|var|function|class|def|from|public|private|if|for|while)\b/m,
      /[{};()=>]{3,}/,
      /<(!DOCTYPE|html|div|span|p|script|style|link|body)[^>]*>/i,
      /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\s+.*\s+(FROM|INTO|TABLE|WHERE)\b/i,
      /^(npm|git|curl|docker|cd|ls|mkdir|chmod|sudo)\s+/m
    ];
    return codePatterns.some(p => p.test(trimmed));
  }

  function analyzePayload(text, files) {
    const hasText = Boolean(text && text.trim());
    const hasFiles = Boolean(files && files.length > 0);
    const urls = hasText ? extractUrls(text.trim()) : [];
    const isPureLink = hasText && isPureUrl(text);
    const isCode = hasText && !isPureLink && isCodeSnippet(text);

    let primaryType = 'note';
    let icon = '📝';
    let typeLabel = 'Text Note';

    if (isPureLink) {
      primaryType = 'link';
      icon = '🔗';
      typeLabel = 'Web Link';
    } else if (isCode) {
      primaryType = 'code';
      icon = '💻';
      typeLabel = 'Code Snippet';
    } else if (hasFiles && !hasText) {
      const isAllImages = files.every(f => f.type && f.type.startsWith('image/'));
      if (isAllImages) {
        primaryType = 'photos';
        icon = '🖼️';
        typeLabel = files.length === 1 ? '1 Photo' : `${files.length} Photos`;
      } else {
        primaryType = 'files';
        icon = '📁';
        typeLabel = files.length === 1 ? '1 File' : `${files.length} Files`;
      }
    } else if (hasFiles && hasText) {
      primaryType = 'mixed';
      icon = '📦';
      typeLabel = 'Drop Package';
    }

    return {
      hasText,
      hasFiles,
      urls,
      isPureLink,
      isCode,
      primaryType,
      icon,
      typeLabel,
      textLength: text ? text.length : 0,
      wordCount: text ? text.trim().split(/\s+/).filter(Boolean).length : 0,
      lineCount: text ? text.split(/\r\n|\r|\n/).length : 0,
      filesCount: files ? files.length : 0,
      totalFileSize: files ? files.reduce((acc, f) => acc + (f.size || 0), 0) : 0
    };
  }

  function formatAutolinkHtml(text) {
    if (!text) return '';
    const urls = extractUrls(text);
    if (urls.length === 0) {
      return escapeHtml(text);
    }

    let escaped = escapeHtml(text);
    for (const u of urls) {
      const escapedRaw = escapeHtml(u.raw);
      const linkHtml = `<a href="${escapeHtml(u.href)}" target="_blank" rel="noopener noreferrer" class="vault-inline-link" title="Open in browser">${escapedRaw} <span class="ext-arrow">↗</span></a>`;
      escaped = escaped.split(escapedRaw).join(linkHtml);
    }
    return escaped;
  }

  // --- INITIALIZATION ---
  function init() {
    setupTabs();
    setupPinInputs();
    setupDropzone();
    setupCamera();
    setupActions();
    setupLiveInputWatcher();
    setupUpdateModal();
    setupMobileAppBanner();
    setupServiceWorker();
    checkDirectPinRoute();
    checkAppUpdate();

    window.checkAppUpdate = checkAppUpdate;
    window.displayUpdateModal = displayUpdateModal;
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

  // --- IN-APP UPDATE CHECKER ---
  async function checkAppUpdate(isManual = false) {
    if (isManual) {
      showToast('Checking for updates...', 'info');
    }

    try {
      let data = null;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(getApiUrl('/api/version'), { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) data = await res.json();
      } catch (e) {}

      if (!data || !data.version) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const ghRes = await fetch('https://api.github.com/repos/ATMRaven/atmr-drop/releases/latest', { signal: controller.signal });
          clearTimeout(timeoutId);
          if (ghRes.ok) {
            const ghData = await ghRes.json();
            const tag = (ghData.tag_name || '').replace(/^v/, '').trim();
            data = {
              version: tag,
              downloadUrl: '/api/apk/latest',
              fallbackUrl: ghData.assets?.[0]?.browser_download_url || 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk',
              releaseNotes: ghData.body || 'Latest performance and security improvements.',
              mandatory: false
            };
          }
        } catch (e) {}
      }

      if (data && data.version) {
        const isNew = isNewerVersion(data.version, APP_CURRENT_VERSION);
        console.log(`[Version Check] Installed: v${APP_CURRENT_VERSION} | Latest: v${data.version} | Update needed: ${isNew}`);
        if (isNew) {
          displayUpdateModal(data);
        } else if (isManual) {
          showToast(`Drop is up to date (v${APP_CURRENT_VERSION})`, 'success');
        }
      } else if (isManual) {
        // Fallback for manual check if offline or network error
        displayUpdateModal({
          version: '1.0.22',
          downloadUrl: '/api/apk/latest',
          fallbackUrl: 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk',
          releaseNotes: '• Real-time in-app direct APK streaming downloader\n• Real-time upload status bar with live speed & byte tracking\n• Instant drop pickup detection & celebratory chime\n• Performance optimizations & background transfer enhancements',
          mandatory: false
        });
      }
    } catch (err) {
      console.warn('Update check failed:', err);
      if (isManual) {
        showToast('Update check failed. Check connection.', 'error');
      }
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

  function downloadUpdateInApp(downloadUrl, fallbackUrl, version) {
    const primaryUrl = downloadUrl ? getApiUrl(downloadUrl) : getApiUrl('/api/apk/latest');
    const secondaryUrl = fallbackUrl || 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk';

    if (btnUpdateNow) {
      btnUpdateNow.disabled = false;
      btnUpdateNow.textContent = '⚡ Downloading...';
    }
    if (btnUpdateLater) {
      btnUpdateLater.classList.remove('hidden');
      btnUpdateLater.textContent = 'Dismiss';
    }

    if (modalDownloadProgressContainer) {
      modalDownloadProgressContainer.classList.remove('hidden');
      if (modalDownloadProgressBar) modalDownloadProgressBar.style.width = '100%';
      if (modalDownloadPercentBadge) modalDownloadPercentBadge.textContent = 'Ready';
      if (modalDownloadStatusText) modalDownloadStatusText.textContent = `Downloading v${version || 'update'}...`;
      if (modalDownloadBytesText) modalDownloadBytesText.textContent = 'High-Speed Edge Stream';
      if (modalDownloadSpeedText) modalDownloadSpeedText.textContent = 'Active';
    }

    playChime('success');
    showToast('Downloading atmr-drop.apk! Tap notification when done to install.', 'success');

    // Trigger system download safely without corrupting WebView DOM or navigating away
    try {
      window.open(primaryUrl, '_system');
    } catch (e) {
      window.open(secondaryUrl, '_system');
    }

    setTimeout(() => {
      if (btnUpdateNow) {
        btnUpdateNow.textContent = '✓ Download Started (Tap to Re-download)';
      }
      if (modalDownloadStatusText) {
        modalDownloadStatusText.textContent = 'Download active in notifications. Tap APK to install!';
      }
    }, 2500);
  }

  function formatReleaseNotes(raw) {
    if (!raw || typeof raw !== 'string') {
      return '• Real-time in-app direct APK streaming downloader\n• Real-time upload status bar with speed & byte tracking\n• Instant drop pickup detection & celebratory chime\n• Smart 1-hour expiration cap for files > 1 GB\n• Performance & background transfer enhancements';
    }

    // If it contains the generic repo header boilerplate, strip it out or provide clean release highlights
    if (raw.includes('The Daily Drop (atmr-drop) Android App') || raw.includes('Published by') || raw.includes('Seamless Updates')) {
      const lines = raw.split('\n');
      const filtered = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (trimmed.startsWith('#')) return false;
        if (trimmed.includes('Published by') || trimmed.includes('Web Service') || trimmed.includes('Seamless Updates') || trimmed.includes('Version:')) return false;
        if (trimmed.includes('Download') && trimmed.includes('.apk')) return false;
        if (trimmed.includes('Instant cross-device')) return false;
        return true;
      });

      if (filtered.length > 0) {
        return filtered.map(l => l.trim().startsWith('•') || l.trim().startsWith('-') ? l.trim() : `• ${l.trim()}`).join('\n');
      }

      return '• Real-time in-app direct APK streaming downloader with live progress bar\n• Real-time upload status bar with speed & byte tracking\n• Instant drop pickup detection & celebratory chime\n• Smart 1-hour expiration cap for files > 1 GB\n• Performance & background transfer enhancements';
    }

    return raw.trim();
  }

  function displayUpdateModal(info) {
    isUpdateMandatory = !!info.mandatory;
    currentRemoteDownloadUrl = info.downloadUrl ? getApiUrl(info.downloadUrl) : getApiUrl('/api/apk/latest');
    currentRemoteFallbackUrl = info.fallbackUrl || 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk';
    currentRemoteVersion = info.version || '';

    updateTitle.textContent = `Update Available (v${info.version})`;
    updateDesc.textContent = info.mandatory
      ? 'A critical update is required to continue.'
      : 'A new version of Drop is ready to install.';
    updateNotesText.textContent = formatReleaseNotes(info.releaseNotes);

    if (modalDownloadProgressContainer) {
      modalDownloadProgressContainer.classList.add('hidden');
      if (modalDownloadProgressBar) modalDownloadProgressBar.style.width = '0%';
      if (modalDownloadPercentBadge) modalDownloadPercentBadge.textContent = '0%';
    }

    if (btnUpdateNow) {
      btnUpdateNow.disabled = false;
      btnUpdateNow.textContent = 'Update Now';
    }

    if (info.mandatory) {
      btnUpdateLater.classList.add('hidden');
    } else {
      btnUpdateLater.classList.remove('hidden');
    }

    updateModal.classList.add('active');
    playChime('copy');
  }

  function setupUpdateModal() {
    if (footerVersionVal) {
      footerVersionVal.textContent = APP_CURRENT_VERSION;
    }

    if (btnCheckUpdate) {
      btnCheckUpdate.addEventListener('click', (e) => {
        e.preventDefault();
        checkAppUpdate(true);
      });
    }

    if (btnUpdateNow) {
      btnUpdateNow.addEventListener('click', (e) => {
        e.preventDefault();
        if (btnUpdateNow.textContent.includes('Install Ready')) {
          // If already downloaded, re-trigger
          if (currentRemoteDownloadUrl) {
            window.open(currentRemoteDownloadUrl, '_system');
          }
          return;
        }
        downloadUpdateInApp(currentRemoteDownloadUrl, currentRemoteFallbackUrl, currentRemoteVersion);
      });
    }

    btnUpdateLater.addEventListener('click', () => {
      updateModal.classList.remove('active');
    });

    updateModalOverlay.addEventListener('click', () => {
      if (!isUpdateMandatory) {
        updateModal.classList.remove('active');
      }
    });

    // Check updates when app returns to foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isCapacitorNative()) {
        checkAppUpdate(false);
      }
    });

    window.addEventListener('focus', () => {
      if (isCapacitorNative()) {
        checkAppUpdate(false);
      }
    });

    window.showAppUpdateModal = displayUpdateModal;
  }

  // --- TAB NAVIGATION ---
  function switchTab(mode) {
    [viewSend, viewReceive, viewShare, viewVault].forEach(v => v.classList.remove('active'));

    if (mode === 'send') {
      tabSend.classList.add('active');
      tabReceive.classList.remove('active');

      const active = getActiveSenderDrop();
      if (active && !isExplicitNewSend) {
        // User has an active unexpired drop -> restore active share view!
        activeDropData = active;
        displayShareScreen(active);
      } else {
        viewSend.classList.add('active');
        updateActiveDropBanner();
        inputText.focus();
      }
    } else if (mode === 'receive') {
      tabReceive.classList.add('active');
      tabSend.classList.remove('active');
      viewReceive.classList.add('active');
      pinCells[0].focus();
    } else if (mode === 'share') {
      tabSend.classList.add('active');
      tabReceive.classList.remove('active');
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

  // --- LIVE INPUT WATCHER ---
  function updateLiveInputInfo() {
    const text = inputText.value;
    const info = analyzePayload(text, stagedFiles);

    if (!info.hasText && stagedFiles.length === 0) {
      liveInputBar.classList.add('hidden');
      return;
    }

    liveInputBar.classList.remove('hidden');
    liveTagBadge.className = `live-tag-badge ${info.primaryType}`;
    liveTagBadge.textContent = `${info.icon} ${info.typeLabel}`;

    if (info.isPureLink && info.urls.length > 0) {
      liveTagDesc.textContent = info.urls[0].domain;
      liveTagDesc.classList.remove('hidden');
    } else if (info.hasCode) {
      liveTagDesc.textContent = 'Code Snippet';
      liveTagDesc.classList.remove('hidden');
    } else {
      liveTagDesc.classList.add('hidden');
    }

    const statParts = [];
    if (info.wordCount > 0) statParts.push(`${info.wordCount} words`);
    if (info.charCount > 0) statParts.push(`${info.charCount} chars`);
    if (stagedFiles.length > 0) statParts.push(`${stagedFiles.length} file${stagedFiles.length > 1 ? 's' : ''}`);
    liveStats.textContent = statParts.join(' • ');
  }

  function setupLiveInputWatcher() {
    inputText.addEventListener('input', updateLiveInputInfo);
    inputText.addEventListener('paste', () => {
      setTimeout(updateLiveInputInfo, 50);
    });
  }

  // --- DROPZONE & CAMERA ---
  function setupDropzone() {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files);
      if (files.length) handleFiles(files);
    });

    dropzone.addEventListener('click', (e) => {
      if (e.target.closest('#btn-camera')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length) handleFiles(files);
    });
  }

  function handleFiles(files) {
    const totalSize = stagedFiles.reduce((acc, f) => acc + f.size, 0) + files.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > 10000 * 1024 * 1024) {
      showToast('Combined files exceed 10 GB maximum limit.');
      return;
    }

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        stagedFiles.push({
          id: 'f_' + Math.random().toString(36).substring(2, 9),
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataBase64: base64
        });
        renderStagedFiles();
        updateLiveInputInfo();
      };
      reader.readAsDataURL(file);
    });
    playChime('pop');
  }

  function renderStagedFiles() {
    const totalSizeBytes = stagedFiles.reduce((acc, f) => acc + f.size, 0);

    // Smart TTL limit for large files (> 1 GB)
    if (selectTtl) {
      if (totalSizeBytes > 1024 * 1024 * 1024) {
        if (ttlLimitNotice) ttlLimitNotice.classList.remove('hidden');
        Array.from(selectTtl.options).forEach(opt => {
          if (parseInt(opt.value, 10) > 3600) {
            opt.disabled = true;
          }
        });
        if (parseInt(selectTtl.value, 10) > 3600) {
          selectTtl.value = '3600';
        }
      } else {
        if (ttlLimitNotice) ttlLimitNotice.classList.add('hidden');
        Array.from(selectTtl.options).forEach(opt => {
          opt.disabled = false;
        });
      }
    }

    if (stagedFiles.length === 0) {
      stagedChipsList.classList.add('hidden');
      stagedChipsList.innerHTML = '';
      return;
    }

    stagedChipsList.classList.remove('hidden');
    stagedChipsList.innerHTML = '';

    stagedFiles.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'staged-chip';
      chip.innerHTML = `
        <span class="chip-name">${escapeHtml(file.name)}</span>
        <span class="chip-size">${formatFileSize(file.size)}</span>
        <button type="button" class="chip-remove" data-index="${index}">&times;</button>
      `;
      stagedChipsList.appendChild(chip);
    });

    stagedChipsList.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        stagedFiles.splice(idx, 1);
        renderStagedFiles();
        updateLiveInputInfo();
      });
    });
  }

  function setupCamera() {
    btnCamera.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        cameraVideo.srcObject = mediaStream;
        cameraModal.classList.add('active');
      } catch (err) {
        showToast('Camera access denied or unavailable.');
      }
    });

    btnCameraClose.addEventListener('click', closeCamera);

    btnCameraSnap.addEventListener('click', () => {
      if (!mediaStream) return;
      cameraCanvas.width = cameraVideo.videoWidth || 640;
      cameraCanvas.height = cameraVideo.videoHeight || 480;
      const ctx = cameraCanvas.getContext('2d');
      ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
      const dataUrl = cameraCanvas.toDataURL('image/jpeg', 0.85);
      const base64 = dataUrl.split(',')[1];
      const filename = `photo_${Date.now()}.jpg`;

      stagedFiles.push({
        id: 'f_' + Math.random().toString(36).substring(2, 9),
        name: filename,
        type: 'image/jpeg',
        size: Math.round(base64.length * 0.75),
        dataBase64: base64
      });

      renderStagedFiles();
      updateLiveInputInfo();
      closeCamera();
      playChime('pop');
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
    if (btnBannerView) {
      btnBannerView.addEventListener('click', () => {
        const active = getActiveSenderDrop();
        if (active) {
          activeDropData = active;
          displayShareScreen(active);
        }
      });
    }

    if (btnBannerDismiss) {
      btnBannerDismiss.addEventListener('click', () => {
        if (activeDropBanner) activeDropBanner.classList.add('hidden');
      });
    }

    function uploadDropWithProgress(payload) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const startTime = performance.now();
        const totalEstimatedBytes = (payload.files || []).reduce((acc, f) => acc + (f.size || 0), 0) + (payload.text ? payload.text.length : 0);

        // Show and initialize upload progress container
        if (uploadProgressContainer) {
          uploadProgressContainer.classList.remove('hidden');
          if (uploadProgressBar) uploadProgressBar.style.width = '0%';
          if (uploadPercentBadge) uploadPercentBadge.textContent = '0%';
          const fileCount = (payload.files || []).length;
          if (uploadStatusText) {
            if (fileCount > 0) {
              uploadStatusText.textContent = `Uploading ${fileCount} file${fileCount > 1 ? 's' : ''}...`;
            } else {
              uploadStatusText.textContent = 'Encrypting & uploading...';
            }
          }
          if (uploadBytesText) uploadBytesText.textContent = `0 B / ${formatFileSize(totalEstimatedBytes || 1024)}`;
          if (uploadSpeedText) uploadSpeedText.textContent = '0 KB/s';
        }

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && uploadProgressContainer) {
            const percent = Math.min(98, Math.round((event.loaded / event.total) * 100));
            if (uploadProgressBar) uploadProgressBar.style.width = `${percent}%`;
            if (uploadPercentBadge) uploadPercentBadge.textContent = `${percent}%`;

            const elapsedSec = (performance.now() - startTime) / 1000;
            const speed = elapsedSec > 0 ? event.loaded / elapsedSec : 0;
            if (uploadBytesText) uploadBytesText.textContent = `${formatFileSize(event.loaded)} / ${formatFileSize(event.total)}`;
            if (uploadSpeedText) uploadSpeedText.textContent = `${formatFileSize(speed)}/s`;
          }
        };

        xhr.onload = () => {
          if (uploadProgressContainer) {
            if (uploadProgressBar) uploadProgressBar.style.width = '100%';
            if (uploadPercentBadge) uploadPercentBadge.textContent = '100%';
            if (uploadStatusText) uploadStatusText.textContent = 'Finalizing wire drop...';
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch (e) {
              reject(new Error('Server returned an invalid response.'));
            }
          } else {
            try {
              const errData = JSON.parse(xhr.responseText);
              reject(new Error(errData.error || `Upload failed with status ${xhr.status}`));
            } catch (e) {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network connection error during upload.'));
        };

        xhr.ontimeout = () => {
          reject(new Error('Upload request timed out.'));
        };

        xhr.open('POST', getApiUrl('/api/drop'));
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify(payload));
      });
    }

    btnSendDrop.addEventListener('click', async () => {
      const text = inputText.value.trim();
      if (!text && stagedFiles.length === 0) {
        showToast('Please enter text or attach a file');
        return;
      }

      btnSendDrop.disabled = true;
      btnSendDrop.querySelector('.btn-text').textContent = 'Creating Drop...';

      try {
        const ttlSec = parseInt(selectTtl.value, 10) || 900;
        const payload = {
          text: text || undefined,
          files: stagedFiles,
          ttlSeconds: ttlSec,
          burnAfterRead: checkBurn.checked
        };

        const data = await uploadDropWithProgress(payload);

        if (!data || !data.success) throw new Error(data?.error || 'Failed to create drop');

        // Store active drop session
        const dropSession = {
          ...data,
          text: text || data.text || '',
          files: data.files || stagedFiles || [],
          expiresAt: data.expiresAt || (Date.now() + ttlSec * 1000),
          ttl: ttlSec,
          burnAfterRead: checkBurn.checked
        };

        saveActiveSenderDrop(dropSession);
        displayShareScreen(dropSession);
        playChime('success');
        showToast('Drop created!');
      } catch (err) {
        showToast(err.message || 'Failed to send drop');
      } finally {
        if (uploadProgressContainer) {
          uploadProgressContainer.classList.add('hidden');
        }
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
      stopPickupWatcher();
      if (activeDropData && activeDropData.code) {
        try {
          await fetch(getApiUrl(`/api/drop/${activeDropData.code}`), { method: 'DELETE' });
          showToast('Drop deleted');
        } catch (e) {}
      }
      clearActiveSenderDrop();
      resetForm();
      switchTab('send');
    });

    btnNewSend.addEventListener('click', () => {
      stopPickupWatcher();
      isExplicitNewSend = true;
      clearActiveSenderDrop();
      resetForm();
      switchTab('send');
      isExplicitNewSend = false;
    });

    btnCopyReceivedText.addEventListener('click', () => {
      const txt = receivedTextContent.textContent;
      if (txt) {
        navigator.clipboard.writeText(txt);
        playChime('copy');
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

  // --- REAL-TIME DROP PICKUP WATCHER ---
  let pickupPollTimer = null;
  let hasNotifiedPickup = false;

  function stopPickupWatcher() {
    if (pickupPollTimer) {
      clearInterval(pickupPollTimer);
      pickupPollTimer = null;
    }
  }

  function startPickupWatcher(code) {
    stopPickupWatcher();
    hasNotifiedPickup = false;

    // Request notification permission if not yet decided
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().catch(() => {});
      } catch (e) {}
    }

    console.log('[PickupWatcher] Starting watcher for code:', code);
    pickupPollTimer = setInterval(async () => {
      if (!code || hasNotifiedPickup) {
        stopPickupWatcher();
        return;
      }
      try {
        const fetchUrl = getApiUrl(`/api/drop/${code}?peek=true`);
        const res = await fetch(fetchUrl);
        if (!res.ok) return;
        const data = await res.json();
        console.log('[PickupWatcher] Poll result:', JSON.stringify(data));
        if (data && data.success && data.drop) {
          if (data.drop.pickedUp || (data.drop.retrievedCount && data.drop.retrievedCount > 0) || data.drop.pickedUpAt) {
            hasNotifiedPickup = true;
            stopPickupWatcher();

            // Play celebratory success chime
            playChime('success');

            // Show celebratory banner
            if (sharePickupBanner) {
              sharePickupBanner.classList.remove('hidden');
            }
            if (shareStatusText) {
              shareStatusText.textContent = 'Drop Picked Up! ✓';
            }
            if (shareStatusDot) {
              shareStatusDot.style.background = '#34d399';
              shareStatusDot.style.boxShadow = '0 0 10px #34d399';
            }

            showToast(`Drop #${code} was picked up! 🎉`);

            // Native push notification if supported & permitted
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Drop Picked Up! 🎉', {
                  body: `PIN #${code} was just opened and retrieved on another device.`,
                  icon: '/icons/icon-192.png'
                });
              } catch (notifErr) {}
            }
          }
        }
      } catch (e) {
        console.warn('[PickupWatcher] Poll error:', e);
      }
    }, 2000);
  }

  function displayShareScreen(data) {
    sharePinCode.textContent = data.code;
    const directUrl = data.directUrl || (isCapacitorNative() ? `${PROD_API_ORIGIN}/${data.code}` : `${window.location.origin}/${data.code}`);
    shareDirectUrl.value = directUrl;

    renderQr(directUrl);

    // Setup Pickup Status Banner
    if (sharePickupBanner) {
      if (data.pickedUp || (data.retrievedCount && data.retrievedCount > 0) || data.pickedUpAt) {
        sharePickupBanner.classList.remove('hidden');
        if (shareStatusText) shareStatusText.textContent = 'Drop Picked Up! ✓';
        if (shareStatusDot) {
          shareStatusDot.style.background = '#34d399';
          shareStatusDot.style.boxShadow = '0 0 10px #34d399';
        }
      } else {
        sharePickupBanner.classList.add('hidden');
        if (shareStatusText) shareStatusText.textContent = 'Ready to receive';
        if (shareStatusDot) {
          shareStatusDot.style.background = '';
          shareStatusDot.style.boxShadow = '';
        }
        startPickupWatcher(data.code);
      }
    }

    // Render Payload Overview / Summary
    const text = data.text || '';
    const files = data.files || [];
    const info = analyzePayload(text, files);

    sharePayloadBadge.className = `payload-badge ${info.primaryType}`;
    shareBadgeIcon.textContent = info.icon;
    shareBadgeText.textContent = info.typeLabel;

    if (info.isPureLink && info.urls.length > 0) {
      sharePayloadStat.textContent = '1 URL';
      shareLinkBox.classList.remove('hidden');
      shareTextBox.classList.add('hidden');
      shareLinkDomain.textContent = info.urls[0].domain;
      shareLinkUrl.textContent = info.urls[0].href;
      shareLinkOpenBtn.href = info.urls[0].href;
    } else if (info.hasText) {
      sharePayloadStat.textContent = `${info.wordCount} words`;
      shareLinkBox.classList.add('hidden');
      shareTextBox.classList.remove('hidden');
      shareTextSnippet.textContent = text.length > 220 ? text.slice(0, 220) + '…' : text;
    } else {
      sharePayloadStat.textContent = `${info.filesCount} file${info.filesCount > 1 ? 's' : ''}`;
      shareLinkBox.classList.add('hidden');
      shareTextBox.classList.add('hidden');
    }

    if (files.length > 0) {
      shareFilesBox.classList.remove('hidden');
      shareFilesChips.innerHTML = '';
      files.forEach(f => {
        const chip = document.createElement('span');
        chip.className = 'file-chip';
        chip.innerHTML = `<span class="chip-name">${escapeHtml(f.name)}</span> <span class="chip-size">${formatFileSize(f.size)}</span>`;
        shareFilesChips.appendChild(chip);
      });
    } else {
      shareFilesBox.classList.add('hidden');
    }

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

    const text = drop.text || '';
    const files = drop.files || [];
    const info = analyzePayload(text, files);

    // Direct Link Hero vs Text Note
    if (info.isPureLink && info.urls.length > 0) {
      const u = info.urls[0];
      receivedLinkHero.classList.remove('hidden');
      receivedTextContainer.classList.add('hidden');

      vaultLinkDomain.textContent = u.domain;
      vaultLinkUrl.textContent = u.href;
      vaultLinkOpenBtn.href = u.href;

      vaultLinkCopyBtn.onclick = () => {
        navigator.clipboard.writeText(u.href);
        playChime('copy');
        showToast('Link copied to clipboard');
      };
    } else if (info.hasText) {
      receivedLinkHero.classList.add('hidden');
      receivedTextContainer.classList.remove('hidden');

      if (info.urls.length > 0) {
        btnOpenReceivedLink.classList.remove('hidden');
        btnOpenReceivedLink.href = info.urls[0].href;
        receivedTextBadge.classList.remove('hidden');
        receivedTextBadge.textContent = `🔗 ${info.urls.length} Link${info.urls.length > 1 ? 's' : ''}`;
        receivedTextContent.innerHTML = formatAutolinkHtml(text);
      } else {
        btnOpenReceivedLink.classList.add('hidden');
        receivedTextBadge.classList.add('hidden');
        receivedTextContent.textContent = text;
      }
    } else {
      receivedLinkHero.classList.add('hidden');
      receivedTextContainer.classList.add('hidden');
    }

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

    const expiryTime = typeof expiresAtIso === 'number' ? expiresAtIso : new Date(expiresAtIso).getTime();

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
        stopPickupWatcher();
        clearActiveSenderDrop();
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
    if (liveInputBar) liveInputBar.classList.add('hidden');
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

  function init() {
    setupTabs();
    setupPinInputs();
    setupLiveInputWatcher();
    setupDropzone();
    setupCamera();
    setupActions();
    setupUpdateModal();

    // Check if user has an active unexpired drop
    const active = getActiveSenderDrop();
    if (active) {
      activeDropData = active;
      displayShareScreen(active);
    } else {
      updateActiveDropBanner();
    }

    checkDirectPinRoute();

    if (isCapacitorNative()) {
      checkAppUpdate(false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
