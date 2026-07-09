const DATA_URL = "https://api.warframestat.us/items?language=en";
const IMG_BASE = "https://cdn.warframestat.us/img/";
const PROGRESS_KEY = "wf-tracker:progress:v5";
const OLD_PROGRESS_KEYS = ["wf-tracker:progress:v4", "wf-tracker:progress:v3", "wf-tracker:progress:v2", "wf-tracker:progress:v1"];
const PAGE_SIZE = 120;

const CATEGORIES = {
  warframes: { label: "Warframes", item: "Warframe", subs: [["all", "All"], ["warframes", "Warframes"], ["prime-warframes", "Prime Warframes"], ["archwings", "Archwings"], ["necramechs", "Necramechs"]] },
  weapons: { label: "Weapons", item: "Weapon", subs: [["all", "All"], ["primary", "Primary"], ["secondary", "Secondary"], ["melee", "Melee"], ["archguns", "Archguns"], ["archmelee", "Archmelee"], ["sentinel-weapons", "Sentinel Weapons"], ["amps", "Amps"], ["kitguns", "Kitguns"], ["zaws", "Zaws"], ["other", "Other"]] },
  companions: { label: "Companions", item: "Companion", subs: [["all", "All"], ["sentinels", "Sentinels"], ["kubrows", "Kubrows"], ["kavats", "Kavats"], ["moa", "MOA"], ["hounds", "Hounds"], ["predasites", "Predasites"], ["vulpaphylas", "Vulpaphylas"], ["robotic", "Robotic"], ["beasts", "Beasts"], ["other", "Other"]] },
};

const FRAME_PARTS = ["Neuroptics", "Chassis", "Systems"];
const OWNABLE_PART_WORDS = ["blueprint", "neuroptics", "chassis", "systems", "cerebrum", "carapace", "barrel", "receiver", "stock", "blade", "handle", "hilt", "head", "link", "pouch", "string", "limb", "grip", "loader", "chamber", "bracket", "chain", "disc", "gauntlet", "guard", "ornament", "stars", "subcortex", "casing", "capsule", "engine", "weapon pod", "wings", "harness"];
const RESOURCE_WORDS = ["credits", "credit", "alloy plate", "argon crystal", "circuits", "control module", "cryotic", "detonite ampule", "ferrite", "fieldron sample", "gallium", "morphics", "mutagen sample", "nano spores", "neural sensors", "neurodes", "orokin cell", "oxium", "plastids", "polymer bundle", "rubedo", "salvage", "tellurium", "forma", "kuva", "endo", "void traces", "hexenon", "copernics", "carbides", "cubic diodes", "pustrels", "fresnels", "titanium", "iradite", "groksdrul", "maprico", "norg", "murkray", "charc", "fish oil", "thermal sludge", "gorgaricus", "tepa nodule", "mytocardia", "spinal core", "ganglion", "seriglass", "scintillant", "entrati lanthorn", "thrax plasm", "rune marrow", "pathos clamp", "tasoma", "yacshag", "kovnik", "aggristone"];

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
  el.search.addEventListener("input", (event) => { state.query = event.target.value.trim().toLowerCase(); resetList(); render(); });
  el.hideComplete.addEventListener("change", (event) => { state.hideComplete = event.target.checked; resetList(); render(); });
  el.sort.addEventListener("change", (event) => { state.sort = event.target.value; resetList(); render(); });
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
    const response = await fetch(DATA_URL, { cache: force ? "reload" : "default" });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const rawItems = await response.json();
    if (!Array.isArray(rawItems)) throw new Error("API response was not a list");
    state.catalogs = buildCatalogs(rawItems);
    state.loaded = true;
    setFirstSelected();
    setStatus(`Loaded ${totalItems().toLocaleString("en-US")} tracked items from the WarframeStat.us Items API.`, "success");
  } catch (error) {
    state.catalogs = { warframes: [], weapons: [], companions: [] };
    setStatus(`Could not load Warframe data: ${error.message}`, "error");
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
    item.buildRequirements = makeBuildRequirements(item);
    item.search = [item.name, item.type, item.productCategory, item.itemCategory, subLabel(item.category, item.subcategory), item.description, item.parts.map((part) => `${part.name} ${part.requirements.map((req) => req.name).join(" ")}`).join(" ")].join(" ").toLowerCase();
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
  const text = item.meta;
  const excludedTerms = ["skin", "helmet", "glyph", "sigil", "emote", "noggle", "articula", "poster", "display", "decoration", "decor", "captura", "scene", "syandana", "ephemera", "color palette", "armor set", "mod", "riven", "arcane", "relic", "resource", "bundle", "pack", "augment", "stance", "precept"];
  if (excludedTerms.some((term) => text.includes(term))) return true;
  if (/(systems|chassis|neuroptics) blueprint$/i.test(item.name)) return true;
  if (/ blueprint$/i.test(item.name) && !text.includes("weapon") && !text.includes("warframe")) return true;
  return false;
}

