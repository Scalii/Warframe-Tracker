const DATA_URL = "https://api.warframestat.us/items?language=en";
const IMG_BASE = "https://cdn.warframestat.us/img/";
const PROGRESS_KEY = "wf-tracker:progress:v2";
const OLD_PROGRESS_KEY = "wf-tracker:progress:v1";
const PAGE_SIZE = 120;

const CATEGORIES = {
  warframes: {
    label: "Warframes",
    item: "Warframe",
    subs: [
      ["all", "All"],
      ["warframes", "Warframes"],
      ["prime-warframes", "Prime Warframes"],
      ["archwings", "Archwings"],
      ["necramechs", "Necramechs"],
    ],
  },
  weapons: {
    label: "Weapons",
    item: "Weapon",
    subs: [
      ["all", "All"],
      ["primary", "Primary"],
      ["secondary", "Secondary"],
      ["melee", "Melee"],
      ["archguns", "Archguns"],
      ["archmelee", "Archmelee"],
      ["sentinel-weapons", "Sentinel Weapons"],
      ["amps", "Amps"],
      ["kitguns", "Kitguns"],
      ["zaws", "Zaws"],
      ["other", "Other"],
    ],
  },
  companions: {
    label: "Companions",
    item: "Companion",
    subs: [
      ["all", "All"],
      ["sentinels", "Sentinels"],
      ["kubrows", "Kubrows"],
      ["kavats", "Kavats"],
      ["moa", "MOA"],
      ["hounds", "Hounds"],
      ["predasites", "Predasites"],
      ["vulpaphylas", "Vulpaphylas"],
      ["robotic", "Robotic"],
      ["beasts", "Beasts"],
      ["other", "Other"],
    ],
  },
};

const FRAME_PARTS = ["Neuroptics", "Chassis", "Systems"];
const OWNABLE_PART_WORDS = [
  "blueprint", "neuroptics", "chassis", "systems", "cerebrum", "carapace", "prime", "barrel", "receiver",
  "stock", "blade", "handle", "hilt", "head", "link", "pouch", "string", "limb", "lower limb", "upper limb",
  "grip", "loader", "chamber", "bracket", "chain", "disc", "gauntlet", "guard", "ornament", "stars", "subcortex",
  "casing", "capsule", "engine", "weapon pod", "wings", "harness"
];

const RESOURCE_WORDS = [
  "credits", "credit", "alloy plate", "argon crystal", "circuits", "control module", "cryotic", "detonite ampule",
  "ferrite", "fieldron sample", "gallium", "morphics", "mutagen sample", "nano spores", "neural sensors",
  "neurodes", "orokin cell", "oxium", "plastids", "polymer bundle", "rubedo", "salvage", "tellurium", "forma",
  "kuva", "endo", "void traces", "hexenon", "copernics", "carbides", "cubic diodes", "pustrels", "fresnels",
  "titanium", "iradite", "groksdrul", "maprico", "norg", "murkray", "charc", "fish oil", "thermal sludge",
  "gorgaricus", "tepa nodule", "mytocardia", "spinal core", "ganglion", "seriglass", "scintillant",
  "entrati lanthorn", "thrax plasm", "rune marrow", "pathos clamp", "tasoma", "yacshag", "kovnik", "aggristone"
];

const state = {
  catalogs: { warframes: [], weapons: [], companions: [] },
  progress: loadProgress(),
  category: "warframes",
  sub: { warframes: "all", weapons: "all", companions: "all" },
  selected: null,
  query: "",
  hideComplete: false,
  sort: "name",
  visible: PAGE_SIZE,
  loading: false,
  loaded: false,
};

const el = {
  status: document.querySelector("#status"),
  grid: document.querySelector("#itemGrid"),
  details: document.querySelector("#detailsPanel"),
  template: document.querySelector("#cardTemplate"),
  search: document.querySelector("#searchInput"),
  hideComplete: document.querySelector("#hideCompleteInput"),
  sort: document.querySelector("#sortSelect"),
  refresh: document.querySelector("#refreshBtn"),
  export: document.querySelector("#exportBtn"),
  import: document.querySelector("#importBtn"),
  importFile: document.querySelector("#importFile"),
  subTabs: document.querySelector("#subCategoryTabs"),
};

init();

