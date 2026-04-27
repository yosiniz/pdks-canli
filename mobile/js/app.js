/* PDKS Mobile - Main Application Logic */

let currentAction = null; // 'check-in' or 'check-out'
let scannedQR = null;

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Show splash then check auth
  setTimeout(() => {
    if (API.token) {
      checkAuthAndLoad();
    } else {
      showScreen('login-screen');
    }
  }, 2000);

  // Login form
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Logout
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
});

// ====== SCREEN MANAGEMENT ======
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

// ====== AUTH ======
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  btn.disabled = true;
  btn.innerHTML = '<span>Giriş yapılıyor...</span>';
  errEl.style.display = 'none';

  const result = await API.login(username, password);

  if (result.success) {
    API.setToken(result.token);
    API.setUser(result.user);
    await loadMainScreen();
  } else {
    errEl.textContent = result.error || 'Giriş başarısız';
    errEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.innerHTML = '<span>Giriş Yap</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
}

async function checkAuthAndLoad() {
  const result = await API.getMe();
  if (result.success) {
    API.setUser(result.user);
    await loadMainScreen();
  } else {
    API.clearToken();
    showScreen('login-screen');
  }
}

function handleLogout() {
  stopGPSTracking();
  API.clearToken();
  showScreen('login-screen');
}

// ====== MAIN SCREEN ======
async function loadMainScreen() {
  const user = API.getUser();
  if (user) {
    document.getElementById('user-name').textContent = user.full_name;
  }
  showScreen('main-screen');
  await updateStatus();
  await loadHistory();
}

async function updateStatus() {
  const result = await API.getMyStatus();
  const card = document.getElementById('status-card');
  const title = document.getElementById('status-title');
  const detail = document.getElementById('status-detail');
  const btnIn = document.getElementById('btn-check-in');
  const btnOut = document.getElementById('btn-check-out');

  card.className = 'status-card';

  if (!result.success || result.status === 'not_checked_in') {
    card.classList.add('status-none');
    title.textContent = 'Giriş Yapılmadı';
    detail.textContent = 'QR kodu taratarak giriş yapın';
    btnIn.style.display = 'flex';
    btnOut.style.display = 'none';
    stopGPSTracking();
  } else if (result.status === 'checked_in') {
    card.classList.add('status-in');
    title.textContent = 'Mesaide';
    const t = new Date(result.attendance.check_in_time);
    detail.textContent = result.attendance.location_name + ' • Giriş: ' + t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    btnIn.style.display = 'none';
    btnOut.style.display = 'flex';
    startGPSTracking();
  } else if (result.status === 'checked_out') {
    card.classList.add('status-out');
    title.textContent = 'Çıkış Yapıldı';
    detail.textContent = 'Bugünkü mesainiz tamamlandı';
    btnIn.style.display = 'none';
    btnOut.style.display = 'none';
    stopGPSTracking();
  } else if (result.status === 'irregular') {
    card.classList.add('status-irregular');
    title.textContent = '⚠ Düzensiz';
    detail.textContent = 'GPS konumunuz alan dışında tespit edildi';
    btnIn.style.display = 'none';
    btnOut.style.display = 'flex';
    startGPSTracking();
  }
}

async function loadHistory() {
  const result = await API.getMyHistory(1);
  const list = document.getElementById('history-list');

  if (!result.success || !result.records || result.records.length === 0) {
    list.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><p>Henüz kayıt bulunmuyor</p></div>';
    return;
  }

  list.innerHTML = result.records.map(r => {
    const dateStr = new Date(r.work_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
    const inTime = r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const outTime = r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const dotClass = r.status === 'irregular' ? 'irregular' : (r.status === 'checked_out' ? 'out' : 'in');
    return '<div class="history-item"><div class="history-dot ' + dotClass + '"></div><div class="history-info"><div class="h-title">' + r.location_name + '</div><div class="h-sub">' + inTime + ' - ' + outTime + '</div></div><div class="history-time">' + dateStr + '</div></div>';
  }).join('');
}

// ====== CHECK-IN FLOW ======
function startCheckIn() {
  currentAction = 'check-in';
  document.getElementById('qr-modal-title').textContent = 'Giriş QR Kodu Tarat';
  startQRScan(onQRScanned);
}

function startCheckOut() {
  currentAction = 'check-out';
  document.getElementById('qr-modal-title').textContent = 'Çıkış QR Kodu Tarat';
  startQRScan(onQRScanned);
}

async function onQRScanned(qrData) {
  scannedQR = qrData;
  // Validate QR format
  if (!qrData || !qrData.startsWith('PDKS::')) {
    showResult(false, 'Geçersiz QR', 'Bu QR kod PDKS sistemine ait değil.');
    return;
  }
  // Take selfie
  const blob = await takeSelfie();
  if (!blob) return;

  // Get GPS
  showProcessing('Konum alınıyor...');
  try {
    const pos = await getCurrentPosition();
    showProcessing(currentAction === 'check-in' ? 'Giriş kaydediliyor...' : 'Çıkış kaydediliyor...');

    let result;
    if (currentAction === 'check-in') {
      result = await API.checkIn(scannedQR, pos.lat, pos.lng, blob);
    } else {
      result = await API.checkOut(scannedQR, pos.lat, pos.lng, blob);
    }

    hideProcessing();

    if (result.success) {
      const msg = currentAction === 'check-in'
        ? result.attendance.location_name + ' lokasyonuna giriş yapıldı.'
        : 'Çalışma süresi: ' + (result.attendance.duration || '');
      showResult(true, result.message, msg);
      await updateStatus();
      await loadHistory();
    } else {
      showResult(false, 'İşlem Başarısız', result.error || 'Bir hata oluştu');
    }
  } catch (err) {
    hideProcessing();
    showResult(false, 'GPS Hatası', 'Konum alınamadı. Konum izni verin ve tekrar deneyin.');
  }
}

// ====== UI HELPERS ======
function showProcessing(text) {
  document.getElementById('processing-text').textContent = text;
  document.getElementById('processing-modal').style.display = 'flex';
}

function hideProcessing() {
  document.getElementById('processing-modal').style.display = 'none';
}

function showResult(success, title, message) {
  const icon = document.getElementById('result-icon');
  icon.className = 'result-icon ' + (success ? 'success' : 'error');
  icon.innerHTML = success
    ? '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>'
    : '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-message').textContent = message;
  document.getElementById('result-modal').style.display = 'flex';
}

function closeResultModal() {
  document.getElementById('result-modal').style.display = 'none';
}
