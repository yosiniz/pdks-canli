const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'pdks.db');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db = null;

// Wrapper to make sql.js API similar to better-sqlite3
class DBWrapper {
  constructor(sqliteDb) {
    this._db = sqliteDb;
  }

  run(sql, params = []) {
    this._db.run(sql, params);
    // Get last insert rowid
    const result = this._db.exec('SELECT last_insert_rowid() as id');
    const lastId = result.length > 0 ? result[0].values[0][0] : 0;
    const changes = this._db.getRowsModified();
    this._save();
    return { lastInsertRowid: lastId, changes };
  }

  get(sql, params = []) {
    const stmt = this._db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      stmt.free();
      const row = {};
      cols.forEach((c, i) => row[c] = vals[i]);
      return row;
    }
    stmt.free();
    return undefined;
  }

  all(sql, params = []) {
    const stmt = this._db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    const cols = stmt.getColumnNames();
    while (stmt.step()) {
      const vals = stmt.get();
      const row = {};
      cols.forEach((c, i) => row[c] = vals[i]);
      rows.push(row);
    }
    stmt.free();
    return rows;
  }

  exec(sql) {
    this._db.run(sql);
    this._save();
  }

  _save() {
    try {
      const data = this._db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch(e) {
      console.error('DB save error:', e);
    }
  }
}

async function initializeDatabase() {
  const SQL = await initSqlJs();

  // Load existing or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new DBWrapper(new SQL.Database(fileBuffer));
  } else {
    db = new DBWrapper(new SQL.Database());
  }

  // Create tables
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL, email TEXT, phone TEXT, role TEXT NOT NULL DEFAULT 'employee',
    profile_photo TEXT, is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT,
    latitude REAL NOT NULL, longitude REAL NOT NULL, radius_meters INTEGER NOT NULL DEFAULT 50,
    qr_code TEXT UNIQUE NOT NULL, qr_secret TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, start_time TEXT NOT NULL,
    end_time TEXT NOT NULL, is_flexible INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS user_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, location_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL, start_date DATE, end_date DATE, is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (location_id) REFERENCES locations(id), FOREIGN KEY (shift_id) REFERENCES shifts(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, location_id INTEGER NOT NULL,
    work_date DATE NOT NULL, check_in_time DATETIME, check_out_time DATETIME,
    check_in_lat REAL, check_in_lng REAL, check_out_lat REAL, check_out_lng REAL,
    check_in_selfie TEXT, check_out_selfie TEXT, is_gps_valid INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'checked_in', notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (location_id) REFERENCES locations(id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS gps_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, attendance_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    latitude REAL NOT NULL, longitude REAL NOT NULL, is_within_zone INTEGER NOT NULL DEFAULT 1,
    distance_meters REAL, logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attendance_id) REFERENCES attendance(id), FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // Indexes
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_att_user ON attendance(user_id)'); } catch(e){}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(work_date)'); } catch(e){}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_gps_att ON gps_logs(attendance_id)'); } catch(e){}

  // Default admin
  const admin = db.get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (username, password_hash, full_name, email, role) VALUES (?,?,?,?,?)',
      ['admin', hash, 'Sistem Yoneticisi', 'admin@pdks.local', 'admin']);
    console.log('Varsayilan admin olusturuldu (admin / admin123)');
  }

  // Default shifts
  const shiftCount = db.get('SELECT COUNT(*) as c FROM shifts');
  if (!shiftCount || shiftCount.c === 0) {
    db.run('INSERT INTO shifts (name, start_time, end_time, is_flexible) VALUES (?,?,?,?)', ['Sabah Vardiyasi', '08:00', '17:00', 0]);
    db.run('INSERT INTO shifts (name, start_time, end_time, is_flexible) VALUES (?,?,?,?)', ['Aksam Vardiyasi', '17:00', '01:00', 0]);
    db.run('INSERT INTO shifts (name, start_time, end_time, is_flexible) VALUES (?,?,?,?)', ['Gece Vardiyasi', '01:00', '08:00', 0]);
    db.run('INSERT INTO shifts (name, start_time, end_time, is_flexible) VALUES (?,?,?,?)', ['Esnek Calisma', '00:00', '23:59', 1]);
    console.log('Varsayilan vardiyalar olusturuldu');
  }

  console.log('Veritabani basariyla baslatildi');
}

function getDb() { return db; }

module.exports = { initializeDatabase, getDb };
