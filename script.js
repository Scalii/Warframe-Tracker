const API_URL = "https://api.warframestat.us/items?language=de";
const IMAGE_BASE_URL = "https://cdn.warframestat.us/img/";
const CACHE_KEY = "wf-tracker:items:v1";
const PROGRESS_KEY = "wf-tracker:progress:v1";
const CATEGORY_LABELS = {
  warframes: "Warframes",
  weapons: "Waffen",
  companions: "Companions",
};

const state = {
  items: [],
  catalogs: {
    warframes: [],
    weapons: [],
    companions: [],
  },
  progress: loadProgress(),
  activeCategory: "warframes",
  selectedId: null,
  query: "",
  hideComplete: false,
  sortBy: "name",
  sourceLabel: "API",
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
};

init();

function init() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setActiveCategory(tab.dataset.category));
  });

  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  elements.hideComplete.addEventListener("change", (event) => {
    state.hideComplete = event.target.checked;
    render();
  });

  elements.sort.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    render();
  });

  elements.refresh.addEventListener("click", () => loadItems(true));
  elements.export.addEventListener("click", exportProgress);
  elements.import.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", importProgress);

  loadItems(false);
}

async function loadItems(forceRefresh) {
  setStatus("Lade Warframe-Daten …");

  const cached = readCache();
  if (cached && !forceRefresh && isCacheFresh(cached.fetchedAt)) {
    useItems(cached.items, "Cache");
    return;
  }

  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`API antwortet mit ${response.status}`);
    }
    const apiItems = await response.json();
    if (!Array.isArray(apiItems) || apiItems.length === 0) {
      throw new Error("API hat keine Items geliefert");
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), items: apiItems }));
    useItems(apiItems, "API");
  } catch (error) {
    if (cached?.items?.length) {
      useItems(cached.items, "Cache");
      setStatus(`API nicht erreichbar, nutze gespeicherte Daten. (${error.message})`, "warning");
      return;
    }

    setStatus(`Konnte keine Warframe-Daten laden: ${error.message}`, "error");
    state.items = [];
    state.catalogs = { warframes: [], weapons: [], companions: [] };
    render();
  }
}

function useItems(rawItems, sourceLabel) {
  state.items = rawItems.map(normalizeItem).filter(Boolean);
  state.catalogs = buildCatalogs(state.items);
  state.sourceLabel = sourceLabel;

  if (!state.catalogs[state.activeCategory]?.length) {
    state.activeCategory = "warframes";
  }

  state.selectedId = state.catalogs[state.activeCategory][0]?.id ?? null;
  setStatus(`${state.items.length.toLocaleString("de-DE")} Warframe-API-Einträge geladen.`, "success");
  render();
}

function normalizeItem(raw) {
  if (!raw || !raw.name) return null;

  const imageName = raw.imageName || raw.image || raw.icon;
  const components = Array.isArray(raw.components) ? raw.components : [];
  const item = {
    raw,
    id: raw.uniqueName || raw.urlName || raw.name,
    name: cleanName(raw.name),
    type: raw.type || raw.category || raw.productCategory || "Unbekannt",
    category: raw.category || "",
    productCategory: raw.productCategory || "",
    description: raw.description || raw.compatName || "Keine Beschreibung verfügbar.",
    imageUrl: imageName ? `${IMAGE_BASE_URL}${imageName}` : "",
    masteryReq: Number.isFinite(raw.masteryReq) ? raw.masteryReq : null,
    buildTime: raw.buildTime || raw.buildTimeSeconds || null,
    buildPrice: raw.buildPrice || raw.skipBuildTimePrice || null,
    tradable: Boolean(raw.tradable),
    wikiaUrl: raw.wikiaUrl || raw.wikiUrl || raw.url || "",
    components,
  };

  item.checklist = createChecklist(item);
  return item;
}

function buildCatalogs(items) {
  const catalogs = { warframes: [], weapons: [], companions: [] };

  items.forEach((item) => {
    if (isWarframe(item)) catalogs.warframes.push(item);
    else if (isCompanion(item)) catalogs.companions.push(item);
    else if (isWeapon(item)) catalogs.weapons.push(item);
  });

  Object.keys(catalogs).forEach((key) => {
    catalogs[key] = uniqueById(catalogs[key]).sort((a, b) => a.name.localeCompare(b.name, "de"));
  });

  return catalogs;
}

function isWarframe(item) {
  const haystack = searchableText(item.raw, item.type, item.category, item.productCategory);
  const excluded = /(skin|helmet|glyph|noggle|articula|animation|emote|sigil|syandana|armor|scene|decor|bundle)/i;
  return !excluded.test(item.name) && /(^|\b)(warframe|warframes|suits)(\b|$)/i.test(haystack);
}