function init() {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchCategory(tab.dataset.category)));
  el.search.addEventListener("input", (e) => { state.query = e.target.value.trim().toLowerCase(); resetList(); render(); });
  el.hideComplete.addEventListener("change", (e) => { state.hideComplete = e.target.checked; resetList(); render(); });
  el.sort.addEventListener("change", (e) => { state.sort = e.target.value; resetList(); render(); });
  el.refresh.addEventListener("click", () => loadData(true));
  el.export.addEventListener("click", exportProgress);
  el.import.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", importProgress);
  try { localStorage.removeItem("wf-tracker:items:v1"); } catch {}
  renderSubTabs();
  render();
  loadData(false);
}

async function loadData(force = false) {
  if (state.loaded && !force) return;
  state.loading = true;
  state.loaded = false;
  setStatus("Loading Warframe item database …");
  render();
  try {
    const res = await fetch(DATA_URL, { cache: force ? "reload" : "default" });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const rawItems = await res.json();
    if (!Array.isArray(rawItems)) throw new Error("API response was not a list");
    state.catalogs = buildCatalogs(rawItems);
    state.loaded = true;
    setFirstSelected();
    setStatus(`Loaded ${totalItems().toLocaleString("en-US")} tracked items from the WarframeStat.us Items API.`, "success");
  } catch (err) {
    state.catalogs = { warframes: [], weapons: [], companions: [] };
    setStatus(`Could not load Warframe data: ${err.message}`, "error");
  } finally {
    state.loading = false;
    resetList();
    renderSubTabs();
    render();
  }
}

