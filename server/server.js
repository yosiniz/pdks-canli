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

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/mobile', express.static(path.join(__dirname, '..', 'mobile')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

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