function isWeapon(item) {
  const haystack = searchableText(item.raw, item.type, item.category, item.productCategory);
  const excluded = /(skin|riven|stance|mod|arcane|glyph|sigil|scene|decor|bundle|warframe)/i;
  return !excluded.test(item.name) && /(weapon|weapons|primary|secondary|melee|rifle|shotgun|bow|launcher|pistol|dual pistols|throwing|arch-gun|arch-melee|sentinel weapon|amp|zaw|kitgun|longguns|spaceguns|spacemelee)/i.test(haystack);
}

function isCompanion(item) {
  const haystack = searchableText(item.raw, item.type, item.category, item.productCategory);
  const excluded = /(weapon|skin|armor|mask|emblem|glyph|mod|bundle|decor|scene)/i;
  return !excluded.test(item.name) && /(companion|companions|sentinel|sentinels|kubrow|kavat|moa|hound|predasite|vulpaphyla|beast|robotic)/i.test(haystack);
}

function createChecklist(item) {
  const parts = [];
  const componentParts = item.components.map((component) => normalizeComponent(component)).filter(Boolean);

  if (isWarframe(item)) {
    addPart(parts, {
      name: `${item.name} Blueprint`,
      kind: "Blueprint",
      count: 1,
      notes: "Haupt-Blueprint für den Warframe.",
    });
  } else {
    addPart(parts, {
      name: `${item.name} Blueprint`,
      kind: "Blueprint",
      count: 1,
      notes: "Haupt-Blueprint oder Bauplan.",
    });
  }

  componentParts.forEach((component) => addPart(parts, component));

  if (isWarframe(item)) {
    ["Neuroptics", "Chassis", "Systems"].forEach((partName) => {
      const alreadyIncluded = parts.some((part) => part.name.toLowerCase().includes(partName.toLowerCase()));
      if (!alreadyIncluded) {
        addPart(parts, {
          name: `${item.name} ${partName}`,
          kind: "Blueprint/Teil",
          count: 1,
          notes: "Standard-Warframe-Komponente.",
        });
      }
    });
  }

  if (parts.length === 1 && componentParts.length === 0) {
    parts[0].notes = "Keine detaillierten Komponenten in der Datenquelle gefunden. Du kannst den Blueprint trotzdem tracken.";
  }

  return parts.map((part) => ({ ...part, key: makePartKey(item.id, part.name) }));
}

