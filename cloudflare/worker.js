// 肉了个肉 · 今日通关人数接口（Cloudflare Worker + D1，备用地址）
// GET  /api/stats?day=YYYY-MM-DD        -> { day, cleared }
// POST /api/clear  {day, uid}           -> { day, cleared, rank }
// 2026-11-02：改为计数表，避免每次 COUNT(*) 扫全天数据导致 D1 读取量超限
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOK = (day) => DAY.test(day) && Math.abs(Date.parse(day + 'T00:00:00Z') - Date.now()) < 2.5 * 864e5;

// 读人数：只读 day_counts 里的 1 行（以前是 COUNT(*)，当天有多少人通关就要读多少行）
async function stats(env, day) {
  const row = await env.DB.prepare('SELECT n FROM day_counts WHERE day = ?').bind(day).first();
  return { day, cleared: row ? row.n : 0 };
}

// 记通关：第一次通关时计数 +1，并把"第几位"存进这一行；重复通关只读 2 行
async function clear(env, day, uid) {
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO clears (day, uid, ts) VALUES (?, ?, ?)')
    .bind(day, uid, Date.now()).run();
  if (ins.meta.changes === 1) {
    const r = await env.DB.prepare(
      'INSERT INTO day_counts (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 RETURNING n'
    ).bind(day).first();
    await env.DB.prepare('UPDATE clears SET rk = ? WHERE day = ? AND uid = ?').bind(r.n, day, uid).run();
    return { day, cleared: r.n, rank: r.n };
  }
  const [mine, cnt] = await env.DB.batch([
    env.DB.prepare('SELECT rk FROM clears WHERE day = ? AND uid = ?').bind(day, uid),
    env.DB.prepare('SELECT n FROM day_counts WHERE day = ?').bind(day),
  ]);
  return { day, cleared: cnt.results[0]?.n ?? 0, rank: mine.results[0]?.rk ?? null };
}

async function handleApi(req, env, url) {
  if (!env.DB) return json({ error: 'D1 not bound' }, 500);
  try {
    if (url.pathname === '/api/stats' && req.method === 'GET') {
      const day = url.searchParams.get('day') || '';
      if (!DAY.test(day)) return json({ error: 'bad day' }, 400);
      return json(await stats(env, day));
    }
    if (url.pathname === '/api/clear' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const { day, uid } = body || {};
      if (!dayOK(day) || typeof uid !== 'string' || uid.length < 4 || uid.length > 64) return json({ error: 'bad input' }, 400);
      return json(await clear(env, day, uid));
    }
  } catch (e) {
    return json({ error: 'db error' }, 503);
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    return handleApi(req, env, url);
  },
};
