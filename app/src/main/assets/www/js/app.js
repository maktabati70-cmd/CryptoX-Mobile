/* CRYPTO X — تطبيق الجوال */
(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const ICON = s => `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s.toLowerCase()}.png`;
  const img = s => `<img src="${ICON(s)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fp = p => { if (p == null || isNaN(p)) return '—'; const a = Math.abs(p), d = a >= 1 ? 2 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 8;
    return Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const fu = v => { if (v == null || isNaN(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '-' : '';
    return a >= 1e12 ? `${s}$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(1)}K` : `${s}$${a.toFixed(0)}`; };
  const pc = (v, d = 2) => v == null || isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${(+v).toFixed(d)}%`;
  const cl = v => v > 0 ? 'up' : v < 0 ? 'down' : 'muted';
  const ps = (v, d) => `<span class="num ${cl(v)}">${pc(v, d)}</span>`;
  const ago = t => { const s = Date.now() / 1000 - t; return s < 3600 ? `قبل ${Math.max(1, Math.round(s / 60))} د` : s < 86400 ? `قبل ${Math.round(s / 3600)} س` : `قبل ${Math.round(s / 86400)} ي`; };
  const tone = (v, hi = 0, lo = 0) => v > hi ? 'up' : v < lo ? 'down' : 'flat';

  async function api(path, body) { return ENG.handle(path, body); }
  function toast(t, k = '') { const e = document.createElement('div'); e.className = `toast ${k}`; e.innerHTML = t; document.body.appendChild(e); setTimeout(() => e.remove(), 4500); }
  const errBox = e => `<div class="err">${esc(e.message)}</div>`;

  /* ---------- التنقل ---------- */
  let view = 'home';
  const loaders = {};
  function go(v) {
    view = v;
    $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $$('.view').forEach(s => s.classList.toggle('on', s.id === `v-${v}`));
    window.scrollTo(0, 0);
    loaders[v]?.();
    history.replaceState(null, '', `#${v}`);
  }
  $$('nav.tabs button').forEach(b => b.onclick = () => go(b.dataset.v));

  /* ---------- الأسعار الحية ---------- */
  const live = new Map();
  let ws;
  function connectWS() {
    ws = new WebSocket('wss://data-stream.binance.vision/ws/!miniTicker@arr');
    ws.onmessage = e => { for (const t of JSON.parse(e.data)) if (t.s.endsWith('USDT')) live.set(t.s, { s: t.s, b: t.s.slice(0, -4), p: +t.c, c: +t.o ? (t.c / t.o - 1) * 100 : 0, v: +t.q }); };
    ws.onclose = () => setTimeout(connectWS, 4000); ws.onerror = () => ws.close();
  }
  async function pollPrices() {
    try { (await api('/api/tickers?n=300')).forEach(t => { if (!live.has(t.symbol)) live.set(t.symbol, { s: t.symbol, b: t.base, p: t.price, c: t.change, v: t.quoteVolume }); }); } catch (e) { }
  }
  const top = n => [...live.values()].filter(t => t.v > 3e6).sort((a, b) => b.v - a.v).slice(0, n);
  function ticker() {
    const items = top(25).map(t => `<span class="it"><b>${t.b}</b> <span class="num">${fp(t.p)}</span> ${ps(t.c)}</span>`).join('');
    if (!items) return;
    $('#tick').innerHTML = items + items;
    $('#tick').style.animationDuration = `${Math.max(30, $('#tick').scrollWidth / 2 / 50)}s`;
  }

  /* ---------- حالة Binance ---------- */
  async function health() {
    try {
      const h = (await api('/api/health')).binance, el = $('#bn');
      el.classList.toggle('ban', h.paused);
      el.querySelector('span').textContent = h.paused ? `محظور ${Math.floor(h.seconds / 60)}:${String(h.seconds % 60).padStart(2, '0')}` : (h.source && h.source !== 'Binance' ? `البيانات من ${h.source}` : 'Binance يعمل');
    } catch (e) { }
  }

  /* ---------- الرئيسية ---------- */
  let listMode = 'vol';
  $('#lt').onclick = e => { const b = e.target.closest('button'); if (!b) return; listMode = b.dataset.k; $$('#lt button').forEach(x => x.classList.toggle('on', x === b)); coins(); };
  function coins() {
    let a = top(120);
    if (listMode === 'gain') a.sort((x, y) => y.c - x.c); if (listMode === 'lose') a.sort((x, y) => x.c - y.c);
    $('#coinList').innerHTML = a.slice(0, 12).map(t => `<div class="it" onclick="M.analyze('${t.b}')">${img(t.b)}<div class="n"><b>${t.b}</b><small>${fu(t.v)}</small></div>
      <div class="p"><b class="num">${fp(t.p)}</b>${ps(t.c)}</div></div>`).join('') || '<div class="empty">جارٍ تحميل الأسعار…</div>';
  }
  const ringStyle = (v, colors) => `background:conic-gradient(${colors(v)} ${v * 3.6}deg,#13254a 0)`;
  loaders.home = async () => {
    try {
      const o = await api('/api/overview'), h = o.health, f = o.fng, g = o.global, b = o.breadth;
      $('#hVal').textContent = h.value; $('#hLab').textContent = h.label; $('#hLab').className = tone(h.value - 50, 5, -5);
      $('#hRing').style = ringStyle(h.value, v => v >= 55 ? '#1ed69f' : v <= 45 ? '#ff2e55' : '#58a6ff');
      $('#fVal').textContent = f.value; $('#fLab').textContent = f.label;
      $('#fRing').style = ringStyle(f.value, v => v <= 25 ? '#ff2e55' : v < 45 ? '#ff6b85' : v <= 55 ? '#7383a6' : '#2d7bff');
      $('#hTime').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      $('#hSum').className = `sum ${tone(h.value - 50, 5, -5)}`;
      $('#hSum').textContent = `السوق ${h.label} (${h.value}/100)، ${b.ratio}% من العملات صاعدة، والمزاج ${f.label}. ` +
        (f.value <= 25 ? 'الخوف الشديد كان تاريخياً فرصة شراء.' : f.value >= 75 ? 'الطمع الشديد يرفع خطر التصحيح.' : '');
      $('#kpis').innerHTML = [['القيمة السوقية', fu(g.market_cap), ps(g.mcap_change)], ['حجم 24س', fu(g.volume), ''],
        ['هيمنة BTC', (g.dominance?.btc ?? 0).toFixed(1) + '%', ''], ['صاعدة / هابطة', `<span class="up">${b.up}</span> / <span class="down">${b.down}</span>`, '']]
        .map(([l, v, x]) => `<div class="stat"><div class="l">${l}</div><div class="v num">${v}</div>${x}</div>`).join('');
    } catch (e) { $('#hSum').innerHTML = errBox(e); }
    coins();
    try {
      const n = await api('/api/news?cat=high&limit=8');
      $('#homeNews').innerHTML = n.items.map(x => `<div class="it"><a href="#" onclick="NET.open('${esc(x.link)}');return false">${esc(x.title_ar)}</a><br><small>${esc(x.source)} · ${ago(x.t)} ${x.sentiment < 0 ? '· <span class="down">سلبي للكريبتو</span>' : x.sentiment > 0 ? '· <span class="up">إيجابي للكريبتو</span>' : ''}</small></div>`).join('') || '<div class="empty">لا أخبار عاجلة الآن</div>';
    } catch (e) { }
  };

  /* ---------- التوقعات ---------- */
  let fcData = null, fcSide = 'ups';
  $('#fcTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; fcSide = b.dataset.k; $$('#fcTabs button').forEach(x => x.classList.toggle('on', x === b)); drawFc(); };
  function drawFc() {
    if (!fcData) return;
    const up = fcSide === 'ups', list = fcData[fcSide];
    $('#fcBox').innerHTML = `<div class="sum ${fcData.gate.ok ? 'up' : 'down'}" style="margin:0 0 12px">حالة السوق: ${fcData.gate.ok ? 'داعمة' : 'حذرة'} · ${esc(fcData.gate.text)}</div>` +
      (list.map(c => { const sc = up ? c.up_score : c.down_score, t = c.levels?.t || {}, tg = up ? t.up2 : t.dn2, base = c.levels?.price || c.price;
        return `<div class="card" onclick="M.analyze('${c.symbol}')"><div class="row sb"><div class="row">${img(c.symbol)}<div><b style="color:#fff;font-size:17px">${c.symbol}</b><br><span class="num">${fp(c.price)}</span> ${ps(c.change, 1)}</div></div>
          <div style="text-align:center"><b class="num ${up ? 'up' : 'down'}" style="font-size:28px">${sc}</b><br><span class="badge ${c.conf === 'قوي' ? (up ? 'up' : 'down') : ''}">${c.conf}</span></div></div>
          <div class="msg muted">ساعة: ${c.trend_1h} · 4س: ${c.trend_4h} · 15د: ${c.trend_15m}</div>
          <ul style="margin:6px 0;padding-inline-start:18px;font-size:13px;line-height:1.8">${(up ? c.reasons_up : c.reasons_down).slice(0, 4).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
          <div class="grid2"><div class="stat"><div class="l">هدف محتمل</div><div class="num ${up ? 'up' : 'down'}" style="font-weight:700">${fp(tg)} (${pc((tg / base - 1) * 100, 1)})</div></div>
          <div class="stat"><div class="l">يُلغى إذا ${up ? 'نزل تحت' : 'صعد فوق'}</div><div class="num" style="font-weight:700;color:#fff">${fp(c.levels?.st)}</div></div></div></div>`; }).join('')
       || `<div class="empty">لا عملات ${up ? 'بإشارة صعود' : 'بإشارة هبوط'} واضحة الآن.</div>`);
  }
  loaders.fc = async () => {
    if (!fcData) $('#fcBox').innerHTML = '<div class="empty">يحلل البرنامج السوق بكل المؤشرات… (20-40 ثانية أول مرة)</div>';
    try { fcData = await api('/api/forecast'); drawFc(); } catch (e) { $('#fcBox').innerHTML = errBox(e); }
  };

  /* ---------- البوت ---------- */
  let St = null, inited = false;
  function need() {
    const a = +$('#bA').value, p = +$('#bP').value, f = (St?.fee_rate || 0.001) * 100;
    $('#need').textContent = a && p ? `يحتاج ارتفاع ${((p / a + 2 * f / 100) * 100).toFixed(2)}% (شامل الرسوم) ليربح ${p}$ صافية.` : '';
  }
  ['#bA', '#bP'].forEach(s => { $(s).oninput = need; $(s).onchange = () => api('/api/bot/settings', { amount: $('#bA').value, profit: $('#bP').value }).catch(() => { }); });
  loaders.bot = async () => {
    try { St = await api('/api/bot/status'); } catch (e) { $('#botMsg').innerHTML = errBox(e); return; }
    const s = St.settings, liveMode = s.mode === 'live', ex = St.exchanges[St.exchange].label;
    if (!inited) { $('#bA').value = s.amount; $('#bP').value = s.profit; inited = true; }
    need();
    $('#botMode').innerHTML = `<span class="badge ${liveMode ? 'live' : ''}">${ex} · ${liveMode ? 'حقيقي' : 'تجريبي'}</span>`;
    $('#autoChk').checked = St.auto;
    const bal = liveMode ? (St.account ? St.account.usdt : null) : St.paper_usdt, st = St.stats;
    const openPnl = St.open.reduce((a, t) => a + t.pnl, 0);
    $('#botKpi').innerHTML = [['الرصيد', bal == null ? '—' : bal.toFixed(2) + '$'], ['الربح المحقق', `<span class="${cl(st.pnl)}">${st.pnl >= 0 ? '+' : ''}${st.pnl.toFixed(2)}$</span>`],
      ['مفتوح الآن', `<span class="${cl(openPnl)}">${openPnl >= 0 ? '+' : ''}${openPnl.toFixed(2)}$</span>`]]
      .map(([l, v]) => `<div class="stat"><div class="l">${l}</div><div class="v num" style="font-size:16px">${v}</div></div>`).join('');
    $('#openList').innerHTML = St.open.map(t => {
      const p = live.get(t.symbol)?.p || t.price, pnl = t.qty_sell * p * (1 - (t.fee_rate || St.fee_rate)) - t.cost, prog = Math.max(0, Math.min(100, (p - t.buy_price) / (t.target_price - t.buy_price) * 100));
      return `<div class="it" style="flex-wrap:wrap">${img(t.base)}<div class="n"><b>${t.base} ${t.auto ? '<span class="badge">تلقائي</span>' : ''}</b><small>${t.amount}$ · ${ago(t.opened)} · هدف ${fp(t.target_price)}</small></div>
        <div class="p"><b class="num ${cl(pnl)}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(3)}$</b><button class="btn sm ghost" onclick="M.close('${t.id}')">بيع</button></div>
        <div class="bar" style="width:100%;margin-top:6px"><i style="width:${prog}%;background:#1ed69f"></i></div></div>`; }).join('') || '<div class="empty">لا صفقات مفتوحة</div>';
    $('#closedList').innerHTML = St.closed.slice(0, 8).map(t => `<div class="it">${img(t.base)}<div class="n"><b>${t.base}</b><small>${esc(t.close_reason)} · ${ago(t.closed)}</small></div>
      <div class="p"><b class="num ${cl(t.pnl)}">${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(3)}$</b></div></div>`).join('') || '<div class="empty">لا صفقات مغلقة بعد</div>';
    if (St.binance?.paused && St.exchange === 'binance' && liveMode) $('#botMsg').innerHTML = `<span class="down">Binance محظورة مؤقتاً، أوامر البيع المحددة تبقى تعمل. يمكنك التبديل إلى Bybit من الإعدادات.</span>`;
    if (!St.connected) $('#botMsg').innerHTML = `<span class="muted">الوضع التجريبي. لربط حسابك: المزيد ← الإعدادات.</span>`;
  };
  $('#smartBtn').onclick = async () => {
    if (St?.settings.mode === 'live' && !confirm(`شراء حقيقي بقيمة ${$('#bA').value}$ لأفضل عملة؟`)) return;
    $('#smartBtn').disabled = true; $('#botMsg').innerHTML = '<span class="flat">يختار البوت أقوى عملة… (10-30 ثانية)</span>';
    try { const t = await api('/api/bot/buy', { amount: $('#bA').value, profit: $('#bP').value }); $('#botMsg').innerHTML = `<span class="up">✅ تم شراء ${t.base} عند ${fp(t.buy_price)} · هدف البيع ${fp(t.target_price)}</span><br><small class="muted">${esc(t.reason)}</small>`; }
    catch (e) { $('#botMsg').innerHTML = `<span class="down">${esc(e.message)}</span>`; }
    $('#smartBtn').disabled = false; loaders.bot();
  };
  $('#autoChk').onchange = async e => {
    const on = e.target.checked;
    if (on && St?.settings.mode === 'live' && !confirm('تشغيل الشراء التلقائي الحقيقي؟')) { e.target.checked = false; return; }
    await api('/api/bot/auto', { on }); toast(on ? 'تم تشغيل الشراء التلقائي' : 'تم إيقاف الشراء التلقائي', on ? 'up' : ''); loaders.bot();
  };
  $('#closeAll').onclick = async () => { if (confirm('بيع كل الصفقات المفتوحة بسعر السوق؟')) { await api('/api/bot/close', { all: true }).catch(e => toast(esc(e.message), 'down')); loaders.bot(); } };
  $('#scanBtn').onclick = async () => {
    $('#cands').innerHTML = '<div class="empty">يحلل السوق…</div>';
    try {
      const r = await api('/api/bot/scan', { amount: $('#bA').value, profit: $('#bP').value });
      $('#cands').innerHTML = r.candidates.slice(0, 6).map(c => `<div class="it">${img(c.symbol)}<div class="n"><b>${c.symbol}</b><small>${esc(c.pros[0] || c.trend_1h)}</small></div>
        <div class="p"><b class="num ${c.score >= 60 ? 'up' : 'flat'}">${c.score}</b><button class="btn sm" onclick="M.buy('${c.symbol}')">شراء</button></div></div>`).join('') || '<div class="empty">لا مرشحين</div>';
    } catch (e) { $('#cands').innerHTML = errBox(e); }
  };

  /* ---------- تحليل عملة ---------- */
  let anIv = '4h', anSym = 'BTC';
  $('#ivT').onclick = e => { const b = e.target.closest('button'); if (!b) return; anIv = b.dataset.k; $$('#ivT button').forEach(x => x.classList.toggle('on', x === b)); analyze(anSym); };
  $('#qBtn').onclick = () => analyze($('#q').value);
  $('#q').onkeydown = e => { if (e.key === 'Enter') analyze($('#q').value); };
  async function analyze(sym) {
    anSym = (sym || 'BTC').toUpperCase().replace(/USDT$/, '').replace(/[^A-Z0-9]/g, '') || 'BTC';
    $('#q').value = anSym; if (view !== 'an') go('an');
    $('#anBox').innerHTML = '<div class="empty">جارٍ تحليل 25 مؤشراً…</div>';
    try {
      const [r, mtf] = await Promise.all([api(`/api/trend?symbol=${anSym}&interval=${anIv}`), api(`/api/trend/mtf?symbol=${anSym}`).catch(() => [])]);
      const col = r.cls === 'up' ? '#1ed69f' : r.cls === 'down' ? '#ff2e55' : '#58a6ff', e = r.extras || {}, m = r.ml;
      const names = { '15m': '15د', '1h': 'ساعة', '4h': '4س', '1d': 'يوم', '1w': 'أسبوع' };
      $('#anBox').innerHTML = `<div class="card" style="border-color:${col}55"><div class="row sb"><div class="row">${img(anSym)}<b style="color:#fff;font-size:18px">${anSym}</b></div>
          <div style="text-align:left"><b class="num" style="color:#fff">${fp(live.get(anSym + 'USDT')?.p || r.price)}</b><br>${ps(r.ticker?.change)}</div></div>
        <div class="verdict" style="color:${col};margin-top:8px">${r.verdict}</div>
        <div class="votebar"><i style="width:${r.bull * 4}%;background:#1ed69f">${r.bull || ''}</i><i style="width:${r.neutral * 4}%;background:#33415f">${r.neutral || ''}</i><i style="width:${r.bear * 4}%;background:#ff2e55">${r.bear || ''}</i></div>
        <div class="muted" style="font-size:12.5px">${r.bull} صاعد · ${r.neutral} محايد · ${r.bear} هابط · اتفاق ${r.agreement}%</div>
        <div class="sum ${r.cls}">${esc(r.summary[0])} ${esc(r.summary[1] || '')}</div></div>
      ${mtf.length ? `<div class="card"><h3>كل الأطر الزمنية</h3><div class="grid3" style="grid-template-columns:repeat(5,1fr);gap:6px">${mtf.map(f => `<div class="stat" style="padding:7px 4px;text-align:center"><div class="l">${names[f.interval]}</div><b class="${f.cls}" style="font-size:12px">${f.verdict}</b></div>`).join('')}</div></div>` : ''}
      <div class="grid2" style="margin-bottom:12px">
        ${m ? `<div class="stat"><div class="l">تعلم آلي: احتمال الصعود</div><div class="v num ${m.edge > 2 ? cl(m.prob_up - 50) : 'muted'}">${m.prob_up}%</div><small class="muted">${m.edge > 2 ? `أفضلية ${m.edge}%` : 'غير موثوق هنا'}</small></div>` : ''}
        ${e.targets ? `<div class="stat"><div class="l">هدف صاعد / هابط</div><div class="num" style="font-weight:700"><span class="up">${fp(e.targets.up1)}</span><br><span class="down">${fp(e.targets.dn1)}</span></div></div>` : ''}
        ${e.trend_dir ? `<div class="stat"><div class="l">Supertrend</div><div class="v ${e.trend_dir === 'صاعد' ? 'up' : 'down'}" style="font-size:16px">${e.trend_dir} · ${e.trend_age} شمعة</div></div>` : ''}
        <div class="stat"><div class="l">الحالة</div><div class="v" style="font-size:15px">${r.dormancy.squeeze ? 'انضغاط قبل حركة' : Object.values(r.dormancy.flags).filter(Boolean).length >= 3 ? 'هادئة' : 'نشطة'}</div></div></div>
      <div class="card"><h3>المؤشرات الـ25</h3>${r.indicators.map(i => `<div class="ind"><div class="h"><b>${esc(i.name)}</b><span class="badge ${i.vote > 0 ? 'up' : i.vote < 0 ? 'down' : ''} ${cl(i.vote)}">${i.vote > 0 ? 'صاعد' : i.vote < 0 ? 'هابط' : 'محايد'}</span></div><div class="s ${cl(i.vote)}">${esc(i.say)}</div></div>`).join('')}</div>
      <div class="card"><h3>تحليل الذكاء الاصطناعي</h3><div id="aiBox" class="ai"><p class="muted" style="font-size:13px">${r.summary.slice(2).map(esc).join(' ')}</p></div><button class="btn ghost" id="aiBtn">حلّل بالذكاء الاصطناعي</button></div>
      <button class="btn ghost" onclick="M.alert('${anSym}','${anIv}')">🔔 نبّهني عند تغير اتجاه ${anSym}</button>`;
      $('#aiBtn').onclick = async () => {
        $('#aiBtn').disabled = true; $('#aiBox').innerHTML = '<p class="muted">يحلل…</p>';
        try { const d = await api('/api/ai/trend', { symbol: anSym, interval: anIv }); $('#aiBox').innerHTML = md(d.text); }
        catch (er) { $('#aiBox').innerHTML = `<p class="down">${esc(er.message)}</p>`; }
        $('#aiBtn').disabled = false;
      };
    } catch (e) { $('#anBox').innerHTML = errBox(e); }
  }
  const md = t => esc(t).replace(/^###\s?(.+)$/gm, '<h3>$1</h3>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^\s*[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`).replace(/\n{2,}/g, '<br>').replace(/\n/g, ' ');
  loaders.an = () => { if (!$('#anBox').innerHTML) analyze(anSym); };

  /* ---------- المزيد ---------- */
  $('#moreMenu').onclick = e => { const a = e.target.closest('a[data-sub]'); if (!a) return; sub(a.dataset.sub); };
  async function sub(k) {
    const box = $('#subBox'); box.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    box.scrollIntoView({ behavior: 'smooth' });
    try {
      if (k === 'success') {
        const d = await api('/api/success'), w = d.filter(r => r.winning_side === 'شراء'), l = d.filter(r => r.winning_side === 'بيع');
        const row = (r, side) => `<div class="it" onclick="M.analyze('${r.symbol}')">${img(r.symbol)}<div class="n"><b>${r.symbol}</b><small>${side === 'b' ? `${r.d24.buyers_win.toFixed(0)}% من المشترين رابحون` : `${r.d24.sellers_win.toFixed(0)}% من البائعين رابحون`}</small></div><div class="p">${ps(r.d24.buyers_pnl)}</div></div>`;
        box.innerHTML = `<div class="card"><h3>🏆 الشراء ناجح في</h3><div class="list">${w.map(r => row(r, 'b')).join('') || '<div class="empty">لا عملات واضحة</div>'}</div>
          <div class="sum up">في هذه العملات أغلب من اشترى خلال 24 ساعة وأسبوع رابح الآن بعد الرسوم.</div></div>
          <div class="card"><h3>⚠️ المشترون خاسرون في</h3><div class="list">${l.map(r => row(r, 's')).join('') || '<div class="empty">لا عملات واضحة</div>'}</div></div>`;
      }
      if (k === 'news') {
        const d = await api('/api/news?limit=60');
        box.innerHTML = `<div class="card news"><h3>📰 الأخبار</h3>${d.items.map(x => `<div class="it"><a href="#" onclick="NET.open('${esc(x.link)}');return false">${esc(x.title_ar)}</a><br><small>${esc(x.source)} · ${ago(x.t)} · تأثير ${x.level}</small></div>`).join('')}</div>`;
      }
      if (k === 'markets') {
        const d = await api('/api/macro');
        box.innerHTML = `<div class="card"><h3>🥇 المعادن والأسواق</h3><div class="list">${d.map(m => `<div class="it"><div class="n"><b>${m.name}</b><small>${m.code}</small></div><div class="p"><b class="num">${fp(m.price)}</b>${ps(m.change)}</div></div>`).join('')}</div></div>`;
      }
      if (k === 'settings') return settings(box);
      if (k === 'alerts') {
        const [a, ev] = await Promise.all([api('/api/alerts'), api('/api/alerts/events?since=0')]);
        box.innerHTML = `<div class="card"><h3>🔔 تنبيه جديد</h3>
          <div class="grid2"><select class="inp" id="alT">${Object.entries(a.types).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input class="inp" id="alS" placeholder="BTC" value="BTC"></div>
          <div class="grid2" style="margin-top:8px"><input class="inp num" id="alV" type="number" inputmode="decimal" placeholder="السعر (لتنبيهات السعر)"><button class="btn" id="alAdd">إضافة</button></div>
          <div class="msg muted">تُفحص التنبيهات كل دقيقة ما دام التطبيق مفتوحاً أو في الخلفية القريبة.</div></div>
          <div class="card"><h3>تنبيهاتي</h3><div class="list">${a.rules.map(r => `<div class="it"><div class="n"><b>${esc(r.symbol)} · ${esc(a.types[r.type])} ${r.value || ''}</b><small>${r.active ? 'فعال' : 'متوقف'}</small></div><button class="btn sm ghost" onclick="M.delAlert('${r.id}')">حذف</button></div>`).join('') || '<div class="empty">لا تنبيهات بعد</div>'}</div></div>
          <div class="card"><h3>السجل</h3><div class="list">${ev.events.slice(-20).reverse().map(e => `<div class="it"><div class="n"><b class="${e.level === 'up' ? 'up' : e.level === 'down' ? 'down' : ''}">${esc(e.title)}</b><small>${esc(e.body)} · ${ago(e.t)}</small></div></div>`).join('') || '<div class="empty">لا شيء بعد</div>'}</div></div>`;
        $('#alAdd').onclick = async () => { await api('/api/alerts/add', { type: $('#alT').value, symbol: $('#alS').value, value: $('#alV').value }); toast('تمت إضافة التنبيه', 'up'); sub('alerts'); };
      }
      if (k === 'about') {
        box.innerHTML = `<div class="card" style="text-align:center"><img src="icon.svg" width="72" height="72" alt=""><h3 style="justify-content:center;direction:ltr">CRYPTO X</h3>
          <p class="muted" style="font-size:14px;line-height:1.9">مركز التحليل الذكي لسوق العملات الرقمية: بيانات حية، 25 مؤشراً، تعلم آلي، توقعات، بوت تداول على Binance وBybit، وأخبار مترجمة. يعمل مستقلاً على جوالك بالكامل.</p>
          <p style="color:#fff;font-weight:700">تطوير أبو عبدالله الشامي</p>
          <a class="btn ghost" style="display:block" href="#" onclick="NET.open('https://wa.me/963968744241');return false">تواصل مع المطور (واتساب)</a>

          <p class="muted" style="font-size:12px;margin-top:12px">التحليلات آلية وليست نصيحة استثمارية.</p></div>`;
      }
    } catch (e) { box.innerHTML = errBox(e); }
  }

  /* ---------- الإعدادات ---------- */
  async function settings(box) {
    const St = await api('/api/bot/status'), ex = St.exchanges, s = St.settings;
    box.innerHTML = `<div class="card"><h3>⚙️ منصة التداول</h3>
      <div class="seg" id="exSeg">${['binance', 'bybit'].map(x => `<button data-x="${x}" class="${s.exchange === x ? 'on' : ''}">${ex[x].label} ${ex[x].connected ? '✓' : ''}</button>`).join('')}</div>
      <div class="seg" id="mdSeg"><button data-m="paper" class="${s.mode === 'paper' ? 'on' : ''}">تجريبي</button><button data-m="live" class="${s.mode === 'live' ? 'on' : ''}" style="${s.mode === 'live' ? 'background:var(--red)' : ''}">حقيقي</button></div>
      <div class="msg">${ex[s.exchange].connected ? `<span class="up">${ex[s.exchange].label} مربوط</span> · <span class="num muted">${esc(ex[s.exchange].masked)}</span>` : `<span class="muted">${ex[s.exchange].label} غير مربوط: البوت يعمل تجريبياً برصيد افتراضي 1000$.</span>`}</div>
      <input class="inp" id="kK" placeholder="API Key" autocomplete="off" style="margin-top:10px"><input class="inp" id="kS" type="password" placeholder="Secret Key" autocomplete="off" style="margin-top:8px">
      <button class="btn" id="kSave" style="margin-top:8px">ربط ${ex[s.exchange].label}</button>
      ${ex[s.exchange].connected ? `<button class="btn ghost" id="kDel" style="margin-top:8px">حذف المفاتيح</button>` : ''}
      <div class="msg muted">${s.exchange === 'bybit' ? 'Bybit ← API ← مفتاح Read-Write بصلاحية Spot Trade فقط.' : 'Binance ← إدارة API ← فعّل التداول الفوري فقط.'} لا تفعّل السحب أبداً. المفاتيح تُحفظ مشفّرة داخل الجوال فقط.</div>
      <div class="grid2" style="margin-top:10px"><label class="fld">وقف خسارة % (0 = بدون)<input class="inp num" id="sStop" type="number" value="${s.stop_pct}"></label>
        <label class="fld">أقصى صفقات تلقائية<input class="inp num" id="sMax" type="number" value="${s.max_trades}"></label></div></div>
      <div class="card"><h3>🤖 الذكاء الاصطناعي (اختياري)</h3><input class="inp" id="aiK" type="password" placeholder="${NET.secret.get('anthropic') ? 'المفتاح محفوظ ✓' : 'مفتاح Anthropic: sk-ant-…'}">
        <button class="btn ghost" id="aiSave" style="margin-top:8px">حفظ</button><div class="msg muted">من console.anthropic.com. بدونه تعمل كل التحليلات الأخرى.</div></div>`;
    $('#exSeg').onclick = async e => { const b = e.target.closest('button'); if (!b) return; await api('/api/bot/settings', { exchange: b.dataset.x }); settings(box); };
    $('#mdSeg').onclick = async e => { const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.m === 'live' && !confirm('في الوضع الحقيقي ينفذ البوت أوامر فعلية بأموالك وقد تخسر. متابعة؟')) return;
      try { await api('/api/bot/settings', { mode: b.dataset.m }); } catch (er) { toast(esc(er.message), 'down'); } settings(box); };
    $('#kSave').onclick = async () => { $('#kSave').disabled = true;
      try { const r = await api('/api/bot/keys', { exchange: s.exchange, key: $('#kK').value, secret: $('#kS').value }); toast(r.warning ? esc(r.warning) : 'تم الربط بنجاح ✓', r.warning ? '' : 'up'); settings(box); }
      catch (er) { toast(esc(er.message), 'down'); $('#kSave').disabled = false; } };
    if ($('#kDel')) $('#kDel').onclick = async () => { if (confirm('حذف المفاتيح من الجوال؟')) { await api('/api/bot/keys', { exchange: s.exchange, clear: true }); settings(box); } };
    ['#sStop', '#sMax'].forEach(id => $(id).onchange = () => api('/api/bot/settings', { stop_pct: $('#sStop').value || 0, max_trades: $('#sMax').value }));
    $('#aiSave').onclick = () => { NET.secret.set('anthropic', $('#aiK').value.trim()); toast($('#aiK').value.trim() ? 'تم حفظ المفتاح' : 'تم حذف المفتاح', 'up'); settings(box); };
  }

  /* ---------- إشعارات التنبيهات ---------- */
  let evSince = null;
  async function events() {
    try {
      const d = await api(`/api/alerts/events?since=${evSince ?? 0}`);
      if (evSince === null) { evSince = d.seq; return; }
      d.events.forEach(e => { toast(`<b>${esc(e.title)}</b><br>${esc(e.body)}`, e.level); if (navigator.vibrate) navigator.vibrate(120); });
      if (d.events.length) evSince = d.events.at(-1).id;
    } catch (e) { }
  }

  /* ---------- السحب للتحديث ---------- */
  let y0 = null;
  addEventListener('touchstart', e => { y0 = scrollY === 0 ? e.touches[0].clientY : null; }, { passive: true });
  addEventListener('touchmove', e => { if (y0 != null) { const d = e.touches[0].clientY - y0; $('#ptr').style.height = d > 20 ? `${Math.min(40, d / 3)}px` : '0'; } }, { passive: true });
  addEventListener('touchend', () => { if (parseInt($('#ptr').style.height) >= 30) { $('#ptr').textContent = 'جارٍ التحديث…'; loaders[view]?.(); }
    setTimeout(() => { $('#ptr').style.height = '0'; $('#ptr').textContent = 'اسحب للتحديث'; }, 600); y0 = null; });

  /* ---------- التشغيل ---------- */
  window.M = {
    analyze, close: async id => { if (confirm('بيع هذه الصفقة الآن بسعر السوق؟')) { await api('/api/bot/close', { id }).catch(e => toast(esc(e.message), 'down')); loaders.bot(); } },
    buy: async s => { if (St?.settings.mode === 'live' && !confirm(`شراء حقيقي لـ ${s}؟`)) return; try { const t = await api('/api/bot/buy', { symbol: s, amount: $('#bA').value, profit: $('#bP').value }); toast(`✅ تم شراء ${t.base}`, 'up'); } catch (e) { toast(esc(e.message), 'down'); } loaders.bot(); },
    delAlert: async id => { await api('/api/alerts/del', { id }); sub('alerts'); },
    alert: async (s, iv) => { try { await api('/api/alerts/add', { type: 'trend_change', symbol: s, interval: iv, repeat: true }); toast(`سيصلك تنبيه عند تغير اتجاه ${s}`, 'up'); } catch (e) { toast(esc(e.message), 'down'); } },
  };
  connectWS(); pollPrices().then(() => { ticker(); coins(); });
  setInterval(() => { ticker(); if (view === 'home') coins(); }, 15000);
  setInterval(pollPrices, 60000);
  health(); setInterval(health, 8000);
  events(); setInterval(events, 15000);
  setTimeout(() => ENG.checkAlerts(), 20000); setInterval(() => ENG.checkAlerts(), 60000);
  setInterval(() => { if (view === 'bot') loaders.bot(); }, 10000);
  const h0 = location.hash.slice(1);
  go(['home', 'fc', 'bot', 'an', 'more'].includes(h0) ? h0 : 'home');
  addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h !== view && ['home', 'fc', 'bot', 'an', 'more'].includes(h)) go(h); });
})();