function weapon(item) {
  const text = item.meta;
  return /(sentinel|companion) weapon|arch-gun|archgun|arch gun|spaceguns|arch-melee|archmelee|space melee|spacemelee|primary|secondary|melee|longguns|rifle|shotgun|bow|sniper|launcher|speargun|pistol|dual pistols|throwing|weapon|weapons|\bamp\b|zaw|kitgun/.test(text);
}

function companion(item) {
  const text = item.meta;
  return !/weapon/.test(text) && /(companion|companions|sentinel|sentinels|kubrow|kavat|moa companion|hound|predasite|vulpaphyla|beast companion|robotic companion)/.test(text);
}

function frame(item) {
  const text = item.meta;
  return !/weapon/.test(text) && /(warframe|warframes|powersuit|suits|archwing|archwings|necramech|necramechs)/.test(text);
}

function subCategory(item, category) {
  const text = item.meta;
  const name = item.name.toLowerCase();
  if (category === "warframes") {
    if (/archwing|archwings/.test(text)) return "archwings";
    if (/necramech|necramechs/.test(text)) return "necramechs";
    if (/\bprime\b/.test(name)) return "prime-warframes";
    return "warframes";
  }
  if (category === "weapons") {
    if (/(sentinel|companion) weapon/.test(text)) return "sentinel-weapons";
    if (/arch-gun|archgun|arch gun|spaceguns/.test(text)) return "archguns";
    if (/arch-melee|archmelee|space melee|spacemelee/.test(text)) return "archmelee";
    if (/\bamp\b|operator amp/.test(text)) return "amps";
    if (/kitgun/.test(text)) return "kitguns";
    if (/\bzaw\b/.test(text)) return "zaws";
    if (/primary|longguns|rifle|shotgun|bow|sniper|launcher|speargun/.test(text)) return "primary";
    if (/secondary|pistol|dual pistols|throwing/.test(text)) return "secondary";
    if (/\bmelee\b/.test(text)) return "melee";
    return "other";
  }
  if (/sentinel/.test(text)) return "sentinels";
  if (/kubrow/.test(text)) return "kubrows";
  if (/kavat/.test(text)) return "kavats";
  if (/\bmoa\b/.test(text)) return "moa";
  if (/hound/.test(text)) return "hounds";
  if (/predasite/.test(text)) return "predasites";
  if (/vulpaphyla/.test(text)) return "vulpaphylas";
  if (/robotic/.test(text)) return "robotic";
  if (/beast/.test(text)) return "beasts";
  return "other";
}

function imageUrl(raw) {
  const img = raw.imageName || raw.image || raw.icon || raw.thumbnail || raw.textureLocation;
  if (!img) return "";
  if (/^https?:\/\//i.test(img)) return img;
  return `${IMG_BASE}${String(img).replace(/^\/?img\//i, "")}`;
}

function makeOwnedBlueprintList(item) {
  const direct = item.components.map(normalizeRequirement).filter(Boolean);
  const trackable = direct.filter((component) => isTrackableBlueprintComponent(component, item));
  const resources = direct.filter((component) => !trackable.includes(component));
  const parts = [{
    name: `${item.name} Blueprint`,
    displayName: `${item.name} Blueprint`,
    kind: "Blueprint",
    count: 1,
    notes: "Own this blueprint.",
    requirements: mainBlueprintRequirements(item, trackable, resources),
  }];

  if (item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory)) {
    FRAME_PARTS.forEach((framePart) => {
      const component = findFrameComponent(trackable, item, framePart);
      addOwnedPart(parts, {
        name: `${framePart} Blueprint`,
        displayName: `${framePart} Blueprint`,
        kind: "Component Blueprint",
        count: 1,
        notes: `Own the ${framePart} blueprint.`,
        requirements: frameComponentRequirements(component),
      });
    });
  } else {
    trackable.forEach((component) => {
      addOwnedPart(parts, {
        name: blueprintName(component.name),
        displayName: blueprintName(component.name),
        kind: component.kind || "Part Blueprint",
        count: component.count || 1,
        notes: "Own this blueprint/part.",
        requirements: component.requirements || [],
      });
    });
  }
  return parts.map((part) => ({ ...part, key: `${item.id}::${clean(part.name).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}` }));
}