function buildCatalogs(rawItems) {
  const catalogs = { warframes: [], weapons: [], companions: [] };
  rawItems.forEach((raw) => {
    const item = normalize(raw);
    if (!item) return;
    const category = topCategory(item);
    if (!category) return;
    item.category = category;
    item.subcategory = subCategory(item, category);
    item.parts = makeOwnedBlueprintList(item);
    item.search = [item.name, item.type, item.productCategory, item.itemCategory, subLabel(item.category, item.subcategory), item.description, item.parts.map((p) => `${p.name} ${p.requirements.map((r) => r.name).join(" ")}`).join(" ")].join(" ").toLowerCase();
    catalogs[category].push(item);
  });
  Object.keys(catalogs).forEach((key) => {
    catalogs[key] = [...new Map(catalogs[key].map((item) => [item.id, item])).values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  });
  return catalogs;
}

function normalize(raw) {
  if (!raw?.name) return null;
  const item = {
    raw,
    id: raw.uniqueName || raw.urlName || raw.name,
    name: clean(raw.name),
    type: clean(raw.type || raw.category || raw.productCategory || "Item"),
    productCategory: clean(raw.productCategory || ""),
    itemCategory: clean(raw.category || ""),
    uniqueName: clean(raw.uniqueName || ""),
    description: clean(raw.description || raw.compatName || "No description available."),
    imageUrl: imageUrl(raw),
    masteryReq: Number.isFinite(raw.masteryReq) ? raw.masteryReq : null,
    buildTime: raw.buildTime || raw.buildTimeSeconds || null,
    tradable: Boolean(raw.tradable),
    wikiaUrl: raw.wikiaUrl || raw.wikiUrl || raw.url || "",
    components: Array.isArray(raw.components) ? raw.components : [],
  };
  item.meta = [item.name, item.type, item.productCategory, item.itemCategory, item.uniqueName].join(" ").toLowerCase();
  return item;
}

function topCategory(item) {
  if (excluded(item)) return null;
  if (weapon(item)) return "weapons";
  if (companion(item)) return "companions";
  if (frame(item)) return "warframes";
  return null;
}

function excluded(item) {
  const t = item.meta;
  const excludedTerms = ["skin", "helmet", "glyph", "sigil", "emote", "noggle", "articula", "poster", "display", "decoration", "decor", "captura", "scene", "syandana", "ephemera", "color palette", "armor set", "mod", "riven", "arcane", "relic", "resource", "bundle", "pack", "augment", "stance", "precept"];
  if (excludedTerms.some((term) => t.includes(term))) return true;
  if (/(systems|chassis|neuroptics) blueprint$/i.test(item.name)) return true;
  if (/ blueprint$/i.test(item.name) && !t.includes("weapon") && !t.includes("warframe")) return true;
  return false;
}

function weapon(item) {
  const t = item.meta;
  return /(sentinel|companion) weapon|arch-gun|archgun|arch gun|spaceguns|arch-melee|archmelee|space melee|spacemelee|primary|secondary|melee|longguns|rifle|shotgun|bow|sniper|launcher|speargun|pistol|dual pistols|throwing|weapon|weapons|\bamp\b|zaw|kitgun/.test(t);
}

function companion(item) {
  const t = item.meta;
  return !/weapon/.test(t) && /(companion|companions|sentinel|sentinels|kubrow|kavat|moa companion|hound|predasite|vulpaphyla|beast companion|robotic companion)/.test(t);
}

function frame(item) {
  const t = item.meta;
  return !/weapon/.test(t) && /(warframe|warframes|powersuit|suits|archwing|archwings|necramech|necramechs)/.test(t);
}

function subCategory(item, category) {
  const t = item.meta;
  const name = item.name.toLowerCase();
  if (category === "warframes") {
    if (/archwing|archwings/.test(t)) return "archwings";
    if (/necramech|necramechs/.test(t)) return "necramechs";
    if (/\bprime\b/.test(name)) return "prime-warframes";
    return "warframes";
  }
  if (category === "weapons") {
    if (/(sentinel|companion) weapon/.test(t)) return "sentinel-weapons";
    if (/arch-gun|archgun|arch gun|spaceguns/.test(t)) return "archguns";
    if (/arch-melee|archmelee|space melee|spacemelee/.test(t)) return "archmelee";
    if (/\bamp\b|operator amp/.test(t)) return "amps";
    if (/kitgun/.test(t)) return "kitguns";
    if (/\bzaw\b/.test(t)) return "zaws";
    if (/primary|longguns|rifle|shotgun|bow|sniper|launcher|speargun/.test(t)) return "primary";
    if (/secondary|pistol|dual pistols|throwing/.test(t)) return "secondary";
    if (/\bmelee\b/.test(t)) return "melee";
    return "other";
  }
  if (/sentinel/.test(t)) return "sentinels";
  if (/kubrow/.test(t)) return "kubrows";
  if (/kavat/.test(t)) return "kavats";
  if (/\bmoa\b/.test(t)) return "moa";
  if (/hound/.test(t)) return "hounds";
  if (/predasite/.test(t)) return "predasites";
  if (/vulpaphyla/.test(t)) return "vulpaphylas";
  if (/robotic/.test(t)) return "robotic";
  if (/beast/.test(t)) return "beasts";
  return "other";
}

function imageUrl(raw) {
  const img = raw.imageName || raw.image || raw.icon || raw.thumbnail || raw.textureLocation;
  if (!img) return "";
  if (/^https?:\/\//i.test(img)) return img;
  return `${IMG_BASE}${String(img).replace(/^\/?img\//i, "")}`;
}

function makeOwnedBlueprintList(item) {
  const directComponents = item.components.map(normalizeRequirement).filter(Boolean);
  const trackableComponents = directComponents.filter((component) => isTrackableBlueprintComponent(component, item));
  const resourceRequirements = directComponents.filter((component) => !trackableComponents.includes(component));

  const parts = [{
    name: `${item.name} Blueprint`,
    kind: "Blueprint",
    count: 1,
    notes: "Check this only when you own the main blueprint.",
    requirements: mainBlueprintRequirements(item, trackableComponents, resourceRequirements),
  }];

  if (item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory)) {
    FRAME_PARTS.forEach((framePart) => {
      const component = findFrameComponent(trackableComponents, item, framePart);
      const name = component?.name || `${item.name} ${framePart}`;
      addOwnedPart(parts, {
        name: `${name} Blueprint`,
        kind: "Component Blueprint",
        count: 1,
        notes: `Check this when you own the ${framePart} blueprint.`,
        requirements: component?.requirements || [],
      });
    });
  } else {
    trackableComponents.forEach((component) => {
      addOwnedPart(parts, {
        name: blueprintName(component.name),
        kind: component.kind || "Part Blueprint",
        count: component.count || 1,
        notes: "Check this when you own this blueprint/part.",
        requirements: component.requirements || [],
      });
    });
  }

  return parts.map((part) => ({ ...part, key: `${item.id}::${clean(part.name).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}` }));
}

function mainBlueprintRequirements(item, trackableComponents, resourceRequirements) {
  const reqs = [];
  if (item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory)) {
    FRAME_PARTS.forEach((part) => reqs.push({ name: `Crafted ${item.name} ${part}`, count: 1, kind: "Crafted Component", requirements: [] }));
  } else {
    trackableComponents.forEach((component) => reqs.push({ name: component.name, count: component.count || 1, kind: "Owned Part", requirements: [] }));
  }
  resourceRequirements.forEach((resource) => reqs.push(resource));
  return reqs;
}

