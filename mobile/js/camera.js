/* PDKS Mobile - Camera/Selfie Module */
let cameraStream = null;
let capturedBlob = null;

async function openCamera() {
  const modal = document.getElementById('selfie-modal');
  const video = document.getElementById('selfie-video');
  const preview = document.getElementById('selfie-preview');
  const btnCapture = document.getElementById('btn-capture');
  const btnRetake = document.getElementById('btn-retake');
  const btnConfirm = document.getElementById('btn-confirm-selfie');

  modal.style.display = 'flex';
  preview.style.display = 'none';
  video.style.display = 'block';
  btnCapture.style.display = 'block';
  btnRetake.style.display = 'none';
  btnConfirm.style.display = 'none';
  capturedBlob = null;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = cameraStream;
  } catch (err) {
    console.error('Kamera hatasi:', err);
    modal.style.display = 'none';
    showResult(false, 'Kamera Hatasi', 'On kameraya erisim izni verin.');
  }
}

function captureSelfie() {
  const video = document.getElementById('selfie-video');
  const canvas = document.getElementById('selfie-canvas');
  const preview = document.getElementById('selfie-preview');
  const img = document.getElementById('selfie-img');
  const btnCapture = document.getElementById('btn-capture');
  const btnRetake = document.getElementById('btn-retake');
  const btnConfirm = document.getElementById('btn-confirm-selfie');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  // Mirror the image
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  canvas.toBlob((blob) => {
    capturedBlob = blob;
    img.src = URL.createObjectURL(blob);
    video.style.display = 'none';
    preview.style.display = 'block';
    btnCapture.style.display = 'none';
    btnRetake.style.display = 'inline-flex';
    btnConfirm.style.display = 'inline-flex';
  }, 'image/jpeg', 0.5);
}

function retakeSelfie() {
  const video = document.getElementById('selfie-video');
  const preview = document.getElementById('selfie-preview');
  const btnCapture = document.getElementById('btn-capture');
  const btnRetake = document.getElementById('btn-retake');
  const btnConfirm = document.getElementById('btn-confirm-selfie');

  capturedBlob = null;
  video.style.display = 'block';
  preview.style.display = 'none';
  btnCapture.style.display = 'block';
  btnRetake.style.display = 'none';
  btnConfirm.style.display = 'none';
}

function confirmSelfie() {
  stopCamera();
  document.getElementById('selfie-modal').style.display = 'none';
  if (window._selfieCallback) {
    window._selfieCallback(capturedBlob);
    window._selfieCallback = null;
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

function closeSelfieModal() {
  stopCamera();
  capturedBlob = null;
  document.getElementById('selfie-modal').style.display = 'none';
}

function takeSelfie() {
  return new Promise((resolve) => {
    window._selfieCallback = resolve;
    openCamera();
  });
}
