# Market Files — live-data build ($0 launch)

Static site + two serverless functions. No paid services, no database.

## Deploy (about 5 minutes)
1. Create a GitHub repo and upload this folder's contents (`public/`, `api/`, `vercel.json`, `package.json`).
2. vercel.com -> Add New Project -> import the repo -> Deploy (no build settings needed).
3. Recommended: get a free FRED key and add it in Vercel -> Settings -> Environment Variables as `FRED_API_KEY`. It enables the 2Y Treasury and the long-run history charts on Library pages.
4. Add your domain in Vercel -> Settings -> Domains.

## Verify after deploy (do this before announcing)
Open `https://YOUR-SITE/api/quotes?debug=1`. `debug.requested`, `debug.returned` and `debug.missing` show exactly which instruments came back. Anything missing displays as "—" on the site, never a made-up number.

## What is live
- Ticker, market boards, futures, crypto, sector heatmap, instrument pop-ups: `/api/quotes`, refreshed every 30 s while the tab is visible, CDN-cached 30 s.
- Charts: free TradingView embed (replaces the simulated intraday chart).
- Library history charts: `/api/series` (needs the FRED key).

## Known gaps (shown as "—")
- Global 10Y yields (DE, GB, JP, FR, IT) and VIX futures: no free keyless source. Add a keyed provider in `api/quotes.js`.
- Quotes come from Yahoo Finance's unofficial endpoint: free and delayed, but not a licensed feed. Fine to launch; plan a licensed vendor if traffic or commercial scrutiny grows. The site footer labels quotes as delayed.

## Still preview content (not market data)
- Live-desk stories are tagged SAMPLE with placeholder copy.
- Newsletter and sign-in forms are not connected; the privacy text still says "preview".
- "Market Files AI" research only runs inside Claude's preview; the public site needs its own server-side endpoint.