function makeBuildRequirements(item) {
  if (item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory)) {
    return [
      ...FRAME_PARTS.map((part) => ({ name: part, count: 1, kind: "Crafted Component" })),
      { name: "Orokin Cell", count: 1, kind: "Resource" },
    ];
  }
  return item.parts[0]?.requirements?.length ? item.parts[0].requirements : item.parts.slice(1).map((part) => ({ name: part.displayName || part.name, count: part.count || 1, kind: "Owned Part" }));
}

function frameComponentRequirements(component) {
  const requirements = component?.requirements ? [...component.requirements] : [];
  const hasOrokinCell = requirements.some((req) => req.name.toLowerCase().includes("orokin cell"));
  if (!hasOrokinCell) {
    requirements.push({ name: "Orokin Cell", kind: "Resource", count: 1, notes: "Fallback: API may omit this common Warframe component material.", drops: [], requirements: [] });
  }
  return requirements;
}

function mainBlueprintRequirements(item, trackable, resources) {
  const requirements = [];
  if (item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory)) {
    FRAME_PARTS.forEach((part) => requirements.push({ name: `Crafted ${part}`, count: 1, kind: "Crafted Component", requirements: [] }));
    requirements.push({ name: "Orokin Cell", count: 1, kind: "Resource", requirements: [] });
  } else {
    trackable.forEach((component) => requirements.push({ name: component.name, count: component.count || 1, kind: "Owned Part", requirements: [] }));
  }
  resources.forEach((resource) => requirements.push(resource));
  return requirements;
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
  node.classList.toggle("is-mastered", progress.mastered);
  if (item.imageUrl) {
    img.src = item.imageUrl;
    img.alt = item.name;
    img.onerror = () => { img.remove(); wrap.textContent = initials(item.name); };
  } else {
    img.remove();
    wrap.textContent = initials(item.name);
  }
  node.querySelector("h3").textContent = item.name;
  node.querySelector(".badge").textContent = progress.mastered ? "MASTERED" : progress.complete ? "Built" : `${progress.percent}%`;
  node.querySelector(".item-card__meta").textContent = metaLine(item);
  node.querySelector(".progress span").style.width = `${progress.percent}%`;
  node.querySelector(".item-card__progress").textContent = `${progress.done}/${progress.total} done`;
  if (progress.mastered) node.insertAdjacentHTML("beforeend", `<span class="mastered-ribbon">MASTERED</span>`);
  node.addEventListener("click", () => select(item.id));
  node.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(item.id); } });
  return node;
}

