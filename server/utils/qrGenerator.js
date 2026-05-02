const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Render'da persistent disk varsa orayı kullan, yoksa yerel uploads/qrcodes kullan
const PERSISTENT_DATA = '/opt/render/project/src/server/data';
const QR_DIR = fs.existsSync(PERSISTENT_DATA) 
  ? path.join(PERSISTENT_DATA, 'qrcodes')
  : path.join(__dirname, '..', 'uploads', 'qrcodes');

// Ensure QR directory exists
if (!fs.existsSync(QR_DIR)) {
  fs.mkdirSync(QR_DIR, { recursive: true });
}

/**
 * Lokasyon için benzersiz QR kodu verisi oluşturur
 */
function generateQRData(locationId) {
  const secret = uuidv4();
  const qrData = `PDKS::${locationId}::${secret}`;
  return { qrData, secret };
}

/**
 * QR kodu PNG dosyası olarak oluşturur
 */
async function generateQRImage(qrData, locationId) {
  const filename = `location_${locationId}_${Date.now()}.png`;
  const filepath = path.join(QR_DIR, filename);

  await QRCode.toFile(filepath, qrData, {
    width: 400,
    margin: 2,
    color: {
      dark: '#1a1a1a',
      light: '#ffffff'
    },
    errorCorrectionLevel: 'H'
  });

  return `/uploads/qrcodes/${filename}`;
}

/**
 * QR kodu base64 string olarak döndürür (inline görüntüleme için)
 */
async function generateQRBase64(qrData) {
  return await QRCode.toDataURL(qrData, {
    width: 400,
    margin: 2,
    color: {
      dark: '#1a1a1a',
      light: '#ffffff'
    },
    errorCorrectionLevel: 'H'
  });
}

/**
 * QR kod verisini parse eder ve doğrular
 */
function parseQRData(qrString) {
  const parts = qrString.split('::');
  if (parts.length !== 3 || parts[0] !== 'PDKS') {
    return null;
  }
  return {
    locationId: parseInt(parts[1]),
    secret: parts[2]
  };
}

module.exports = { generateQRData, generateQRImage, generateQRBase64, parseQRData };
