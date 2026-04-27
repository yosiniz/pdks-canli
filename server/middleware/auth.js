const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pdks-secret-key-2024-change-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * JWT token doğrulama middleware'i
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Yetkilendirme token\'ı bulunamadı' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token süresi dolmuş' });
    }
    return res.status(403).json({ error: 'Geçersiz token' });
  }
}

/**
 * Rol bazlı yetkilendirme middleware'i
 */
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }
    next();
  };
}

/**
 * JWT token oluşturma
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

module.exports = { authenticateToken, authorizeRoles, generateToken, JWT_SECRET };
