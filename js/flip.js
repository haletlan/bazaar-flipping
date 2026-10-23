(function(){
  "use strict";
  const API = "https://api.hypixel.net/v2/skyblock/bazaar";
  const ITEMS_API = "https://api.hypixel.net/v2/resources/skyblock/items";
  const REFRESH_MS = 60000;
  const MAX_ROWS = 150;
  const NCOLS = 11;

  const $ = id => document.getElementById(id);
  const state = { products:null, lastUpdated:0, names:{}, sortKey:"smart", sortDir:-1, open:null, timer:null, loading:false, charts:{} };

  const columns = [
    {key:"name", label:"Item"},
    {key:"buy", label:"Buy order"},
    {key:"sell", label:"Sell offer"},
    {key:"profit", label:"Zisk / kus"},
    {key:"margin", label:"Marže"},
    {key:null, label:"Vývoj marže"},
    {key:"score", label:"Stabilita"},
    {key:"hold", label:"Drží se"},
    {key:"weekly", label:"Objem / týden"},
    {key:"perHour", label:"Zisk / hod"},
    {key:"orders", label:"Konkurence"}
  ];

  // ---------- formatting ----------
  const nf1 = new Intl.NumberFormat("cs-CZ",{maximumFractionDigits:1, minimumFractionDigits:1});
  const nf0 = new Intl.NumberFormat("cs-CZ",{maximumFractionDigits:0});
  function coins(n){
    const a = Math.abs(n);
    if (a >= 1e9) return nf1.format(n/1e9)+" B";
    if (a >= 1e6) return nf1.format(n/1e6)+" M";
    if (a >= 1e4) return nf1.format(n/1e3)+" k";
    if (a >= 100) return nf0.format(n);
    return nf1.format(n);
  }
  const pct = m => nf1.format(m*100) + " %";
  function parseAmount(s){
    if (!s) return 0;
    const m = String(s).trim().replace(/\s/g,"").replace(",",".").match(/^([\d.]+)\s*([kmb])?$/i);
    if (!m) return Number(s) || 0;
    const mult = {k:1e3,m:1e6,b:1e9}[(m[2]||"").toLowerCase()] || 1;
    return parseFloat(m[1]) * mult;
  }
  function fmtDur(ms){
    const min = Math.round(ms/60000);
    if (min < 1) return "nově";
    if (min < 60) return min + " min";
    return Math.floor(min/60) + " h " + (min%60) + " min";
  }
  const hhmm = t => new Date(t).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"});
  const ROMAN = ["","I","II","III","IV","V","VI","VII","VIII","IX","X"];
  function titleCase(s){ return s.toLowerCase().split("_").filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(" "); }
  function prettyId(id){
    if (state.names[id]) return state.names[id];
    let m = id.match(/^ENCHANTMENT_(ULTIMATE_)?(.+?)_(\d+)$/);
    if (m){ const lvl = +m[3]; return (m[1] ? "Ultimate " : "") + titleCase(m[2]) + " " + (ROMAN[lvl] || lvl); }
    m = id.match(/^ESSENCE_(.+)$/);
    if (m) return titleCase(m[1]) + " Essence";
    return titleCase(id.replace(/:/g,"_"));
  }
  function stripColor(s){ return String(s).replace(/§./g,""); }
  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  // ---------- price history (kept in this browser) ----------
  const H_KEY = "bzflip-history-v1";
  const H_MAX_AGE = 12*3600e3;   // keep 12 hours
  const H_FINE = 3600e3;         // last hour at full (1 min) resolution
  const H_BUCKET = 600e3;        // older data: one snapshot per 10 min
  const H_MIN_VOL = 20000;       // don't store items that barely trade
  const hist = { ids:[], idx:new Map(), snaps:[] };
  const r2 = x => Math.round(x*100)/100;

  function histLoad(){
    try {
      const j = JSON.parse(localStorage.getItem(H_KEY) || "null");
      if (j && Array.isArray(j.ids) && Array.isArray(j.snaps)) { hist.ids = j.ids; hist.snaps = j.snaps; }
    } catch(e){}
    hist.idx = new Map(hist.ids.map((id,i)=>[id,i]));
  }
  function histSave(){
    for (let k = 0; k < 5; k++){
      try { localStorage.setItem(H_KEY, JSON.stringify({ids:hist.ids, snaps:hist.snaps})); return true; }
      catch(e){
        if (hist.snaps.length < 4) return false;
        hist.snaps.splice(0, Math.ceil(hist.snaps.length/4)); // storage full: drop the oldest quarter
      }
    }
    return false;
  }
  function histCompact(now){
    const out = []; let lastBucket = null;
    for (const sn of hist.snaps){
      if (now - sn.t > H_MAX_AGE) continue;
      if (now - sn.t > H_FINE){
        const bk = Math.floor(sn.t / H_BUCKET);
        if (bk === lastBucket) continue;
        lastBucket = bk;
      }
      out.push(sn);
    }
    hist.snaps = out;
  }
  function histRecord(products, t){
    const last = hist.snaps[hist.snaps.length-1];
    if (last && t - last.t < 30000) return;
    const b = [], s = [];
    for (const id in products){
      const p = products[id];
      const offers = p.buy_summary || [], orders = p.sell_summary || [];
      if (!offers.length || !orders.length) continue;
      const qs = p.quick_status || {};
      if (Math.min(qs.buyMovingWeek||0, qs.sellMovingWeek||0) < H_MIN_VOL) continue;
      let i = hist.idx.get(id);
      if (i === undefined){ i = hist.ids.length; hist.ids.push(id); hist.idx.set(id, i); }
      b[i] = r2(orders[0].pricePerUnit);
      s[i] = r2(offers[0].pricePerUnit);
    }
    hist.snaps.push({t, b, s});
    histCompact(t);
    histSave();
  }
  function histClear(){
    hist.ids = []; hist.idx = new Map(); hist.snaps = [];
    try { localStorage.removeItem(H_KEY); } catch(e){}
  }
  const marginOf = (b, s, tax) => ((s-0.1)*(1-tax) - (b+0.1)) / (b+0.1);
  const histEnd = () => hist.snaps.length ? hist.snaps[hist.snaps.length-1].t : 0;

  function series(id, win, tax){
    const i = hist.idx.get(id);
    if (i === undefined) return [];
    const end = histEnd(), out = [];
    for (const sn of hist.snaps){
      if (sn.t < end - win) continue;
      const b = sn.b[i], s = sn.s[i];
      if (b == null || s == null) continue;
      out.push({t:sn.t, b, s, m:marginOf(b, s, tax)});
    }
    return out;
  }
  function holdTime(id, tax){
    const i = hist.idx.get(id), n = hist.snaps.length;
    if (i === undefined || !n) return null;
    let start = null, full = true;
    for (let k = n-1; k >= 0; k--){
      const sn = hist.snaps[k], b = sn.b[i], s = sn.s[i];
      if (b == null || s == null || marginOf(b, s, tax) <= 0){ full = false; break; }
      start = sn.t;
    }
    if (start === null) return null;
    return {ms: histEnd() - start, full};
  }
  function stability(ser){
    if (ser.length < 5) return null;
    const ms = ser.map(p=>p.m);
    const mean = ms.reduce((a,b)=>a+b,0)/ms.length;
    const sd = Math.sqrt(ms.reduce((a,m)=>a+(m-mean)**2,0)/ms.length);
    const share = ms.filter(m=>m>0).length/ms.length;
    const cv = sd / Math.max(Math.abs(mean), 1e-9);
    return Math.max(0, Math.min(100, Math.round(100*share/(1+cv))));
  }
  function trend(ser){
    if (ser.length < 2) return [];
    const cur = ser[ser.length-1];
    const ref = ser.find(p => p.t >= cur.t - 15*60e3);
    if (!ref || cur.t - ref.t < 10*60e3) return [];
    const out = [];
    if ((cur.b - ref.b)/ref.b > 0.03) out.push("nákup roste");
    if ((cur.s - ref.s)/ref.s < -0.03) out.push("prodej klesá");
    return out;
  }

  // ---------- data ----------
  async function loadNames(){
    try {
      const r = await fetch(ITEMS_API);
      if (!r.ok) return;
      const j = await r.json();
      (j.items||[]).forEach(it => { if (it.id && it.name) state.names[it.id] = stripColor(it.name); });
      (window.SB_STATE = window.SB_STATE || {}).items = j.items;
      window.dispatchEvent(new CustomEvent("items-loaded", {detail: j.items}));
      if (state.products) render();
    } catch(e){ /* names are optional */ }
  }

  async function load(){
    if (state.loading) return;
    state.loading = true;
    setStatus("load","Načítám…");
    try {
      const r = await fetch(API, {cache:"no-store"});
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (!j.success) throw new Error(j.cause || "API vrátilo chybu");
      state.products = j.products;
      state.lastUpdated = j.lastUpdated || Date.now();
      histRecord(j.products, state.lastUpdated);
      $("errorBox").hidden = true;
      setStatus("ok", "Aktualizováno " + new Date(state.lastUpdated).toLocaleTimeString("cs-CZ"));
      render();
      (window.SB_STATE = window.SB_STATE || {}).products = j.products;
      window.dispatchEvent(new CustomEvent("bazaar-updated", {detail: j.products}));
    } catch(e){
      setStatus("err","Data se nepodařilo načíst");
      const box = $("errorBox");
      box.hidden = false;
      box.innerHTML = "<strong>Data z Hypixel API se nenačetla</strong> (" + esc(e.message) + "). " +
        "Zkontroluj připojení k internetu. Pokud soubor otevíráš přímo z disku a prohlížeč požadavek blokuje, spusť ho přes lokální server " +
        "(např. <code>npx serve</code> nebo <code>python -m http.server</code> ve složce se souborem) nebo ho nahraj na hosting. " +
        "Další pokus proběhne automaticky.";
    } finally {
      state.loading = false;
    }
  }

  function setStatus(kind, text){
    $("dot").className = "dot " + kind;
    $("statusText").textContent = text;
  }

  function compute(){
    const tax = parseFloat($("tax").value)/100;
    const budget = parseAmount($("budget").value);
    const minVol = parseAmount($("minVol").value);
    const share = Math.min(100, Math.max(1, +$("share").value || 10))/100;
    const win = +$("win").value;
    const minStab = Math.max(0, +$("minStab").value || 0);
    const q = $("q").value.trim().toLowerCase();
    const hideRisk = $("hideRisk").checked;

    const out = [];
    for (const id in state.products){
      const p = state.products[id];
      const offers = p.buy_summary || [];   // sell offers – what you insta-buy from
      const orders = p.sell_summary || [];  // buy orders – what you insta-sell into
      if (!offers.length || !orders.length) continue;
      const qs = p.quick_status || {};
      const buy = orders[0].pricePerUnit + 0.1;
      const sell = offers[0].pricePerUnit - 0.1;
      const profit = sell*(1-tax) - buy;
      if (!(profit > 0)) continue;
      if (budget > 0 && buy > budget) continue;
      const weekly = Math.min(qs.buyMovingWeek||0, qs.sellMovingWeek||0);
      if (weekly < minVol) continue;
      const name = prettyId(id);
      if (q && !name.toLowerCase().includes(q) && !id.toLowerCase().includes(q)) continue;
      const margin = profit / buy;
      const perHourUnits = Math.min(weekly/168*share, budget > 0 ? budget/buy : Infinity);
      const perHour = profit * perHourUnits;
      const competition = (orders[0].orders||0) + (offers[0].orders||0);
      const reasons = [];
      if (margin > 0.4) reasons.push("vysoká marže");
      if (competition < 3) reasons.push("málo orderů");
      const risky = reasons.length > 0;
      if (hideRisk && risky) continue;

      const ser = series(id, win, tax);
      const score = stability(ser);
      if (minStab > 0 && (score === null || score < minStab)) continue;
      const hold = holdTime(id, tax);
      const smart = perHour * ((score === null ? 50 : score)/100);

      out.push({id, name, buy, sell, profit, margin, weekly, perHour, perHourUnits, orders:competition,
        risky, reasons, offers, ordersBook:orders, ser, score, holdInfo:hold, hold: hold ? hold.ms : -1,
        trends:trend(ser), smart});
    }
    const k = state.sortKey, d = state.sortDir;
    const val = r => k === "score" ? (r.score === null ? -1 : r.score) : r[k];
    out.sort((a,b) => k === "name" ? d*a.name.localeCompare(b.name,"cs") : d*(val(a)-val(b)));
    return out;
  }

  // ---------- charts ----------
  function spark(ser){
    if (ser.length < 2) return '<span class="muted">–</span>';
    const W = 92, H = 24, P = 2;
    const t0 = ser[0].t, span = Math.max(1, ser[ser.length-1].t - t0);
    let lo = Math.min(0, ...ser.map(p=>p.m)), hi = Math.max(0, ...ser.map(p=>p.m));
    if (hi - lo < 1e-6) hi = lo + 0.01;
    const X = t => P + (t-t0)/span*(W-2*P), Y = v => P + (hi-v)/(hi-lo)*(H-2*P);
    const pts = ser.map(p => X(p.t).toFixed(1)+","+Y(p.m).toFixed(1)).join(" ");
    return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="0" x2="${W}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/><polyline points="${pts}"/></svg>`;
  }

  function bigChart(r){
    const ser = r.ser;
    if (ser.length < 2){
      return `<div class="chart"><p class="note" style="margin-top:0">Graf se začne kreslit po pár minutách. Aplikace si ukládá ceny při každém obnovení, dokud je stránka otevřená.</p></div>`;
    }
    const W = 760, L = 66, R = 14, T = 10, PH = 150, G = 30, MH = 64, B = 24;
    const H = T + PH + G + MH + B, MT = T + PH + G;
    const t0 = ser[0].t, t1 = ser[ser.length-1].t, span = Math.max(1, t1 - t0);
    const X = t => L + (t-t0)/span*(W-L-R);
    let lo = Infinity, hi = -Infinity;
    ser.forEach(p => { lo = Math.min(lo, p.b, p.s); hi = Math.max(hi, p.b, p.s); });
    const dLo = lo, dHi = hi;
    const pad = (hi-lo)*0.08 || hi*0.01 || 1; lo -= pad; hi += pad;
    const Y = v => T + (hi-v)/(hi-lo)*PH;
    let mlo = Math.min(0, ...ser.map(p=>p.m)), mhi = Math.max(0, ...ser.map(p=>p.m));
    if (mhi - mlo < 1e-6) mhi = mlo + 0.01;
    const YM = v => MT + (mhi-v)/(mhi-mlo)*MH;
    const line = key => ser.map(p => X(p.t).toFixed(1)+","+Y(p[key]).toFixed(1)).join(" ");
    const area = `M${X(t0).toFixed(1)},${YM(0).toFixed(1)} ` + ser.map(p => "L"+X(p.t).toFixed(1)+","+YM(p.m).toFixed(1)).join(" ") + ` L${X(t1).toFixed(1)},${YM(0).toFixed(1)} Z`;
    const mid = (dLo + dHi)/2;
    const yl = v => `<line class="grid" x1="${L}" x2="${W-R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${L-8}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${coins(v)}</text>`;
    const tl = (t, anchor) => `<text x="${X(t).toFixed(1)}" y="${H-6}" text-anchor="${anchor}">${hhmm(t)}</text>`;
    state.charts[r.id] = {ser, L, R, W, t0, span, T, bottom: MT + MH};
    const ms = ser.map(p=>p.m);
    const avg = ms.reduce((a,b)=>a+b,0)/ms.length;
    const okShare = ms.filter(m=>m>0).length/ms.length;
    const hold = r.holdInfo ? (r.holdInfo.full ? "aspoň " : "") + fmtDur(r.holdInfo.ms) : "teď není v zisku";
    return `<div class="chart">
      <div class="legend"><span><i style="background:var(--emerald)"></i>Nejvyšší buy order</span><span><i style="background:var(--gold)"></i>Nejnižší sell offer</span><span>Spodní pás: tvoje marže po dani</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Vývoj ceny a marže za sledované období">
        ${yl(dHi)}${dHi !== dLo ? yl(mid) + yl(dLo) : ""}
        <polyline class="pb" points="${line("b")}"/>
        <polyline class="ps" points="${line("s")}"/>
        <text x="${L-8}" y="${(YM(mhi)+4).toFixed(1)}" text-anchor="end">${pct(mhi)}</text>
        <text x="${L-8}" y="${(YM(mlo)+4).toFixed(1)}" text-anchor="end">${pct(mlo)}</text>
        <path class="pm" d="${area}"/>
        <line class="zero" x1="${L}" x2="${W-R}" y1="${YM(0).toFixed(1)}" y2="${YM(0).toFixed(1)}"/>
        ${tl(t0,"start")}${tl(t0+span/2,"middle")}${tl(t1,"end")}
        <line class="guide" x1="${L}" x2="${L}" y1="${T}" y2="${MT+MH}"/>
        <rect class="hit" data-chart="${esc(r.id)}" x="${L}" y="${T}" width="${W-L-R}" height="${PH+G+MH}"/>
      </svg>
      <p class="info">Najetím na graf zobrazíš ceny v daném čase.</p>
      <div class="stats">
        <span>Průměrná marže: <b>${pct(avg)}</b></span>
        <span>V zisku: <b>${nf0.format(okShare*100)} % času</b></span>
        <span>Drží se: <b>${hold}</b></span>
        <span>Snímků: <b>${ser.length}</b></span>
      </div>
    </div>`;
  }

  function onChartMove(e){
    const hit = e.target.closest && e.target.closest(".hit");
    if (!hit) return;
    const c = state.charts[hit.dataset.chart];
    if (!c) return;
    const svg = hit.ownerSVGElement, rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * svg.viewBox.baseVal.width;
    const t = c.t0 + (x - c.L) / (c.W - c.L - c.R) * c.span;
    let best = c.ser[0];
    for (const p of c.ser) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    const gx = (c.L + (best.t - c.t0)/c.span*(c.W - c.L - c.R)).toFixed(1);
    const g = svg.querySelector(".guide");
    g.setAttribute("x1", gx); g.setAttribute("x2", gx); g.style.opacity = "0.5";
    const info = svg.parentNode.querySelector(".info");
    info.textContent = `${hhmm(best.t)}: buy order ${coins(best.b)}, sell offer ${coins(best.s)}, marže ${pct(best.m)}`;
  }
  function onChartLeave(e){
    const hit = e.target.closest && e.target.closest(".hit");
    if (!hit) return;
    hit.ownerSVGElement.querySelector(".guide").style.opacity = "0";
  }

  // ---------- render ----------
  function renderHead(){
    $("headRow").innerHTML = columns.map(c => {
      if (!c.key) return `<th scope="col">${c.label}</th>`;
      const sorted = state.sortKey === c.key;
      const aria = sorted ? ` aria-sort="${state.sortDir<0?"descending":"ascending"}"` : "";
      const arrow = sorted ? (state.sortDir<0 ? " ▾" : " ▴") : "";
      return `<th scope="col"${aria}><button type="button" data-key="${c.key}">${c.label}${arrow}</button></th>`;
    }).join("");
  }

  function bookTable(rows, title){
    const body = rows.slice(0,6).map(r =>
      `<tr><td>${coins(r.pricePerUnit)}</td><td>${nf0.format(r.amount)}</td><td>${r.orders}</td></tr>`).join("");
    return `<div><h3>${title}</h3><table><thead><tr><th>Cena</th><th>Kusů</th><th>Orderů</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function stabCell(score){
    if (score === null) return '<span class="muted">sbírám data</span>';
    const cls = score >= 70 ? "s-hi" : score >= 40 ? "s-mid" : "s-lo";
    return `<span class="meter"><i class="${cls}" style="width:${score}%"></i></span>${score}`;
  }

  function renderHist(){
    const n = hist.snaps.length;
    const text = n
      ? `Uložená historie: ${n} ${n === 1 ? "snímek" : n < 5 ? "snímky" : "snímků"} za ${fmtDur(histEnd() - hist.snaps[0].t)}. Ukládá se jen v tomhle prohlížeči a jen když je stránka otevřená (stačí i na pozadí). Stabilita se ukáže po 5 snímcích. `
      : "Historie cen je zatím prázdná. Začne se plnit po prvním načtení dat. ";
    $("histNote").innerHTML = esc(text) + (n ? '<button type="button" class="linkbtn" id="clearHist">Smazat historii</button>' : "");
  }

  function render(){
    renderHead();
    renderHist();
    state.charts = {};
    const rows = compute();
    const maxPH = rows.reduce((m,r)=>Math.max(m,r.perHour),0) || 1;

    const best = rows.slice().sort((a,b)=>b.smart-a.smart)[0];
    if (best){
      $("heroName").textContent = best.name;
      const stab = best.score === null ? "stabilitu zatím počítám" : `stabilita ${best.score}` + (best.holdInfo ? `, v zisku ${best.holdInfo.full ? "aspoň " : ""}${fmtDur(best.holdInfo.ms)}` : "");
      $("heroRoute").textContent = `Buy order za ${coins(best.buy)}, sell offer za ${coins(best.sell)}, zisk ${coins(best.profit)} na kus (${pct(best.margin)}), zhruba ${nf0.format(best.perHourUnits)} kusů za hodinu, ${stab}`;
      $("heroValue").textContent = coins(best.perHour);
    } else {
      $("heroName").textContent = "Nic nevyhovuje filtrům";
      $("heroRoute").textContent = "Sniž minimální objem nebo stabilitu, případně zvyš kapitál.";
      $("heroValue").textContent = "–";
    }

    if (!rows.length){
      $("tbody").innerHTML = `<tr><td colspan="${NCOLS}" class="empty">Žádný item nesplňuje filtry. Zkus snížit minimální objem či stabilitu nebo vypnout skrývání rizikových.</td></tr>`;
      $("countNote").textContent = "";
      return;
    }

    const shown = rows.slice(0, MAX_ROWS);
    $("tbody").innerHTML = shown.map(r => {
      const open = state.open === r.id;
      let tags = r.risky ? `<span class="tag risk" title="${esc(r.reasons.join(", "))}">riziko</span>` : "";
      tags += r.trends.map(t => `<span class="tag warn">${t}</span>`).join("");
      const w = Math.max(2, Math.round(r.perHour/maxPH*56));
      const hold = r.holdInfo ? (r.holdInfo.full ? "≥ " : "") + fmtDur(r.holdInfo.ms) : '<span class="muted">–</span>';
      let html = `<tr class="row" tabindex="0" data-id="${esc(r.id)}" aria-expanded="${open}">
        <td>${SBUI.icon(r.name)}<span class="item">${esc(r.name)}</span>${tags}</td>
        <td>${coins(r.buy)}</td>
        <td>${coins(r.sell)}</td>
        <td class="pos">${coins(r.profit)}</td>
        <td>${pct(r.margin)}</td>
        <td>${spark(r.ser)}</td>
        <td>${stabCell(r.score)}</td>
        <td>${hold}</td>
        <td>${coins(r.weekly)}</td>
        <td class="gold"><span class="bar" style="width:${w}px"></span>${coins(r.perHour)}</td>
        <td>${r.orders}</td></tr>`;
      if (open){
        html += `<tr class="detail"><td colspan="${NCOLS}"><p style="margin:14px 18px 0">${SBUI.wikiLink(r.name)}</p>${bigChart(r)}<div class="book">
          ${bookTable(r.ordersBook, "Buy ordery (sem prodáváš okamžitě)")}
          ${bookTable(r.offers, "Sell offery (odsud kupuješ okamžitě)")}
        </div></td></tr>`;
      }
      return html;
    }).join("");
    const count = rows.length > MAX_ROWS ? `Zobrazeno ${MAX_ROWS} z ${rows.length} ziskových itemů.` : `${rows.length} ziskových itemů.`;
    $("countNote").innerHTML = esc(count) + " " + (state.sortKey === "smart"
      ? "Seřazeno doporučeně (zisk za hodinu × stabilita). Kliknutím na záhlaví sloupce seřadíš jinak."
      : '<button type="button" class="linkbtn" id="resetSort">Vrátit doporučené pořadí</button>');
  }

  // ---------- events ----------
  $("headRow").addEventListener("click", e => {
    const b = e.target.closest("button[data-key]");
    if (!b) return;
    const k = b.dataset.key;
    if (state.sortKey === k) state.sortDir *= -1;
    else { state.sortKey = k; state.sortDir = k === "name" ? 1 : -1; }
    render();
  });
  $("countNote").addEventListener("click", e => {
    if (e.target.id === "resetSort"){ state.sortKey = "smart"; state.sortDir = -1; render(); }
  });
  $("histNote").addEventListener("click", e => {
    if (e.target.id === "clearHist" && confirm("Opravdu smazat uloženou historii cen?")){ histClear(); render(); }
  });
  function toggleRow(tr){
    const id = tr.dataset.id;
    state.open = state.open === id ? null : id;
    render();
    const again = [...document.querySelectorAll("tr.row")].find(x => x.dataset.id === id);
    if (again) again.focus();
  }
  $("tbody").addEventListener("click", e => {
    if (e.target.closest(".detail")) return;
    const tr = e.target.closest("tr.row"); if (tr) toggleRow(tr);
  });
  $("tbody").addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tr = e.target.closest("tr.row"); if (!tr) return;
    e.preventDefault(); toggleRow(tr);
  });
  $("tbody").addEventListener("pointermove", onChartMove);
  $("tbody").addEventListener("pointerout", onChartLeave);

  const FILTERS = ["q","budget","minVol","tax","share","win","minStab","hideRisk"];
  FILTERS.forEach(id => {
    $(id).addEventListener("input", () => { if (state.products) render(); });
    $(id).addEventListener("change", () => { if (state.products) render(); });
  });
  $("refreshBtn").addEventListener("click", load);
  function schedule(){
    clearInterval(state.timer);
    // keeps running in a background tab so the history has no gaps
    if ($("auto").checked) state.timer = setInterval(load, REFRESH_MS);
  }
  $("auto").addEventListener("change", schedule);

  // remember settings for this browser
  const SAVED = ["budget","minVol","tax","share","win","minStab"];
  try {
    const s = JSON.parse(localStorage.getItem("bzflip-settings") || "{}");
    SAVED.forEach(k => { if (s[k] != null) $(k).value = s[k]; });
    if (s.hideRisk != null) $("hideRisk").checked = s.hideRisk;
  } catch(e){}
  function save(){
    try {
      const s = {}; SAVED.forEach(k => s[k] = $(k).value); s.hideRisk = $("hideRisk").checked;
      localStorage.setItem("bzflip-settings", JSON.stringify(s));
    } catch(e){}
  }
  SAVED.concat("hideRisk").forEach(id => $(id).addEventListener("change", save));

  histLoad();
  renderHead();
  renderHist();
  load();
  loadNames();
  schedule();
})();
