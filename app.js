const DATA_URL = "https://api.warframestat.us/items?language=en";
const IMAGE_BASE_URL = "https://cdn.warframestat.us/img/";
const PROGRESS_KEY = "wf-tracker:progress:v1";
const PAGE_SIZE = 120;

const CATEGORY_CONFIG = {
  warframes: {
    label: "Warframes",
    itemLabel: "Warframe",
    subcategories: [
      { id: "all", label: "All" },
      { id: "warframes", label: "Warframes" },
      { id: "prime-warframes", label: "Prime Warframes" },
      { id: "archwings", label: "Archwings" },
      { id: "necramechs", label: "Necramechs" },
    ],
  },
  weapons: {
    label: "Weapons",
    itemLabel: "Weapon",
    subcategories: [
      { id: "all", label: "All" },
      { id: "primary", label: "Primary" },
      { id: "secondary", label: "Secondary" },
      { id: "melee", label: "Melee" },
      { id: "archguns", label: "Archguns" },
      { id: "archmelee", label: "Archmelee" },
      { id: "sentinel-weapons", label: "Sentinel Weapons" },
      { id: "amps", label: "Amps" },
      { id: "kitguns", label: "Kitguns" },
      { id: "zaws", label: "Zaws" },
      { id: "other", label: "Other" },
    ],
  },
  companions: {
    label: "Companions",
    itemLabel: "Companion",
    subcategories: [
      { id: "all", label: "All" },
      { id: "sentinels", label: "Sentinels" },
      { id: "kubrows", label: "Kubrows" },
      { id: "kavats", label: "Kavats" },
      { id: "moa", label: "MOA" },
      { id: "hounds", label: "Hounds" },
      { id: "predasites", label: "Predasites" },
      { id: "vulpaphylas", label: "Vulpaphylas" },
      { id: "robotic", label: "Robotic" },
      { id: "beasts", label: "Beasts" },
      { id: "other", label: "Other" },
    ],
  },
};

const state = {
  catalogs: {
    warframes: [],
    weapons: [],
    companions: [],
  },
  progress: loadProgress(),
  activeCategory: "warframes",
  activeSubcategory: {
    warframes: "all",
    weapons: "all",
    companions: "all",
  },
  selectedId: null,
  query: "",
  hideComplete: false,
  sortBy: "name",
  visibleLimit: PAGE_SIZE,
  isLoading: false,
  isLoaded: false,
};

const elements = {
  status: document.querySelector("#status"),
  grid: document.querySelector("#itemGrid"),
  details: document.querySelector("#detailsPanel"),
  cardTemplate: document.querySelector("#cardTemplate"),
  search: document.querySelector("#searchInput"),
  hideComplete: document.querySelector("#hideCompleteInput"),
  sort: document.querySelector("#sortSelect"),
  refresh: document.querySelector("#refreshBtn"),
  export: document.querySelector("#exportBtn"),
  import: document.querySelector("#importBtn"),
  importFile: document.querySelector("#importFile"),
  subcategories: document.querySelector("#subCategoryTabs"),
};

init();

function init() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setActiveCategory(tab.dataset.category));
  });

  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    resetVisibleList();
    render();
  });

  elements.hideComplete.addEventListener("change", (event) => {
    state.hideComplete = event.target.checked;
    resetVisibleList();
    render();
  });

  elements.sort.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    resetVisibleList();
    render();
  });

  elements.refresh.addEventListener("click", () => loadItems(true));
  elements.export.addEventListener("click", exportProgress);
  elements.import.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", importProgress);

  clearOldCache();
  renderSubcategories();
  updateSummary();
  loadItems(false);
}

async function loadItems(forceRefresh = false) {
  if (state.isLoaded && !forceRefresh) {
    render();
    return;
  }

  state.isLoading = true;
  state.isLoaded = false;
  setStatus("Loading Warframe item database …");
  render();

  try {
    const response = await fetch(DATA_URL, { cache: forceRefresh ? "reload" : "default" });
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const rawItems = await response.json();
    if (!Array.isArray(rawItems)) {
      throw new Error("API response was not a list");
    }

    buildCatalogs(rawItems);
    state.isLoaded = true;
    state.selectedId = getVisibleItems()[0]?.id ?? getCurrentItems()[0]?.id ?? null;
    setStatus(`Loaded ${getTotalCount().toLocaleString("en-US")} tracked items from the WarframeStat.us Items API.`, "success");
  } catch (error) {
    setStatus(`Could not load Warframe data: ${error.message}`, "error");
    state.catalogs = { warframes: [], weapons: [], companions: [] };
  } finally {
    state.isLoading = false;
    resetVisibleList();
    render();
  }
}