function findFrameComponent(components, item, framePart) {
  const framePartLower = framePart.toLowerCase();
  return components.find((component) => component.name.toLowerCase().includes(framePartLower))
    || components.find((component) => `${item.name} ${framePart}`.toLowerCase().includes(component.name.toLowerCase()));
}

function blueprintName(name) {
  return /blueprint$/i.test(name) ? name : `${name} Blueprint`;
}

function isTrackableBlueprintComponent(component, item) {
  const name = component.name.toLowerCase();
  if (item.category === "warframes" && FRAME_PARTS.some((part) => name.includes(part.toLowerCase()))) return true;
  if (component.requirements.length > 0) return true;
  if (name.includes("blueprint")) return true;
  if (RESOURCE_WORDS.some((resource) => name === resource || name.includes(resource))) return false;
  return OWNABLE_PART_WORDS.some((word) => name.includes(word));
}

function normalizeRequirement(part) {
  const name = clean(part?.name || part?.itemName || part?.uniqueName || "");
  if (!name) return null;
  return {
    name,
    kind: clean(part.type || part.category || "Requirement"),
    count: part.itemCount || part.count || part.quantity || 1,
    notes: clean(part.description || ""),
    drops: Array.isArray(part.drops) ? part.drops.map((drop) => typeof drop === "string" ? drop : [drop.location, drop.type, drop.chance ? `${drop.chance}%` : ""].filter(Boolean).join(" · ")).filter(Boolean).slice(0, 5) : [],
    requirements: Array.isArray(part.components) ? part.components.map(normalizeRequirement).filter(Boolean) : [],
  };
}

function addOwnedPart(parts, part) {
  if (!parts.some((existing) => existing.name.toLowerCase() === part.name.toLowerCase())) parts.push(part);
}

function switchCategory(category) {
  if (!CATEGORIES[category]) return;
  state.category = category;
  resetList();
  setFirstSelected();
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.category === category;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  renderSubTabs();
  render();
}

function switchSub(sub) {
  state.sub[state.category] = sub;
  resetList();
  setFirstSelected();
  renderSubTabs();
  render();
}

function render() {
  updateCounts();
  updateSummary();
  renderGrid();
  renderDetails();
}

