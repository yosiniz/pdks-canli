const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { generateQRData, generateQRImage, generateQRBase64 } = require('../utils/qrGenerator');

router.use(authenticateToken);
router.use(authorizeRoles('admin', 'hr'));

// DASHBOARD
router.get('/dashboard', (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const totalUsers = db.get('SELECT COUNT(*) as c FROM users WHERE is_active=1 AND role=?', ['employee']);
    const checkedIn = db.get('SELECT COUNT(*) as c FROM attendance WHERE work_date=? AND status=?', [today, 'checked_in']);
    const checkedOut = db.get('SELECT COUNT(*) as c FROM attendance WHERE work_date=? AND status=?', [today, 'checked_out']);
    const irregular = db.get('SELECT COUNT(*) as c FROM attendance WHERE work_date=? AND status=?', [today, 'irregular']);
    const totalLoc = db.get('SELECT COUNT(*) as c FROM locations WHERE is_active=1');
    const recent = db.all(`
      SELECT a.*, u.full_name, l.name as location_name,
      (STRFTIME('%s', 'now') - STRFTIME('%s', COALESCE(a.updated_at, a.check_in_time))) as last_seen_seconds
      FROM attendance a 
      JOIN users u ON a.user_id=u.id 
      JOIN locations l ON a.location_id=l.id 
      WHERE a.work_date=? 
      ORDER BY a.id DESC LIMIT 10`, [today]);
    res.json({ success: true, dashboard: { total_employees: totalUsers.c, checked_in_now: checkedIn.c, checked_out_today: checkedOut.c, irregular_today: irregular.c, total_locations: totalLoc.c, recent_activity: recent } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// USERS
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const { role, search } = req.query;
    let sql = 'SELECT id, username, full_name, email, phone, role, is_active, created_at FROM users WHERE 1=1';
    const p = [];
    if (role) { sql += ' AND role=?'; p.push(role); }
    if (search) { sql += ' AND (full_name LIKE ? OR username LIKE ?)'; p.push('%'+search+'%', '%'+search+'%'); }
    sql += ' ORDER BY full_name ASC';
    res.json({ success: true, users: db.all(sql, p) });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/users', (req, res) => {
  try {
    const db = getDb();
    const { username, password, full_name, email, phone, role } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
    const exists = db.get('SELECT id FROM users WHERE username=?', [username]);
    if (exists) return res.status(400).json({ error: 'Bu kullanici adi mevcut' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.run('INSERT INTO users (username, password_hash, full_name, email, phone, role) VALUES (?,?,?,?,?,?)', [username, hash, full_name, email||null, phone||null, role||'employee']);
    res.json({ success: true, message: 'Personel eklendi', id: result.lastInsertRowid });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.put('/users/:id', (req, res) => {
  try {
    const db = getDb();
    const { full_name, email, phone, role, is_active, password } = req.body;
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.run('UPDATE users SET full_name=?, email=?, phone=?, role=?, is_active=?, password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [full_name, email, phone, role, is_active?1:0, hash, req.params.id]);
    } else {
      db.run('UPDATE users SET full_name=?, email=?, phone=?, role=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [full_name, email, phone, role, is_active?1:0, req.params.id]);
    }
    res.json({ success: true, message: 'Personel guncellendi' });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.delete('/users/:id', (req, res) => {
  try {
    const db = getDb();
    db.run('UPDATE users SET is_active=0 WHERE id=?', [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// LOCATIONS
router.get('/locations', (req, res) => {
  try { res.json({ success: true, locations: getDb().all('SELECT * FROM locations ORDER BY name ASC', []) }); }
  catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/locations', async (req, res) => {
  try {
    const db = getDb();
    const { name, address, latitude, longitude, radius_meters } = req.body;
    if (!name || !latitude || !longitude) return res.status(400).json({ error: 'Ad, enlem ve boylam gereklidir' });
    const { secret } = generateQRData(0);
    const result = db.run('INSERT INTO locations (name, address, latitude, longitude, radius_meters, qr_code, qr_secret) VALUES (?,?,?,?,?,?,?)', [name, address||'', parseFloat(latitude), parseFloat(longitude), parseInt(radius_meters)||50, 'temp', secret]);
    const locId = result.lastInsertRowid;
    const real = generateQRData(locId);
    const qrVal = 'PDKS::' + locId + '::' + real.secret;
    const qrImg = await generateQRImage(qrVal, locId);
    db.run('UPDATE locations SET qr_code=?, qr_secret=? WHERE id=?', [qrVal, real.secret, locId]);
    res.json({ success: true, message: 'Lokasyon eklendi', id: locId, qr_image: qrImg });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.put('/locations/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, address, latitude, longitude, radius_meters, is_active } = req.body;
    db.run('UPDATE locations SET name=?, address=?, latitude=?, longitude=?, radius_meters=?, is_active=? WHERE id=?', [name, address, parseFloat(latitude), parseFloat(longitude), parseInt(radius_meters)||50, is_active?1:0, parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/locations/:id/regenerate-qr', async (req, res) => {
  try {
    const db = getDb();
    const locId = parseInt(req.params.id);
    const loc = db.get('SELECT * FROM locations WHERE id=?', [locId]);
    if (!loc) return res.status(404).json({ error: 'Lokasyon bulunamadi' });
    const { secret } = generateQRData(locId);
    const qrVal = 'PDKS::' + locId + '::' + secret;
    const qrImg = await generateQRImage(qrVal, locId);
    db.run('UPDATE locations SET qr_code=?, qr_secret=? WHERE id=?', [qrVal, secret, locId]);
    res.json({ success: true, qr_image: qrImg });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.get('/locations/:id/qr-image', async (req, res) => {
  try {
    const db = getDb();
    const loc = db.get('SELECT * FROM locations WHERE id=?', [parseInt(req.params.id)]);
    if (!loc) return res.status(404).json({ error: 'Lokasyon bulunamadi' });
    const base64 = await generateQRBase64(loc.qr_code);
    res.json({ success: true, qr_base64: base64, location_name: loc.name });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// SHIFTS
router.get('/shifts', (req, res) => {
  try { res.json({ success: true, shifts: getDb().all('SELECT * FROM shifts ORDER BY start_time ASC', []) }); }
  catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/shifts', (req, res) => {
  try {
    const { name, start_time, end_time, is_flexible } = req.body;
    if (!name) return res.status(400).json({ error: 'Ad gereklidir' });
    const result = getDb().run('INSERT INTO shifts (name, start_time, end_time, is_flexible) VALUES (?,?,?,?)', [name, start_time, end_time, is_flexible?1:0]);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// ASSIGNMENTS
router.get('/assignments', (req, res) => {
  try { res.json({ success: true, assignments: getDb().all('SELECT ua.*, u.full_name, l.name as location_name, s.name as shift_name FROM user_assignments ua JOIN users u ON ua.user_id=u.id JOIN locations l ON ua.location_id=l.id JOIN shifts s ON ua.shift_id=s.id WHERE ua.is_active=1', []) }); }
  catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/assignments', (req, res) => {
  try {
    const { user_id, location_id, shift_id, start_date, end_date } = req.body;
    if (!user_id || !location_id || !shift_id) return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
    const result = getDb().run('INSERT INTO user_assignments (user_id, location_id, shift_id, start_date, end_date) VALUES (?,?,?,?,?)', [user_id, location_id, shift_id, start_date||null, end_date||null]);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// ATTENDANCE (admin view)
router.get('/attendance', (req, res) => {
  try {
    const db = getDb();
    const { date, user_id, location_id, status } = req.query;
    let sql = 'SELECT a.*, u.full_name, l.name as location_name FROM attendance a JOIN users u ON a.user_id=u.id JOIN locations l ON a.location_id=l.id WHERE 1=1';
    const p = [];
    if (date) { sql += ' AND a.work_date=?'; p.push(date); }
    if (user_id) { sql += ' AND a.user_id=?'; p.push(user_id); }
    if (location_id) { sql += ' AND a.location_id=?'; p.push(location_id); }
    if (status) { sql += ' AND a.status=?'; p.push(status); }
    sql += ' ORDER BY a.work_date DESC, a.id DESC LIMIT 100';
    res.json({ success: true, records: db.all(sql, p) });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.get('/attendance/:id/detail', (req, res) => {
  try {
    const db = getDb();
    const record = db.get('SELECT a.*, u.full_name, u.username, l.name as location_name, l.latitude as loc_lat, l.longitude as loc_lng, l.radius_meters FROM attendance a JOIN users u ON a.user_id=u.id JOIN locations l ON a.location_id=l.id WHERE a.id=?', [parseInt(req.params.id)]);
    if (!record) return res.status(404).json({ error: 'Kayit bulunamadi' });
    const gpsLogs = db.all('SELECT * FROM gps_logs WHERE attendance_id=? ORDER BY logged_at ASC', [parseInt(req.params.id)]);
    res.json({ success: true, record, gps_logs: gpsLogs });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// REPORTS
router.get('/reports/daily', (req, res) => {
  try {
    const db = getDb();
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const records = db.all(`
      SELECT a.*, u.full_name, l.name as location_name,
      (STRFTIME('%s', 'now') - STRFTIME('%s', COALESCE(a.updated_at, a.check_in_time))) as last_seen_seconds
      FROM attendance a 
      JOIN users u ON a.user_id=u.id 
      JOIN locations l ON a.location_id=l.id 
      WHERE a.work_date=? 
      ORDER BY u.full_name`, [date]);
    const total = db.get('SELECT COUNT(*) as c FROM users WHERE is_active=1 AND role=?', ['employee']);
    const present = records.length;
    res.json({ success: true, date, summary: { total: total.c, present, absent: total.c - present, irregular: records.filter(r => r.status==='irregular').length }, records });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.get('/reports/monthly', (req, res) => {
  try {
    const db = getDb();
    const year = req.query.year || new Date().getFullYear();
    const month = req.query.month || (new Date().getMonth()+1);
    const start = year + '-' + String(month).padStart(2,'0') + '-01';
    const end = year + '-' + String(month).padStart(2,'0') + '-31';
    const records = db.all('SELECT a.user_id, u.full_name, COUNT(*) as days_present, SUM(CASE WHEN a.status=? THEN 1 ELSE 0 END) as irregular_days FROM attendance a JOIN users u ON a.user_id=u.id WHERE a.work_date BETWEEN ? AND ? GROUP BY a.user_id ORDER BY u.full_name', ['irregular', start, end]);
    res.json({ success: true, year: parseInt(year), month: parseInt(month), records });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

module.exports = router;
