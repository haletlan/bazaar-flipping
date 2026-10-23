// Shared helpers: formatting, item icons (community wiki renders) and links to the official Hypixel wiki
window.SBUI = (function(){
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
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const page = name => encodeURIComponent(String(name).trim().replace(/ /g,"_")).replace(/%2F/g,"/");
  function iconUrl(name, px){
    return "https://hypixelskyblock.minecraft.wiki/w/Special:FilePath/" + page(name) + ".png?width=" + (px > 32 ? 64 : 32);
  }
  // Image that quietly disappears when the wiki has no render for the item
  function icon(name, px){
    px = px || 20;
    return `<img class="ico" src="${esc(iconUrl(name, px))}" width="${px}" height="${px}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`;
  }
  const wikiUrl = name => "https://hypixelskyblock.minecraft.wiki/w/" + page(name);
  function wikiLink(name, label){
    return `<a class="wiki" href="${esc(wikiUrl(name))}" target="_blank" rel="noopener">${label || "Otevřít na SkyBlock Wiki"}</a>`;
  }
  return { coins, pct: m => nf1.format(m*100) + " %", nf0, nf1, esc, icon, iconUrl, wikiUrl, wikiLink };
})();
