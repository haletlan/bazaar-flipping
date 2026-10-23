(function(){
  "use strict";
  const $ = id => document.getElementById(id);
  const { coins, pct, nf0, esc, icon, wikiLink } = window.SBUI;
  let products = null, npc = null, names = {};
  const state = { sortKey:"perHour", sortDir:-1 };
  const cols = [
    {key:"name", label:"Item"}, {key:"insta", label:"Insta-buy"}, {key:"order", label:"Buy order"}, {key:"npc", label:"NPC výkup"},
    {key:"pI", label:"Zisk / kus (insta)"}, {key:"pO", label:"Zisk / kus (order)"}, {key:"margin", label:"Marže"},
    {key:"weekly", label:"Objem / týden"}, {key:"perHour", label:"Zisk / hod"}
  ];
  function parseAmount(s){
    const m = String(s||"").trim().replace(/\s/g,"").replace(",",".").match(/^([\d.]+)([kmb])?$/i);
    if (!m) return Number(s) || 0;
    return parseFloat(m[1]) * ({k:1e3,m:1e6,b:1e9}[(m[2]||"").toLowerCase()] || 1);
  }
  const titleCase = id => id.toLowerCase().split(/[_:]/).filter(Boolean).map(w => w[0].toUpperCase()+w.slice(1)).join(" ");

  function rows(){
    const budget = parseAmount(($("budget")||{}).value) || Infinity;
    const share = Math.min(100, Math.max(1, +(($("share")||{}).value) || 10))/100;
    const out = [];
    for (const id in products){
      const n = npc[id];
      if (!n) continue;
      const p = products[id], offers = p.buy_summary || [], orders = p.sell_summary || [], qs = p.quick_status || {};
      const insta = offers.length ? offers[0].pricePerUnit : null;
      const order = orders.length ? orders[0].pricePerUnit + 0.1 : null;
      const pI = insta != null ? n - insta : -Infinity;
      const pO = order != null ? n - order : -Infinity;
      if (pI <= 0 && pO <= 0) continue;
      const vI = qs.buyMovingWeek || 0, vO = qs.sellMovingWeek || 0;
      if (vI + vO < 1000) continue;
      const hI = pI > 0 ? pI * Math.min(vI/168*share, budget/insta, offers[0].amount) : 0;
      const hO = pO > 0 ? pO * Math.min(vO/168*share, budget/order) : 0;
      const name = names[id] || titleCase(id);
      const bestP = Math.max(pI, pO), base = pO >= pI ? order : insta;
      out.push({id, name, insta, order, npc:n, pI, pO, margin: bestP/base, weekly: Math.max(vI, vO), perHour: Math.max(hI, hO)});
    }
    const k = state.sortKey, d = state.sortDir;
    out.sort((a,b) => k === "name" ? d*a.name.localeCompare(b.name,"cs") : d*((a[k] ?? -Infinity) - (b[k] ?? -Infinity)));
    return out;
  }
  function render(){
    if ($("tab-npc").hidden) return;
    $("nhead").innerHTML = cols.map(c => {
      const s = state.sortKey === c.key;
      return `<th scope="col"${s ? ` aria-sort="${state.sortDir<0?"descending":"ascending"}"` : ""}><button type="button" data-key="${c.key}">${c.label}${s ? (state.sortDir<0?" ▾":" ▴") : ""}</button></th>`;
    }).join("");
    if (!products || !npc) return;
    const list = rows();
    const money = v => v > 0 ? `<span class="pos">${coins(v)}</span>` : '<span class="muted">–</span>';
    $("nbody").innerHTML = list.length ? list.slice(0,100).map(r => `<tr>
        <td>${icon(r.name)}<span class="item">${esc(r.name)}</span> <span class="muted" style="font-size:13px">${wikiLink(r.name, "wiki")}</span></td>
        <td>${r.insta != null ? coins(r.insta) : "–"}</td><td>${r.order != null ? coins(r.order) : "–"}</td>
        <td class="gold">${coins(r.npc)}</td><td>${money(r.pI)}</td><td>${money(r.pO)}</td>
        <td>${pct(r.margin)}</td><td>${coins(r.weekly)}</td><td class="gold">${coins(r.perHour)}</td></tr>`).join("")
      : `<tr><td colspan="9" class="empty">Teď není na bazaaru nic levnějšího než výkup u NPC. Zkus to za chvíli znovu.</td></tr>`;
  }
  $("nhead").addEventListener("click", e => {
    const b = e.target.closest("button[data-key]"); if (!b) return;
    if (state.sortKey === b.dataset.key) state.sortDir *= -1; else { state.sortKey = b.dataset.key; state.sortDir = b.dataset.key === "name" ? 1 : -1; }
    render();
  });
  function setItems(items){
    npc = {};
    (items || []).forEach(it => {
      if (it.npc_sell_price > 0) npc[it.id] = it.npc_sell_price;
      if (it.name) names[it.id] = String(it.name).replace(/§./g,"");
    });
    render();
  }
  window.addEventListener("items-loaded", e => setItems(e.detail));
  if (window.SB_STATE){ if (window.SB_STATE.products) products = window.SB_STATE.products; if (window.SB_STATE.items) setItems(window.SB_STATE.items); }
  window.addEventListener("bazaar-updated", e => { products = e.detail; render(); });
  window.addEventListener("tab-shown", e => { if (e.detail === "npc") render(); });
  ["budget","share"].forEach(id => $(id) && $(id).addEventListener("change", render));
})();
