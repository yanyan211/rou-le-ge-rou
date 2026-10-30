// 肉了个肉 · 今日通关人数接口（Cloudflare Worker + D1）
// GET  /api/stats?day=YYYY-MM-DD        -> { day, cleared }
// POST /api/clear  {day, uid}           -> { day, cleared, rank }
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// 只接受服务器日期前后一天以内（兼容不同时区），防止乱写
function dayOK(day) {
  if (!DAY.test(day)) return false;
  const diff = Math.abs(Date.parse(day + 'T00:00:00Z') - Date.now());
  return diff < 2.5 * 864e5;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/api/stats' && req.method === 'GET') {
      const day = url.searchParams.get('day') || '';
      if (!DAY.test(day)) return json({ error: 'bad day' }, 400);
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM clears WHERE day = ?').bind(day).first();
      return json({ day, cleared: row.n });
    }

    if (url.pathname === '/api/clear' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const { day, uid } = body || {};
      if (!dayOK(day) || typeof uid !== 'string' || uid.length < 4 || uid.length > 64) return json({ error: 'bad input' }, 400);
      await env.DB.prepare('INSERT OR IGNORE INTO clears (day, uid, ts) VALUES (?, ?, ?)').bind(day, uid, Date.now()).run();
      const mine = await env.DB.prepare('SELECT ts FROM clears WHERE day = ? AND uid = ?').bind(day, uid).first();
      const [cnt, rank] = await env.DB.batch([
        env.DB.prepare('SELECT COUNT(*) AS n FROM clears WHERE day = ?').bind(day),
        env.DB.prepare('SELECT COUNT(*) AS n FROM clears WHERE day = ? AND ts <= ?').bind(day, mine.ts),
      ]);
      return json({ day, cleared: cnt.results[0].n, rank: rank.results[0].n });
    }

    return json({ error: 'not found' }, 404);
  },
};