function renderSubTabs() {
  if (!el.subTabs) return;
  const counts = subCounts();
  el.subTabs.innerHTML = "";
  CATEGORIES[state.category].subs.forEach(([id, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "subtab";
    btn.classList.toggle("is-active", id === state.sub[state.category]);
    btn.textContent = `${label}${counts[id] ? ` (${counts[id].toLocaleString("en-US")})` : ""}`;
    btn.addEventListener("click", () => switchSub(id));
    el.subTabs.appendChild(btn);
  });
}

function renderGrid() {
  el.grid.innerHTML = "";
  if (state.loading && !state.loaded) {
    el.grid.innerHTML = `<div class="empty-list"><h2>Loading items …</h2><p>Please wait while the tracker builds all categories.</p></div>`;
    return;
  }
  const items = visibleItems();
  if (!items.length) {
    el.grid.innerHTML = `<div class="empty-list"><h2>No items found</h2><p>Try a different search, subcategory, or filter.</p></div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  items.slice(0, state.visible).forEach((item) => frag.appendChild(card(item)));
  el.grid.appendChild(frag);
  if (items.length > state.visible) {
    const more = document.createElement("button");
    more.className = "button button--wide load-more";
    more.type = "button";
    more.textContent = `Show ${Math.min(PAGE_SIZE, items.length - state.visible)} more`;
    more.addEventListener("click", () => { state.visible += PAGE_SIZE; renderGrid(); });
    el.grid.appendChild(more);
  }
}

function card(item) {
  const node = el.template.content.firstElementChild.cloneNode(true);
  const progress = itemProgress(item);
  const img = node.querySelector("img");
  const wrap = node.querySelector(".item-card__image-wrap");
  node.dataset.id = item.id;
  node.classList.toggle("is-selected", item.id === state.selected);
  node.classList.toggle("is-complete", progress.complete);
  if (item.imageUrl) {
    img.src = item.imageUrl;
    img.alt = item.name;
    img.onerror = () => { img.remove(); wrap.textContent = initials(item.name); };
  } else {
    img.remove();
    wrap.textContent = initials(item.name);
  }
  node.querySelector("h3").textContent = item.name;
  node.querySelector(".badge").textContent = progress.complete ? "Complete" : `${progress.percent}%`;
  node.querySelector(".item-card__meta").textContent = metaLine(item);
  node.querySelector(".progress span").style.width = `${progress.percent}%`;
  node.querySelector(".item-card__progress").textContent = `${progress.done}/${progress.total} owned blueprints`;
  node.addEventListener("click", () => select(item.id));
  node.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(item.id); } });
  return node;
}

function renderDetails() {
  const item = currentItems().find((candidate) => candidate.id === state.selected);
  if (!item) {
    el.details.className = "details-panel details-panel--empty";
    el.details.innerHTML = `<div class="empty-state"><h2>Select an item</h2><p>Choose a category and item to see details and crafting components.</p></div>`;
    return;
  }
  const progress = itemProgress(item);
  el.details.className = "details-panel";
  el.details.innerHTML = `
    <div class="details-header">
      <div>
        <span class="details-kicker">${escapeHtml(CATEGORIES[item.category].label)} · ${escapeHtml(subLabel(item.category, item.subcategory))}</span>
        <h2>${escapeHtml(item.name)}</h2>
        <p>${escapeHtml(item.description)}</p>
      </div>
      ${item.imageUrl ? `<img class="details-image" src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(item.name)}">` : ""}
    </div>
    <div class="details-meta">
      <span>${escapeHtml(item.type)}</span>
      ${item.masteryReq !== null ? `<span>MR ${item.masteryReq}</span>` : ""}
      ${item.buildTime ? `<span>Build time: ${buildTime(item.buildTime)}</span>` : ""}
      ${item.tradable ? "<span>Tradable</span>" : ""}
    </div>
    <div class="detail-progress-row">
      <div class="progress"><span style="width:${progress.percent}%"></span></div>
      <strong>${progress.done}/${progress.total} owned blueprints/parts · ${progress.percent}%</strong>
    </div>
    <button class="button button--primary button--wide" type="button" data-complete-toggle>${progress.complete ? "Mark as incomplete" : "Mark all owned blueprints"}</button>
    <h3>Owned blueprints / parts</h3>
    <p class="details-help">Only the checkbox rows count toward completion. Open a row to see the materials required to craft that blueprint/part.</p>
    <div class="checklist">${item.parts.map((part) => partRow(item, part)).join("")}</div>
    ${item.wikiaUrl ? `<a class="wiki-link" href="${escapeAttr(item.wikiaUrl)}" target="_blank" rel="noopener noreferrer">Open wiki</a>` : ""}`;
  const detailsImage = el.details.querySelector(".details-image");
  if (detailsImage) detailsImage.onerror = () => detailsImage.remove();
  el.details.querySelector("[data-complete-toggle]").addEventListener("click", () => toggleComplete(item));
  el.details.querySelectorAll("[data-part-key]").forEach((input) => input.addEventListener("change", () => setPart(item, input.dataset.partKey, input.checked)));
}

function partRow(item, part) {
  const checked = Boolean(state.progress[item.id]?.parts?.[part.key]);
  const requirements = part.requirements?.length
    ? `<div class="requirement-list"><strong>Crafting requirements</strong>${requirementList(part.requirements)}</div>`
    : `<p class="drops">No crafting requirements found in the data source for this blueprint/part.</p>`;
  return `
    <details class="part-row ${checked ? "is-checked" : ""}">
      <summary>
        <input type="checkbox" data-part-key="${escapeAttr(part.key)}" ${checked ? "checked" : ""} onclick="event.stopPropagation()">
        <span>
          <strong>${escapeHtml(partLabel(part))}</strong>
          <small>${escapeHtml(part.kind || "Blueprint")}${part.notes ? ` · ${escapeHtml(part.notes)}` : ""}</small>
        </span>
      </summary>
      ${requirements}
    </details>`;
}

function requirementList(requirements) {
  return `<ul class="subcomponents">${requirements.map((req) => `
    <li>
      ${escapeHtml(partLabel(req))}
      ${req.requirements?.length ? requirementList(req.requirements) : ""}
      ${req.drops?.length ? `<p class="drops">Drops: ${req.drops.map(escapeHtml).join(" · ")}</p>` : ""}
    </li>`).join("")}</ul>`;
}

function visibleItems() {
  let items = currentItems();
  const sub = state.sub[state.category];
  if (sub !== "all") items = items.filter((item) => item.subcategory === sub);
  if (state.query) items = items.filter((item) => item.search.includes(state.query));
  if (state.hideComplete) items = items.filter((item) => !itemProgress(item).complete);
  return [...items].sort((a, b) => {
    if (state.sort === "progress") return itemProgress(b).percent - itemProgress(a).percent || a.name.localeCompare(b.name, "en");
    if (state.sort === "mastery") return (a.masteryReq ?? 999) - (b.masteryReq ?? 999) || a.name.localeCompare(b.name, "en");
    return a.name.localeCompare(b.name, "en");
  });
}

function currentItems() { return state.catalogs[state.category] || []; }
function select(id) { state.selected = id; render(); if (window.matchMedia("(max-width: 900px)").matches) el.details.scrollIntoView({ behavior: "smooth", block: "start" }); }
function resetList() { state.visible = PAGE_SIZE; }
function setFirstSelected() { state.selected = visibleItems()[0]?.id ?? null; }
function totalItems() { return Object.values(state.catalogs).reduce((sum, items) => sum + items.length, 0); }
function subLabel(category, sub) { return CATEGORIES[category].subs.find(([id]) => id === sub)?.[1] || "Other"; }
function subCounts() { const counts = { all: currentItems().length }; currentItems().forEach((item) => { counts[item.subcategory] = (counts[item.subcategory] || 0) + 1; }); return counts; }
function itemProgress(item) { const total = Math.max(item.parts.length, 1); const done = item.parts.filter((part) => state.progress[item.id]?.parts?.[part.key]).length; return { total, done, percent: Math.round((done / total) * 100), complete: done === total }; }
function setPart(item, key, checked) { state.progress[item.id] ||= { parts: {} }; state.progress[item.id].parts ||= {}; state.progress[item.id].parts[key] = checked; saveProgress(); render(); }
function toggleComplete(item) { const next = !itemProgress(item).complete; state.progress[item.id] ||= { parts: {} }; state.progress[item.id].parts ||= {}; item.parts.forEach((part) => { state.progress[item.id].parts[part.key] = next; }); saveProgress(); render(); }

function updateCounts() {
  Object.keys(CATEGORIES).forEach((key) => {
    const target = document.querySelector(`#count-${key}`);
    const items = state.catalogs[key];
    const done = items.filter((item) => itemProgress(item).complete).length;
    if (target) target.textContent = state.loading && !state.loaded ? "…" : `${done}/${items.length}`;
  });
}

