const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { generateQRData, generateQRImage, generateQRBase64 } = require('../utils/qrGenerator');

router.use(authenticateToken);
router.use(authorizeRoles('admin', 'hr'));

// DASHBOARD
router.get('/dashboard', async (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const totalUsers = await db.get('SELECT COUNT(*) as c FROM users WHERE is_active=1 AND role=$1', ['employee']);
    const checkedIn = await db.get('SELECT COUNT(*) as c FROM attendance WHERE work_date=$1 AND status=$2', [today, 'checked_in']);
    const checkedOut = await db.get('SELECT COUNT(*) as c FROM attendance WHERE work_date=$1 AND status=$3', [today, 'checked_out']);
    const irregular = await db.get('SELECT COUNT(*) as c FROM attendance WHERE work_date=$1 AND status=$4', [today, 'irregular']);
    const totalLoc = await db.get('SELECT COUNT(*) as c FROM locations WHERE is_active=1');
    const recent = await db.all(`
      SELECT a.*, u.full_name, l.name as location_name,
      EXTRACT(EPOCH FROM (now() - COALESCE(a.updated_at, a.check_in_time))) as last_seen_seconds
      FROM attendance a 
      JOIN users u ON a.user_id=u.id 
      JOIN locations l ON a.location_id=l.id 
      WHERE a.work_date=$1 
      ORDER BY a.id DESC LIMIT 10`, [today]);
    res.json({ success: true, dashboard: { total_employees: totalUsers.c, checked_in_now: checkedIn.c, checked_out_today: checkedOut.c, irregular_today: irregular.c, total_locations: totalLoc.c, recent_activity: recent } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// USERS
router.get('/users', async (req, res) => {
  try {
    const db = getDb();
    const { role, search } = req.query;
    let sql = 'SELECT id, username, full_name, email, phone, role, is_active, created_at FROM users WHERE 1=1';
    const p = [];
    if (role) { p.push(role); sql += ' AND role=$' + p.length; }
    if (search) { p.push('%'+search+'%'); sql += ' AND (full_name LIKE $' + p.length + ' OR username LIKE $' + p.length + ')'; }
    sql += ' ORDER BY full_name ASC';
    res.json({ success: true, users: await db.all(sql, p) });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/users', async (req, res) => {
  try {
    const db = getDb();
    const { username, password, full_name, email, phone, role } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
    const exists = await db.get('SELECT id FROM users WHERE username=$1', [username]);
    if (exists) return res.status(400).json({ error: 'Bu kullanici adi mevcut' });
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run('INSERT INTO users (username, password_hash, full_name, email, phone, role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [username, hash, full_name, email||null, phone||null, role||'employee']);
    res.json({ success: true, message: 'Personel eklendi', id: result.lastInsertRowid });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    const db = getDb();
    const { full_name, email, phone, role, is_active, password } = req.body;
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      await db.run('UPDATE users SET full_name=$1, email=$2, phone=$3, role=$4, is_active=$5, password_hash=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$7', [full_name, email, phone, role, is_active?1:0, hash, req.params.id]);
    } else {
      await db.run('UPDATE users SET full_name=$1, email=$2, phone=$3, role=$4, is_active=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6', [full_name, email, phone, role, is_active?1:0, req.params.id]);
    }
    res.json({ success: true, message: 'Personel guncellendi' });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const db = getDb();
    await db.run('UPDATE users SET is_active=0 WHERE id=$1', [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// LOCATIONS
router.get('/locations', async (req, res) => {
  try { res.json({ success: true, locations: await getDb().all('SELECT * FROM locations ORDER BY name ASC', []) }); }
  catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/locations', async (req, res) => {
  try {
    const db = getDb();
    const { name, address, latitude, longitude, radius_meters } = req.body;
    if (!name || !latitude || !longitude) return res.status(400).json({ error: 'Ad, enlem ve boylam gereklidir' });
    const { secret } = generateQRData(0);
    const result = await db.run('INSERT INTO locations (name, address, latitude, longitude, radius_meters, qr_code, qr_secret) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [name, address||'', parseFloat(latitude), parseFloat(longitude), parseInt(radius_meters)||50, 'temp', secret]);
    const locId = result.lastInsertRowid;
    const real = generateQRData(locId);
    const qrVal = 'PDKS::' + locId + '::' + real.secret;
    const qrImg = await generateQRImage(qrVal, locId);
    await db.run('UPDATE locations SET qr_code=$1, qr_secret=$2 WHERE id=$3', [qrVal, real.secret, locId]);
    res.json({ success: true, message: 'Lokasyon eklendi', id: locId, qr_image: qrImg });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.put('/locations/:id', async (req, res) => {
  try {
    const db = getDb();
    const { name, address, latitude, longitude, radius_meters, is_active } = req.body;
    await db.run('UPDATE locations SET name=$1, address=$2, latitude=$3, longitude=$4, radius_meters=$5, is_active=$6 WHERE id=$7', [name, address, parseFloat(latitude), parseFloat(longitude), parseInt(radius_meters)||50, is_active?1:0, parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/locations/:id/regenerate-qr', async (req, res) => {
  try {
    const db = getDb();
    const locId = parseInt(req.params.id);
    const loc = await db.get('SELECT * FROM locations WHERE id=$1', [locId]);
    if (!loc) return res.status(404).json({ error: 'Lokasyon bulunamadi' });
    const { secret } = generateQRData(locId);
    const qrVal = 'PDKS::' + locId + '::' + secret;
    const qrImg = await generateQRImage(qrVal, locId);
    await db.run('UPDATE locations SET qr_code=$1, qr_secret=$2 WHERE id=$3', [qrVal, secret, locId]);
    res.json({ success: true, qr_image: qrImg });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.get('/locations/:id/qr-image', async (req, res) => {
  try {
    const db = getDb();
    const loc = await db.get('SELECT * FROM locations WHERE id=$1', [parseInt(req.params.id)]);
    if (!loc) return res.status(404).json({ error: 'Lokasyon bulunamadi' });
    const base64 = await generateQRBase64(loc.qr_code);
    res.json({ success: true, qr_base64: base64, location_name: loc.name });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// SHIFTS
router.get('/shifts', async (req, res) => {
  try { res.json({ success: true, shifts: await getDb().all('SELECT * FROM shifts ORDER BY start_time ASC', []) }); }
  catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/shifts', async (req, res) => {
  try {
    const { name, start_time, end_time, is_flexible } = req.body;
    if (!name) return res.status(400).json({ error: 'Ad gereklidir' });
    const result = await getDb().run('INSERT INTO shifts (name, start_time, end_time, is_flexible) VALUES ($1,$2,$3,$4) RETURNING id', [name, start_time, end_time, is_flexible?1:0]);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// ASSIGNMENTS
router.get('/assignments', async (req, res) => {
  try { res.json({ success: true, assignments: await getDb().all('SELECT ua.*, u.full_name, l.name as location_name, s.name as shift_name FROM user_assignments ua JOIN users u ON ua.user_id=u.id JOIN locations l ON ua.location_id=l.id JOIN shifts s ON ua.shift_id=s.id WHERE ua.is_active=1', []) }); }
  catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/assignments', async (req, res) => {
  try {
    const { user_id, location_id, shift_id, start_date, end_date } = req.body;
    if (!user_id || !location_id || !shift_id) return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
    const result = await getDb().run('INSERT INTO user_assignments (user_id, location_id, shift_id, start_date, end_date) VALUES ($1,$2,$3,$4,$5) RETURNING id', [user_id, location_id, shift_id, start_date||null, end_date||null]);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// ATTENDANCE (admin view)
router.get('/attendance', async (req, res) => {
  try {
    const db = getDb();
    const { date, user_id, location_id, status } = req.query;
    let sql = 'SELECT a.*, u.full_name, l.name as location_name FROM attendance a JOIN users u ON a.user_id=u.id JOIN locations l ON a.location_id=l.id WHERE 1=1';
    const p = [];
    if (date) { p.push(date); sql += ' AND a.work_date=$' + p.length; }
    if (user_id) { p.push(user_id); sql += ' AND a.user_id=$' + p.length; }
    if (location_id) { p.push(location_id); sql += ' AND a.location_id=$' + p.length; }
    if (status) { p.push(status); sql += ' AND a.status=$' + p.length; }
    sql += ' ORDER BY a.work_date DESC, a.id DESC LIMIT 100';
    res.json({ success: true, records: await db.all(sql, p) });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.get('/attendance/:id/detail', async (req, res) => {
  try {
    const db = getDb();
    const record = await db.get('SELECT a.*, u.full_name, u.username, l.name as location_name, l.latitude as loc_lat, l.longitude as loc_lng, l.radius_meters FROM attendance a JOIN users u ON a.user_id=u.id JOIN locations l ON a.location_id=l.id WHERE a.id=$1', [parseInt(req.params.id)]);
    if (!record) return res.status(404).json({ error: 'Kayit bulunamadi' });
    const gpsLogs = await db.all('SELECT * FROM gps_logs WHERE attendance_id=$1 ORDER BY logged_at ASC', [parseInt(req.params.id)]);
    res.json({ success: true, record, gps_logs: gpsLogs });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

// REPORTS
router.get('/reports/daily', async (req, res) => {
  try {
    const db = getDb();
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const records = await db.all(`
      SELECT a.*, u.full_name, l.name as location_name,
      EXTRACT(EPOCH FROM (now() - COALESCE(a.updated_at, a.check_in_time))) as last_seen_seconds
      FROM attendance a 
      JOIN users u ON a.user_id=u.id 
      JOIN locations l ON a.location_id=l.id 
      WHERE a.work_date=$1 
      ORDER BY u.full_name`, [date]);
    const total = await db.get('SELECT COUNT(*) as c FROM users WHERE is_active=1 AND role=$1', ['employee']);
    const present = records.length;
    res.json({ success: true, date, summary: { total: total.c, present, absent: total.c - present, irregular: records.filter(r => r.status==='irregular').length }, records });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.get('/reports/monthly', async (req, res) => {
  try {
    const db = getDb();
    const year = req.query.year || new Date().getFullYear();
    const month = req.query.month || (new Date().getMonth()+1);
    const start = year + '-' + String(month).padStart(2,'0') + '-01';
    const end = year + '-' + String(month).padStart(2,'0') + '-31';
    const records = await db.all('SELECT a.user_id, u.full_name, COUNT(*) as days_present, SUM(CASE WHEN a.status=$1 THEN 1 ELSE 0 END) as irregular_days FROM attendance a JOIN users u ON a.user_id=u.id WHERE a.work_date BETWEEN $2 AND $3 GROUP BY a.user_id ORDER BY u.full_name', ['irregular', start, end]);
    res.json({ success: true, year: parseInt(year), month: parseInt(month), records });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

module.exports = router;