function buildCatalogs(rawItems) {
  const catalogs = { warframes: [], weapons: [], companions: [] };

  rawItems.forEach((raw) => {
    const item = normalizeItem(raw);
    if (!item) return;

    const topCategory = getTopCategory(item);
    if (!topCategory) return;

    item.category = topCategory;
    item.subcategory = getSubcategory(item, topCategory);
    item.checklist = createChecklist(item);
    item.searchText = createSearchText(item);
    catalogs[topCategory].push(item);
  });

  Object.keys(catalogs).forEach((category) => {
    catalogs[category] = uniqueById(catalogs[category]).sort((a, b) => a.name.localeCompare(b.name, "en"));
  });

  state.catalogs = catalogs;
}

function normalizeItem(raw) {
  if (!raw || !raw.name) return null;

  const item = {
    raw,
    id: raw.uniqueName || raw.urlName || raw.name,
    category: "",
    subcategory: "other",
    name: cleanName(raw.name),
    type: cleanName(raw.type || raw.category || raw.productCategory || "Item"),
    productCategory: cleanName(raw.productCategory || ""),
    itemCategory: cleanName(raw.category || ""),
    uniqueName: cleanName(raw.uniqueName || ""),
    description: cleanName(raw.description || raw.compatName || "No description available."),
    imageUrl: resolveImageUrl(raw),
    masteryReq: Number.isFinite(raw.masteryReq) ? raw.masteryReq : null,
    buildTime: raw.buildTime || raw.buildTimeSeconds || null,
    buildPrice: raw.buildPrice || null,
    tradable: Boolean(raw.tradable),
    wikiaUrl: raw.wikiaUrl || raw.wikiUrl || raw.url || "",
    components: Array.isArray(raw.components) ? raw.components : [],
    checklist: [],
    searchText: "",
    haystack: "",
  };

  item.haystack = [
    item.name,
    item.type,
    item.productCategory,
    item.itemCategory,
    item.uniqueName,
    item.description,
    safeStringify(raw),
  ]
    .join(" ")
    .toLowerCase();

  return item;
}

function getTopCategory(item) {
  if (isJunkOrCosmetic(item)) return null;
  if (isWeaponItem(item)) return "weapons";
  if (isCompanionItem(item)) return "companions";
  if (isWarframeItem(item)) return "warframes";
  return null;
}

function isJunkOrCosmetic(item) {
  const text = item.haystack;
  const name = item.name.toLowerCase();
  const hardExclusions = [
    "skin",
    "helmet",
    "glyph",
    "sigil",
    "emote",
    "noggle",
    "articula",
    "poster",
    "display",
    "decoration",
    "decor",
    "captura",
    "scene",
    "syandana",
    "ephemera",
    "color palette",
    "armor set",
    "mod",
    "riven",
    "arcane",
    "relic",
    "resource",
    "bundle",
    "pack",
    "augment",
    "stance",
    "precept",
  ];

  if (hardExclusions.some((term) => text.includes(term))) return true;
  if (/(systems|chassis|neuroptics) blueprint$/i.test(item.name)) return true;
  if (/ blueprint$/i.test(item.name) && !text.includes("weapon") && !text.includes("warframe")) return true;
  if (name.includes(" badge") || name.includes(" emblem")) return true;

  return false;
}

function isWeaponItem(item) {
  const text = item.haystack;
  if (/(sentinel|companion) weapon/.test(text)) return true;
  if (/(arch-gun|archgun|arch gun|spaceguns|arch-melee|archmelee|space melee|spacemelee)/.test(text)) return true;
  if (/(primary|secondary|melee|longguns|rifle|shotgun|bow|sniper|launcher|speargun|pistol|dual pistols|throwing|weapon|weapons|amp|zaw|kitgun)/.test(text)) return true;
  return false;
}

function isCompanionItem(item) {
  const text = item.haystack;
  if (/weapon/.test(text)) return false;
  return /(companion|companions|sentinel|sentinels|kubrow|kavat|moa companion|hound|predasite|vulpaphyla|beast companion|robotic companion)/.test(text);
}

