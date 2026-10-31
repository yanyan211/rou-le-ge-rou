// 肉了个肉 · 部署在 Cloudflare Pages 上的接口（和游戏同一个域名，国内访问更稳）
// /api/stats?day=YYYY-MM-DD  -> { day, cleared }
// /api/clear  POST {day,uid} -> { day, cleared, rank }
// 其他请求原样返回网站文件（index.html、图片、广告等）
// 需要在 Pages 项目里绑定 D1 数据库，变量名 DB
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOK = (day) => DAY.test(day) && Math.abs(Date.parse(day + 'T00:00:00Z') - Date.now()) < 2.5 * 864e5;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!env.DB) return json({ error: 'D1 not bound' }, 500);

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
