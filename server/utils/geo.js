/**
 * Haversine formülü ile iki GPS koordinatı arasındaki mesafeyi metre cinsinden hesaplar
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Dünya yarıçapı (metre)
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Mesafe metre cinsinden
}

/**
 * Verilen koordinatın lokasyonun geofence alanı içinde olup olmadığını kontrol eder
 */
function isWithinGeofence(userLat, userLng, locationLat, locationLng, radiusMeters) {
  const distance = calculateDistance(userLat, userLng, locationLat, locationLng);
  return {
    isWithin: distance <= radiusMeters,
    distance: Math.round(distance * 100) / 100
  };
}

module.exports = { calculateDistance, isWithinGeofence };
