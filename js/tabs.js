// Tabs: #flip, #craft, #npc
(function(){
  const tabs = [...document.querySelectorAll(".tab[data-tab]")];
  function show(name){
    if (!tabs.some(t => t.dataset.tab === name)) name = "flip";
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", String(on));
      document.getElementById("tab-" + t.dataset.tab).hidden = !on;
    });
    window.dispatchEvent(new CustomEvent("tab-shown", {detail: name}));
  }
  tabs.forEach(t => t.addEventListener("click", () => { location.hash = t.dataset.tab; }));
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
})();
