const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { isWithinGeofence } = require('../utils/geo');
const { parseQRData } = require('../utils/qrGenerator');

router.post('/check-in', authenticateToken, upload.single('selfie'), async (req, res) => {
  try {
    const db = getDb();
    const { qr_data, latitude, longitude } = req.body;
    const userId = req.user.id;
    if (!qr_data || !latitude || !longitude) return res.status(400).json({ error: 'QR kod, GPS koordinatlari gereklidir' });
    const qrInfo = parseQRData(qr_data);
    if (!qrInfo) return res.status(400).json({ error: 'Gecersiz QR kod' });
    const location = await db.get('SELECT * FROM locations WHERE id = ? AND qr_secret = ? AND is_active = 1', [qrInfo.locationId, qrInfo.secret]);
    if (!location) return res.status(404).json({ error: 'Lokasyon bulunamadi veya QR kod gecersiz' });
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const gpsCheck = isWithinGeofence(lat, lng, location.latitude, location.longitude, location.radius_meters);
    if (!gpsCheck.isWithin) return res.status(403).json({ error: 'Lokasyon alani disindasiniz. Mesafe: ' + gpsCheck.distance + 'm' });
    const today = new Date().toISOString().split('T')[0];
    const existing = await db.get('SELECT * FROM attendance WHERE user_id = ? AND work_date = ? AND status = ?', [userId, today, 'checked_in']);
    if (existing) return res.status(400).json({ error: 'Bugun zaten giris yapmissiniz' });
    let selfiePath = null;
    if (req.file) {
      const b64 = req.file.buffer.toString('base64');
      selfiePath = `data:${req.file.mimetype};base64,${b64}`;
    }
    const now = new Date().toISOString();
    const result = await db.run('INSERT INTO attendance (user_id, location_id, work_date, check_in_time, check_in_lat, check_in_lng, check_in_selfie, is_gps_valid, status) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id', [userId, location.id, today, now, lat, lng, selfiePath, 1, 'checked_in']);
    await db.run('INSERT INTO gps_logs (attendance_id, user_id, latitude, longitude, is_within_zone, distance_meters) VALUES (?,?,?,?,?,?)', [result.lastInsertRowid, userId, lat, lng, 1, gpsCheck.distance]);
    res.json({ success: true, message: 'Giris basarili', attendance: { id: result.lastInsertRowid, location_name: location.name, check_in_time: now, distance: gpsCheck.distance } });
  } catch (err) { console.error('Check-in hatasi:', err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/check-out', authenticateToken, upload.single('selfie'), async (req, res) => {
  try {
    const db = getDb();
    const { qr_data, latitude, longitude } = req.body;
    const userId = req.user.id;
    if (!qr_data || !latitude || !longitude) return res.status(400).json({ error: 'QR kod, GPS koordinatlari gereklidir' });
    const qrInfo = parseQRData(qr_data);
    if (!qrInfo) return res.status(400).json({ error: 'Gecersiz QR kod' });
    const location = await db.get('SELECT * FROM locations WHERE id = ? AND qr_secret = ? AND is_active = 1', [qrInfo.locationId, qrInfo.secret]);
    if (!location) return res.status(404).json({ error: 'Lokasyon bulunamadi' });
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const gpsCheck = isWithinGeofence(lat, lng, location.latitude, location.longitude, location.radius_meters);
    const today = new Date().toISOString().split('T')[0];
    const attendance = await db.get('SELECT * FROM attendance WHERE user_id = ? AND work_date = ? AND status = ?', [userId, today, 'checked_in']);
    if (!attendance) return res.status(400).json({ error: 'Aktif giris kaydi bulunamadi' });
    let selfiePath = null;
    if (req.file) {
      const b64 = req.file.buffer.toString('base64');
      selfiePath = `data:${req.file.mimetype};base64,${b64}`;
    }
    const now = new Date().toISOString();
    await db.run('UPDATE attendance SET check_out_time = ?, check_out_lat = ?, check_out_lng = ?, check_out_selfie = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [now, lat, lng, selfiePath, 'checked_out', attendance.id]);
    await db.run('INSERT INTO gps_logs (attendance_id, user_id, latitude, longitude, is_within_zone, distance_meters) VALUES (?,?,?,?,?,?)', [attendance.id, userId, lat, lng, gpsCheck.isWithin ? 1 : 0, gpsCheck.distance]);
    const checkIn = new Date(attendance.check_in_time);
    const checkOut = new Date(now);
    const ms = checkOut - checkIn;
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    res.json({ success: true, message: 'Cikis basarili', attendance: { id: attendance.id, location_name: location.name, check_in_time: attendance.check_in_time, check_out_time: now, duration: hours + ' saat ' + minutes + ' dakika', gps_valid: gpsCheck.isWithin } });
  } catch (err) { console.error('Check-out hatasi:', err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/heartbeat', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { latitude, longitude } = req.body;
    const userId = req.user.id;
    if (!latitude || !longitude) return res.status(400).json({ error: 'GPS koordinatlari gereklidir' });
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const today = new Date().toISOString().split('T')[0];
    const attendance = await db.get('SELECT a.*, l.latitude as loc_lat, l.longitude as loc_lng, l.radius_meters FROM attendance a JOIN locations l ON a.location_id = l.id WHERE a.user_id = ? AND a.work_date = ? AND a.status = ?', [userId, today, 'checked_in']);
    if (!attendance) return res.status(400).json({ error: 'Aktif giris kaydi bulunamadi' });
    const gpsCheck = isWithinGeofence(lat, lng, attendance.loc_lat, attendance.loc_lng, attendance.radius_meters);
    await db.run('INSERT INTO gps_logs (attendance_id, user_id, latitude, longitude, is_within_zone, distance_meters) VALUES (?,?,?,?,?,?)', [attendance.id, userId, lat, lng, gpsCheck.isWithin ? 1 : 0, gpsCheck.distance]);
    
    // Her sinyalde updated_at vaktini guncelle (Aktiflik takibi icin)
    if (!gpsCheck.isWithin) {
      await db.run('UPDATE attendance SET is_gps_valid = 0, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['irregular', attendance.id]);
    } else {
      await db.run('UPDATE attendance SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [attendance.id]);
    }
    res.json({ success: true, is_within_zone: gpsCheck.isWithin, distance: gpsCheck.distance });
  } catch (err) { console.error('Heartbeat hatasi:', err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.get('/my-status', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const attendance = await db.get('SELECT a.*, l.name as location_name FROM attendance a JOIN locations l ON a.location_id = l.id WHERE a.user_id = ? AND a.work_date = ? ORDER BY a.id DESC LIMIT 1', [req.user.id, today]);
    res.json({ success: true, status: attendance ? attendance.status : 'not_checked_in', attendance: attendance || null });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.get('/my-history', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const records = await db.all('SELECT a.*, l.name as location_name FROM attendance a JOIN locations l ON a.location_id = l.id WHERE a.user_id = ? ORDER BY a.work_date DESC LIMIT ? OFFSET ?', [req.user.id, limit, offset]);
    const total = await db.get('SELECT COUNT(*) as c FROM attendance WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, records, pagination: { page, limit, total: total.c, totalPages: Math.ceil(total.c / limit) } });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

module.exports = router;
