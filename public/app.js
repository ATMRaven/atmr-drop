/**
 * THE DAILY DROP • Frontend Application Controller
 * Created by atmr
 */

(function () {
  'use strict';

  // --- State Management ---
  const state = {
    currentView: 'pin', // 'pin' | 'send' | 'share' | 'receive'
    enteredPin: '',
    selectedTtl: 300, // default 5 mins
    burnAfterRead: false,
    selectedFiles: [], // Array<{ name, size, type, dataBase64, previewUrl }>
    currentDrop: null, // Active drop metadata
    timerInterval: null,
    html5QrScanner: null,
    cameraStream: null,
  };

  // --- DOM Elements ---
  const views = {
    pin: document.getElementById('view-pin'),
    send: document.getElementById('view-send'),
    share: document.getElementById('view-share'),
    receive: document.getElementById('view-receive'),
  };

  const nav = {
    brand: document.getElementById('nav-brand'),
    btnEnterPin: document.getElementById('nav-btn-enter-pin'),
    btnSend: document.getElementById('nav-btn-send'),
  };

  // Date Header Element
  const dateElement = document.getElementById('current-newspaper-date');
  if (dateElement) {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = `${now.toLocaleDateString('en-US', options).toUpperCase()} • NEW YORK & GLOBAL EDITION`;
  }

  // PIN View elements
  const pinBoxes = document.querySelectorAll('.pin-box');
  const pinHiddenInput = document.getElementById('pin-hidden-input');
  const pinStatusMsg = document.getElementById('pin-status-msg');
  const btnGotoSend = document.getElementById('btn-goto-send');
  const keypadBtns = document.querySelectorAll('.keypad-btn[data-val]');
  const keypadBtnBackspace = document.getElementById('keypad-btn-backspace');
  const keypadBtnQr = document.getElementById('keypad-btn-qr');

  // Send View elements
  const dropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('file-input');
  const btnCameraSnap = document.getElementById('btn-camera-snap');
  const selectedFilesContainer = document.getElementById('selected-files-container');
  const fileCardsGrid = document.getElementById('file-cards-grid');
  const filesCountSpan = document.getElementById('files-count');
  const btnClearFiles = document.getElementById('btn-clear-files');
  const textInput = document.getElementById('text-input');
  const charCountSpan = document.getElementById('char-count');
  const btnClearText = document.getElementById('btn-clear-text');
  const btnPasteClipboard = document.getElementById('btn-paste-clipboard');
  const ttlChips = document.querySelectorAll('.ttl-chip');
  const toggleBurn = document.getElementById('toggle-burn');
  const btnCreateDrop = document.getElementById('btn-create-drop');
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const uploadProgressLabel = document.getElementById('upload-progress-label');

  // Share View elements
  const sharePinCode = document.getElementById('share-pin-code');
  const btnCopyPinCode = document.getElementById('btn-copy-pin-code');
  const shareExpiryTimer = document.getElementById('share-expiry-timer');
  const shareBurnIndicator = document.getElementById('share-burn-indicator');
  const shareDirectUrl = document.getElementById('share-direct-url');
  const btnCopyShareUrl = document.getElementById('btn-copy-share-url');
  const btnDoneShare = document.getElementById('btn-done-share');

  // Receive View elements
  const receiveExpiryTimer = document.getElementById('receive-expiry-timer');
  const receiveBurnBadge = document.getElementById('receive-burn-badge');
  const receivedTextBox = document.getElementById('received-text-box');
  const receivedTextContent = document.getElementById('received-text-content');
  const btnCopyReceivedText = document.getElementById('btn-copy-received-text');
  const copyTextBtnLabel = document.getElementById('copy-text-btn-label');
  const receivedImagesContainer = document.getElementById('received-images-container');
  const receivedImagesCount = document.getElementById('received-images-count');
  const receivedImagesGrid = document.getElementById('received-images-grid');
  const receivedFilesContainer = document.getElementById('received-files-container');
  const receivedFilesCount = document.getElementById('received-files-count');
  const receivedFilesList = document.getElementById('received-files-list');
  const btnDownloadAllZip = document.getElementById('btn-download-all-zip');
  const btnReceiveDone = document.getElementById('btn-receive-done');

  // Modals
  const modalScanner = document.getElementById('modal-scanner');
  const btnCloseScanner = document.getElementById('btn-close-scanner');
  const modalCameraSnap = document.getElementById('modal-camera-snap');
  const btnCloseCamera = document.getElementById('btn-close-camera');
  const cameraVideo = document.getElementById('camera-video');
  const cameraCanvas = document.getElementById('camera-canvas');
  const btnTriggerSnap = document.getElementById('btn-trigger-snap');
  const modalLightbox = document.getElementById('modal-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const btnCloseLightbox = document.getElementById('btn-close-lightbox');
  const toastContainer = document.getElementById('toast-container');

  // --- Sound Effects via Web Audio API ---
  const audioCtx = window.AudioContext || window.webkitAudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null;
  function playBeep(freq = 600, type = 'sine', duration = 0.08) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function playSuccessChime() {
    playBeep(523.25, 'sine', 0.1);
    setTimeout(() => playBeep(659.25, 'sine', 0.1), 100);
    setTimeout(() => playBeep(783.99, 'sine', 0.15), 200);
  }

  // --- Toast Notifications ---
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'news-toast';
    toast.textContent = `[TELEGRAPH] ${message}`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3200);
  }

  // --- View Switcher ---
  function switchView(viewName) {
    state.currentView = viewName;
    Object.keys(views).forEach((k) => {
      if (views[k]) views[k].classList.toggle('active', k === viewName);
    });

    // Update navigation active states
    if (nav.btnEnterPin && nav.btnSend) {
      nav.btnEnterPin.classList.toggle('active', viewName === 'pin' || viewName === 'receive');
      nav.btnSend.classList.toggle('active', viewName === 'send' || viewName === 'share');
    }

    // Auto-focus PIN input if switching to PIN view
    if (viewName === 'pin') {
      setTimeout(() => {
        pinHiddenInput.focus();
      }, 100);
    }
  }

  // --- PIN Keypad Logic ---
  function updatePinBoxes() {
    pinBoxes.forEach((box, i) => {
      const char = state.enteredPin[i];
      if (char) {
        box.textContent = char;
        box.classList.add('filled');
        box.classList.remove('active-pulse');
      } else {
        box.textContent = '_';
        box.classList.remove('filled');
        box.classList.toggle('active-pulse', i === state.enteredPin.length);
      }
    });

    if (pinHiddenInput.value !== state.enteredPin) {
      pinHiddenInput.value = state.enteredPin;
    }

    if (state.enteredPin.length === 4) {
      submitPin(state.enteredPin);
    }
  }

  function handlePinInput(char) {
    if (state.enteredPin.length < 4 && /[0-9A-Za-z]/.test(char)) {
      state.enteredPin += char.toUpperCase();
      playBeep(400 + state.enteredPin.length * 80);
      updatePinBoxes();
    }
  }

  function handlePinBackspace() {
    if (state.enteredPin.length > 0) {
      state.enteredPin = state.enteredPin.slice(0, -1);
      playBeep(320);
      setPinStatus('');
      updatePinBoxes();
    }
  }

  function setPinStatus(msg, type = '') {
    pinStatusMsg.textContent = msg;
    pinStatusMsg.className = 'pin-status' + (type ? ` ${type}` : '');
  }

  async function submitPin(code) {
    setPinStatus('DECRYPTING WIRE...', 'loading');
    try {
      const res = await fetch(`/api/drop/${code}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setPinStatus(data.error ? `ERROR: ${data.error.toUpperCase()}` : 'DROP NOT FOUND OR EXPIRED', 'error');
        playBeep(220, 'sawtooth', 0.2);
        setTimeout(() => {
          state.enteredPin = '';
          updatePinBoxes();
        }, 1200);
        return;
      }

      playSuccessChime();
      renderReceivedDrop(data.drop);
      switchView('receive');
      setPinStatus('');
    } catch (err) {
      setPinStatus('NETWORK CONNECTION FAILED. RETRY.', 'error');
    }
  }

  // --- Send View / File & Text Handling ---
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    for (const file of fileList) {
      if (file.size > 25 * 1024 * 1024) {
        showToast(`"${file.name}" exceeds 25MB limit.`);
        continue;
      }

      const isImage = file.type.startsWith('image/');
      let previewUrl = '';
      const dataBase64 = await readFileAsBase64(file);

      if (isImage) {
        previewUrl = dataBase64;
      }

      state.selectedFiles.push({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        dataBase64,
        previewUrl,
      });
    }

    renderSelectedFiles();
    playBeep(700);
  }

  function renderSelectedFiles() {
    if (state.selectedFiles.length === 0) {
      selectedFilesContainer.classList.add('hidden');
      filesCountSpan.textContent = '0';
      fileCardsGrid.innerHTML = '';
      return;
    }

    selectedFilesContainer.classList.remove('hidden');
    filesCountSpan.textContent = state.selectedFiles.length.toString();
    fileCardsGrid.innerHTML = '';

    state.selectedFiles.forEach((file, index) => {
      const card = document.createElement('div');
      card.className = 'file-card-preview';

      const name = document.createElement('span');
      name.className = 'file-card-name';
      name.textContent = file.name;

      const size = document.createElement('span');
      size.className = 'file-card-size';
      size.textContent = formatBytes(file.size);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-remove-btn';
      removeBtn.innerHTML = '×';
      removeBtn.title = 'Remove file';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedFiles.splice(index, 1);
        renderSelectedFiles();
      });

      card.appendChild(name);
      card.appendChild(size);
      card.appendChild(removeBtn);
      fileCardsGrid.appendChild(card);
    });
  }

  // --- Dynamic TTL & Burn Options ---
  ttlChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      ttlChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.selectedTtl = parseInt(chip.dataset.ttl || '300', 10);
      playBeep(500);
    });
  });

  toggleBurn.addEventListener('change', () => {
    state.burnAfterRead = toggleBurn.checked;
    playBeep(state.burnAfterRead ? 650 : 350);
  });

  textInput.addEventListener('input', () => {
    charCountSpan.textContent = `${textInput.value.length} CHARACTERS`;
  });

  btnClearText.addEventListener('click', () => {
    textInput.value = '';
    charCountSpan.textContent = '0 CHARACTERS';
  });

  btnPasteClipboard.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        textInput.value = text;
        charCountSpan.textContent = `${text.length} CHARACTERS`;
        showToast('Pasted wire text from clipboard.');
        playBeep(800);
      }
    } catch (_) {
      showToast('Clipboard access required.');
    }
  });

  btnClearFiles.addEventListener('click', () => {
    state.selectedFiles = [];
    renderSelectedFiles();
  });

  // --- Drop Creation Request ---
  async function createDrop() {
    const textVal = textInput.value.trim();
    if (!textVal && state.selectedFiles.length === 0) {
      showToast('Please attach at least one file or compose text.');
      playBeep(250, 'sawtooth');
      return;
    }

    btnCreateDrop.disabled = true;
    uploadProgressContainer.classList.remove('hidden');
    uploadProgressFill.style.width = '35%';
    uploadProgressLabel.textContent = 'ENCODING WIRE DISPATCH...';

    try {
      const payload = {
        text: textVal || undefined,
        ttlSeconds: state.selectedTtl,
        burnAfterRead: state.burnAfterRead,
        files: state.selectedFiles.map((f) => ({
          name: f.name,
          type: f.type,
          size: f.size,
          dataBase64: f.dataBase64,
        })),
      };

      uploadProgressFill.style.width = '75%';

      const res = await fetch('/api/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to create wire dispatch');
      }

      uploadProgressFill.style.width = '100%';
      uploadProgressLabel.textContent = 'TRANSMISSION COMPLETE!';
      playSuccessChime();

      // Show Share Screen
      renderShareScreen(result);
      switchView('share');

      // Clear input fields
      textInput.value = '';
      charCountSpan.textContent = '0 CHARACTERS';
      state.selectedFiles = [];
      renderSelectedFiles();
    } catch (err) {
      showToast(err.message || 'Transmission error');
      playBeep(220, 'sawtooth');
    } finally {
      btnCreateDrop.disabled = false;
      setTimeout(() => {
        uploadProgressContainer.classList.add('hidden');
        uploadProgressFill.style.width = '0%';
      }, 1000);
    }
  }

  // --- Share Screen Presentation ---
  function renderShareScreen(dropInfo) {
    sharePinCode.textContent = dropInfo.code;
    shareDirectUrl.value = dropInfo.directUrl;

    if (dropInfo.burnAfterRead) {
      shareBurnIndicator.classList.remove('hidden');
    } else {
      shareBurnIndicator.classList.add('hidden');
    }

    // Render Vector QR Code
    const qrContainer = document.getElementById('share-qr-container');
    if (qrContainer && typeof window.qrcode === 'function') {
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData(dropInfo.directUrl);
        qr.make();
        qrContainer.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 1, scalable: true });
      } catch (err) {
        console.error('QR Render Error:', err);
      }
    }

    startExpiryCountdown(shareExpiryTimer, dropInfo.expiresAt);
  }

  // --- Receive Screen Presentation ---
  function renderReceivedDrop(drop) {
    state.currentDrop = drop;
    startExpiryCountdown(receiveExpiryTimer, drop.expiresAt);

    if (drop.burnAfterRead) {
      receiveBurnBadge.classList.remove('hidden');
    } else {
      receiveBurnBadge.classList.add('hidden');
    }

    // Text Display
    if (drop.text) {
      receivedTextBox.classList.remove('hidden');
      receivedTextContent.textContent = drop.text;
    } else {
      receivedTextBox.classList.add('hidden');
      receivedTextContent.textContent = '';
    }

    // Image Previews & Files List
    const imageFiles = drop.files.filter((f) => f.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      receivedImagesContainer.classList.remove('hidden');
      receivedImagesCount.textContent = imageFiles.length.toString();
      receivedImagesGrid.innerHTML = '';

      imageFiles.forEach((file) => {
        const fileUrl = `/api/file/${drop.code}/${file.id}`;
        const card = document.createElement('div');
        card.className = 'image-card-news';

        const img = document.createElement('img');
        img.src = fileUrl;
        img.alt = file.name;
        img.loading = 'lazy';

        const caption = document.createElement('div');
        caption.className = 'image-caption-news';
        caption.textContent = file.name;

        card.appendChild(img);
        card.appendChild(caption);

        card.addEventListener('click', () => {
          lightboxImg.src = fileUrl;
          modalLightbox.classList.remove('hidden');
        });

        receivedImagesGrid.appendChild(card);
      });
    } else {
      receivedImagesContainer.classList.add('hidden');
      receivedImagesGrid.innerHTML = '';
    }

    // All Files List
    if (drop.files.length > 0) {
      receivedFilesContainer.classList.remove('hidden');
      receivedFilesCount.textContent = drop.files.length.toString();
      receivedFilesList.innerHTML = '';

      drop.files.forEach((file) => {
        const fileUrl = `/api/file/${drop.code}/${file.id}`;
        const row = document.createElement('div');
        row.className = 'file-item-row';

        const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';

        row.innerHTML = `
          <div class="file-item-info">
            <span class="file-ext-tag">${ext.slice(0, 4)}</span>
            <div>
              <div class="file-item-name">${file.name}</div>
              <div class="file-item-size">${formatBytes(file.size)}</div>
            </div>
          </div>
          <a href="${fileUrl}?download=1" download="${file.name}" class="news-btn-primary small-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>DOWNLOAD</span>
          </a>
        `;

        receivedFilesList.appendChild(row);
      });
    } else {
      receivedFilesContainer.classList.add('hidden');
      receivedFilesList.innerHTML = '';
    }
  }

  // --- Countdown Timer Helper ---
  function startExpiryCountdown(elem, expiresAt) {
    if (state.timerInterval) clearInterval(state.timerInterval);

    function update() {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      if (remaining <= 0) {
        elem.textContent = 'EXPIRED';
        clearInterval(state.timerInterval);
        return;
      }
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      elem.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    update();
    state.timerInterval = setInterval(update, 1000);
  }

  // --- Download All as ZIP (JSZip) ---
  btnDownloadAllZip.addEventListener('click', async () => {
    if (!state.currentDrop || !state.currentDrop.files.length) return;
    if (!window.JSZip) {
      showToast('ZIP library is loading...');
      return;
    }

    btnDownloadAllZip.disabled = true;
    showToast('Compressing archive into ZIP...');

    try {
      const zip = new window.JSZip();
      for (const file of state.currentDrop.files) {
        const fileUrl = `/api/file/${state.currentDrop.code}/${file.id}`;
        const res = await fetch(fileUrl);
        const blob = await res.blob();
        zip.file(file.name, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `daily-drop-${state.currentDrop.code}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      showToast('ZIP archive downloaded successfully.');
      playSuccessChime();
    } catch (err) {
      showToast('Failed to create ZIP archive.');
    } finally {
      btnDownloadAllZip.disabled = false;
    }
  });

  // --- Camera QR Scanner (Html5Qrcode) ---
  keypadBtnQr.addEventListener('click', async () => {
    modalScanner.classList.remove('hidden');
    if (window.Html5Qrcode) {
      try {
        state.html5QrScanner = new window.Html5Qrcode('qr-reader');
        await state.html5QrScanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            handleScannedQr(decodedText);
          },
          () => {}
        );
      } catch (err) {
        showToast('Camera access required for scanner.');
        closeQrScanner();
      }
    }
  });

  function closeQrScanner() {
    if (state.html5QrScanner) {
      state.html5QrScanner
        .stop()
        .then(() => state.html5QrScanner.clear())
        .catch(() => {});
      state.html5QrScanner = null;
    }
    modalScanner.classList.add('hidden');
  }

  function handleScannedQr(qrData) {
    closeQrScanner();
    playSuccessChime();

    let code = qrData.trim();
    if (code.includes('/')) {
      const parts = code.split('/');
      code = parts[parts.length - 1] || parts[parts.length - 2];
    }

    if (code && code.length >= 4) {
      state.enteredPin = code.slice(0, 4).toUpperCase();
      updatePinBoxes();
    }
  }

  btnCloseScanner.addEventListener('click', closeQrScanner);

  // --- Camera Snap Direct Capture ---
  btnCameraSnap.addEventListener('click', async () => {
    try {
      modalCameraSnap.classList.remove('hidden');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      state.cameraStream = stream;
      cameraVideo.srcObject = stream;
    } catch (err) {
      showToast('Camera not available or permission denied.');
      modalCameraSnap.classList.add('hidden');
    }
  });

  function closeCameraModal() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach((track) => track.stop());
      state.cameraStream = null;
    }
    modalCameraSnap.classList.add('hidden');
  }

  btnCloseCamera.addEventListener('click', closeCameraModal);

  btnTriggerSnap.addEventListener('click', () => {
    if (!cameraVideo.videoWidth) return;
    cameraCanvas.width = cameraVideo.videoWidth;
    cameraCanvas.height = cameraVideo.videoHeight;
    const ctx = cameraCanvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);

    const dataUrl = cameraCanvas.toDataURL('image/jpeg', 0.9);
    const filename = `press_photo_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;

    state.selectedFiles.push({
      name: filename,
      size: Math.round(dataUrl.length * 0.75),
      type: 'image/jpeg',
      dataBase64: dataUrl,
      previewUrl: dataUrl,
    });

    renderSelectedFiles();
    closeCameraModal();
    showToast('Photograph attached to dispatch.');
    playSuccessChime();
  });

  // --- Lightbox Viewer ---
  btnCloseLightbox.addEventListener('click', () => {
    modalLightbox.classList.add('hidden');
  });

  modalLightbox.addEventListener('click', (e) => {
    if (e.target === modalLightbox) {
      modalLightbox.classList.add('hidden');
    }
  });

  // --- Global Event Listeners ---
  btnCopyPinCode.addEventListener('click', () => {
    navigator.clipboard.writeText(sharePinCode.textContent);
    showToast('PIN code copied to clipboard.');
    playBeep(800);
  });

  btnCopyShareUrl.addEventListener('click', () => {
    navigator.clipboard.writeText(shareDirectUrl.value);
    showToast('Direct telegraph link copied.');
    playBeep(800);
  });

  btnCopyReceivedText.addEventListener('click', () => {
    navigator.clipboard.writeText(receivedTextContent.textContent);
    copyTextBtnLabel.textContent = '[COPIED]';
    showToast('Wire text copied.');
    playBeep(800);
    setTimeout(() => {
      copyTextBtnLabel.textContent = '[COPY TEXT]';
    }, 2000);
  });

  // Navigation Buttons
  nav.brand.addEventListener('click', () => switchView('pin'));
  nav.btnEnterPin.addEventListener('click', () => switchView('pin'));
  nav.btnSend.addEventListener('click', () => switchView('send'));
  btnGotoSend.addEventListener('click', () => switchView('send'));
  btnDoneShare.addEventListener('click', () => switchView('send'));
  btnReceiveDone.addEventListener('click', () => {
    state.enteredPin = '';
    updatePinBoxes();
    switchView('pin');
  });

  btnCreateDrop.addEventListener('click', createDrop);

  // Keypad Number Buttons
  keypadBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      handlePinInput(btn.dataset.val);
    });
  });

  keypadBtnBackspace.addEventListener('click', handlePinBackspace);

  // Physical Keyboard Input
  document.addEventListener('keydown', (e) => {
    if (state.currentView === 'pin') {
      if (e.key >= '0' && e.key <= '9') {
        handlePinInput(e.key);
      } else if (e.key === 'Backspace') {
        handlePinBackspace();
      }
    }
  });

  // Drag & Drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files) {
      addFiles(Array.from(fileInput.files));
      fileInput.value = '';
    }
  });

  // Clipboard Paste Support
  window.addEventListener('paste', (e) => {
    if (state.currentView === 'send') {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }

      if (pastedFiles.length > 0) {
        addFiles(pastedFiles);
        showToast(`Pasted ${pastedFiles.length} file(s) from clipboard.`);
      }
    }
  });

  // --- Initial Direct Route / Hash Check ---
  function checkInitialRoute() {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const hash = window.location.hash.replace(/^#+/, '');
    const searchParams = new URLSearchParams(window.location.search);
    const pinParam = searchParams.get('pin') || searchParams.get('code');

    const targetCode = pinParam || (path.length >= 4 && path.length <= 8 ? path : hash);

    if (targetCode && /^[0-9A-Za-z]{4,8}$/.test(targetCode)) {
      state.enteredPin = targetCode.slice(0, 4).toUpperCase();
      updatePinBoxes();
      switchView('pin');
    } else {
      switchView('pin');
    }
  }

  checkInitialRoute();
})();
