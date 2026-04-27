const multer = require('multer');
const path = require('path');
const fs = require('fs');

const SELFIE_DIR = path.join(__dirname, '..', 'uploads', 'selfies');

// Ensure selfie directory exists
if (!fs.existsSync(SELFIE_DIR)) {
  fs.mkdirSync(SELFIE_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Organize by date
    const dateDir = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dir = path.join(SELFIE_DIR, dateDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const userId = req.user ? req.user.id : 'unknown';
    const type = req.body.type || 'selfie'; // check_in or check_out
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `user_${userId}_${type}_${timestamp}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Sadece JPEG, PNG ve WebP formatları kabul edilir'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

module.exports = { upload, SELFIE_DIR };