function renderDetails() {
  const item = currentItems().find((candidate) => candidate.id === state.selected);
  if (!item) {
    el.details.className = "details-panel details-panel--empty";
    el.details.innerHTML = `<div class="empty-state"><h2>Select an item</h2><p>Choose a category and item to see owned blueprints, build requirements, and mastery.</p></div>`;
    return;
  }

  const progress = itemProgress(item);
  el.details.className = "details-panel";
  el.details.innerHTML = `
    ${progress.mastered ? `<div class="mastered-banner">MASTERED</div>` : ""}
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
      <strong>${progress.done}/${progress.total} done · ${progress.percent}%</strong>
    </div>
    <section class="build-card">
      <div class="build-card__top"><strong>Build Requirements</strong><span>${progress.buildComplete ? "Ready to build" : `${progress.missingBuild} left`}</span></div>
      <div class="build-grid">${buildRequirementGrid(item, progress)}</div>
    </section>
    <button class="button button--primary button--wide" type="button" data-complete-toggle>${progress.buildComplete ? "Unmark owned blueprints" : "Mark all owned blueprints"}</button>
    <h3>Owned blueprints / parts</h3>
    <p class="details-help">Hover or focus a blueprint row to see its full recipe. Only checkboxes plus Max Level 30 count toward MASTERED.</p>
    <div class="checklist">${item.parts.map((part) => partRow(item, part)).join("")}${masteryRow(item)}</div>
    ${item.wikiaUrl ? `<a class="wiki-link" href="${escapeAttr(item.wikiaUrl)}" target="_blank" rel="noopener noreferrer">Open wiki</a>` : ""}`;

  const detailsImage = el.details.querySelector(".details-image");
  if (detailsImage) detailsImage.onerror = () => detailsImage.remove();
  el.details.querySelector("[data-complete-toggle]").addEventListener("click", () => toggleOwnedBlueprints(item));
  el.details.querySelectorAll("[data-part-key]").forEach((input) => input.addEventListener("change", () => setPart(item, input.dataset.partKey, input.checked)));
  el.details.querySelector("[data-mastered-key]").addEventListener("change", (event) => setMastered(item, event.target.checked));
}

function buildRequirementGrid(item, progress) {
  return item.buildRequirements.map((req) => {
    const status = requirementSatisfied(item, req) ? "✓" : "";
    return `<div class="build-req ${status ? "is-owned" : ""}"><span class="build-req__icon">${escapeHtml(status || String(req.count || 1))}</span><span>${escapeHtml(req.name)}</span></div>`;
  }).join("");
}

function requirementSatisfied(item, req) {
  const name = req.name.toLowerCase().replace(/^crafted\s+/, "");
  if (name.includes("neuroptics")) return partOwned(item, "neuroptics");
  if (name.includes("chassis")) return partOwned(item, "chassis");
  if (name.includes("systems")) return partOwned(item, "systems");
  if (name.includes("orokin cell")) return true;
  return item.parts.some((part) => part.name.toLowerCase().includes(name) && state.progress[item.id]?.parts?.[part.key]);
}

function partOwned(item, term) {
  const part = item.parts.find((candidate) => candidate.name.toLowerCase().includes(term));
  return Boolean(part && state.progress[item.id]?.parts?.[part.key]);
}

function partRow(item, part) {
  const checked = Boolean(state.progress[item.id]?.parts?.[part.key]);
  return `
    <label class="part-row compact-row ${checked ? "is-checked" : ""}" tabindex="0">
      <input type="checkbox" data-part-key="${escapeAttr(part.key)}" ${checked ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(partLabel(part))}</strong>
        <small>${escapeHtml(part.kind || "Blueprint")}${part.notes ? ` · ${escapeHtml(part.notes)}` : ""}</small>
        <span class="recipe-tooltip"><strong>Recipe</strong>${requirementList(part.requirements)}</span>
      </span>
    </label>`;
}

function masteryRow(item) {
  const checked = Boolean(state.progress[item.id]?.mastered);
  return `
    <label class="part-row compact-row mastery-row ${checked ? "is-checked" : ""}">
      <input type="checkbox" data-mastered-key="${escapeAttr(item.id)}" ${checked ? "checked" : ""}>
      <span><strong>Max Level 30</strong><small>Check when this item is fully leveled.</small></span>
    </label>`;
}

function requirementList(requirements) {
  if (!requirements?.length) return `<p>No recipe found in the API.</p>`;
  return `<ul>${requirements.map((req) => `<li>${escapeHtml(partLabel(req))}${req.requirements?.length ? requirementList(req.requirements) : ""}${req.drops?.length ? `<small>Drops: ${req.drops.map(escapeHtml).join(" · ")}</small>` : ""}</li>`).join("")}</ul>`;
}

