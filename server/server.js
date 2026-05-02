const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files — no-cache so browsers always get latest HTML/CSS
const noCacheOpts = { etag: false, lastModified: false, setHeaders: (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}};
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Render persistent disk servisi
const PERSISTENT_DATA = '/opt/render/project/src/server/data';
if (require('fs').existsSync(PERSISTENT_DATA)) {
  app.use('/uploads/qrcodes', express.static(path.join(PERSISTENT_DATA, 'qrcodes')));
}
app.use('/mobile', express.static(path.join(__dirname, '..', 'mobile'), noCacheOpts));
app.use('/admin',  express.static(path.join(__dirname, '..', 'admin'),  noCacheOpts));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/admin', require('./routes/admin'));

// Root redirect
app.get('/', (req, res) => { res.redirect('/mobile/'); });

// Error handler
app.use((err, req, res, next) => {
  console.error('Hata:', err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Dosya boyutu 5MB limitini asmaktadir' });
  res.status(500).json({ error: 'Sunucu hatasi' });
});

// Start server after DB init
async function start() {
  await initializeDatabase();
  
  // Auto-Checkout Cron (15 saniyede bir calisir)
  setInterval(async () => {
    try {
      const { getDb } = require('./config/database');
      const db = getDb();
      if (!db) return;
      
      // 60 saniyedir sinyal alinamayan (telefonu kapanmis veya arka planda durdurulmus) kisileri otomatik cikar
      await db.run(`
        UPDATE attendance 
        SET status = 'checked_out', 
            check_out_time = CURRENT_TIMESTAMP, 
            updated_at = CURRENT_TIMESTAMP 
        WHERE (status = 'checked_in' OR status = 'irregular') 
        AND EXTRACT(EPOCH FROM (now() - COALESCE(updated_at, check_in_time))) > 60
      `);
    } catch (err) {
      console.error('Auto-checkout cron hatasi:', err);
    }
  }, 15000);

  app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('  PDKS - Personel Devam Kontrol Sistemi');
    console.log('========================================');
    console.log('  Sunucu: http://localhost:' + PORT);
    console.log('  Mobil:  http://localhost:' + PORT + '/mobile/');
    console.log('  Admin:  http://localhost:' + PORT + '/admin/');
    console.log('========================================');
    console.log('');
  });
}

start().catch(err => { console.error('Baslatma hatasi:', err); process.exit(1); });
