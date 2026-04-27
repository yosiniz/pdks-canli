/* PDKS Mobile - GPS Tracker Module */
let gpsIntervalId = null;
const GPS_INTERVAL = 1000; // 1 saniye

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS desteklenmiyor'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  });
}

async function sendHeartbeat() {
  const indicator = document.getElementById('gps-indicator');
  try {
    const pos = await getCurrentPosition();
    const result = await API.heartbeat(pos.lat, pos.lng);
    
    if (result.success) {
      indicator.style.color = '#00C853'; // Yesil - Aktif
      indicator.classList.remove('pulse-error');
    }
  } catch (err) {
    console.warn('Sinyal gonderilemedi, otomatik yeniden denenecek...');
    indicator.style.color = '#FF1744'; // Kirmizi - Hata
    indicator.classList.add('pulse-error');
  }
}

function startGPSTracking() {
  if (gpsIntervalId) return;
  document.getElementById('gps-indicator').style.display = 'flex';
  
  // İlk sinyali hemen gonder
  sendHeartbeat();
  
  // Donguyu baslat
  gpsIntervalId = setInterval(sendHeartbeat, GPS_INTERVAL);

  // OTOMATIK IYILESTIRME: İnternet geldigi an beklemeden sinyal gonder
  window.addEventListener('online', () => {
    console.log('Baglanti geri geldi, sinyal tazeleniyor...');
    sendHeartbeat();
  });
  
  console.log('Akilli GPS takip baslatildi');
}

function stopGPSTracking() {
  if (gpsIntervalId) {
    clearInterval(gpsIntervalId);
    gpsIntervalId = null;
  }
  document.getElementById('gps-indicator').style.display = 'none';
}
