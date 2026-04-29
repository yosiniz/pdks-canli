/* PDKS Mobile - GPS Tracker Module */
let gpsIntervalId = null;
const GPS_INTERVAL = 1000; // 1 saniye
let consecutiveFailures = 0;

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
      consecutiveFailures = 0; // Sifirla
    }
  } catch (err) {
    consecutiveFailures++;
    console.warn('Sinyal gonderilemedi, Hata Sayisi: ' + consecutiveFailures);
    indicator.style.color = '#FF1744'; // Kirmizi - Hata
    indicator.classList.add('pulse-error');

    // 60 saniye boyunca sinyal yoksa otomatik cikis yap
    if (consecutiveFailures >= 60) {
      stopGPSTracking();
      
      // Bildirim gonder
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('PDKS Uyarı', { 
          body: 'GPS sinyalinize 1 dakika ulaşılamadığı için mesainiz otomatik sonlandırıldı.',
          icon: '/mobile/icon.png' 
        });
      } else {
        alert('GPS sinyalinize 1 dakika ulaşılamadığı için mesainiz otomatik sonlandırıldı.');
      }
      
      // Arayuzu guncelle (Cikis Yapildi olarak goster)
      const card = document.getElementById('status-card');
      const title = document.getElementById('status-title');
      const detail = document.getElementById('status-detail');
      const btnIn = document.getElementById('btn-check-in');
      const btnOut = document.getElementById('btn-check-out');
      
      card.className = 'status-card status-out';
      title.textContent = 'Çıkış Yapıldı (Otomatik)';
      detail.textContent = 'Sinyal yok - Mesai sonlandırıldı';
      btnIn.style.display = 'none';
      btnOut.style.display = 'none';
    }
  }
}

function startGPSTracking() {
  if (gpsIntervalId) return;
  consecutiveFailures = 0; // Baslangicta sifirla
  document.getElementById('gps-indicator').style.display = 'flex';
  
  // Bildirim izni iste
  if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
  
  // İlk sinyali hemen gonder
  sendHeartbeat();
  
  // Donguyu baslat
  gpsIntervalId = setInterval(sendHeartbeat, GPS_INTERVAL);

  // OTOMATIK IYILESTIRME: İnternet geldigi an beklemeden sinyal gonder
  window.addEventListener('online', () => {
    console.log('Baglanti geri geldi, sinyal tazeleniyor...');
    consecutiveFailures = 0;
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
