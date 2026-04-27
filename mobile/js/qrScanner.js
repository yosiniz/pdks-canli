/* PDKS Mobile - QR Scanner Module */
let html5QrCode = null;

function initQRScanner() {
  if (html5QrCode) {
    try { html5QrCode.clear(); } catch(e) {}
  }
  html5QrCode = new Html5Qrcode('qr-reader');
}

async function startQRScan(onSuccess) {
  const qrModal = document.getElementById('qr-modal');
  qrModal.style.display = 'flex';

  // Small delay for DOM
  await new Promise(r => setTimeout(r, 300));

  initQRScanner();

  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      },
      (decodedText) => {
        // QR found
        stopQRScan();
        qrModal.style.display = 'none';
        if (onSuccess) onSuccess(decodedText);
      },
      (errorMessage) => {
        // Scanning...
      }
    );
  } catch (err) {
    console.error('QR Kamera hatasi:', err);
    qrModal.style.display = 'none';
    showResult(false, 'Kamera Hatasi', 'Kameraya erisim izni verin ve tekrar deneyin.');
  }
}

function stopQRScan() {
  if (html5QrCode) {
    try {
      html5QrCode.stop().catch(() => {});
    } catch(e) {}
  }
}

function closeQRModal() {
  stopQRScan();
  document.getElementById('qr-modal').style.display = 'none';
}
