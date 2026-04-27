/* PDKS Mobile - GPS Tracker Module */
let gpsIntervalId = null;
const GPS_INTERVAL = 10 * 60 * 1000; // 10 dakika

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS desteklenmiyor'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function startGPSTracking() {
  if (gpsIntervalId) return;
  document.getElementById('gps-indicator').style.display = 'flex';
  gpsIntervalId = setInterval(async () => {
    try {
      const pos = await getCurrentPosition();
      const result = await API.heartbeat(pos.lat, pos.lng);
      if (result.success && !result.is_within_zone) {
        console.warn('GPS: Alan disinda! Mesafe:', result.distance + 'm');
      }
    } catch (err) {
      console.error('GPS heartbeat hatasi:', err);
    }
  }, GPS_INTERVAL);
  console.log('GPS takip baslatildi (10 dk aralik)');
}

function stopGPSTracking() {
  if (gpsIntervalId) {
    clearInterval(gpsIntervalId);
    gpsIntervalId = null;
  }
  document.getElementById('gps-indicator').style.display = 'none';
  console.log('GPS takip durduruldu');
}
