// GET /api/series?id=DGS10[&units=pc1]  ->  { id, points: [{ d: 'YYYY-MM-DD', v: number }] }
// Long-run history for the Library pages. Needs a free FRED key: FRED_API_KEY (https://fred.stlouisfed.org/docs/api/api_key.html)
const ALLOWED = new Set(['DGS10', 'FEDFUNDS', 'CPIAUCSL']);
const UNITS = new Set(['lin', 'pc1', 'pch', 'chg']);

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').toUpperCase();
  const units = String((req.query && req.query.units) || 'lin');
  if (!ALLOWED.has(id) || !UNITS.has(units)) return res.status(400).json({ error: 'unsupported series' });
  const key = process.env.FRED_API_KEY;
  if (!key) return res.status(503).json({ error: 'FRED_API_KEY not set' });
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&units=${units}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status });
    const j = await r.json();
    const byMonth = new Map(); // keep the last observation of each month to keep the payload small
    for (const o of j.observations || []) {
      const v = parseFloat(o.value);
      if (Number.isFinite(v)) byMonth.set(o.date.slice(0, 7), { d: o.date, v });
    }
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json({ id, points: [...byMonth.values()] });
  } catch (e) {
    res.status(502).json({ error: 'fetch failed' });
  }
};
