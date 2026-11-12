/* محرك السوق: البيانات الحية والتحليلات كلها تعمل على الجوال */
const ENG = (() => {
  const { json, binance, cached, gate } = NET;
  const STABLE = new Set(['USDC', 'FDUSD', 'TUSD', 'BUSD', 'DAI', 'USDP', 'EUR', 'AEUR', 'USDE', 'PYUSD', 'EURI', 'XUSD', 'USD1', 'BFUSD', 'RLUSD', 'USDS', 'TRY', 'BRL']);
  const SOURCE = { tickers: 'Binance', klines: 'Binance' };
  const BY = 'https://api.bybit.com', OK = 'https://www.okx.com';
  const BYIV = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
  const OKIV = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1Dutc', '1w': '1Wutc' };
  const TTL = { '1m': 8, '5m': 15, '15m': 25, '1h': 45, '4h': 90, '1d': 300, '1w': 900 };
  const norm = s => { s = String(s || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.endsWith('USDT') ? s : s + 'USDT'; };

  async function withFallback(kind, primary, alts) {
    try { const v = await primary(); SOURCE[kind] = 'Binance'; return v; }
    catch (first) { for (const [name, fn] of alts) { try { const v = await fn(); SOURCE[kind] = name; return v; } catch (e) { } } throw first; }
  }

  /* ---------- الأسعار ---------- */
  const tickers = () => cached('tickers', 12, async () => {
    const raw = await withFallback('tickers', () => binance('/api/v3/ticker/24hr'), [
      ['Bybit', async () => (await json(BY + '/v5/market/tickers', { category: 'spot' })).result.list.map(x => ({ symbol: x.symbol, lastPrice: x.lastPrice, priceChangePercent: +x.price24hPcnt * 100, highPrice: x.highPrice24h, lowPrice: x.lowPrice24h, quoteVolume: x.turnover24h, count: 1 }))],
      ['OKX', async () => (await json(OK + '/api/v5/market/tickers', { instType: 'SPOT' })).data.map(x => ({ symbol: x.instId.replace('-', ''), lastPrice: x.last, priceChangePercent: (x.last / x.open24h - 1) * 100, highPrice: x.high24h, lowPrice: x.low24h, quoteVolume: x.volCcy24h, count: 1 }))]]);
    return raw.filter(t => t.symbol.endsWith('USDT') && !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol) && !STABLE.has(t.symbol.slice(0, -4)) && +t.lastPrice > 0 && +t.quoteVolume > 0 && +t.count !== 0)
      .map(t => ({ symbol: t.symbol, base: t.symbol.slice(0, -4), price: +t.lastPrice, change: +t.priceChangePercent, high: +t.highPrice, low: +t.lowPrice, quoteVolume: +t.quoteVolume }))
      .sort((a, b) => b.quoteVolume - a.quoteVolume);
  });
  const ticker = async s => (await tickers()).find(t => t.symbol === s);

  /* ---------- الشموع ---------- */
  const toK = rows => { const K = { t: [], o: [], h: [], l: [], c: [], v: [], qv: [], tb: [], tqv: [] };
    rows.forEach(r => { K.t.push(Math.floor(+r[0] / 1000)); K.o.push(+r[1]); K.h.push(+r[2]); K.l.push(+r[3]); K.c.push(+r[4]); K.v.push(+r[5]); K.qv.push(+r[7]); K.tb.push(+r[9]); K.tqv.push(+r[10]); }); return K; };
  const klines = (sym, iv = '1h') => cached(`k:${sym}:${iv}`, TTL[iv] || 45, async () => toK(await withFallback('klines',
    () => binance('/api/v3/klines', { symbol: sym, interval: iv, limit: 1000 }), [
      ['Bybit', async () => (await json(BY + '/v5/market/kline', { category: 'spot', symbol: sym, interval: BYIV[iv] || '60', limit: 1000 })).result.list.reverse().map(r => [r[0], r[1], r[2], r[3], r[4], r[5], 0, r[6], 0, r[5] / 2, r[6] / 2])],
      ['OKX', async () => (await json(OK + '/api/v5/market/candles', { instId: sym.slice(0, -4) + '-USDT', bar: OKIV[iv] || '1H', limit: 300 })).data.reverse().map(r => [r[0], r[1], r[2], r[3], r[4], r[5], 0, r[7] || r[5] * r[4], 0, r[5] / 2, (r[7] || r[5] * r[4]) / 2])]])));
  const tail = (K, n) => Object.fromEntries(Object.entries(K).map(([k, a]) => [k, a.slice(-n)]));

  /* ---------- مؤشرات عامة ---------- */
  const cgGlobal = () => cached('cg', 120, async () => { const d = (await json('https://api.coingecko.com/api/v3/global')).data;
    return { market_cap: d.total_market_cap.usd, volume: d.total_volume.usd, mcap_change: d.market_cap_change_percentage_24h_usd, coins: d.active_cryptocurrencies, dominance: d.market_cap_percentage }; });
  const fng = (n = 30) => cached('fng' + n, 600, async () => (await json('https://api.alternative.me/fng/', { limit: n })).data.map(x => ({ value: +x.value, t: +x.timestamp })));
  const fngLabel = v => v < 25 ? 'خوف شديد' : v < 45 ? 'خوف' : v <= 55 ? 'محايد' : v <= 75 ? 'طمع' : 'طمع شديد';
  async function breadth() {
    const ts = (await tickers()).slice(0, 200), up = ts.filter(t => t.change > 0).length, dn = ts.filter(t => t.change < 0).length, vol = ts.reduce((a, t) => a + t.quoteVolume, 0) || 1;
    return { up, down: dn, flat: ts.length - up - dn, total: ts.length, ratio: +(up / Math.max(1, up + dn) * 100).toFixed(1), weighted_change: +(ts.reduce((a, t) => a + t.change * t.quoteVolume, 0) / vol).toFixed(2),
             strong_up: ts.filter(t => t.change > 5).length, strong_down: ts.filter(t => t.change < -5).length };
  }
  async function overview() {
    const [g, f, b] = await Promise.all([cgGlobal().catch(() => null), fng(30).catch(() => []), breadth()]);
    const fv = f[0]?.value ?? 50, parts = { breadth: b.ratio, fng: fv, momentum: Math.max(0, Math.min(100, 50 + b.weighted_change * 8)), mcap: Math.max(0, Math.min(100, 50 + (g?.mcap_change || 0) * 8)) };
    try { const bt = await trendFor('BTCUSDT', '4h', false); parts.btc_trend = (bt.net / 25 * 100 + 100) / 2; } catch (e) { }
    const val = Math.round(Object.values(parts).reduce((a, x) => a + x, 0) / Object.keys(parts).length);
    const label = val >= 65 ? 'صاعد' : val >= 55 ? 'إيجابي' : val > 45 ? 'متذبذب' : val > 35 ? 'سلبي' : 'هابط';
    const ts = await tickers();
    return { global: g || { market_cap: null, volume: ts.reduce((a, t) => a + t.quoteVolume, 0), mcap_change: b.weighted_change, coins: ts.length, dominance: {} },
             fng: { value: fv, label: fngLabel(fv), history: f }, breadth: b, health: { value: val, label, parts } };
  }

  /* ---------- الاتجاه ---------- */
  async function trendFor(sym, iv = '4h', deep = true) {
    sym = norm(sym);
    const K = await klines(sym, iv), tk = await ticker(sym);
    let rs = null;
    if (deep && sym !== 'BTCUSDT') { try { const B = await klines('BTCUSDT', iv), n = 30; rs = +((K.c.at(-1) / K.c.at(-n)) / (B.c.at(-1) / B.c.at(-n)) * 100 - 100).toFixed(2); } catch (e) { } }
    const r = IND.trend(deep ? K : tail(K, 400), iv, deep, tk, rs);
    r.symbol = sym; return r;
  }
  const mtf = sym => cached('mtf:' + norm(sym), 90, async () => {
    const out = [];
    for (const iv of ['15m', '1h', '4h', '1d', '1w']) { try { const r = await trendFor(sym, iv, false); out.push({ interval: iv, verdict: r.verdict, cls: r.cls, net: r.net }); } catch (e) { } }
    return out;
  });

  /* ---------- البيانات المساعدة للترشيح ---------- */
  async function bookImb(sym) {
    const d = await binance('/api/v3/depth', { symbol: sym, limit: 100 });
    const bids = d.bids.map(([p, q]) => [+p, +q]), asks = d.asks.map(([p, q]) => [+p, +q]), mid = (bids[0][0] + asks[0][0]) / 2;
    const w = (lv) => lv.filter(([p]) => Math.abs(p - mid) / mid <= 0.01).reduce((a, [p, q]) => a + p * q, 0), b = w(bids), a = w(asks);
    return (b - a) / Math.max(1, b + a) * 100;
  }
  const futures = sym => cached('fut:' + sym, 120, async () => {
    const F = 'https://fapi.binance.com';
    try {
      const [p, ls] = await Promise.all([json(F + '/fapi/v1/premiumIndex', { symbol: sym }), json(F + '/futures/data/globalLongShortAccountRatio', { symbol: sym, period: '1h', limit: 2 })]);
      return { funding: +p.lastFundingRate * 100, ls: +ls.at(-1).longShortRatio };
    } catch (e) {
      const t = (await json(BY + '/v5/market/tickers', { category: 'linear', symbol: sym })).result.list[0];
      const r = (await json(BY + '/v5/market/account-ratio', { category: 'linear', symbol: sym, period: '1h', limit: 1 })).result.list[0];
      return { funding: +t.fundingRate * 100, ls: +r.buyRatio / Math.max(1e-9, +r.sellRatio) };
    }
  });

  async function gateMarket() {
    try {
      const [b1, b4, br, f] = await Promise.all([trendFor('BTCUSDT', '1h', false), trendFor('BTCUSDT', '4h', false), breadth(), fng(2).catch(() => [{ value: 50 }])]);
      let fc = 1;
      if (b1.net <= -10 && b4.net <= -5) fc -= .35; else if (b1.net <= -5) fc -= .15; else if (b1.net >= 8 && b4.net >= 5) fc += .08;
      if (br.ratio < 30) fc -= .15; else if (br.ratio > 65) fc += .05; if (f[0].value >= 85) fc -= .08;
      return { ok: fc >= .7, factor: +fc.toFixed(2), text: `BTC ساعة: ${b1.verdict} (${b1.net > 0 ? '+' : ''}${b1.net}) · BTC 4س: ${b4.verdict} · الصاعدة ${br.ratio}% · الخوف والطمع ${f[0].value}` };
    } catch (e) { return { ok: true, factor: 1, text: 'تعذر قراءة حالة السوق' }; }
  }

  async function deep(sym, amount, profit, feePct) {
    const base = sym.slice(0, -4), [r1, r4, r15, tk] = await Promise.all([trendFor(sym, '1h', true), trendFor(sym, '4h', false), trendFor(sym, '15m', false), ticker(sym)]);
    const comp = {}, pos = [], neg = [], add = (k, v, w) => comp[k] = [Math.max(0, Math.min(1, v)), w];
    add('trend_1h', (r1.net + 25) / 50, 22); add('trend_4h', (r4.net + 25) / 50, 14); add('timing_15m', (r15.net + 25) / 50, 8);
    if (r1.cls === 'up' && r4.cls === 'up') pos.push('الاتجاه صاعد على الساعة و4 ساعات'); if (r4.cls === 'down') neg.push('اتجاه 4 ساعات هابط'); if (r15.cls === 'up') pos.push('توقيت جيد: 15 دقيقة صاعد');
    const m = r1.ml; if (m && m.edge > 2) { add('ml', (m.prob_up - 30) / 40, 10); if (m.prob_up >= 58) pos.push(`التعلم الآلي: صعود ${m.prob_up}%`); }
    const an = r1.analogs || {}; if (an.win_rate != null && an.count >= 15) { add('analogs', (an.win_rate - 35) / 35, 8); if (an.win_rate >= 58) pos.push(`حالات مشابهة: صعد في ${an.win_rate}% منها`); }
    const K = await klines(sym, '1h'), q = K.qv.slice(-24).reduce((a, b) => a + b, 0), bq = K.tqv.slice(-24).reduce((a, b) => a + b, 0), bs = bq / Math.max(1, q) * 100;
    const spike = K.qv.at(-1) / Math.max(1, K.qv.slice(-25, -1).reduce((a, b) => a + b, 0) / 24);
    add('buy_pressure', (bs - 44) / 12, 8); add('volume', Math.min(spike, 3) / 3, 4);
    if (bs > 53) pos.push(`المشترون يسيطرون على ${bs.toFixed(0)}% من الحجم`); if (spike > 1.8) pos.push(`حجم الساعة ${spike.toFixed(1)}× المتوسط`);
    try { const im = await bookImb(sym); add('orderbook', (im + 30) / 60, 5); if (im > 15) pos.push('الطلب أقوى من العرض في دفتر الأوامر'); if (im < -25) neg.push('جدار بيع قريب'); } catch (e) { }
    try { const f = await futures(sym); let v = .6; if (f.funding > .05) { v -= .35; neg.push(`تمويل مرتفع ${f.funding.toFixed(3)}%`); } else if (f.funding < 0) { v += .25; pos.push('تمويل سلبي: احتمال ضغط صعودي'); }
      if (f.ls > 2.5) { v -= .25; neg.push(`الأفراد يشترون بإفراط (${f.ls.toFixed(2)})`); } add('futures', v, 8); } catch (e) { }
    const need = (profit / amount + 2 * feePct / 100) * 100, atrp = r1.dormancy.atr_pct || .5, hours = need / Math.max(.01, atrp) * 1.6;
    add('reach', 1.4 - hours / 24, 9); if (hours <= 8) pos.push(`الهدف (${need.toFixed(2)}%) قابل للتحقق خلال ~${hours.toFixed(0)} ساعة`); if (hours > 36) neg.push('الهدف بعيد بالنسبة لتقلب العملة');
    let pen = 0; const rsi1 = r1.indicators.find(i => i.name === 'RSI 14')?.value || 50;
    if (rsi1 > 76) { pen += 10; neg.push(`تشبع شرائي RSI ${rsi1.toFixed(0)}`); } if ((tk?.change || 0) > 25) { pen += 10; neg.push(`ارتفع ${tk.change.toFixed(0)}% اليوم`); }
    if (r1.extras?.divergence.includes('سلبي')) { pen += 6; neg.push('تباعد سلبي مع RSI'); }
    const tw = Object.values(comp).reduce((a, [, w]) => a + w, 0), raw = Object.values(comp).reduce((a, [v, w]) => a + v * w, 0) / tw * 100;
    // درجة الهبوط بعكس المكونات الاتجاهية
    const DIR = ['trend_1h', 'trend_4h', 'timing_15m', 'ml', 'analogs', 'buy_pressure', 'orderbook', 'futures'];
    let bn = 0, bd = 0; for (const [k, [v, w]] of Object.entries(comp)) { if (DIR.includes(k)) { bn += (1 - v) * w; bd += w; } else if (k === 'volume') { bn += v * w; bd += w; } }
    const bpen = (rsi1 < 25 ? 10 : 0) + ((tk?.change || 0) < -25 ? 10 : 0);
    const downR = []; if (r1.cls === 'down') downR.push(`اتجاه الساعة ${r1.verdict} (${r1.net}/25)`); if (r4.cls === 'down') downR.push(`اتجاه 4 ساعات ${r4.verdict}`); if (r15.cls === 'down') downR.push('الزخم القصير هابط');
    if (m && m.prob_up <= 42) downR.push(`التعلم الآلي يرجح الهبوط (${(100 - m.prob_up).toFixed(0)}%)`); if (bs < 47) downR.push(`البائعون يسيطرون على ${(100 - bs).toFixed(0)}% من الحجم`);
    neg.forEach(x => { if (!downR.some(y => y.includes(x) || x.includes(y))) downR.push(x); });
    const e = r1.extras || {};
    return { symbol: base, pair: sym, price: tk?.price || r1.price, change: tk?.change, raw: +raw.toFixed(1), penalty: pen, trend_1h: r1.verdict, trend_4h: r4.verdict, trend_15m: r15.verdict,
             net_1h: r1.net, ml: m ? m.prob_up : null, buy_share: +bs.toFixed(1), need_pct: +need.toFixed(3), eta_hours: +hours.toFixed(1),
             components: Object.fromEntries(Object.entries(comp).map(([k, [v]]) => [k, Math.round(v * 100)])), pros: pos.slice(0, 6), cons: neg.slice(0, 5),
             up_score: +Math.max(0, Math.min(100, raw - pen)).toFixed(1), down_score: +Math.max(0, Math.min(100, bn / bd * 100 - bpen)).toFixed(1),
             reasons_up: pos.slice(0, 6), reasons_down: downR.slice(0, 6), levels: { st: e.supertrend, t: e.targets || {}, price: r1.price } };
  }
  async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all([...Array(n)].map(async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } })); return out.filter(Boolean); }

  async function quickRank(universe, exclude = []) {
    const ts = (await tickers()).slice(0, universe).filter(t => t.quoteVolume > 10e6 && !exclude.includes(t.base) && t.change > -20 && t.change < 40);
    const q = await pool(ts, 4, async t => ({ s: t.symbol, n: (await trendFor(t.symbol, '1h', false)).net }));
    return { ts, q: q.sort((a, b) => b.n - a.n) };
  }
  const scan = (amount, profit, feePct, exclude = []) => cached(`scan:${amount}:${profit}:${exclude.join(',')}`, 60, async () => {
    const t0 = Date.now(), g = await gateMarket(), { ts, q } = await quickRank(30, exclude);
    const pick = (q.filter(x => x.n >= 3).length ? q.filter(x => x.n >= 3) : q).slice(0, 8).map(x => x.s);
    const rows = await pool(pick, 3, s => deep(s, amount, profit, feePct));
    rows.forEach(r => r.score = +Math.max(0, Math.min(100, r.raw * g.factor - r.penalty)).toFixed(1));
    return { gate: g, candidates: rows.sort((a, b) => b.score - a.score), scanned: ts.length, deep: pick.length, seconds: +((Date.now() - t0) / 1000).toFixed(1), t: Math.floor(Date.now() / 1000) };
  });
  const forecast = () => cached('forecast', 180, async () => {
    const g = await gateMarket(), { q } = await quickRank(30);
    const pick = [...new Set([...q.slice(0, 6), ...q.slice(-6)].map(x => x.s))];
    const rows = await pool(pick, 3, s => deep(s, 20, .5, .1));
    const conf = s => s >= 65 ? 'قوي' : s >= 55 ? 'متوسط' : 'ضعيف';
    const ups = rows.filter(r => r.up_score > r.down_score).sort((a, b) => b.up_score - a.up_score).map(r => ({ ...r, conf: conf(r.up_score) }));
    const downs = rows.filter(r => r.down_score > r.up_score).sort((a, b) => b.down_score - a.down_score).map(r => ({ ...r, conf: conf(r.down_score) }));
    return { gate: g, ups, downs, quick: q.map(x => ({ symbol: x.s.slice(0, -4), net: x.n })), t: Math.floor(Date.now() / 1000) };
  });

  /* ---------- الصفقات الناجحة ---------- */
  function side(K, hours) {
    const n = K.c.length, p = K.c.at(-1), F = .2; let tb = 0, ts = 0, wb = 0, ws = 0, bqs = 0, bvs = 0;
    for (let i = Math.max(0, n - hours); i < n; i++) {
      const bq = K.tqv[i], bv = K.tb[i], sq = K.qv[i] - bq, sv = K.v[i] - bv; tb += bq; ts += sq; bqs += bq; bvs += bv;
      if (bv > 0 && bq / bv < p * (1 - F / 100)) wb += bq; if (sv > 0 && sq / sv > p * (1 + F / 100)) ws += sq;
    }
    return { buyers_win: wb / Math.max(1, tb) * 100, sellers_win: ws / Math.max(1, ts) * 100, buyers_pnl: (p / (bqs / Math.max(1e-12, bvs)) - 1) * 100 - F };
  }
  const success = () => cached('success', 300, async () => {
    const ts = (await tickers()).slice(0, 20).filter(t => t.quoteVolume > 10e6);
    return pool(ts, 4, async t => { const K = await klines(t.symbol, '1h'), d24 = side(K, 24), d7 = side(K, 168);
      return { symbol: t.base, price: t.price, change: t.change, d24, d7, winning_side: d24.buyers_win >= 60 && d7.buyers_win >= 50 ? 'شراء' : d24.sellers_win >= 60 && d7.sellers_win >= 50 ? 'بيع' : 'متذبذب' }; });
  });

  /* ---------- المعادن والأسواق ---------- */
  const MAC = [['GC=F', 'الذهب', 'XAU'], ['SI=F', 'الفضة', 'XAG'], ['PL=F', 'البلاتين', 'XPT'], ['HG=F', 'النحاس', 'HG'], ['CL=F', 'النفط WTI', 'WTI'], ['BZ=F', 'برنت', 'BRENT'],
               ['DX-Y.NYB', 'مؤشر الدولار', 'DXY'], ['EURUSD=X', 'اليورو/دولار', 'EUR/USD'], ['^GSPC', 'إس آند بي 500', 'SPX'], ['^IXIC', 'ناسداك', 'NDX'], ['^VIX', 'مؤشر التقلب', 'VIX']];
  const macro = () => cached('macro', 120, async () => pool(MAC, 4, async ([s, name, code]) => {
    const r = (await json(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}`, { range: '5d', interval: '1d' }, { 'User-Agent': 'Mozilla/5.0' })).chart.result[0];
    const cl = (r.indicators.quote[0].close || []).filter(x => x != null), price = r.meta.regularMarketPrice || cl.at(-1), prev = cl.length > 1 ? cl.at(-2) : r.meta.chartPreviousClose;
    return { name, code, price, change: prev ? (price / prev - 1) * 100 : 0 };
  }));

  /* ---------- الأخبار ---------- */
  const FEEDS = [['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/', 'crypto'], ['Cointelegraph', 'https://cointelegraph.com/rss', 'crypto'], ['Decrypt', 'https://decrypt.co/feed', 'crypto'],
    ['BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'world'], ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', 'world'],
    ['BBC Business', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'economy'], ['CNBC', 'https://www.cnbc.com/id/20910258/device/rss/rss.html', 'economy']];
  const RULES = [[/\b(war|invasion|airstrike|missile|bombing|troops|military offensive|drone attack|escalat|nuclear)/, 'حروب وصراعات', -.7, 3], [/\b(ceasefire|peace talks|truce|peace deal)/, 'حروب وصراعات', .5, 2],
    [/\b(sanction|tariff|trade war|export ban)/, 'عقوبات وتجارة', -.45, 2], [/\b(rate cut|cuts rates|dovish|stimulus)/, 'السياسة النقدية', .7, 3], [/\b(rate hike|raises rates|hawkish)/, 'السياسة النقدية', -.7, 3],
    [/\b(fed|federal reserve|powell|fomc|ecb)/, 'السياسة النقدية', 0, 2], [/\b(inflation|cpi|jobs report|recession|gdp)/, 'بيانات اقتصادية', -.2, 2],
    [/\b(etf inflow|inflows|record high|all-time high|surge|soar|rall)/, 'تبني وزخم', .6, 2], [/\b(sec\b|lawsuit|ban|crackdown|probe)/, 'تنظيم وقوانين', -.4, 2],
    [/\b(hack|exploit|stolen|breach|drained|scam)/, 'اختراقات وأمن', -.7, 2], [/\b(liquidat|crash|plunge|sell-off|selloff|tumble|slump|outflow)/, 'ضغط بيعي', -.6, 2]];
  function assess(t) { t = t.toLowerCase(); let s = 0, w = 0; const cats = [];
    for (const [re, c, d, ww] of RULES) if (re.test(t)) { if (!cats.includes(c)) cats.push(c); s += d * ww; w += ww; }
    return { cats: cats.length ? cats : ['عام'], level: w >= 5 || cats.includes('حروب وصراعات') ? 'عالي' : w >= 2 ? 'متوسط' : 'منخفض', sentiment: w ? Math.max(-1, Math.min(1, s / Math.max(3, w))) : 0, weight: w }; }
  const TR = JSON.parse(localStorage.getItem('tr') || '{}');
  async function translate(list) {
    const todo = list.filter(t => !TR[t]);
    for (let i = 0; i < todo.length; i += 12) {
      const ch = todo.slice(i, i + 12);
      try { const r = await json('https://translate.googleapis.com/translate_a/single', { client: 'gtx', sl: 'auto', tl: 'ar', dt: 't', q: ch.join('\n') });
        const out = r[0].map(x => x[0]).join('').split('\n'); if (out.length === ch.length) ch.forEach((t, k) => TR[t] = out[k].trim()); } catch (e) { }
    }
    const keys = Object.keys(TR); if (keys.length > 1500) keys.slice(0, 600).forEach(k => delete TR[k]);
    try { localStorage.setItem('tr', JSON.stringify(TR)); } catch (e) { }
  }
  const news = () => cached('news', 240, async () => {
    const all = (await pool(FEEDS, 4, async ([src, url, cat]) => {
      const r = await NET.raw('GET', url, { 'User-Agent': 'Mozilla/5.0' }); if (r.status !== 200) return [];
      const doc = new DOMParser().parseFromString(r.text, 'text/xml');
      return [...doc.querySelectorAll('item')].slice(0, 20).map(it => ({ title: (it.querySelector('title')?.textContent || '').trim(), link: it.querySelector('link')?.textContent?.trim(),
        source: src, cat, t: Math.floor((Date.parse(it.querySelector('pubDate')?.textContent || '') || Date.now()) / 1000) }));
    })).flat().filter(x => x.title);
    const seen = new Set(), items = all.sort((a, b) => b.t - a.t).filter(x => { const k = x.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 90);
    await translate(items.map(x => x.title));
    return items.map(x => ({ ...x, ...assess(x.title), title_ar: TR[x.title] || x.title }));
  });

  /* ---------- التنبيهات المحلية ---------- */
  const AL = JSON.parse(localStorage.getItem('alerts') || '{"rules":[],"events":[],"seq":0}');
  const saveAl = () => localStorage.setItem('alerts', JSON.stringify(AL));
  const ATYPES = { price_above: 'السعر يتجاوز', price_below: 'السعر ينزل تحت', trend_change: 'تغير الاتجاه (25 مؤشراً)', news_high: 'خبر عالي التأثير' };
  function fire(title, body, level = 'info') { AL.seq++; AL.events.push({ id: AL.seq, t: Math.floor(Date.now() / 1000), title, body, level }); AL.events = AL.events.slice(-100); saveAl(); NET.notify(title, body); }
  async function checkAlerts() {
    for (const r of AL.rules.filter(r => r.active)) {
      try {
        if (r.type.startsWith('price')) { const t = await ticker(r.symbol + 'USDT'); if (!t) continue;
          if ((r.type === 'price_above' && t.price >= r.value) || (r.type === 'price_below' && t.price <= r.value)) { fire(`${r.symbol} ${r.type === 'price_above' ? 'تجاوز' : 'نزل تحت'} ${r.value}`, `السعر الآن ${t.price}`, r.type === 'price_above' ? 'up' : 'down'); r.active = false; } }
        if (r.type === 'trend_change') { const t = await trendFor(r.symbol, r.interval || '1h', false);
          if (r.last && r.last !== t.verdict) fire(`تغير اتجاه ${r.symbol}`, `من «${r.last}» إلى «${t.verdict}»`, t.cls); r.last = t.verdict; }
        if (r.type === 'news_high') { const n = (await news()).filter(x => x.level === 'عالي'); const seen = r.seen || [];
          if (r.seen) n.filter(x => !seen.includes(x.link)).slice(0, 2).forEach(x => fire('📰 خبر عالي التأثير', x.title_ar, x.sentiment < 0 ? 'down' : 'info')); r.seen = n.map(x => x.link).slice(0, 80); }
      } catch (e) { }
    }
    saveAl();
  }

  /* ---------- الموجّه: نفس واجهة الخادم السابقة ---------- */
  async function handle(path, body) {
    const u = new URL(path, 'https://x'), p = u.pathname, a = Object.fromEntries(u.searchParams);
    switch (p) {
      case '/api/overview': return overview();
      case '/api/tickers': return (await tickers()).slice(0, +(a.n || 300));
      case '/api/health': return { binance: { ...gate(), source: SOURCE.tickers } };
      case '/api/trend': return trendFor(a.symbol, a.interval || '4h', true);
      case '/api/trend/mtf': return mtf(a.symbol);
      case '/api/forecast': return forecast();
      case '/api/success': return success();
      case '/api/macro': return macro();
      case '/api/news': { let it = await news(); if (a.cat === 'high') it = it.filter(x => x.level === 'عالي'); else if (a.cat && a.cat !== 'all') it = it.filter(x => x.cat === a.cat); return { items: it.slice(0, +(a.limit || 60)) }; }
      case '/api/alerts': return { rules: AL.rules, types: ATYPES };
      case '/api/alerts/events': return { events: AL.events.filter(e => e.id > +(a.since || 0)), seq: AL.seq };
      case '/api/alerts/add': { const r = { id: Math.random().toString(36).slice(2, 10), type: body.type, symbol: (body.symbol || 'BTC').toUpperCase(), value: +body.value || 0, interval: body.interval || '1h', active: true, fired: 0 }; AL.rules.push(r); saveAl(); return r; }
      case '/api/alerts/del': AL.rules = AL.rules.filter(r => r.id !== body.id); saveAl(); return true;
      case '/api/ai/trend': return AI.report(await trendFor(body.symbol, body.interval || '4h', true), await mtf(body.symbol).catch(() => []));
      default: if (p.startsWith('/api/bot/')) return BOT.handle(p.slice(9), body || {}, a);
    }
    throw new Error('غير مدعوم: ' + p);
  }
  return { handle, tickers, ticker, klines, trendFor, scan, deep, gateMarket, checkAlerts, norm, SOURCE, news };
})();

/* ---------- الذكاء الاصطناعي (اختياري بمفتاحك) ---------- */
const AI = {
  async report(tr, mtf) {
    const key = NET.secret.get('anthropic'); if (!key) throw new Error('أضف مفتاح Anthropic من الإعدادات لتفعيل الذكاء الاصطناعي');
    const ctx = JSON.stringify({ coin: tr.symbol, interval: tr.interval, price: tr.price, verdict: tr.verdict, bull: tr.bull, bear: tr.bear, categories: tr.categories,
      indicators: tr.indicators.map(i => [i.name, i.vote, i.value]), dormancy: tr.dormancy, extras: tr.extras, ml: tr.ml, analogs: tr.analogs, mtf });
    const r = await NET.raw('POST', 'https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, JSON.stringify({
      model: localStorage.getItem('ai_model') || 'claude-sonnet-5-5', max_tokens: 1300,
      system: 'أنت محلل أسواق عملات رقمية خبير تكتب بالعربية المبسطة، تعتمد فقط على البيانات المرفقة ولا تخترع أرقاماً، واختم بسطر أن هذا ليس نصيحة استثمارية.',
      messages: [{ role: 'user', content: `بيانات حية:\n${ctx}\n\nاكتب بهذه العناوين: ### الخلاصة ### ما تقوله المؤشرات ### السيناريو الصاعد ### السيناريو الهابط ### مستويات للمراقبة ### المخاطر. نقاط قصيرة.` }] }));
    const j = JSON.parse(r.text || '{}'); if (r.status !== 200) throw new Error(j.error?.message || `خطأ ${r.status}`);
    return { text: j.content.filter(b => b.type === 'text').map(b => b.text).join('') };
  },
};