function isWarframeItem(item) {
  const text = item.haystack;
  if (/weapon/.test(text)) return false;
  return /(warframe|warframes|powersuit|suits|archwing|archwings|necramech|necramechs)/.test(text);
}

function getSubcategory(item, category) {
  const text = item.haystack;
  const name = item.name.toLowerCase();

  if (category === "warframes") {
    if (/(archwing|archwings)/.test(text)) return "archwings";
    if (/(necramech|necramechs)/.test(text)) return "necramechs";
    if (/\bprime\b/.test(name)) return "prime-warframes";
    return "warframes";
  }

  if (category === "weapons") {
    if (/(sentinel|companion) weapon/.test(text)) return "sentinel-weapons";
    if (/(arch-gun|archgun|arch gun|spaceguns)/.test(text)) return "archguns";
    if (/(arch-melee|archmelee|space melee|spacemelee)/.test(text)) return "archmelee";
    if (/\bamp\b|operator amp/.test(text)) return "amps";
    if (/kitgun/.test(text)) return "kitguns";
    if (/\bzaw\b/.test(text)) return "zaws";
    if (/(primary|longguns|rifle|shotgun|bow|sniper|launcher|speargun)/.test(text)) return "primary";
    if (/(secondary|pistol|dual pistols|throwing)/.test(text)) return "secondary";
    if (/\bmelee\b/.test(text)) return "melee";
    return "other";
  }

  if (category === "companions") {
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

  return "other";
}

function resolveImageUrl(raw) {
  const imageName = raw.imageName || raw.image || raw.icon || raw.thumbnail || raw.textureLocation;
  if (!imageName) return "";
  if (/^https?:\/\//i.test(imageName)) return imageName;

  const normalized = String(imageName).replace(/^\/?img\//i, "");
  return `${IMAGE_BASE_URL}${normalized}`;
}

function createChecklist(item) {
  const parts = [];
  addPart(parts, {
    name: `${item.name} Blueprint`,
    kind: "Blueprint",
    count: 1,
    notes: `Main blueprint for this ${CATEGORY_CONFIG[item.category].itemLabel.toLowerCase()}.`,
  });

  item.components
    .map((component) => normalizeComponent(component))
    .filter(Boolean)
    .forEach((component) => addPart(parts, component));

  if (item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory)) {
    ["Neuroptics", "Chassis", "Systems"].forEach((partName) => {
      const alreadyIncluded = parts.some((part) => part.name.toLowerCase().includes(partName.toLowerCase()));
      if (!alreadyIncluded) {
        addPart(parts, {
          name: `${item.name} ${partName}`,
          kind: "Blueprint/Part",
          count: 1,
          notes: "Standard Warframe crafting part.",
        });
      }
    });
  }

  if (parts.length === 1) {
    parts[0].notes = "No detailed components were available from the data source, so only the main blueprint is tracked.";
  }

  return parts.map((part) => ({ ...part, key: makePartKey(item.id, part.name) }));
}

function normalizeComponent(component) {
  const name = cleanName(component.name || component.itemName || component.uniqueName || "");
  if (!name) return null;

  const children = Array.isArray(component.components)
    ? component.components.map((child) => normalizeComponent(child)).filter(Boolean)
    : [];

  return {
    name,
    kind: cleanName(component.type || component.category || "Component"),
    count: component.itemCount || component.count || component.quantity || 1,
    notes: cleanName(component.description || ""),
    drops: normalizeDrops(component.drops),
    children,
  };
}

function normalizeDrops(drops) {
  if (!Array.isArray(drops)) return [];
  return drops
    .map((drop) => {
      if (typeof drop === "string") return drop;
      return [drop.location, drop.type, drop.chance ? `${drop.chance}%` : ""].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .slice(0, 5);
}

function addPart(parts, part) {
  const normalized = cleanName(part.name);
  if (!normalized) return;

  const exists = parts.some((existing) => existing.name.toLowerCase() === normalized.toLowerCase());
  if (!exists) {
    parts.push({ ...part, name: normalized });
  }
}

function setActiveCategory(category) {
  if (!CATEGORY_CONFIG[category]) return;

  state.activeCategory = category;
  resetVisibleList();
  setSelectedToFirstVisible();

  document.querySelectorAll(".tab").forEach((tab) => {
    const isActive = tab.dataset.category === category;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  renderSubcategories();
  render();
}

function setActiveSubcategory(subcategory) {
  state.activeSubcategory[state.activeCategory] = subcategory;
  resetVisibleList();
  setSelectedToFirstVisible();
  renderSubcategories();
  render();
}

function render() {
  updateTabCounts();
  updateSummary();
  renderGrid();
  renderDetails();
}

function renderSubcategories() {
  if (!elements.subcategories) return;

  const config = CATEGORY_CONFIG[state.activeCategory];
  const activeSubcategory = state.activeSubcategory[state.activeCategory];
  const counts = getSubcategoryCounts(state.activeCategory);

  elements.subcategories.innerHTML = "";
  config.subcategories.forEach((subcategory) => {
    const button = document.createElement("button");
    button.className = "subtab";
    button.type = "button";
    button.dataset.subcategory = subcategory.id;
    button.classList.toggle("is-active", subcategory.id === activeSubcategory);
    button.textContent = `${subcategory.label} ${formatCount(counts[subcategory.id] || 0)}`;
    button.addEventListener("click", () => setActiveSubcategory(subcategory.id));
    elements.subcategories.appendChild(button);
  });
}

function renderGrid() {
  elements.grid.innerHTML = "";

  if (state.isLoading && !state.isLoaded) {
    elements.grid.innerHTML = `<div class="empty-list"><h2>Loading items …</h2><p>Please wait while the tracker builds all categories.</p></div>`;
    return;
  }

  const items = getVisibleItems();
  if (!items.length) {
    elements.grid.innerHTML = `<div class="empty-list"><h2>No items found</h2><p>Try a different search, subcategory, or filter.</p></div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  const visibleItems = items.slice(0, state.visibleLimit);

  visibleItems.forEach((item) => {
    fragment.appendChild(createItemCard(item));
  });

  elements.grid.appendChild(fragment);

  if (items.length > state.visibleLimit) {
    const loadMore = document.createElement("button");
    loadMore.className = "button button--wide load-more";
    loadMore.type = "button";
    loadMore.textContent = `Show ${Math.min(PAGE_SIZE, items.length - state.visibleLimit)} more`;
    loadMore.addEventListener("click", () => {
      state.visibleLimit += PAGE_SIZE;
      renderGrid();
    });
    elements.grid.appendChild(loadMore);
  }
}

function createItemCard(item) {
  const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
  const progress = getItemProgress(item);
  const wrap = card.querySelector(".item-card__image-wrap");
  const image = card.querySelector("img");

  card.dataset.id = item.id;
  card.classList.toggle("is-selected", item.id === state.selectedId);
  card.classList.toggle("is-complete", progress.isComplete);

  if (item.imageUrl) {
    image.src = item.imageUrl;
    image.alt = item.name;
    image.onerror = () => {
      image.remove();
      wrap.textContent = getInitials(item.name);
    };
  } else {
    image.remove();
    wrap.textContent = getInitials(item.name);
  }

  card.querySelector("h3").textContent = item.name;
  card.querySelector(".badge").textContent = progress.isComplete ? "Complete" : `${progress.percent}%`;
  card.querySelector(".item-card__meta").textContent = getMetaLine(item);
  card.querySelector(".progress span").style.width = `${progress.percent}%`;
  card.querySelector(".item-card__progress").textContent = `${progress.done}/${progress.total} blueprints/parts`;

  card.addEventListener("click", () => selectItem(item.id));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectItem(item.id);
    }
  });

  return card;
}

function renderDetails() {
  const item = getCurrentItems().find((candidate) => candidate.id === state.selectedId);
  if (!item) {
    elements.details.className = "details-panel details-panel--empty";
    elements.details.innerHTML = `<div class="empty-state"><h2>Select an item</h2><p>Choose a category and item to see details and crafting components.</p></div>`;
    return;
  }

  const progress = getItemProgress(item);
  elements.details.className = "details-panel";
  elements.details.innerHTML = `
    <div class="details-header">
      <div>
        <span class="details-kicker">${escapeHtml(CATEGORY_CONFIG[item.category].label)} · ${escapeHtml(getSubcategoryLabel(item.category, item.subcategory))}</span>
        <h2>${escapeHtml(item.name)}</h2>
        <p>${escapeHtml(item.description)}</p>
      </div>
      ${item.imageUrl ? `<img class="details-image" src="${escapeAttribute(item.imageUrl)}" alt="${escapeAttribute(item.name)}">` : ""}
    </div>

    <div class="details-meta">
      <span>${escapeHtml(item.type)}</span>
      ${item.masteryReq !== null ? `<span>MR ${item.masteryReq}</span>` : ""}
      ${item.buildTime ? `<span>Build time: ${formatBuildTime(item.buildTime)}</span>` : ""}
      ${item.tradable ? "<span>Tradable</span>" : ""}
    </div>

    <div class="detail-progress-row">
      <div class="progress"><span style="width:${progress.percent}%"></span></div>
      <strong>${progress.done}/${progress.total} done · ${progress.percent}%</strong>
    </div>

    <button class="button button--primary button--wide" type="button" data-complete-toggle>
      ${progress.isComplete ? "Mark as incomplete" : "Mark everything owned"}
    </button>

    <h3>Blueprints & crafting components</h3>
    <div class="checklist">
      ${item.checklist.map((part) => renderPartRow(item, part)).join("")}
    </div>

    ${item.wikiaUrl ? `<a class="wiki-link" href="${escapeAttribute(item.wikiaUrl)}" target="_blank" rel="noopener noreferrer">Open wiki</a>` : ""}
  `;

  const detailsImage = elements.details.querySelector(".details-image");
  if (detailsImage) {
    detailsImage.onerror = () => detailsImage.remove();
  }

  elements.details.querySelector("[data-complete-toggle]").addEventListener("click", () => toggleItemComplete(item));
  elements.details.querySelectorAll("[data-part-key]").forEach((input) => {
    input.addEventListener("change", () => setPartChecked(item, input.dataset.partKey, input.checked));
  });
}

function renderPartRow(item, part) {
  const checked = isPartChecked(item, part.key);
  const children = Array.isArray(part.children) && part.children.length
    ? `<ul class="subcomponents">${part.children.map((child) => `<li>${escapeHtml(formatPartLabel(child))}</li>`).join("")}</ul>`
    : "";
  const drops = Array.isArray(part.drops) && part.drops.length
    ? `<p class="drops">Drops: ${part.drops.map(escapeHtml).join(" · ")}</p>`
    : "";

  return `
    <label class="part-row ${checked ? "is-checked" : ""}">
      <input type="checkbox" data-part-key="${escapeAttribute(part.key)}" ${checked ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(formatPartLabel(part))}</strong>
        <small>${escapeHtml(part.kind || "Component")}${part.notes ? ` · ${escapeHtml(part.notes)}` : ""}</small>
        ${children}
        ${drops}
      </span>
    </label>
  `;
}

function selectItem(id) {
  state.selectedId = id;
  render();

  if (window.matchMedia("(max-width: 900px)").matches) {
    elements.details.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function getVisibleItems() {
  let items = getCurrentItems();
  const subcategory = state.activeSubcategory[state.activeCategory];

  if (subcategory !== "all") {
    items = items.filter((item) => item.subcategory === subcategory);
  }

  if (state.query) {
    items = items.filter((item) => item.searchText.includes(state.query));
  }

  if (state.hideComplete) {
    items = items.filter((item) => !getItemProgress(item).isComplete);
  }

  return sortItems(items);
}

function getCurrentItems() {
  return state.catalogs[state.activeCategory] || [];
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (state.sortBy === "progress") {
      return getItemProgress(b).percent - getItemProgress(a).percent || a.name.localeCompare(b.name, "en");
    }
    if (state.sortBy === "mastery") {
      return (a.masteryReq ?? 999) - (b.masteryReq ?? 999) || a.name.localeCompare(b.name, "en");
    }
    return a.name.localeCompare(b.name, "en");
  });
}

function updateTabCounts() {
  Object.entries(CATEGORY_CONFIG).forEach(([key, config]) => {
    const target = document.querySelector(`#count-${key}`);
    if (!target) return;

    const items = state.catalogs[key];
    const completed = items.filter((item) => getItemProgress(item).isComplete).length;
    target.textContent = state.isLoading && !state.isLoaded ? "…" : `${completed}/${items.length}`;
    target.setAttribute("aria-label", `${completed} of ${items.length} ${config.label.toLowerCase()} complete`);
  });
}

function updateSummary() {
  const items = getVisibleItems();
  const completed = items.filter((item) => getItemProgress(item).isComplete).length;
  const totals = items.reduce(
    (acc, item) => {
      const progress = getItemProgress(item);
      acc.done += progress.done;
      acc.total += progress.total;
      return acc;
    },
    { done: 0, total: 0 },
  );

  document.querySelector("#stat-total").textContent = state.isLoading && !state.isLoaded ? "…" : items.length.toLocaleString("en-US");
  document.querySelector("#stat-complete").textContent = completed.toLocaleString("en-US");
  document.querySelector("#stat-parts").textContent = `${totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%`;
  document.querySelector("#stat-source").textContent = "Items API";
}

function getSubcategoryCounts(category) {
  const counts = { all: state.catalogs[category].length };
  state.catalogs[category].forEach((item) => {
    counts[item.subcategory] = (counts[item.subcategory] || 0) + 1;
  });
  return counts;
}

function getSubcategoryLabel(category, subcategoryId) {
  return CATEGORY_CONFIG[category].subcategories.find((item) => item.id === subcategoryId)?.label || "Other";
}

function getItemProgress(item) {
  const total = Math.max(item.checklist.length, 1);
  const done = item.checklist.filter((part) => isPartChecked(item, part.key)).length;
  return {
    total,
    done,
    percent: Math.round((done / total) * 100),
    isComplete: done === total,
  };
}

function isPartChecked(item, partKey) {
  return Boolean(state.progress[item.id]?.parts?.[partKey]);
}

function setPartChecked(item, partKey, checked) {
  const record = ensureProgressRecord(item.id);
  record.parts[partKey] = checked;
  saveProgress();
  render();
}

function toggleItemComplete(item) {
  const progress = getItemProgress(item);
  const nextValue = !progress.isComplete;
  const record = ensureProgressRecord(item.id);

  item.checklist.forEach((part) => {
    record.parts[part.key] = nextValue;
  });

  saveProgress();
  render();
}

function ensureProgressRecord(itemId) {
  if (!state.progress[itemId]) state.progress[itemId] = { parts: {} };
  if (!state.progress[itemId].parts) state.progress[itemId].parts = {};
  return state.progress[itemId];
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress));
  } catch (error) {
    setStatus(`Progress could not be saved: ${error.message}`, "warning");
  }
}

function exportProgress() {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    progress: state.progress,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "warframe-tracker-progress.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importProgress(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const importedProgress = payload.progress || payload;
    if (!importedProgress || typeof importedProgress !== "object") {
      throw new Error("Invalid file");
    }

    state.progress = importedProgress;
    saveProgress();
    setStatus("Progress imported.", "success");
    render();
  } catch (error) {
    setStatus(`Import failed: ${error.message}`, "error");
  } finally {
    elements.importFile.value = "";
  }
}

function setSelectedToFirstVisible() {
  state.selectedId = getVisibleItems()[0]?.id ?? null;
}

function resetVisibleList() {
  state.visibleLimit = PAGE_SIZE;
}

function getTotalCount() {
  return Object.values(state.catalogs).reduce((sum, items) => sum + items.length, 0);
}

function clearOldCache() {
  try {
    localStorage.removeItem("wf-tracker:items:v1");
  } catch {
    // Ignore browsers that block storage cleanup.
  }
}

function createSearchText(item) {
  return [
    item.name,
    item.type,
    item.productCategory,
    item.itemCategory,
    getSubcategoryLabel(item.category, item.subcategory),
    item.description,
    item.checklist.map((part) => part.name).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
}

function formatPartLabel(part) {
  const count = Number(part.count || 1);
  return count > 1 ? `${count}× ${part.name}` : part.name;
}

function getMetaLine(item) {
  const meta = [getSubcategoryLabel(item.category, item.subcategory), item.type].filter(Boolean);
  if (item.masteryReq !== null) meta.push(`MR ${item.masteryReq}`);
  if (item.checklist.length) meta.push(`${item.checklist.length} parts`);
  return meta.join(" · ");
}

function formatBuildTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return String(value);
  const hours = Math.round(seconds / 3600);
  if (hours >= 24) return `${Math.round(hours / 24)} days`;
  if (hours >= 1) return `${hours} hours`;
  return `${Math.round(seconds / 60)} minutes`;
}

function makePartKey(itemId, partName) {
  return `${itemId}::${cleanName(partName).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`;
}

function formatCount(count) {
  return count ? `(${count.toLocaleString("en-US")})` : "";
}

function getInitials(name) {
  return cleanName(name)
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function cleanName(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function uniqueById(items) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
