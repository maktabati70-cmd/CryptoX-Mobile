/* بوت التداول الفوري على الجوال: Binance أو Bybit، تجريبي أو حقيقي.
   بعد كل شراء يُوضع أمر بيع محدد على المنصة عند السعر الذي يحقق صافي الربح، فيُنفذ حتى لو أُغلق التطبيق. */
const BOT = (() => {
  const LS = 'bot_state';
  const S = Object.assign({ settings: { exchange: 'binance', mode: 'paper', amount: 20, profit: .5, stop_pct: 0, max_trades: 2, auto_min: 60 },
    trades: [], log: [], paper_usdt: 1000, cooldown: {}, fee: { binance: .001, bybit: .001 } }, JSON.parse(localStorage.getItem(LS) || '{}'));
  S.auto = false; S.busy = false;   // الشراء التلقائي يبدأ دائماً متوقفاً
  const save = () => localStorage.setItem(LS, JSON.stringify({ settings: S.settings, trades: S.trades.slice(-300), log: S.log.slice(-200), paper_usdt: S.paper_usdt, cooldown: S.cooldown, fee: S.fee }));
  const LABEL = { binance: 'Binance', bybit: 'Bybit' };
  const log = (text, level = 'info') => { S.log.push({ t: Math.floor(Date.now() / 1000), text, level }); S.log = S.log.slice(-200); save(); };
  const D = x => { const s = String(x); return s.includes('e') ? Number(x).toFixed(12) : s; };
  const decimals = step => { const s = D(+step).replace(/0+$/, ''); return s.includes('.') ? s.split('.')[1].length : 0; };
  const qFloor = (x, step) => { const d = decimals(step), st = +step; return (Math.floor(x / st + 1e-9) * st).toFixed(d); };
  const qCeil = (x, tick) => { const d = decimals(tick), t = +tick; return (Math.ceil(x / t - 1e-9) * t).toFixed(d); };
  const key = n => NET.secret.get(n + '_key'), sec = n => NET.secret.get(n + '_secret');
  const connected = n => !!key(n);
  const isLive = () => S.settings.mode === 'live' && connected(S.settings.exchange);

  /* ================= Binance ================= */
  const BN = {
    off: 0,
    async req(method, path, params = {}) {
      NET.gateCheck();
      const p = new URLSearchParams({ ...params, timestamp: Date.now() + this.off, recvWindow: 10000 }).toString(), sig = await NET.hmac(sec('binance'), p);
      const r = await NET.raw(method, `https://api.binance.com${path}?${p}&signature=${sig}`, { 'X-MBX-APIKEY': key('binance') });
      NET.gateUpdate(r);
      if (r.status === 0) throw new Error('لا يوجد اتصال بالإنترنت');
      const j = JSON.parse(r.text || '{}');
      if (r.status !== 200) { if (j.code === -1021) { try { const t = await NET.json('https://api.binance.com/api/v3/time'); this.off = t.serverTime - Date.now(); } catch (e) { } } throw new Error(`Binance: ${j.msg || r.status}`); }
      return j;
    },
    async account() { const a = await this.req('GET', '/api/v3/account', { omitZeroBalances: 'true' }), cr = a.commissionRates || {};
      const free = {}, tot = {}; a.balances.forEach(b => { free[b.asset] = +b.free; tot[b.asset] = +b.free + +b.locked; });
      return { usdt: free.USDT || 0, free, total: tot, fee_rate: Math.max(+cr.taker || .001, +cr.maker || .001), canTrade: a.canTrade }; },
    async verify() { const a = await this.account(); if (!a.canTrade) throw new Error('المفتاح لا يملك صلاحية التداول الفوري'); return null; },
    filtersCache: {},
    async filters(sym) { if (this.filtersCache[sym]) return this.filtersCache[sym];
      const i = (await NET.binance('/api/v3/exchangeInfo', { symbol: sym })).symbols[0], f = Object.fromEntries(i.filters.map(x => [x.filterType, x]));
      return this.filtersCache[sym] = { step: f.LOT_SIZE.stepSize, tick: f.PRICE_FILTER.tickSize, min: +((f.NOTIONAL || f.MIN_NOTIONAL || {}).minNotional || 5), ok: i.status === 'TRADING' }; },
    async price(sym) { const t = await ENG.ticker(sym); return t ? t.price : +(await NET.binance('/api/v3/ticker/price', { symbol: sym })).price; },
    async fees(fills, base, avg) { let bf = 0, uf = 0; for (const f of fills || []) { const c = +f.commission, a = f.commissionAsset;
      if (a === base) bf += c; else if (a === 'USDT') uf += c; else { try { uf += c * await this.price(a + 'USDT'); } catch (e) { } } } return [bf, uf]; },
    async marketBuy(sym, quote) { const o = await this.req('POST', '/api/v3/order', { symbol: sym, side: 'BUY', type: 'MARKET', quoteOrderQty: quote.toFixed(2), newOrderRespType: 'FULL' });
      const q = +o.executedQty, sp = +o.cummulativeQuoteQty, [bf, uf] = await this.fees(o.fills, sym.slice(0, -4), sp / q);
      return { qty: q - bf, avg: sp / q, cost: sp + uf, fee: bf * sp / q + uf, order: o.orderId }; },
    async limitSell(sym, qty, price) { return (await this.req('POST', '/api/v3/order', { symbol: sym, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', quantity: qty, price })).orderId; },
    async marketSell(sym, qty) { const o = await this.req('POST', '/api/v3/order', { symbol: sym, side: 'SELL', type: 'MARKET', quantity: qty, newOrderRespType: 'FULL' });
      const g = +o.cummulativeQuoteQty, q = +o.executedQty, [bf, uf] = await this.fees(o.fills, sym.slice(0, -4), g / q); return { avg: g / q, got: g, fee: uf + bf * g / q }; },
    cancel(sym, id) { return this.req('DELETE', '/api/v3/order', { symbol: sym, orderId: id }); },
    async order(sym, id) { const o = await this.req('GET', '/api/v3/order', { symbol: sym, orderId: id });
      const st = o.status === 'FILLED' ? 'filled' : ['CANCELED', 'EXPIRED', 'REJECTED'].includes(o.status) ? 'canceled' : 'open';
      return { status: st, got: +o.cummulativeQuoteQty, qty: +o.executedQty, fee: +o.cummulativeQuoteQty * S.fee.binance }; },
  };

  /* ================= Bybit v5 ================= */
  const BB = {
    async req(method, path, params = {}) {
      const ts = String(Date.now()), rw = '10000', isGet = method === 'GET', payload = isGet ? new URLSearchParams(params).toString() : JSON.stringify(params);
      const sig = await NET.hmac(sec('bybit'), ts + key('bybit') + rw + payload);
      const r = await NET.raw(method, 'https://api.bybit.com' + path + (isGet && payload ? '?' + payload : ''),
        { 'X-BAPI-API-KEY': key('bybit'), 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': rw, 'X-BAPI-SIGN': sig, 'Content-Type': 'application/json' }, isGet ? '' : payload);
      if (r.status === 0) throw new Error('لا يوجد اتصال بالإنترنت');
      if (r.status === 403) throw new Error('Bybit رفض الطلب (403): ربما حظر مؤقت أو قيد IP على المفتاح');
      const j = JSON.parse(r.text || '{}'); if (j.retCode !== 0) throw new Error(`Bybit: ${j.retMsg} (${j.retCode})`); return j.result;
    },
    acct: 'UNIFIED',
    async account() {
      let res; for (const at of [this.acct, this.acct === 'UNIFIED' ? 'SPOT' : 'UNIFIED']) { try { res = await this.req('GET', '/v5/account/wallet-balance', { accountType: at }); this.acct = at; break; } catch (e) { } }
      if (!res) throw new Error('تعذر قراءة رصيد Bybit');
      const free = {}, tot = {}; (res.list || []).forEach(a => (a.coin || []).forEach(c => { const wb = +c.walletBalance || 0; tot[c.coin] = wb; free[c.coin] = Math.max(0, wb - (+c.locked || 0)); }));
      let fee = .001; try { const f = (await this.req('GET', '/v5/account/fee-rate', { category: 'spot', symbol: 'BTCUSDT' })).list[0]; fee = Math.max(+f.takerFeeRate, +f.makerFeeRate); } catch (e) { }
      return { usdt: free.USDT || 0, free, total: tot, fee_rate: fee };
    },
    async verify() { const i = await this.req('GET', '/v5/user/query-api'); if (!(i.permissions || {}).Spot) throw new Error('المفتاح لا يملك صلاحية Spot'); if (i.readOnly === 1) throw new Error('المفتاح للقراءة فقط'); await this.account();
      return (i.permissions.Wallet || []).some(p => p.includes('Withdraw')) ? 'صلاحية السحب مفعلة على المفتاح، عطّلها للأمان.' : null; },
    filtersCache: {},
    async filters(sym) { if (this.filtersCache[sym]) return this.filtersCache[sym];
      const l = (await NET.json('https://api.bybit.com/v5/market/instruments-info', { category: 'spot', symbol: sym })).result.list; if (!l.length) throw new Error(`${sym} غير متاحة على Bybit`);
      const i = l[0]; return this.filtersCache[sym] = { step: i.lotSizeFilter.basePrecision, tick: i.priceFilter.tickSize, min: +(i.lotSizeFilter.minOrderAmt || 5), ok: i.status === 'Trading' }; },
    async price(sym) { return +(await NET.json('https://api.bybit.com/v5/market/tickers', { category: 'spot', symbol: sym })).result.list[0].lastPrice; },
    async execs(sym, id, tries = 6) { for (let i = 0; i < tries; i++) { const l = (await this.req('GET', '/v5/execution/list', { category: 'spot', symbol: sym, orderId: id })).list || []; if (l.length) return l; await new Promise(r => setTimeout(r, 500)); } return []; },
    async sum(sym, ex) { const base = sym.slice(0, -4); let q = 0, v = 0, bf = 0, uf = 0;
      for (const x of ex) { q += +x.execQty; v += +x.execValue; const f = +x.execFee || 0, c = x.feeCurrency; if (c === base) bf += f; else if (c === 'USDT') uf += f; else if (f) { try { uf += f * await this.price(c + 'USDT'); } catch (e) { } } }
      return [q, v, bf, uf]; },
    async marketBuy(sym, quote) { const o = await this.req('POST', '/v5/order/create', { category: 'spot', symbol: sym, side: 'Buy', orderType: 'Market', qty: quote.toFixed(2), marketUnit: 'quoteCoin' });
      const [q, v, bf, uf] = await this.sum(sym, await this.execs(sym, o.orderId)); if (!q) throw new Error('تم إرسال الشراء لكن لم تُقرأ تفاصيله، راجع حسابك');
      return { qty: q - bf, avg: v / q, cost: v + uf, fee: bf * v / q + uf, order: o.orderId }; },
    async limitSell(sym, qty, price) { return (await this.req('POST', '/v5/order/create', { category: 'spot', symbol: sym, side: 'Sell', orderType: 'Limit', qty, price, timeInForce: 'GTC' })).orderId; },
    async marketSell(sym, qty) { const o = await this.req('POST', '/v5/order/create', { category: 'spot', symbol: sym, side: 'Sell', orderType: 'Market', qty });
      const [q, v, bf, uf] = await this.sum(sym, await this.execs(sym, o.orderId)); return { avg: q ? v / q : await this.price(sym), got: v, fee: uf + bf * (q ? v / q : 0) }; },
    cancel(sym, id) { return this.req('POST', '/v5/order/cancel', { category: 'spot', symbol: sym, orderId: id }); },
    async order(sym, id) { let l = (await this.req('GET', '/v5/order/realtime', { category: 'spot', symbol: sym, orderId: id })).list || [];
      if (!l.length) l = (await this.req('GET', '/v5/order/history', { category: 'spot', symbol: sym, orderId: id })).list || []; if (!l.length) return { status: 'open' };
      const o = l[0], s = o.orderStatus; return { status: s === 'Filled' ? 'filled' : ['Cancelled', 'Rejected', 'Deactivated', 'PartiallyFilledCanceled'].includes(s) ? 'canceled' : 'open', got: +o.cumExecValue || 0, qty: +o.cumExecQty || 0, fee: (+o.cumExecValue || 0) * S.fee.bybit }; },
  };
  const EX = { binance: BN, bybit: BB };

  /* ================= الصفقات ================= */
  const open = () => S.trades.filter(t => t.status === 'open');
  const feeOf = t => S.fee[t.exchange] || .001;
  async function price(t) { try { return t.mode === 'live' ? await EX[t.exchange].price(t.symbol) : (await ENG.ticker(t.symbol)).price; } catch (e) { return t.last_price || t.buy_price; } }
  const accCache = {};
  async function account(n, fresh) { const h = accCache[n]; if (h && !fresh && Date.now() - h.t < 10000) return h.v; const v = await EX[n].account(); S.fee[n] = v.fee_rate; accCache[n] = { t: Date.now(), v }; return v; }

  async function buy(sym, amount, profit, stop, reason = '', score = null, auto = false) {
    sym = ENG.norm(sym); const base = sym.slice(0, -4), n = S.settings.exchange, live = isLive();
    amount = +amount; profit = +profit;
    if (open().some(t => t.symbol === sym && t.exchange === n)) throw new Error(`توجد صفقة مفتوحة على ${base} بالفعل`);
    if (!(amount > 0 && profit > 0)) throw new Error('قيمة الصفقة والربح يجب أن تكونا أكبر من صفر');
    const tr = { id: Math.random().toString(36).slice(2, 10), symbol: sym, base, exchange: n, mode: live ? 'live' : 'paper', auto, amount, profit, stop_pct: +stop || 0,
                 opened: Math.floor(Date.now() / 1000), status: 'open', score, reason };
    if (live) {
      const X = EX[n], f = await X.filters(sym); if (!f.ok) throw new Error(`${base} غير متاحة للتداول على ${LABEL[n]}`);
      if (amount < Math.max(f.min * 1.15, 6)) throw new Error(`أقل قيمة صفقة على ${base}: ${Math.max(f.min * 1.15, 6).toFixed(2)}$`);
      const acc = await account(n, true); if (acc.usdt < amount) throw new Error(`رصيد USDT غير كافٍ (${acc.usdt.toFixed(2)}$)`);
      const b = await X.marketBuy(sym, amount), fee = S.fee[n];
      let free = b.qty; try { free = (await account(n, true)).free[base] ?? b.qty; } catch (e) { }
      const qs = +qFloor(Math.min(b.qty, free), f.step), tp = (b.cost + profit) / (qs * (1 - fee));
      Object.assign(tr, { buy_price: b.avg, qty_sell: qs, cost: b.cost, buy_fee: b.fee, target_price: +qCeil(tp, f.tick) });
      try { tr.sell_order = await X.limitSell(sym, qFloor(qs, f.step), qCeil(tp, f.tick)); }
      catch (e) { tr.sell_order = null; log(`تعذر وضع أمر البيع المحدد لـ ${base}: ${e.message}. سيبيع البوت بالسوق عند الهدف ما دام التطبيق مفتوحاً.`, 'down'); }
    } else {
      const fee = S.fee[n] || .001, p = (await ENG.ticker(sym))?.price; if (!p) throw new Error('تعذر قراءة السعر');
      if (S.paper_usdt < amount) throw new Error(`الرصيد التجريبي غير كافٍ (${S.paper_usdt.toFixed(2)}$)`);
      const q = amount / p * (1 - fee);
      Object.assign(tr, { buy_price: p, qty_sell: q, cost: amount, buy_fee: amount * fee, sell_order: null, target_price: (amount + profit) / (q * (1 - fee)) });
      S.paper_usdt -= amount;
    }
    tr.stop_price = tr.stop_pct > 0 ? tr.buy_price * (1 - tr.stop_pct / 100) : null;
    S.trades.push(tr); save();
    log(`[${LABEL[n]}] شراء ${auto ? 'تلقائي' : 'يدوي'} ${base} بـ ${amount}$ عند ${tr.buy_price} · هدف ${(+tr.target_price).toPrecision(8)}`, 'up');
    NET.notify(`🟢 شراء ${base} (${live ? 'حقيقي' : 'تجريبي'})`, `${amount}$ · هدف البيع ${(+tr.target_price).toPrecision(8)} (+${profit}$)`);
    return tr;
  }
  function closeT(tr, px, got, fee, why) {
    Object.assign(tr, { status: 'closed', closed: Math.floor(Date.now() / 1000), sell_price: px, proceeds: got, sell_fee: fee, pnl: got - fee - tr.cost, close_reason: why });
    S.cooldown[tr.symbol] = Date.now(); if (tr.mode === 'paper') S.paper_usdt += got - fee; save();
    log(`[${LABEL[tr.exchange]}] بيع ${tr.base} · صافي ${tr.pnl >= 0 ? '+' : ''}${tr.pnl.toFixed(3)}$ (${why})`, tr.pnl >= 0 ? 'up' : 'down');
    NET.notify(`${tr.pnl >= 0 ? '✅' : '🔻'} بيع ${tr.base}`, `صافي ${tr.pnl >= 0 ? '+' : ''}${tr.pnl.toFixed(3)}$ (${why})`); NET.vibrate(150);
  }
  async function checkOrder(tr) { const o = await EX[tr.exchange].order(tr.symbol, tr.sell_order);
    if (o.status === 'filled') { closeT(tr, o.qty ? o.got / o.qty : tr.target_price, o.got, o.fee, 'تحقق هدف الربح'); return true; }
    if (o.status === 'canceled') { tr.sell_order = null; log(`أمر البيع لـ ${tr.base} أُلغي من خارج البوت`, 'down'); save(); } return false; }
  async function close(id, why = 'إغلاق يدوي') {
    const tr = open().find(t => t.id === id); if (!tr) throw new Error('الصفقة غير موجودة');
    if (tr.mode === 'live') {
      const X = EX[tr.exchange];
      if (tr.sell_order) { try { await X.cancel(tr.symbol, tr.sell_order); } catch (e) { if (await checkOrder(tr)) return tr; throw e; } }
      const f = await X.filters(tr.symbol); let free = tr.qty_sell; try { free = (await account(tr.exchange, true)).free[tr.base] ?? free; } catch (e) { }
      const r = await X.marketSell(tr.symbol, qFloor(Math.min(tr.qty_sell, free), f.step)); closeT(tr, r.avg, r.got, r.fee, why);
    } else { const p = await price(tr), g = tr.qty_sell * p; closeT(tr, p, g, g * feeOf(tr), why); }
    return tr;
  }
  async function monitor() {
    for (const tr of open()) {
      if (tr.exchange === 'binance' && tr.mode === 'live' && NET.gate().paused) continue;
      try {
        const p = await price(tr); tr.last_price = p; delete tr.error;
        if (tr.stop_price && p <= tr.stop_price) { await close(tr.id, `وقف الخسارة ${tr.stop_pct}%`); continue; }
        if (tr.mode === 'live') { if (tr.sell_order) await checkOrder(tr); else if (p >= tr.target_price) await close(tr.id, 'تحقق هدف الربح'); }
        else if (p >= tr.target_price) { const g = tr.qty_sell * tr.target_price; closeT(tr, tr.target_price, g, g * feeOf(tr), 'تحقق هدف الربح'); }
      } catch (e) { tr.error = e.message.slice(0, 140); }
    }
    save();
  }
  async function scan(amount, profit) {
    const st = S.settings, ex = [...new Set([...open().map(t => t.base), ...Object.entries(S.cooldown).filter(([, t]) => Date.now() - t < 3600e3).map(([s]) => s.slice(0, -4))])];
    return ENG.scan(+(amount || st.amount), +(profit || st.profit), (S.fee[st.exchange] || .001) * 100, ex);
  }
  async function smart(amount, profit, symbol, auto = false) {
    const st = S.settings; amount = +(amount || st.amount); profit = +(profit || st.profit);
    if (isLive() && st.exchange === 'binance' && NET.gate().paused) throw new Error('Binance متوقفة مؤقتاً. انتظر أو بدّل المنصة إلى Bybit من الإعدادات.');
    if (S.busy) throw new Error('البوت يحلل السوق الآن، انتظر لحظات'); S.busy = true;
    try {
      const res = await scan(amount, profit); let c;
      if (symbol) { const b = symbol.toUpperCase().replace(/USDT$/, ''); c = res.candidates.find(x => x.symbol === b) || await ENG.deep(b + 'USDT', amount, profit, (S.fee[st.exchange] || .001) * 100); c.score = c.score ?? +(c.raw * res.gate.factor - c.penalty).toFixed(1); }
      else { c = res.candidates[0]; if (!c) throw new Error('لا مرشحين مناسبين الآن');
        if (c.score < st.auto_min) throw new Error(`أفضل مرشح ${c.symbol} درجته ${c.score} أقل من ${st.auto_min}. البوت يفضّل الانتظار. ${res.gate.text}`); }
      return await buy(c.pair, amount, profit, st.stop_pct, c.pros.slice(0, 3).join('؛ ') || 'أعلى درجة', c.score, auto);
    } finally { S.busy = false; }
  }
  let lastAuto = 0;
  setInterval(async () => {
    await monitor().catch(() => { });
    if (S.auto && Date.now() - lastAuto > 180e3) { lastAuto = Date.now();
      try { while (S.auto && open().filter(t => t.auto).length < S.settings.max_trades) await smart(null, null, null, true); } catch (e) { log('التلقائي: ' + e.message); } }
  }, 10000);

  async function status() {
    const st = S.settings, n = st.exchange, exs = {};
    for (const x of ['binance', 'bybit']) { const k = key(x); exs[x] = { label: LABEL[x], connected: !!k, masked: k ? k.slice(0, 5) + '…' + k.slice(-4) : null }; }
    let acc = null, err = null; if (exs[n].connected) { try { const a = await account(n); acc = { usdt: a.usdt, fee_rate: a.fee_rate }; } catch (e) { err = e.message; } }
    const opens = open().map(t => { const p = t.last_price || t.buy_price; return { ...t, price: p, fee_rate: feeOf(t), pnl: t.qty_sell * p * (1 - feeOf(t)) - t.cost }; });
    const closed = S.trades.filter(t => t.status === 'closed'), mc = closed.filter(t => t.mode === st.mode);
    return { exchanges: exs, exchange: n, connected: exs[n].connected, account: acc, account_error: err, settings: st, auto: S.auto, busy: S.busy, paper_usdt: S.paper_usdt,
             fee_rate: S.fee[n] || .001, open: opens, closed: closed.slice(-60).reverse(), log: S.log.slice(-40).reverse(), binance: NET.gate(),
             stats: { count: mc.length, wins: mc.filter(t => t.pnl > 0).length, pnl: mc.reduce((a, t) => a + t.pnl, 0), fees: mc.reduce((a, t) => a + (t.buy_fee || 0) + (t.sell_fee || 0), 0) } };
  }
  async function handle(p, b) {
    const st = S.settings;
    switch (p) {
      case 'status': return status();
      case 'settings':
        if (b.exchange) st.exchange = b.exchange;
        if (b.mode === 'live') { if (!connected(st.exchange)) throw new Error(`اربط مفاتيح ${LABEL[st.exchange]} أولاً`); st.mode = 'live'; } else if (b.mode === 'paper') st.mode = 'paper';
        if (st.mode === 'live' && !connected(st.exchange)) st.mode = 'paper';
        for (const k of ['amount', 'profit', 'stop_pct', 'max_trades', 'auto_min']) if (b[k] !== undefined && b[k] !== '') st[k] = +b[k];
        save(); return st;
      case 'keys': {
        const n = b.exchange || st.exchange;
        if (b.clear) { NET.secret.set(n + '_key', ''); NET.secret.set(n + '_secret', ''); if (st.exchange === n) { st.mode = 'paper'; S.auto = false; } save(); log(`تم حذف مفاتيح ${LABEL[n]}`); return true; }
        const ok = key(n), os = sec(n); NET.secret.set(n + '_key', b.key.trim()); NET.secret.set(n + '_secret', b.secret.trim());
        try { const w = await EX[n].verify(); log(`تم ربط ${LABEL[n]} بنجاح`, 'up'); return { ok: true, warning: w }; }
        catch (e) { NET.secret.set(n + '_key', ok); NET.secret.set(n + '_secret', os); throw e; }
      }
      case 'scan': return scan(b.amount, b.profit);
      case 'buy': return smart(b.amount, b.profit, b.symbol);
      case 'close': if (b.all) { for (const t of open()) await close(t.id, 'إغلاق الكل').catch(e => log(e.message, 'down')); return true; } return close(b.id);
      case 'auto': S.auto = !!b.on; log(S.auto ? 'تم تشغيل الشراء التلقائي' : 'تم إيقاف الشراء التلقائي'); return S.auto;
      case 'reset-paper': S.trades = S.trades.filter(t => t.mode !== 'paper'); S.paper_usdt = 1000; save(); return true;
    }
    throw new Error('أمر غير معروف');
  }
  return { handle, S };
})();
