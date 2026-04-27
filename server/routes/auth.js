const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { authenticateToken, generateToken } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const db = getDb();
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Kullanici adi ve sifre gereklidir' });
    const user = await db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
    if (!user) return res.status(401).json({ error: 'Gecersiz kullanici adi veya sifre' });
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Gecersiz kullanici adi veya sifre' });
    const token = generateToken(user);
    res.json({ success: true, token, user: { id: user.id, username: user.username, full_name: user.full_name, email: user.email, role: user.role } });
  } catch (err) { console.error('Login hatasi:', err); res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const user = await db.get('SELECT id, username, full_name, email, phone, role, profile_photo FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Kullanici bulunamadi' });
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Mevcut ve yeni sifre gereklidir' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Yeni sifre en az 6 karakter olmalidir' });
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(current_password, user.password_hash)) return res.status(401).json({ error: 'Mevcut sifre yanlis' });
    const hash = bcrypt.hashSync(new_password, 10);
    await db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, req.user.id]);
    res.json({ success: true, message: 'Sifre degistirildi' });
  } catch (err) { res.status(500).json({ error: 'Sunucu hatasi' }); }
});

module.exports = router;
