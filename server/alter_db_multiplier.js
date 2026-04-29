const {getDb, initializeDatabase} = require('./config/database.js');
async function run() {
  await initializeDatabase();
  const db = getDb();
  try {
    await db.run("ALTER TABLE locations ADD COLUMN overtime_multiplier NUMERIC DEFAULT 1");
    console.log('locations table altered - added overtime_multiplier');
  } catch(e){ console.log(e.message); }
  process.exit(0);
}
run();
