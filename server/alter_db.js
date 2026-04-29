const {getDb, initializeDatabase} = require('./config/database.js');
async function run() {
  await initializeDatabase();
  const db = getDb();
  try {
    await db.run("ALTER TABLE users ADD COLUMN employment_type TEXT DEFAULT 'kadrolu', ADD COLUMN monthly_salary NUMERIC DEFAULT 0, ADD COLUMN monthly_travel NUMERIC DEFAULT 0, ADD COLUMN monthly_food NUMERIC DEFAULT 0, ADD COLUMN working_days_month INTEGER DEFAULT 26, ADD COLUMN working_hours_day INTEGER DEFAULT 8");
    console.log('users table altered');
  } catch(e){ console.log(e.message); }
  
  try {
    await db.run("ALTER TABLE locations ADD COLUMN hourly_rate NUMERIC DEFAULT 0, ADD COLUMN travel_allowance NUMERIC DEFAULT 0, ADD COLUMN food_allowance NUMERIC DEFAULT 0");
    console.log('locations table altered');
  } catch(e){ console.log(e.message); }
  process.exit(0);
}
run();
