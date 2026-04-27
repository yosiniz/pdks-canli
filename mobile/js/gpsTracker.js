/* PDKS Mobile - GPS Tracker Module */
let gpsIntervalId = null;
const GPS_INTERVAL = 3000; // 3 saniye

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

function startGPSTracking() {
  if (gpsIntervalId) return;
  const indicator = document.getElementById('gps-indicator');
  indicator.style.display = 'flex';
  indicator.style.color = '#00C853';

  gpsIntervalId = setInterval(async () => {
    try {
      const pos = await getCurrentPosition();
      const result = await API.heartbeat(pos.lat, pos.lng);
      
      indicator.style.color = '#00C853'; // Yesil - Aktif
      
      if (result.success && !result.is_within_zone) {
        console.warn('GPS: Alan disinda!');
      }
    } catch (err) {
      console.error('GPS hatasi:', err);
      indicator.style.color = '#FF1744'; // Kirmizi - Hata
      
      // Eger bir modal veya alert gostermek isterseniz buraya ekleyebilirsiniz
      // showResult(false, 'Sinyal Kaybi', 'GPS veya internet baglantisi kesildi!');
    }
  }, GPS_INTERVAL);
  console.log('GPS takip baslatildi (3 sn aralik)');
}

function stopGPSTracking() {
  if (gpsIntervalId) {
    clearInterval(gpsIntervalId);
    gpsIntervalId = null;
  }
  document.getElementById('gps-indicator').style.display = 'none';
  console.log('GPS takip durduruldu');
}
