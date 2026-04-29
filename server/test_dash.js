const {getDb} = require('./config/database.js');
async function test() {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    console.log('Today:', today);
    const recent = await db.all(`
      SELECT a.*, u.full_name, l.name as location_name,
      EXTRACT(EPOCH FROM (now() - COALESCE(a.updated_at, a.check_in_time))) as last_seen_seconds
      FROM attendance a 
      JOIN users u ON a.user_id=u.id 
      JOIN locations l ON a.location_id=l.id 
      WHERE a.work_date=$1 
      ORDER BY a.id DESC LIMIT 10`, [today]);
    console.log('Recent:', recent);
  } catch(e) {
    console.error('Error:', e);
  } finally {
    process.exit();
  }
}
test();
