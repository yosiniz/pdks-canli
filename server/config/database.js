const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Database Connection URL - Render'da environment variable olarak tanimlanacak
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false // Cloud veritabanlari icin gerekli (Neon, Supabase vb.)
  }
});

// Helper for standard queries
const query = (text, params) => pool.query(text, params);

const initializeDatabase = async () => {
  try {
    // Create Users Table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        role TEXT DEFAULT 'employee',
        profile_photo TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Locations Table
    await query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        radius_meters INTEGER DEFAULT 50,
        qr_code TEXT,
        qr_secret TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Attendance Table
    await query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        location_id INTEGER REFERENCES locations(id),
        work_date DATE NOT NULL,
        check_in_time TIMESTAMP,
        check_out_time TIMESTAMP,
        check_in_lat DOUBLE PRECISION,
        check_in_lng DOUBLE PRECISION,
        check_out_lat DOUBLE PRECISION,
        check_out_lng DOUBLE PRECISION,
        check_in_selfie TEXT,
        check_out_selfie TEXT,
        is_gps_valid INTEGER DEFAULT 1,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create GPS Logs Table
    await query(`
      CREATE TABLE IF NOT EXISTS gps_logs (
        id SERIAL PRIMARY KEY,
        attendance_id INTEGER REFERENCES attendance(id),
        user_id INTEGER REFERENCES users(id),
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        is_within_zone INTEGER,
        distance_meters DOUBLE PRECISION,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create default admin user if not exists
    const adminCheck = await query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await query(
        'INSERT INTO users (username, password_hash, full_name, email, role) VALUES ($1, $2, $3, $4, $5)',
        ['admin', hash, 'Sistem Yoneticisi', 'admin@pdks.local', 'admin']
      );
      console.log('Varsayilan admin olusturuldu (admin / admin123)');
    }

    // Migration: Add missing columns to users
    const userCols = [
      { name: 'employment_type', type: 'TEXT', def: "'kadrolu'" },
      { name: 'monthly_salary', type: 'NUMERIC', def: '0' },
      { name: 'monthly_travel', type: 'NUMERIC', def: '0' },
      { name: 'monthly_food', type: 'NUMERIC', def: '0' },
      { name: 'working_days_month', type: 'INTEGER', def: '26' },
      { name: 'working_hours_day', type: 'INTEGER', def: '8' }
    ];
    for (const col of userCols) {
      try {
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT ${col.def}`);
        console.log(`User column check: ${col.name}`);
      } catch (e) { console.error(`Error adding ${col.name} to users:`, e.message); }
    }

    // Migration: Add missing columns to locations
    const locCols = [
      { name: 'hourly_rate', type: 'NUMERIC', def: '0' },
      { name: 'travel_allowance', type: 'NUMERIC', def: '0' },
      { name: 'food_allowance', type: 'NUMERIC', def: '0' },
      { name: 'overtime_multiplier', type: 'NUMERIC', def: '1' }
    ];
    for (const col of locCols) {
      try {
        await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT ${col.def}`);
        console.log(`Location column check: ${col.name}`);
      } catch (e) { console.error(`Error adding ${col.name} to locations:`, e.message); }
    }

    console.log('PostgreSQL Veritabanı Yapılandırması Tamamlandı.');
  } catch (err) {
    console.error('Veritabanı başlatma hatası:', err);
  }
};

module.exports = {
  query,
  initializeDatabase,
  getDb: () => ({
    get: async (sql, params = []) => {
      try {
        let idx = 1;
        const formattedSql = sql.replace(/\?/g, () => `$${idx++}`);
        const res = await query(formattedSql, params);
        return res.rows[0];
      } catch (err) {
        console.error('DB Get Hatası:', err.message, '| SQL:', sql);
        throw err;
      }
    },
    all: async (sql, params = []) => {
      try {
        let idx = 1;
        const formattedSql = sql.replace(/\?/g, () => `$${idx++}`);
        const res = await query(formattedSql, params);
        return res.rows;
      } catch (err) {
        console.error('DB All Hatası:', err.message, '| SQL:', sql);
        throw err;
      }
    },
    run: async (sql, params = []) => {
      try {
        let idx = 1;
        const formattedSql = sql.replace(/\?/g, () => `$${idx++}`);
        const res = await query(formattedSql, params);
        // PostgreSQL'de RETURNING id varsa rows[0].id döner
        return { lastInsertRowid: res.rows[0]?.id || null, rowsAffected: res.rowCount };
      } catch (err) {
        console.error('DB Run Hatası:', err.message, '| SQL:', sql);
        throw err;
      }
    }
  })
};
