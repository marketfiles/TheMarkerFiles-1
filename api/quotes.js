// GET /api/quotes  ->  { source, asOf, quotes: { [id]: { v, prev, series } } }
// Free, no API key. Primary provider: Yahoo Finance chart endpoint (unofficial, delayed).
// Fallback for crypto: CoinGecko. Optional: FRED for the 2Y Treasury (set FRED_API_KEY).
// Swap `fetchYahoo` for a licensed vendor later without touching the front end.

const MAP = {
  // U.S. equities
  SPX: '^GSPC', COMP: '^IXIC', INDU: '^DJI', RUT: '^RUT', VIX: '^VIX',
  // Rates (Yahoo quotes these as percent yields)
  US5Y: '^FVX', US10Y: '^TNX', US30Y: '^TYX',
  // Commodities / FX
  XAU: 'XAUUSD=X', XAG: 'XAGUSD=X', CL: 'CL=F', HG: 'HG=F',
  EURUSD: 'EURUSD=X', USDJPY: 'JPY=X', GBPUSD: 'GBPUSD=X', DXY: 'DX-Y.NYB',
  USDCNY: 'CNY=X', USDCHF: 'CHF=X', AUDUSD: 'AUDUSD=X',
  // Crypto
  BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', XRP: 'XRP-USD',
  BNB: 'BNB-USD', DOGE: 'DOGE-USD', ADA: 'ADA-USD', LINK: 'LINK-USD',
  // World indices
  TSX: '^GSPTSE', IBOV: '^BVSP', UKX: '^FTSE', DAX: '^GDAXI', CAC: '^FCHI',
  SX5E: '^STOXX50E', NKY: '^N225', HSI: '^HSI', SHCOMP: '000001.SS',
  SENSEX: '^BSESN', AS51: '^AXJO',
  // Sector ETFs
  XLK: 'XLK', XLF: 'XLF', XLV: 'XLV', XLY: 'XLY', XLC: 'XLC', XLI: 'XLI',
  XLP: 'XLP', XLE: 'XLE', XLU: 'XLU', XLRE: 'XLRE', XLB: 'XLB',
  // Futures (front month)
  ES1: 'ES=F', NQ1: 'NQ=F', YM1: 'YM=F', RTY1: 'RTY=F',
  ZT1: 'ZT=F', ZN1: 'ZN=F', ZB1: 'ZB=F',
  CL1: 'CL=F', BZ1: 'BZ=F', NG1: 'NG=F', RB1: 'RB=F',
  GC1: 'GC=F', SI1: 'SI=F', HG1: 'HG=F', PL1: 'PL=F',
  ZC1: 'ZC=F', ZS1: 'ZS=F', ZW1: 'ZW=F', LE1: 'LE=F', KC1: 'KC=F', SB1: 'SB=F',
  '6E1': '6E=F', '6J1': '6J=F', '6B1': '6B=F', BTC1: 'BTC=F', ETH1: 'ETH=F',
};
// Not available from a free keyless source -> the site shows "—" (never a made-up number):
//   US2Y (unless FRED_API_KEY), DE10Y, GB10Y, JP10Y, FR10Y, IT10Y, VX1

const GECKO = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', BNB: 'binancecoin', DOGE: 'dogecoin', ADA: 'cardano', LINK: 'chainlink' };
const UA = 'Mozilla/5.0 (compatible; MarketFilesBot/1.0; +https://www.themarketfiles.com)';
const TTL = 25_000;
const mem = globalThis.__mfq || (globalThis.__mfq = new Map()); // per-instance cache
const num = (x) => typeof x === 'number' && Number.isFinite(x);

async function timed(url, opts = {}, ms = 7000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal, headers: { 'user-agent': UA, accept: 'application/json', ...(opts.headers || {}) } }); }
  finally { clearTimeout(t); }
}

function thin(arr, n = 48) {
  if (arr.length <= n) return arr;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  return out;
}

async function fetchYahoo(sym) {
  const hit = mem.get(sym);
  if (hit && Date.now() - hit.t < TTL) return hit.d;
  for (const host of ['query1', 'query2']) {
    try {
      const r = await timed(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m&includePrePost=false`);
      if (!r.ok) continue;
      const j = await r.json();
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res) continue;
      const m = res.meta || {};
      const closes = ((res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || []).filter(num);
      const v = num(m.regularMarketPrice) ? m.regularMarketPrice : closes[closes.length - 1];
      const prev = num(m.previousClose) ? m.previousClose : num(m.chartPreviousClose) ? m.chartPreviousClose : null;
      if (!num(v)) continue;
      const d = { v, prev, series: closes.length > 1 ? thin(closes) : null };
      mem.set(sym, { t: Date.now(), d });
      return d;
    } catch (_) { /* try next host */ }
  }
  return null;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

async function geckoFallback(missing) {
  const ids = missing.map((id) => GECKO[id]).filter(Boolean);
  if (!ids.length) return {};
  try {
    const r = await timed(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&sparkline=true&price_change_percentage=24h`);
    if (!r.ok) return {};
    const rows = await r.json();
    const out = {};
    for (const row of rows) {
      const id = Object.keys(GECKO).find((k) => GECKO[k] === row.id);
      if (!id || !num(row.current_price)) continue;
      const pct = row.price_change_percentage_24h;
      out[id] = {
        v: row.current_price,
        prev: num(pct) ? row.current_price / (1 + pct / 100) : null,
        series: row.sparkline_in_price && row.sparkline_in_price.price ? thin(row.sparkline_in_price.price.filter(num).slice(-48)) : null,
      };
    }
    return out;
  } catch (_) { return {}; }
}

async function fred2y() {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  try {
    const r = await timed(`https://api.stlouisfed.org/fred/series/observations?series_id=DGS2&api_key=${key}&file_type=json&sort_order=desc&limit=10`);
    if (!r.ok) return null;
    const j = await r.json();
    const obs = (j.observations || []).map((o) => parseFloat(o.value)).filter(num);
    if (!obs.length) return null;
    return { v: obs[0], prev: obs[1] ?? null, series: obs.slice().reverse() };
  } catch (_) { return null; }
}

module.exports = async (req, res) => {
  const ids = Object.keys(MAP);
  const syms = [...new Set(Object.values(MAP))];
  const bySym = {};
  await pool(syms, 12, async (s) => { bySym[s] = await fetchYahoo(s); });

  const quotes = {};
  const failed = [];
  for (const id of ids) {
    const d = bySym[MAP[id]];
    if (d) quotes[id] = d; else failed.push(id);
  }
  const cryptoMissing = failed.filter((id) => GECKO[id]);
  if (cryptoMissing.length) Object.assign(quotes, await geckoFallback(cryptoMissing));
  const y2 = await fred2y();
  if (y2) quotes.US2Y = y2;

  const got = Object.keys(quotes).length;
  const body = {
    source: 'Yahoo Finance · delayed',
    asOf: new Date().toISOString(),
    quotes,
  };
  if (req.query && req.query.debug) {
    body.debug = { requested: ids.length, returned: got, missing: ids.filter((id) => !quotes[id]).concat(['US2Y'].filter(() => !y2)) };
  }
  // Don't let the CDN pin an empty/failed response.
  res.setHeader('Cache-Control', got > 10 ? 's-maxage=30, stale-while-revalidate=120' : 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(got ? 200 : 502).send(JSON.stringify(body));
};
