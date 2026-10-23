# Bazaar Flipper – Hypixel SkyBlock

Webová aplikace, která z živých dat Hypixel API hledá výdělečné obchody na bazaaru ve SkyBlocku.

**Živá verze:** https://haletlan.github.io/bazaar-flipping/

## Co umí

### Flipping
- Najde itemy s největším rozdílem mezi buy orderem a sell offerem, po odečtení daně bazaaru.
- Odhadne zisk za hodinu podle týdenního objemu, tvého kapitálu a podílu na trhu.
- Ukládá historii cen v prohlížeči (až 12 hodin) a počítá z ní **stabilitu 0–100** a jak dlouho se flip drží v zisku.
- Grafy vývoje ceny a marže, upozornění na rostoucí nákupní nebo klesající prodejní cenu, označení rizikových itemů.

### Crafting
- Vyhledávání mezi více než 2 500 recepty, zobrazení receptu v mřížce 3×3 a potřebné kolekce nebo slayeru.
- Cena craftu přes buy ordery i okamžitým nákupem, zisk při prodeji na bazaaru.
- **Celý strom craftu:** u každé suroviny vybere levnější cestu (koupit, nebo vycraftit) a vypíše nákupní seznam.
- Tabulka nejziskovějších craftů právě teď.

### NPC flip
- Itemy, které na bazaaru koupíš levněji, než za kolik je vykoupí NPC.

## Jak to funguje

Všechno běží v prohlížeči, bez serveru a bez API klíče. Aplikace používá jen veřejné endpointy Hypixel API:

- `/v2/skyblock/bazaar` – ceny, order booky a objemy (obnovuje se každou minutu),
- `/v2/resources/skyblock/items` – názvy itemů a výkupní ceny NPC.

Recepty a požadavky na kolekce pocházejí z komunitního repozitáře [NotEnoughUpdates-REPO](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO). Ikonky a odkazy vedou na [Hypixel SkyBlock Wiki](https://hypixelskyblock.minecraft.wiki/).

## Struktura

```
index.html              stránka a záložky
favicon.svg             ikonka webu (pixelová mince s šipkami), PNG/ICO verze vedle
css/style.css           vzhled (světlý i tmavý režim)
js/shared.js            formátování čísel, ikonky, odkazy na wiki
js/flip.js              záložka Flipping, historie cen a grafy
js/craft.js             záložka Crafting a výpočet stromu craftu
js/npc.js               záložka NPC flip
js/tabs.js              přepínání záložek (#flip, #craft, #npc)
data/recipes.json       recepty vygenerované skriptem níže
tools/build_recipes.py  stáhne aktuální recepty z NEU a vytvoří data/recipes.json
```

## Aktualizace receptů

Když Hypixel přidá nové itemy, spusť v kořeni repozitáře (stačí Python 3, nic se neinstaluje):

```
python tools/build_recipes.py
```

a nahraj nový `data/recipes.json`.

## Spuštění na vlastním počítači

Stránka načítá `data/recipes.json`, takže ji nejde otevřít přímo dvojklikem. Spusť ve složce lokální server:

```
python -m http.server
```

a otevři http://localhost:8000.

---

Není spojeno s Hypixel Inc. ani jím schváleno.
