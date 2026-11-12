/* المؤشرات الفنية ومحرك اتجاه 25 مؤشراً — يعمل بالكامل على الجوال */
const IND = (() => {
  const N = NaN, isN = x => x == null || Number.isNaN(x) || !Number.isFinite(x);
  const fill = (n, v = N) => new Array(n).fill(v);
  const ema = (a, n) => { const k = 2 / (n + 1), o = fill(a.length); let p = N; for (let i = 0; i < a.length; i++) { const x = a[i]; if (isN(x)) { o[i] = p; continue; } p = isN(p) ? x : x * k + p * (1 - k); o[i] = p; } return o; };
  const rma = (a, n) => { const k = 1 / n, o = fill(a.length); let p = N; for (let i = 0; i < a.length; i++) { const x = a[i]; if (isN(x)) { o[i] = p; continue; } p = isN(p) ? x : x * k + p * (1 - k); o[i] = p; } return o; };
  const sma = (a, n) => { const o = fill(a.length); let s = 0, c = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  const roll = (a, n, f) => { const o = fill(a.length); for (let i = n - 1; i < a.length; i++) o[i] = f(a.slice(i - n + 1, i + 1)); return o; };
  const std = (a, n) => roll(a, n, w => { const m = w.reduce((x, y) => x + y, 0) / n; return Math.sqrt(w.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1)); });
  const max = (a, n) => roll(a, n, w => Math.max(...w)), min = (a, n) => roll(a, n, w => Math.min(...w));
  const sub = (a, b) => a.map((x, i) => x - (Array.isArray(b) ? b[i] : b));
  const diff = a => a.map((x, i) => i ? x - a[i - 1] : 0);
  const shift = (a, n) => a.map((_, i) => i - n >= 0 && i - n < a.length ? a[i - n] : N);
  const last = a => { for (let i = a.length - 1; i >= 0; i--) if (!isN(a[i])) return a[i]; return N; };
  const fix = (x, d = 6) => isN(x) ? null : +(+x).toFixed(d);

  function rsi(c, n = 14) {
    const d = diff(c), up = rma(d.map(x => Math.max(x, 0)), n), dn = rma(d.map(x => Math.max(-x, 0)), n);
    return up.map((u, i) => dn[i] === 0 ? (u === 0 ? 50 : 100) : 100 - 100 / (1 + u / dn[i]));
  }
  function macd(c) { const m = sub(ema(c, 12), ema(c, 26)), s = ema(m, 9); return [m, s, sub(m, s)]; }
  function boll(c, n = 20, k = 2) { const m = sma(c, n), sd = std(c, n); return [m.map((x, i) => x + k * sd[i]), m, m.map((x, i) => x - k * sd[i])]; }
  function tr(K) { return K.h.map((h, i) => i ? Math.max(h - K.l[i], Math.abs(h - K.c[i - 1]), Math.abs(K.l[i] - K.c[i - 1])) : h - K.l[i]); }
  const atr = (K, n = 14) => rma(tr(K), n);
  function adx(K, n = 14) {
    const up = diff(K.h), dn = K.l.map((x, i) => i ? K.l[i - 1] - x : 0);
    const pdm = up.map((u, i) => u > dn[i] && u > 0 ? u : 0), mdm = dn.map((d, i) => d > up[i] && d > 0 ? d : 0);
    const a = atr(K, n), pdi = rma(pdm, n).map((x, i) => 100 * x / a[i]), mdi = rma(mdm, n).map((x, i) => 100 * x / a[i]);
    const dx = pdi.map((p, i) => (p + mdi[i]) ? 100 * Math.abs(p - mdi[i]) / (p + mdi[i]) : 0);
    return [rma(dx, n).map(x => isN(x) ? 0 : x), pdi.map(x => isN(x) ? 0 : x), mdi.map(x => isN(x) ? 0 : x)];
  }
  function stoch(K, n = 14) {
    const ll = min(K.l, n), hh = max(K.h, n);
    let k = K.c.map((c, i) => hh[i] - ll[i] ? 100 * (c - ll[i]) / (hh[i] - ll[i]) : N);
    k = sma(k.map(x => isN(x) ? 50 : x), 3); const d = sma(k.map(x => isN(x) ? 50 : x), 3);
    return [k.map(x => isN(x) ? 50 : x), d.map(x => isN(x) ? 50 : x)];
  }
  function obv(K) { let s = 0; return K.c.map((c, i) => (s += i ? Math.sign(c - K.c[i - 1]) * K.v[i] : 0)); }
  function mfi(K, n = 14) {
    const tp = K.c.map((c, i) => (K.h[i] + K.l[i] + c) / 3), mf = tp.map((t, i) => t * K.v[i]);
    const pos = roll(mf.map((m, i) => i && tp[i] > tp[i - 1] ? m : 0), n, w => w.reduce((a, b) => a + b, 0));
    const neg = roll(mf.map((m, i) => i && tp[i] < tp[i - 1] ? m : 0), n, w => w.reduce((a, b) => a + b, 0));
    return pos.map((p, i) => isN(p) ? 50 : neg[i] ? 100 - 100 / (1 + p / neg[i]) : 50);
  }
  function cci(K, n = 20) {
    const tp = K.c.map((c, i) => (K.h[i] + K.l[i] + c) / 3), m = sma(tp, n);
    const md = roll(tp, n, w => { const mm = w.reduce((a, b) => a + b, 0) / n; return w.reduce((a, b) => a + Math.abs(b - mm), 0) / n; });
    return tp.map((t, i) => md[i] ? (t - m[i]) / (0.015 * md[i]) : 0);
  }
  function will(K, n = 14) { const hh = max(K.h, n), ll = min(K.l, n); return K.c.map((c, i) => hh[i] - ll[i] ? -100 * (hh[i] - c) / (hh[i] - ll[i]) : -50); }
  function psar(K, step = 0.02, mx = 0.2) {
    const h = K.h, l = K.l, n = h.length, sar = fill(n, 0), t = fill(n, 1);
    let up = true, af = step, ep = h[0]; sar[0] = l[0];
    for (let i = 1; i < n; i++) {
      sar[i] = sar[i - 1] + af * (ep - sar[i - 1]);
      if (up) { sar[i] = Math.min(sar[i], l[i - 1], i > 1 ? l[i - 2] : l[i - 1]);
        if (l[i] < sar[i]) { up = false; sar[i] = ep; ep = l[i]; af = step; } else if (h[i] > ep) { ep = h[i]; af = Math.min(af + step, mx); } }
      else { sar[i] = Math.max(sar[i], h[i - 1], i > 1 ? h[i - 2] : h[i - 1]);
        if (h[i] > sar[i]) { up = true; sar[i] = ep; ep = h[i]; af = step; } else if (l[i] < ep) { ep = l[i]; af = Math.min(af + step, mx); } }
      t[i] = up ? 1 : -1;
    }
    return [sar, t];
  }
  function supertrend(K, n = 10, m = 3) {
    const a = atr(K, n), c = K.c, len = c.length, hl2 = K.h.map((h, i) => (h + K.l[i]) / 2);
    const ub = hl2.map((x, i) => x + m * a[i]), lb = hl2.map((x, i) => x - m * a[i]), fu = ub.slice(), fl = lb.slice(), d = fill(len, 1);
    for (let i = 1; i < len; i++) {
      fu[i] = ub[i] < fu[i - 1] || c[i - 1] > fu[i - 1] ? ub[i] : fu[i - 1];
      fl[i] = lb[i] > fl[i - 1] || c[i - 1] < fl[i - 1] ? lb[i] : fl[i - 1];
      d[i] = c[i] > fu[i - 1] ? 1 : c[i] < fl[i - 1] ? -1 : d[i - 1];
    }
    return [d.map((x, i) => x > 0 ? fl[i] : fu[i]), d];
  }
  function linreg(c, n = 50) {
    const xm = [...Array(n).keys()].map(x => x - (n - 1) / 2), sxx = xm.reduce((a, x) => a + x * x, 0);
    return roll(c, n, w => { const my = w.reduce((a, b) => a + b, 0) / n; let sxy = 0, syy = 0;
      w.forEach((y, i) => { sxy += xm[i] * (y - my); syy += (y - my) ** 2; });
      const b = sxy / sxx, r2 = syy ? sxy * sxy / (sxx * syy) : 0; return b / my * 100 * (r2 > 0.25 ? 1 : 0.0001); });
  }
  function wma(a, n) { const w = [...Array(n).keys()].map(x => x + 1), s = w.reduce((x, y) => x + y, 0); return roll(a, n, v => v.reduce((t, x, i) => t + x * w[i], 0) / s); }
  function hma(a, n = 21) { const h = wma(a, n >> 1), f = wma(a, n); return wma(h.map((x, i) => 2 * x - f[i]).map(x => isN(x) ? 0 : x), Math.floor(Math.sqrt(n))); }

  /* ---------- تصويت 25 مؤشراً على كامل التاريخ ---------- */
  const s3 = (u, d) => u.map((x, i) => x ? 1 : d[i] ? -1 : 0);
  function compute(K) {
    const c = K.c, h = K.h, l = K.l, v = K.v, n = c.length;
    const e9 = ema(c, 9), e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), s20 = sma(c, 20);
    const [m, ms, mh] = macd(c), [ad, pdi, mdi] = adx(K), [sar, sart] = psar(K);
    const ten = max(h, 9).map((x, i) => (x + min(l, 9)[i]) / 2), kij = max(h, 26).map((x, i) => (x + min(l, 26)[i]) / 2);
    const spa = shift(ten.map((x, i) => (x + kij[i]) / 2), 26), h52 = max(h, 52), l52 = min(l, 52), spb = shift(h52.map((x, i) => (x + l52[i]) / 2), 26);
    const [stl, std_] = supertrend(K);
    const arU = roll(h, 26, w => 100 * w.indexOf(Math.max(...w)) / 25), arD = roll(l, 26, w => 100 * w.indexOf(Math.min(...w)) / 25);
    const lr = linreg(c, 50), hm = hma(c, 21), r = rsi(c), [k, d] = stoch(K);
    const rmin = min(r, 14), rmax = max(r, 14), srsi = sma(r.map((x, i) => rmax[i] - rmin[i] ? 100 * (x - rmin[i]) / (rmax[i] - rmin[i]) : 50), 3).map(x => isN(x) ? 50 : x);
    const cc = cci(K), wr = will(K), roc = c.map((x, i) => i >= 12 ? (x / c[i - 12] - 1) * 100 : 0);
    const med = h.map((x, i) => (x + l[i]) / 2), ao = sub(sma(med, 5), sma(med, 34));
    const t1 = ema(ema(ema(c, 15), 15), 15), trix = t1.map((x, i) => i ? (x / t1[i - 1] - 1) * 10000 : 0), trs = ema(trix, 9);
    const ob = obv(K), obs = sub(ema(ob, 10), ema(ob, 30)), mf = mfi(K);
    const mfm = c.map((x, i) => h[i] - l[i] ? ((x - l[i]) - (h[i] - x)) / (h[i] - l[i]) : 0);
    const mfv = roll(mfm.map((x, i) => x * v[i]), 20, w => w.reduce((a, b) => a + b, 0)), vs = roll(v, 20, w => w.reduce((a, b) => a + b, 0)), cmf = mfv.map((x, i) => vs[i] ? x / vs[i] : 0);
    const tp = c.map((x, i) => (h[i] + l[i] + x) / 3), tpv = roll(tp.map((x, i) => x * v[i]), 50, w => w.reduce((a, b) => a + b, 0)), v50 = roll(v, 50, w => w.reduce((a, b) => a + b, 0)), vwap = tpv.map((x, i) => x / v50[i]);
    const gt = (a, b) => a.map((x, i) => x > (Array.isArray(b) ? b[i] : b)), lt = (a, b) => a.map((x, i) => x < (Array.isArray(b) ? b[i] : b));
    const pct = (a, b) => a.map((x, i) => (x / b[i] - 1) * 100);
    const cloud = spa.map((x, i) => Math.max(x, spb[i]));
    const V = [
      ['EMA 9/21', 'الاتجاه', s3(gt(e9, e21), lt(e9, e21)), pct(e9, e21), 'تقاطع المتوسطين القصيرين'],
      ['SMA 20', 'الاتجاه', s3(c.map((x, i) => x > s20[i] * 1.002), c.map((x, i) => x < s20[i] * 0.998)), pct(c, s20), 'السعر مقابل متوسط 20'],
      ['EMA 50', 'الاتجاه', s3(gt(c, e50), lt(c, e50)), pct(c, e50), 'السعر مقابل متوسط 50'],
      ['EMA 200', 'الاتجاه', s3(gt(c, e200), lt(c, e200)), pct(c, e200), 'الاتجاه طويل المدى'],
      ['EMA 50/200', 'الاتجاه', s3(gt(e50, e200), lt(e50, e200)), pct(e50, e200), 'التقاطع الذهبي / تقاطع الموت'],
      ['MACD', 'الاتجاه', s3(m.map((x, i) => x > ms[i] && i && mh[i] > mh[i - 1]), m.map((x, i) => x < ms[i] && i && mh[i] < mh[i - 1])), mh, 'خط الماكد مقابل الإشارة وتسارع الهيستوغرام'],
      ['ADX / DMI', 'الاتجاه', s3(ad.map((x, i) => x > 20 && pdi[i] > mdi[i]), ad.map((x, i) => x > 20 && mdi[i] > pdi[i])), ad, 'قوة الاتجاه واتجاهه'],
      ['Parabolic SAR', 'الاتجاه', sart, sar, 'نقاط التوقف والانعكاس'],
      ['Ichimoku', 'الاتجاه', s3(c.map((x, i) => x > spa[i] && x > spb[i]), c.map((x, i) => x < spa[i] && x < spb[i])), pct(c, cloud), 'السعر مقابل السحابة'],
      ['Supertrend', 'الاتجاه', std_, stl, 'مؤشر الاتجاه الفائق (10، 3)'],
      ['Aroon', 'الاتجاه', s3(arU.map((x, i) => x - arD[i] > 40), arU.map((x, i) => x - arD[i] < -40)), arU.map((x, i) => x - arD[i]), 'زمن آخر قمة مقابل آخر قاع'],
      ['انحدار خطي 50', 'الاتجاه', s3(gt(lr, 0.02), lt(lr, -0.02)), lr, 'ميل خط الانحدار (% لكل شمعة)'],
      ['Hull MA', 'الاتجاه', s3(hm.map((x, i) => i > 1 && x > hm[i - 2]), hm.map((x, i) => i > 1 && x < hm[i - 2])), hm, 'اتجاه متوسط هال السريع'],
      ['RSI 14', 'الزخم', s3(gt(r, 55), lt(r, 45)), r, 'مؤشر القوة النسبية'],
      ['Stochastic', 'الزخم', s3(k.map((x, i) => x > d[i] && x > 50), k.map((x, i) => x < d[i] && x < 50)), k, 'العشوائي %K مقابل %D'],
      ['Stoch RSI', 'الزخم', s3(gt(srsi, 60), lt(srsi, 40)), srsi, 'عشوائي القوة النسبية'],
      ['CCI 20', 'الزخم', s3(gt(cc, 50), lt(cc, -50)), cc, 'مؤشر قناة السلع'],
      ['Williams %R', 'الزخم', s3(gt(wr, -40), lt(wr, -60)), wr, 'مؤشر ويليامز'],
      ['ROC 12', 'الزخم', s3(gt(roc, 1), lt(roc, -1)), roc, 'معدل التغير خلال 12 شمعة'],
      ['Awesome Osc.', 'الزخم', s3(ao.map((x, i) => x > 0 && i && x > ao[i - 1]), ao.map((x, i) => x < 0 && i && x < ao[i - 1])), ao, 'المذبذب الرائع'],
      ['TRIX', 'الزخم', s3(gt(trix, trs), lt(trix, trs)), trix, 'المتوسط الثلاثي مقابل إشارته'],
      ['OBV', 'الحجم', s3(gt(obs, 0), lt(obs, 0)), obs, 'اتجاه حجم التوازن'],
      ['MFI 14', 'الحجم', s3(gt(mf, 55), lt(mf, 45)), mf, 'مؤشر تدفق الأموال'],
      ['CMF 20', 'الحجم', s3(gt(cmf, 0.05), lt(cmf, -0.05)), cmf, 'تدفق أموال تشايكن'],
      ['VWAP 50', 'الحجم', s3(c.map((x, i) => x > vwap[i]), c.map((x, i) => x < vwap[i])), pct(c, vwap), 'السعر مقابل متوسط السعر المرجح بالحجم'],
    ];
    const net = fill(n, 0); V.forEach(x => x[2].forEach((vv, i) => net[i] += vv || 0));
    const [bu, bm, bl] = boll(c), vr = v.map((x, i) => { const a = sma(v, 20)[i]; return a ? Math.log(Math.min(20, Math.max(0.05, x / a))) / 3 : 0; });
    const clip = (x, a, b) => Math.min(b, Math.max(a, x));
    const feats = c.map((_, i) => [r[i] / 100 - .5, k[i] / 100 - .5, srsi[i] / 100 - .5, clip(cc[i], -300, 300) / 300, wr[i] / 100 + .5, clip(roc[i], -30, 30) / 30,
      clip(mh[i] / c[i] * 100, -3, 3), ad[i] / 50 * Math.sign(pdi[i] - mdi[i]), clip(c[i] / e50[i] - 1, -.3, .3) * 5, clip(c[i] / e200[i] - 1, -.6, .6) * 2,
      clip((c[i] - bl[i]) / (bu[i] - bl[i]), -.5, 1.5) - .5, mf[i] / 100 - .5, clip(cmf[i], -.5, .5) * 2, (arU[i] - arD[i]) / 100, clip(lr[i], -1, 1),
      clip(trix[i] - trs[i], -20, 20) / 20, vr[i], std_[i], net[i] / 25]);
    return { V, net, feats, x: { adx: ad, rsi: r, std: std_, stl, atr: atr(K), bb: [bu, bm, bl], kcm: ema(c, 20), kca: atr(K, 20) } };
  }

  const SAY = {
    'EMA 9/21': v => ['المتوسط السريع فوق البطيء: زخم قصير صاعد', 'المتوسط السريع تحت البطيء: زخم قصير هابط', 'المتوسطان متقاربان: لا اتجاه قصير'],
    'SMA 20': v => [`السعر أعلى من متوسط 20 بـ ${v.toFixed(2)}%: المشترون مسيطرون مؤخراً`, `السعر أدنى من متوسط 20 بـ ${Math.abs(v).toFixed(2)}%: البائعون مسيطرون مؤخراً`, 'السعر ملاصق لمتوسط 20: توازن'],
    'EMA 50': v => [`السعر فوق متوسط 50 (${v.toFixed(2)}%): الاتجاه المتوسط إيجابي`, `السعر تحت متوسط 50 (${v.toFixed(2)}%): الاتجاه المتوسط سلبي`, 'عند متوسط 50'],
    'EMA 200': v => [`فوق متوسط 200 (${v.toFixed(2)}%): الاتجاه الكبير صاعد`, `تحت متوسط 200 (${v.toFixed(2)}%): الاتجاه الكبير هابط`, 'عند متوسط 200'],
    'EMA 50/200': v => ['متوسط 50 فوق 200 (تقاطع ذهبي): بيئة صعود', 'متوسط 50 تحت 200 (تقاطع الموت): بيئة هبوط', 'المتوسطان متلاصقان'],
    'MACD': v => ['الماكد فوق خط الإشارة ويتسارع: زخم شراء يزداد', 'الماكد تحت خط الإشارة ويتسارع: زخم بيع يزداد', 'الماكد بلا تسارع واضح'],
    'ADX / DMI': v => [`اتجاه صاعد بقوة ${v.toFixed(0)}: الصعود له زخم حقيقي`, `اتجاه هابط بقوة ${v.toFixed(0)}: الهبوط له زخم حقيقي`, `قوة الاتجاه ${v.toFixed(0)} فقط: السوق بلا اتجاه واضح`],
    'Parabolic SAR': v => ['النقاط تحت السعر: الاتجاه صاعد ما لم يكسرها', 'النقاط فوق السعر: الاتجاه هابط ما لم يخترقها', 'محايد'],
    'Ichimoku': v => ['السعر فوق السحابة: اتجاه صاعد مؤكد', 'السعر تحت السحابة: اتجاه هابط مؤكد', 'السعر داخل السحابة: منطقة حيرة'],
    'Supertrend': v => ['المؤشر أخضر: الاتجاه صاعد ومستوى الوقف تحت السعر', 'المؤشر أحمر: الاتجاه هابط ومستوى الانعكاس فوق السعر', 'محايد'],
    'Aroon': v => ['القمم الجديدة أحدث من القيعان: سيطرة صاعدة', 'القيعان الجديدة أحدث من القمم: سيطرة هابطة', 'لا قمم ولا قيعان جديدة واضحة'],
    'انحدار خطي 50': v => [`خط الاتجاه يميل للأعلى (${v.toFixed(3)}% لكل شمعة)`, `خط الاتجاه يميل للأسفل (${v.toFixed(3)}% لكل شمعة)`, 'الحركة غير منتظمة: لا ميل واضح'],
    'Hull MA': v => ['المتوسط السريع يتجه للأعلى: تحسن فوري', 'المتوسط السريع يتجه للأسفل: ضعف فوري', 'المتوسط مسطح'],
    'RSI 14': v => [`القوة النسبية ${v.toFixed(0)}: زخم إيجابي${v > 70 ? ' لكنه قريب من التشبع الشرائي' : ''}`, `القوة النسبية ${v.toFixed(0)}: زخم سلبي${v < 30 ? ' وقريب من التشبع البيعي (ارتداد محتمل)' : ''}`, `القوة النسبية ${v.toFixed(0)}: منطقة محايدة`],
    'Stochastic': v => [`العشوائي ${v.toFixed(0)} ويتقاطع للأعلى: دفعة شراء`, `العشوائي ${v.toFixed(0)} ويتقاطع للأسفل: دفعة بيع`, `العشوائي ${v.toFixed(0)}: بلا إشارة`],
    'Stoch RSI': v => [`${v.toFixed(0)}: الزخم القصير جداً قوي`, `${v.toFixed(0)}: الزخم القصير جداً ضعيف`, `${v.toFixed(0)}: محايد`],
    'CCI 20': v => [`${v.toFixed(0)}: السعر أعلى من متوسطه بوضوح`, `${v.toFixed(0)}: السعر أدنى من متوسطه بوضوح`, `${v.toFixed(0)}: السعر قرب متوسطه`],
    'Williams %R': v => [`${v.toFixed(0)}: الإغلاق قريب من أعلى المدى`, `${v.toFixed(0)}: الإغلاق قريب من أدنى المدى`, `${v.toFixed(0)}: الإغلاق في منتصف المدى`],
    'ROC 12': v => [`ارتفع ${v.toFixed(2)}% خلال 12 شمعة`, `انخفض ${Math.abs(v).toFixed(2)}% خلال 12 شمعة`, `تغير ${v.toFixed(2)}% فقط خلال 12 شمعة`],
    'Awesome Osc.': v => ['موجب ويتزايد: الزخم يقوى', 'سالب ويتناقص: الزخم يضعف', 'متذبذب: الزخم يتغير'],
    'TRIX': v => ['فوق إشارته: الاتجاه المتوسط يتحسن', 'تحت إشارته: الاتجاه المتوسط يضعف', 'محايد'],
    'OBV': v => ['الحجم يدخل مع الصعود: تجميع', 'الحجم يخرج مع الهبوط: تصريف', 'الحجم متوازن'],
    'MFI 14': v => [`${v.toFixed(0)}: أموال تدخل العملة`, `${v.toFixed(0)}: أموال تخرج من العملة`, `${v.toFixed(0)}: تدفق محايد`],
    'CMF 20': v => [`${v.toFixed(2)}: ضغط شراء مستمر`, `${v.toFixed(2)}: ضغط بيع مستمر`, `${v.toFixed(2)}: لا ضغط واضح`],
    'VWAP 50': v => [`السعر فوق متوسط الحجم بـ ${v.toFixed(2)}%: المشترون يدفعون أكثر`, `السعر تحت متوسط الحجم بـ ${Math.abs(v).toFixed(2)}%`, 'عند متوسط الحجم'],
  };
  const say = (name, vote, v) => { const t = SAY[name]?.(v || 0); return t ? t[vote > 0 ? 0 : vote < 0 ? 1 : 2] : ''; };

  function classify(net, flags, adxv) {
    const dorm = Object.values(flags).filter(Boolean).length;
    if (Math.abs(net) <= 4 || (dorm >= 3 && Math.abs(net) < 10) || (adxv < 15 && Math.abs(net) < 8))
      return [flags.squeeze ? 'خامل (انضغاط قبل حركة)' : 'خامل', 'flat'];
    return net > 0 ? [net >= 13 ? 'صاعد بقوة' : 'صاعد', 'up'] : [net <= -13 ? 'هابط بقوة' : 'هابط', 'down'];
  }
  const rank = (a, x) => { const w = a.slice(-200).filter(v => !isN(v)); return w.filter(v => v <= x).length / w.length * 100; };

  function dormancy(K, X) {
    const c = K.c, n = c.length - 1, [bu, bm, bl] = X.bb, bbw = bu.map((u, i) => (u - bl[i]) / bm[i]);
    const atrp = X.atr.map((a, i) => a / c[i] * 100), volr = (K.v.slice(-5).reduce((a, b) => a + b, 0) / 5) / (K.v.slice(-50).reduce((a, b) => a + b, 0) / 50);
    const squeeze = bu[n] < X.kcm[n] + 1.5 * X.kca[n] && bl[n] > X.kcm[n] - 1.5 * X.kca[n];
    const hh = Math.max(...K.h.slice(-20)), ll = Math.min(...K.l.slice(-20)), adxv = X.adx[n];
    const flags = { low_adx: adxv < 20, narrow_bb: rank(bbw, bbw[n]) < 25, low_atr: rank(atrp, atrp[n]) < 25, low_volume: volr < 0.75, squeeze };
    return { flags, bb_width_rank: fix(rank(bbw, bbw[n]), 1), atr_pct: fix(atrp[n], 3), atr_rank: fix(rank(atrp, atrp[n]), 1), volume_ratio: fix(volr, 2),
             donchian_pct: fix((hh - ll) / c[n] * 100, 2), adx: fix(adxv, 1), squeeze };
  }

  /* ---------- تعلم آلي (انحدار لوجستي) ---------- */
  function logistic(X, y, lr = 0.3, ep = 400, l2 = 0.01) {
    const m = X[0].length; let w = new Array(m).fill(0), b = 0;
    for (let e = 0; e < ep; e++) {
      const g = new Array(m).fill(0); let gb = 0;
      for (let i = 0; i < X.length; i++) { let z = b; for (let j = 0; j < m; j++) z += X[i][j] * w[j]; const p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))), d = p - y[i];
        for (let j = 0; j < m; j++) g[j] += d * X[i][j]; gb += d; }
      for (let j = 0; j < m; j++) w[j] -= lr * (g[j] / X.length + l2 * w[j]); b -= lr * gb / X.length;
    }
    return [w, b];
  }
  const FN = ['RSI', 'Stochastic', 'Stoch RSI', 'CCI', 'Williams', 'ROC', 'MACD', 'ADX/DMI', 'البعد عن EMA50', 'البعد عن EMA200', 'موقع بولينجر', 'MFI', 'CMF', 'Aroon', 'الانحدار', 'TRIX', 'الحجم النسبي', 'Supertrend', 'صافي الأصوات'];
  const HZ = { '15m': 8, '1h': 6, '4h': 6, '1d': 5, '1w': 4 };
  function ml(K, feats, iv) {
    const h = HZ[iv] || 6, c = K.c, rows = [];
    for (let i = 210; i < c.length - h; i++) { const f = feats[i]; if (f.some(isN)) continue; rows.push([f, c[i + h] > c[i] ? 1 : 0]); }
    if (rows.length < 200) return null;
    const sp = Math.floor(rows.length * .75), tr_ = rows.slice(0, sp), te = rows.slice(sp), m = feats[0].length;
    const stats = d => { const mu = new Array(m).fill(0), sd = new Array(m).fill(0); d.forEach(([f]) => f.forEach((x, j) => mu[j] += x / d.length));
      d.forEach(([f]) => f.forEach((x, j) => sd[j] += (x - mu[j]) ** 2 / d.length)); return [mu, sd.map(s => Math.sqrt(s) || 1)]; };
    const norm = (f, mu, sd) => f.map((x, j) => (x - mu[j]) / sd[j]);
    let [mu, sd] = stats(tr_); let [w, b] = logistic(tr_.map(r => norm(r[0], mu, sd)), tr_.map(r => r[1]));
    const pr = te.map(([f]) => 1 / (1 + Math.exp(-(norm(f, mu, sd).reduce((a, x, j) => a + x * w[j], b)))));
    const acc = pr.filter((p, i) => (p > .5) === (te[i][1] === 1)).length / te.length * 100;
    const ups = te.filter(r => r[1]).length / te.length, base = Math.max(ups, 1 - ups) * 100;
    const ci = pr.map((p, i) => [p, i]).filter(([p]) => p > .6 || p < .4), cacc = ci.length > 10 ? ci.filter(([p, i]) => (p > .5) === (te[i][1] === 1)).length / ci.length * 100 : null;
    [mu, sd] = stats(rows); [w, b] = logistic(rows.map(r => norm(r[0], mu, sd)), rows.map(r => r[1]));
    const xn = norm(feats[feats.length - 1].map(x => isN(x) ? 0 : x), mu, sd), pn = 1 / (1 + Math.exp(-xn.reduce((a, x, j) => a + x * w[j], b)));
    const drivers = xn.map((x, j) => [FN[j], x * w[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6).map(([name, e]) => ({ name, effect: +e.toFixed(3) }));
    return { horizon: h, prob_up: +(pn * 100).toFixed(1), test_accuracy: +acc.toFixed(1), baseline: +base.toFixed(1), edge: +(acc - base).toFixed(1),
             confident_accuracy: cacc == null ? null : +cacc.toFixed(1), confident_count: ci.length, train_size: sp, test_size: te.length, drivers };
  }
  function analogs(K, net, iv) {
    const h = HZ[iv] || 6, c = K.c, now = net[net.length - 1], sel = [];
    for (let i = 210; i < c.length - h; i++) if (Math.abs(net[i] - now) <= 2) sel.push((c[i + h] / c[i] - 1) * 100);
    if (sel.length < 8) return { count: sel.length, horizon: h, net: now };
    const s = sel.slice().sort((a, b) => a - b);
    return { count: sel.length, horizon: h, net: now, win_rate: +(sel.filter(x => x > 0).length / sel.length * 100).toFixed(1),
             avg: +(sel.reduce((a, b) => a + b, 0) / sel.length).toFixed(2), median: +s[s.length >> 1].toFixed(2), best: +s.at(-1).toFixed(2), worst: +s[0].toFixed(2) };
  }
  function extras(K, X, rsBtc) {
    const c = K.c, o = K.o, h = K.h, l = K.l, n = c.length - 1, r = X.rsi.slice(-60), p = c.slice(-60);
    const hi = [], lo = []; for (let i = 3; i < 57; i++) { const w = p.slice(i - 3, i + 4); if (p[i] === Math.max(...w)) hi.push(i); if (p[i] === Math.min(...w)) lo.push(i); }
    let div = 'لا يوجد';
    if (hi.length >= 2 && p[hi.at(-1)] > p[hi.at(-2)] && r[hi.at(-1)] < r[hi.at(-2)] - 2) div = 'تباعد سلبي: السعر يصنع قمة أعلى والزخم أضعف';
    else if (lo.length >= 2 && p[lo.at(-1)] < p[lo.at(-2)] && r[lo.at(-1)] > r[lo.at(-2)] + 2) div = 'تباعد إيجابي: السعر يصنع قاعاً أدنى والزخم أقوى';
    const body = Math.abs(c[n] - o[n]), rg = h[n] - l[n] || 1e-12, pats = [];
    if (c[n - 1] < o[n - 1] && c[n] > o[n] && c[n] > o[n - 1] && o[n] < c[n - 1]) pats.push({ name: 'ابتلاع شرائي', cls: 'up' });
    if (c[n - 1] > o[n - 1] && c[n] < o[n] && c[n] < o[n - 1] && o[n] > c[n - 1]) pats.push({ name: 'ابتلاع بيعي', cls: 'down' });
    if (body / rg < 0.1) pats.push({ name: 'دوجي (تردد)', cls: 'flat' });
    const lw = Math.min(o[n], c[n]) - l[n], uw = h[n] - Math.max(o[n], c[n]);
    if (lw > 2 * body && uw < body) pats.push({ name: 'مطرقة', cls: 'up' }); if (uw > 2 * body && lw < body) pats.push({ name: 'نجم ساقط', cls: 'down' });
    let age = 1; for (let i = n - 1; i >= 0 && X.std[i] === X.std[n]; i--) age++;
    const a = X.atr[n];
    return { divergence: div, patterns: pats, trend_age: age, trend_dir: X.std[n] > 0 ? 'صاعد' : 'هابط', supertrend: fix(X.stl[n]),
             targets: { up1: c[n] + a, up2: c[n] + 2 * a, dn1: c[n] - a, dn2: c[n] - 2 * a }, rs_btc: rsBtc };
  }

  function trend(K, iv, deep, tk, rsBtc) {
    if (K.c.length < 120) throw new Error('بيانات غير كافية لهذه العملة على هذا الإطار');
    const { V, net, feats, x: X } = compute(K), n = K.c.length - 1;
    const rows = V.map(([name, cat, votes, vals, desc]) => ({ name, cat, vote: votes[n] || 0, value: fix(vals[n], 4), desc, say: say(name, votes[n] || 0, vals[n]) }));
    const bull = rows.filter(r => r.vote > 0).length, bear = rows.filter(r => r.vote < 0).length, nn = bull - bear;
    const dm = dormancy(K, X), [verdict, cls] = classify(nn, dm.flags, X.adx[n]);
    const cats = {}; rows.forEach(r => { const c = cats[r.cat] = cats[r.cat] || { up: 0, down: 0, flat: 0 }; c[r.vote > 0 ? 'up' : r.vote < 0 ? 'down' : 'flat']++; });
    const R = { price: K.c[n], ticker: tk, verdict, cls, net: nn, bull, bear, neutral: 25 - bull - bear, strength: Math.round(Math.abs(nn) / 25 * 100),
                agreement: Math.round(Math.max(bull, bear) / Math.max(1, bull + bear) * 100), categories: cats, indicators: rows, dormancy: dm,
                history: { t: K.t.slice(-200), close: K.c.slice(-200), net: net.slice(-200) }, change: { prev_net: net[n - 1], delta: nn - net[n - 1] }, interval: iv };
    if (deep) { R.ml = ml(K, feats, iv); R.analogs = analogs(K, net, iv); R.extras = extras(K, X, rsBtc); }
    R.summary = summary(R);
    return R;
  }
  function summary(r) {
    const s = [`الحكم على إطار ${r.interval}: ${r.verdict}، بعد تصويت 25 مؤشراً (${r.bull} صاعد، ${r.bear} هابط، ${r.neutral} محايد).`];
    s.push(Object.entries(r.categories).map(([c, v]) => `مؤشرات ${c} ${v.up > v.down ? 'صاعدة' : v.down > v.up ? 'هابطة' : 'متوازنة'} (${v.up}/${v.down})`).join('، ') + '.');
    if (r.dormancy.squeeze) s.push('انضغاط بولينجر داخل كلتنر: هدوء يسبق غالباً حركة قوية.');
    const e = r.extras; if (e) { s.push(`Supertrend ${e.trend_dir} منذ ${e.trend_age} شمعة، ومستوى الانعكاس ${(+e.supertrend).toPrecision(6)}.`); if (e.divergence !== 'لا يوجد') s.push(e.divergence + '.'); }
    const m = r.ml; if (m) s.push(`التعلم الآلي: احتمال الصعود ${m.prob_up}% بدقة ${m.test_accuracy}% (التخمين ${m.baseline}%).`);
    const a = r.analogs; if (a?.win_rate != null) s.push(`في ${a.count} حالة مشابهة صعد السعر في ${a.win_rate}% منها بمتوسط ${a.avg > 0 ? '+' : ''}${a.avg}%.`);
    return s;
  }
  /* اختبار تاريخي مبسط للاستراتيجية */
  function backtest(K, entry = 8, ex = 0, fee = 0.1) {
    const { net } = compute(K), o = K.o, c = K.c, f = fee / 100; let pos = 0, cash = 1, u = 0, inP = 0; const trades = [];
    for (let i = 210; i < c.length; i++) { const s = net[i - 1];
      if (!pos && s >= entry) { u = cash * (1 - f) / o[i]; cash = 0; pos = 1; inP = o[i]; }
      else if (pos && s <= ex) { cash = u * o[i] * (1 - f); pos = 0; trades.push((o[i] / inP * (1 - f) ** 2 - 1) * 100); u = 0; } }
    const eq = cash + u * c.at(-1);
    return { return: +((eq - 1) * 100).toFixed(2), hold: +((c.at(-1) / c[210] - 1) * 100).toFixed(2), trades: trades.length,
             win_rate: trades.length ? +(trades.filter(x => x > 0).length / trades.length * 100).toFixed(1) : null };
  }
  return { ema, sma, rsi, atr, trend, backtest, isN, fix };
})();
if (typeof module !== 'undefined') module.exports = IND;
