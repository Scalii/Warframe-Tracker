// v8 patch: recipe counts as "Name x2" and one boss-only frame source block.
(() => {
  const UNKNOWN_BOSS_SOURCE = "No boss source found in the API data. Open wiki for exact farm source.";
  const BOSS_TERMS = [
    "assassination", "boss", "captain", "lieutenant", "sergeant", "jackal", "vor", "kril", "ruk", "hek",
    "alad", "zanuka", "kela", "raptor", "hyena", "ambulas", "tyl regor", "jordas", "mutalist",
    "lephantis", "hemocyte", "ropalolyst", "zealoid", "exploiter", "profit-taker", "eidolons", "eidolon"
  ];

  function rawDropText(drop) {
    if (!drop) return "";
    if (typeof drop === "string") return drop;
    return [
      drop.location,
      drop.place,
      drop.mission,
      drop.node,
      drop.type,
      drop.rarity,
      drop.rotation,
      drop.enemyName,
      drop.enemy,
      drop.source,
    ].filter(Boolean).join(" · ");
  }

  function isBossDropText(text) {
    const lower = String(text || "").toLowerCase();
    return BOSS_TERMS.some((term) => lower.includes(term));
  }

  function collectDropsDeep(value, out = []) {
    if (!value) return out;
    if (Array.isArray(value)) {
      value.forEach((entry) => collectDropsDeep(entry, out));
      return out;
    }
    if (typeof value !== "object") return out;
    if (Array.isArray(value.drops)) out.push(...value.drops);
    if (Array.isArray(value.drop)) out.push(...value.drop);
    if (Array.isArray(value.components)) value.components.forEach((component) => collectDropsDeep(component, out));
    return out;
  }

  function frameBossSources(item) {
    if (item.category !== "warframes" || !["warframes", "prime-warframes"].includes(item.subcategory)) return [];
    const drops = collectDropsDeep(item.raw, []);
    return [...new Set(drops.map(rawDropText).filter(Boolean).filter(isBossDropText))].slice(0, 4);
  }

  function bossSourceBlock(item) {
    const sources = frameBossSources(item);
    if (item.category !== "warframes" || !["warframes", "prime-warframes"].includes(item.subcategory)) return "";
    if (!sources.length) {
      return `<section class="boss-source-card"><strong>Frame source</strong><p>${escapeHtml(UNKNOWN_BOSS_SOURCE)}</p></section>`;
    }
    return `<section class="boss-source-card"><strong>Frame source</strong><p>Can be farmed from: ${sources.map(escapeHtml).join(" • ")}</p></section>`;
  }

  window.partLabel = partLabel = function partLabelXSuffix(part) {
    const count = Number(part.count || 1);
    return count > 1 ? `${part.name} x${count}` : part.name;
  };

  window.renderDetails = renderDetails = function renderDetailsBossSourceOnce() {
    const item = currentItems().find((candidate) => candidate.id === state.selected);
    if (!item) {
      el.details.className = "details-panel details-panel--empty";
      el.details.innerHTML = `<div class="empty-state"><h2>Select an item</h2><p>Choose a category and item to see owned blueprints, recipes, and mastery.</p></div>`;
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
      ${bossSourceBlock(item)}
      <div class="detail-progress-row">
        <div class="progress"><span style="width:${progress.percent}%"></span></div>
        <strong>${progress.done}/${progress.total} done · ${progress.percent}%</strong>
      </div>
      <button class="button button--primary button--wide" type="button" data-complete-toggle>${progress.buildComplete ? "Unmark owned blueprints" : "Mark all owned blueprints"}</button>
      <h3>Owned blueprints / parts</h3>
      <p class="details-help">Recipes are shown inside their blueprint/part row. Frame boss sources are shown once above, when the API provides boss drop data.</p>
      <div class="checklist">${item.parts.map((part) => partRow(item, part)).join("")}${masteryRow(item)}</div>
      ${item.wikiaUrl ? `<a class="wiki-link" href="${escapeAttr(item.wikiaUrl)}" target="_blank" rel="noopener noreferrer">Open wiki</a>` : ""}`;

    const detailsImage = el.details.querySelector(".details-image");
    if (detailsImage) detailsImage.onerror = () => detailsImage.remove();
    el.details.querySelector("[data-complete-toggle]").addEventListener("click", () => toggleOwnedBlueprints(item));
    el.details.querySelectorAll("[data-part-key]").forEach((input) => input.addEventListener("change", () => setPart(item, input.dataset.partKey, input.checked)));
    el.details.querySelector("[data-mastered-key]").addEventListener("change", (event) => setMastered(item, event.target.checked));
  };

  window.partRow = partRow = function partRowNoSource(item, part) {
    const checked = Boolean(state.progress[item.id]?.parts?.[part.key]);
    return `
      <label class="part-row inline-recipe-row ${checked ? "is-checked" : ""}">
        <input type="checkbox" data-part-key="${escapeAttr(part.key)}" ${checked ? "checked" : ""}>
        <span>
          <strong>${escapeHtml(partLabel(part))}</strong>
          <small>${escapeHtml(part.kind || "Blueprint")}${part.notes ? ` · ${escapeHtml(part.notes)}` : ""}</small>
          <span class="inline-recipe"><strong>Recipe</strong>${requirementList(part.requirements)}</span>
        </span>
      </label>`;
  };

  window.requirementList = requirementList = function requirementListXSuffix(requirements) {
    if (!requirements?.length) return `<p>No recipe found in the API.</p>`;
    return `<ul>${requirements.map((req) => `
      <li>
        ${escapeHtml(partLabel(req))}
        ${req.notes ? `<small>${escapeHtml(req.notes)}</small>` : ""}
        ${req.requirements?.length ? requirementList(req.requirements) : ""}
        ${req.drops?.length ? `<small>Drops: ${req.drops.map(escapeHtml).join(" · ")}</small>` : ""}
      </li>`).join("")}</ul>`;
  };

  render();
})();