function updateSummary() {
  const items = visibleItems();
  const complete = items.filter((item) => itemProgress(item).complete).length;
  const totals = items.reduce((acc, item) => { const p = itemProgress(item); acc.done += p.done; acc.total += p.total; return acc; }, { done: 0, total: 0 });
  document.querySelector("#stat-total").textContent = state.loading && !state.loaded ? "…" : items.length.toLocaleString("en-US");
  document.querySelector("#stat-complete").textContent = complete.toLocaleString("en-US");
  document.querySelector("#stat-parts").textContent = `${totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%`;
  document.querySelector("#stat-source").textContent = "Items API";
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || JSON.parse(localStorage.getItem(OLD_PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}
function saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress)); } catch (err) { setStatus(`Progress could not be saved: ${err.message}`, "warning"); } }
function exportProgress() { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: 2, progress: state.progress }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "warframe-tracker-progress.json"; a.click(); URL.revokeObjectURL(url); }
async function importProgress(e) { const file = e.target.files?.[0]; if (!file) return; try { const payload = JSON.parse(await file.text()); state.progress = payload.progress || payload; saveProgress(); setStatus("Progress imported.", "success"); render(); } catch (err) { setStatus(`Import failed: ${err.message}`, "error"); } finally { el.importFile.value = ""; } }

function setStatus(message, type = "info") { el.status.textContent = message; el.status.dataset.type = type; }
function partLabel(part) { const count = Number(part.count || 1); return count > 1 ? `${count}× ${part.name}` : part.name; }
function metaLine(item) { return [subLabel(item.category, item.subcategory), item.type, item.masteryReq !== null ? `MR ${item.masteryReq}` : "", `${item.parts.length} owned blueprints`].filter(Boolean).join(" · "); }
function buildTime(value) { const seconds = Number(value); if (!Number.isFinite(seconds)) return String(value); const hours = Math.round(seconds / 3600); if (hours >= 24) return `${Math.round(hours / 24)} days`; if (hours >= 1) return `${hours} hours`; return `${Math.round(seconds / 60)} minutes`; }
function initials(name) { return clean(name).split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }
function clean(value) { return String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
