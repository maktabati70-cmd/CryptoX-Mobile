/* طبقة الشبكة: الطلبات تمر عبر الجسر الأصلي في أندرويد (بدون قيود CORS)، مع تخزين مؤقت وحارس حدود Binance */
const NET = (() => {
  let seq = 0;
  const pend = new Map();
  window.__http = (id, status, text, hdr) => {
    const p = pend.get(id); if (!p) return; pend.delete(id);
    let headers = {}; try { headers = JSON.parse(hdr || '{}'); } catch (e) { }
    p({ status, text, headers });
  };
  const native = () => typeof CXN !== 'undefined';
  function raw(method, url, headers = {}, body = '') {
    if (native()) return new Promise(res => {
      const id = 'r' + (++seq); pend.set(id, res);
      CXN.http(id, method, url, JSON.stringify(headers), body || '');
      setTimeout(() => { if (pend.has(id)) { pend.delete(id); res({ status: 0, text: 'انتهت مهلة الاتصال', headers: {} }); } }, 30000);
    });
    return fetch(url, { method, headers, body: method === 'GET' || method === 'DELETE' ? undefined : body })
      .then(async r => ({ status: r.status, text: await r.text(), headers: Object.fromEntries([...r.headers].map(([k, v]) => [k.toLowerCase(), v])) }))
      .catch(e => ({ status: 0, text: String(e.message || e), headers: {} }));
  }
  const qs = p => p ? '?' + new URLSearchParams(p).toString() : '';
  async function json(url, params, headers) {
    const r = await raw('GET', url + qs(params), headers || {});
    if (r.status === 0) throw new Error('لا يوجد اتصال بالإنترنت');
    let j; try { j = JSON.parse(r.text); } catch (e) { throw new Error(`استجابة غير صالحة (${r.status})`); }
    if (r.status >= 400) throw Object.assign(new Error(j.msg || j.retMsg || j.message || `خطأ ${r.status}`), { status: r.status, body: j });
    return j;
  }

  /* ---------- حارس حدود Binance ---------- */
  const GATE = { until: 0, reason: '', weight: 0 };
  function gateCheck() { const l = GATE.until - Date.now(); if (l > 0) throw new Error(`Binance أوقفت الطلبات مؤقتاً (${GATE.reason})، استئناف بعد ${Math.ceil(l / 1000)} ث`); }
  function gateUpdate(r) {
    const w = +(r.headers['x-mbx-used-weight-1m'] || 0);
    if (w) { GATE.weight = w; if (w >= 4200) { GATE.until = Math.max(GATE.until, Date.now() + (61 - new Date().getSeconds()) * 1000); GATE.reason = `اقتراب من الحد ${w}/6000`; } }
    if (r.status === 418 || r.status === 429) {
      const ra = +(r.headers['retry-after'] || (r.status === 418 ? 120 : 60));
      GATE.until = Date.now() + ra * 1000; GATE.reason = r.status === 418 ? 'حظر IP مؤقت 418' : 'تجاوز حد الطلبات 429';
    }
  }
  const BASES = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
  async function binance(path, params) {
    gateCheck();
    let last;
    for (const b of BASES) {
      const r = await raw('GET', b + path + qs(params));
      if (r.status === 0) { last = new Error('لا يوجد اتصال'); continue; }
      gateUpdate(r);
      if (r.status === 418 || r.status === 429) throw new Error(`Binance: ${GATE.reason}`);
      const j = JSON.parse(r.text);
      if (r.status >= 400) throw new Error(j.msg || `Binance ${r.status}`);
      return j;
    }
    throw last;
  }
  const gate = () => { const s = Math.max(0, Math.ceil((GATE.until - Date.now()) / 1000)); return { paused: s > 0, seconds: s, reason: s ? GATE.reason : '', weight: GATE.weight }; };

  /* ---------- تخزين مؤقت مع قيمة احتياطية ---------- */
  const C = new Map(), inflight = new Map();
  async function cached(key, ttl, fn) {
    const h = C.get(key);
    if (h && Date.now() - h.t < ttl * 1000) return h.v;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      try { const v = await fn(); C.set(key, { t: Date.now(), v }); return v; }
      catch (e) { if (h) return h.v; throw e; }
      finally { inflight.delete(key); }
    })();
    inflight.set(key, p); return p;
  }

  /* ---------- التوقيع ---------- */
  async function hmac(secret, msg) {
    if (native()) return CXN.hmac(secret, msg);
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
    return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  /* ---------- تخزين آمن للمفاتيح (مشفّر في أندرويد) ---------- */
  const secret = {
    get: k => native() ? (CXN.getSecret(k) || '') : (localStorage.getItem('sec_' + k) || ''),
    set: (k, v) => native() ? CXN.setSecret(k, v || '') : (v ? localStorage.setItem('sec_' + k, v) : localStorage.removeItem('sec_' + k)),
  };
  const notify = (t, b) => { try { if (native()) CXN.notify(t, b); } catch (e) { } };
  const vibrate = ms => { try { native() ? CXN.vibrate(ms) : navigator.vibrate?.(ms); } catch (e) { } };
  const open = u => { try { native() ? CXN.openUrl(u) : window.open(u, '_blank'); } catch (e) { } };
  return { raw, json, qs, binance, gate, gateCheck, gateUpdate, cached, hmac, secret, notify, vibrate, open, native };
})();