function visibleItems() {
  let items = currentItems();
  const sub = state.sub[state.category];
  if (sub !== "all") items = items.filter((item) => item.subcategory === sub);
  if (state.query) items = items.filter((item) => item.search.includes(state.query));
  if (state.hideComplete) items = items.filter((item) => !itemProgress(item).mastered);
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
function itemProgress(item) {
  const blueprintTotal = Math.max(item.parts.length, 1);
  const blueprintDone = item.parts.filter((part) => state.progress[item.id]?.parts?.[part.key]).length;
  const masteredChecked = Boolean(state.progress[item.id]?.mastered);
  const total = blueprintTotal + 1;
  const done = blueprintDone + (masteredChecked ? 1 : 0);
  const buildComplete = blueprintDone === blueprintTotal;
  return { total, done, blueprintTotal, blueprintDone, percent: Math.round((done / total) * 100), buildComplete, complete: buildComplete, mastered: buildComplete && masteredChecked, missingBuild: blueprintTotal - blueprintDone };
}
function setPart(item, key, checked) { state.progress[item.id] ||= { parts: {}, mastered: false }; state.progress[item.id].parts ||= {}; state.progress[item.id].parts[key] = checked; saveProgress(); render(); }
function setMastered(item, checked) { state.progress[item.id] ||= { parts: {}, mastered: false }; state.progress[item.id].mastered = checked; saveProgress(); render(); }
function toggleOwnedBlueprints(item) { const next = !itemProgress(item).buildComplete; state.progress[item.id] ||= { parts: {}, mastered: false }; state.progress[item.id].parts ||= {}; item.parts.forEach((part) => { state.progress[item.id].parts[part.key] = next; }); saveProgress(); render(); }

function updateCounts() {
  Object.keys(CATEGORIES).forEach((key) => {
    const target = document.querySelector(`#count-${key}`);
    const items = state.catalogs[key];
    const done = items.filter((item) => itemProgress(item).mastered).length;
    if (target) target.textContent = state.loading && !state.loaded ? "…" : `${done}/${items.length}`;
  });
}

function updateSummary() {
  const items = visibleItems();
  const complete = items.filter((item) => itemProgress(item).mastered).length;
  const totals = items.reduce((acc, item) => { const progress = itemProgress(item); acc.done += progress.done; acc.total += progress.total; return acc; }, { done: 0, total: 0 });
  document.querySelector("#stat-total").textContent = state.loading && !state.loaded ? "…" : items.length.toLocaleString("en-US");
  document.querySelector("#stat-complete").textContent = complete.toLocaleString("en-US");
  document.querySelector("#stat-parts").textContent = `${totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%`;
  document.querySelector("#stat-source").textContent = "Items API";
}

function loadProgress() {
  try {
    const current = localStorage.getItem(PROGRESS_KEY);
    if (current) return JSON.parse(current) || {};
    for (const key of OLD_PROGRESS_KEYS) {
      const older = localStorage.getItem(key);
      if (older) return JSON.parse(older) || {};
    }
  } catch {}
  return {};
}
function saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress)); } catch (error) { setStatus(`Progress could not be saved: ${error.message}`, "warning"); } }
function exportProgress() { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: 5, progress: state.progress }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "warframe-tracker-progress.json"; anchor.click(); URL.revokeObjectURL(url); }
async function importProgress(event) { const file = event.target.files?.[0]; if (!file) return; try { const payload = JSON.parse(await file.text()); state.progress = payload.progress || payload; saveProgress(); setStatus("Progress imported.", "success"); render(); } catch (error) { setStatus(`Import failed: ${error.message}`, "error"); } finally { el.importFile.value = ""; } }

function setStatus(message, type = "info") { el.status.textContent = message; el.status.dataset.type = type; }
function partLabel(part) { const count = Number(part.count || 1); return count > 1 ? `${count}× ${part.name}` : part.name; }
function metaLine(item) { return [subLabel(item.category, item.subcategory), item.type, item.masteryReq !== null ? `MR ${item.masteryReq}` : "", `${item.parts.length} blueprints`, "Rank 30"].filter(Boolean).join(" · "); }
function buildTime(value) { const seconds = Number(value); if (!Number.isFinite(seconds)) return String(value); const hours = Math.round(seconds / 3600); if (hours >= 24) return `${Math.round(hours / 24)} days`; if (hours >= 1) return `${hours} hours`; return `${Math.round(seconds / 60)} minutes`; }
function initials(name) { return clean(name).split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(); }
function clean(value) { return String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