function normalizeComponent(component) {
  const name = cleanName(component.name || component.itemName || component.uniqueName || "");
  if (!name) return null;

  const childComponents = Array.isArray(component.components)
    ? component.components.map((child) => normalizeComponent(child)).filter(Boolean)
    : [];

  return {
    name,
    kind: component.type || component.category || "Komponente",
    count: component.itemCount || component.count || component.quantity || 1,
    notes: component.description || "",
    drops: normalizeDrops(component.drops),
    children: childComponents,
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
  if (!exists) parts.push({ ...part, name: normalized });
}

function setActiveCategory(category) {
  state.activeCategory = category;
  state.selectedId = state.catalogs[category][0]?.id ?? null;

  document.querySelectorAll(".tab").forEach((tab) => {
    const isActive = tab.dataset.category === category;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  render();
}

function render() {
  updateCounts();
  updateSummary();
  renderGrid();
  renderDetails();
}

function renderGrid() {
  elements.grid.innerHTML = "";
  const items = getVisibleItems();

  if (!items.length) {
    elements.grid.innerHTML = `<div class="empty-list"><h2>Nichts gefunden</h2><p>Ändere Suche oder Filter.</p></div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const progress = getItemProgress(item);

    card.dataset.id = item.id;
    card.classList.toggle("is-selected", item.id === state.selectedId);
    card.classList.toggle("is-complete", progress.isComplete);

    const image = card.querySelector("img");
    if (item.imageUrl) {
      image.src = item.imageUrl;
      image.alt = item.name;
    } else {
      image.remove();
      card.querySelector(".item-card__image-wrap").textContent = item.name.slice(0, 2).toUpperCase();
    }

    card.querySelector("h3").textContent = item.name;
    card.querySelector(".badge").textContent = progress.isComplete ? "Komplett" : `${progress.percent}%`;
    card.querySelector(".item-card__meta").textContent = getMetaLine(item);
    card.querySelector(".progress span").style.width = `${progress.percent}%`;
    card.querySelector(".item-card__progress").textContent = `${progress.done}/${progress.total} Blueprints/Teile`;

    card.addEventListener("click", () => selectItem(item.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectItem(item.id);
      }
    });

    fragment.appendChild(card);
  });

  elements.grid.appendChild(fragment);
}

function renderDetails() {
  const item = getCurrentItems().find((candidate) => candidate.id === state.selectedId);
  if (!item) {
    elements.details.className = "details-panel details-panel--empty";
    elements.details.innerHTML = `<div class="empty-state"><h2>Wähle einen Eintrag</h2><p>Klicke auf einen Eintrag, um Details und Crafting-Komponenten zu sehen.</p></div>`;
    return;
  }

  const progress = getItemProgress(item);
  elements.details.className = "details-panel";
  elements.details.innerHTML = `
    <div class="details-header">
      <div>
        <span class="details-kicker">${escapeHtml(CATEGORY_LABELS[state.activeCategory])}</span>
        <h2>${escapeHtml(item.name)}</h2>
        <p>${escapeHtml(item.description)}</p>
      </div>
      ${item.imageUrl ? `<img class="details-image" src="${escapeAttribute(item.imageUrl)}" alt="${escapeAttribute(item.name)}">` : ""}
    </div>

    <div class="details-meta">
      <span>${escapeHtml(item.type)}</span>
      ${item.masteryReq !== null ? `<span>MR ${item.masteryReq}</span>` : ""}
      ${item.buildTime ? `<span>Bauzeit: ${formatBuildTime(item.buildTime)}</span>` : ""}
      ${item.tradable ? "<span>Handelbar</span>" : ""}
    </div>

    <div class="detail-progress-row">
      <div class="progress"><span style="width:${progress.percent}%"></span></div>
      <strong>${progress.done}/${progress.total} erledigt · ${progress.percent}%</strong>
    </div>

    <button class="button button--primary button--wide" type="button" data-complete-toggle>
      ${progress.isComplete ? "Komplett entfernen" : "Alles als vorhanden markieren"}
    </button>

    <h3>Blueprints & Crafting-Komponenten</h3>
    <div class="checklist">
      ${item.checklist.map((part) => renderPartRow(item, part)).join("")}
    </div>

    ${item.wikiaUrl ? `<a class="wiki-link" href="${escapeAttribute(item.wikiaUrl)}" target="_blank" rel="noopener noreferrer">Wiki öffnen</a>` : ""}
  `;

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
        <small>${escapeHtml(part.kind || "Komponente")}${part.notes ? ` · ${escapeHtml(part.notes)}` : ""}</small>
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
  const query = state.query;

  if (query) {
    items = items.filter((item) => {
      const componentText = item.checklist.map((part) => part.name).join(" ");
      return searchableText(item, item.name, item.type, item.description, componentText).includes(query);
    });
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
      return getItemProgress(b).percent - getItemProgress(a).percent || a.name.localeCompare(b.name, "de");
    }
    if (state.sortBy === "mastery") {
      return (a.masteryReq ?? 999) - (b.masteryReq ?? 999) || a.name.localeCompare(b.name, "de");
    }
    return a.name.localeCompare(b.name, "de");
  });
}

function updateCounts() {
  Object.entries(state.catalogs).forEach(([key, items]) => {
    const target = document.querySelector(`#count-${key}`);
    const completed = items.filter((item) => getItemProgress(item).isComplete).length;
    if (target) target.textContent = `${completed}/${items.length}`;
  });
}

function updateSummary() {
  const items = getCurrentItems();
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

  document.querySelector("#stat-total").textContent = items.length.toLocaleString("de-DE");
  document.querySelector("#stat-complete").textContent = completed.toLocaleString("de-DE");
  document.querySelector("#stat-parts").textContent = `${totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%`;
  document.querySelector("#stat-source").textContent = state.sourceLabel;
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
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress));
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
      throw new Error("Ungültige Datei");
    }
    state.progress = importedProgress;
    saveProgress();
    setStatus("Fortschritt importiert.", "success");
    render();
  } catch (error) {
    setStatus(`Import fehlgeschlagen: ${error.message}`, "error");
  } finally {
    elements.importFile.value = "";
  }
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function isCacheFresh(fetchedAt) {
  if (!fetchedAt) return false;
  const maxAge = 1000 * 60 * 60 * 24;
  return Date.now() - fetchedAt < maxAge;
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
  const meta = [item.type];
  if (item.masteryReq !== null) meta.push(`MR ${item.masteryReq}`);
  if (item.checklist.length) meta.push(`${item.checklist.length} Teile`);
  return meta.join(" · ");
}

function formatBuildTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return String(value);
  const hours = Math.round(seconds / 3600);
  if (hours >= 24) return `${Math.round(hours / 24)} Tage`;
  if (hours >= 1) return `${hours} Std.`;
  return `${Math.round(seconds / 60)} Min.`;
}

function makePartKey(itemId, partName) {
  return `${itemId}::${cleanName(partName).toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-")}`;
}

function cleanName(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueById(items) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function searchableText(...values) {
  return values
    .map((value) => {
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    })
    .join(" ")
    .toLowerCase();
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
