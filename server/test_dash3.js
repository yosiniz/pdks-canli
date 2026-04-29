const {getDb} = require('./config/database.js');
async function test() {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const totalUsers = await db.get('SELECT COUNT(*) as c FROM users WHERE is_active=1 AND role=?', ['employee']);
    const checkedIn = await db.get('SELECT COUNT(*) as c FROM attendance WHERE work_date=? AND status=?', [today, 'checked_in']);
    const checkedOut = await db.get('SELECT COUNT(*) as c FROM attendance WHERE work_date=? AND status=?', [today, 'checked_out']);
    const irregular = await db.get('SELECT COUNT(*) as c FROM attendance WHERE work_date=? AND status=?', [today, 'irregular']);
    const totalLoc = await db.get('SELECT COUNT(*) as c FROM locations WHERE is_active=1');
    const recent = await db.all(`
      SELECT a.*, u.full_name, l.name as location_name,
      EXTRACT(EPOCH FROM (now() - COALESCE(a.updated_at, a.check_in_time))) as last_seen_seconds
      FROM attendance a 
      JOIN users u ON a.user_id=u.id 
      JOIN locations l ON a.location_id=l.id 
      WHERE a.work_date=? 
      ORDER BY a.id DESC LIMIT 10`, [today]);
    console.log({ success: true, dashboard: { total_employees: totalUsers.c, checked_in_now: checkedIn.c, checked_out_today: checkedOut.c, irregular_today: irregular.c, total_locations: totalLoc.c, recent_activity: recent } });
  } catch(e) {
    console.error('Error:', e);
  } finally {
    process.exit();
  }
}
test();
