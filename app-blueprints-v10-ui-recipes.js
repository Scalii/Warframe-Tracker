// v10 patch: collapsed recipe rows, no fake fallback recipes, better component lookup, compact layout behavior.
(() => {
  const RAW_ITEMS_BY_NAME = new Map();
  const RAW_ITEMS_LIST = [];
  const PREVIOUS_BUILD_CATALOGS = buildCatalogs;

  const FRAME_BOSS_SOURCES_V10 = {
    "atlas": "Jordas Golem — Jordas Golem Assassination, Eris",
    "ember": "General Sargas Ruk — Tethys, Saturn",
    "equinox": "Tyl Regor — Titania, Uranus",
    "excalibur": "Lieutenant Lech Kril — War, Mars",
    "frost": "Captain Vor & Lieutenant Lech Kril — Exta, Ceres",
    "hydroid": "Councilor Vay Hek — Oro, Earth",
    "loki": "Hyena Pack — Psamathe, Neptune",
    "mag": "The Sergeant — Iliad, Phobos",
    "mesa": "Mutalist Alad V — Mutalist Alad V Assassination, Eris",
    "nekros": "Lephantis — Magnacidium, Deimos",
    "nova": "Raptors — Naamah, Europa",
    "nyx": "Phorid — Infested Invasion Assassination",
    "rhino": "Jackal — Fossa, Venus",
    "saryn": "Kela De Thaym — Merrow, Sedna",
    "trinity": "Ambulas — Hades, Pluto",
    "valkyr": "Alad V — Themisto, Jupiter",
    "wisp": "Ropalolyst — The Ropalolyst, Jupiter"
  };

  function key(value) {
    return clean(value).toLowerCase().replace(/\s+/g, " ");
  }

  function addRawToIndex(raw) {
    if (!raw?.name) return;
    const names = [raw.name, raw.name.replace(/ blueprint$/i, "")];
    if (raw.uniqueName) names.push(raw.uniqueName.split("/").pop());
    names.forEach((name) => RAW_ITEMS_BY_NAME.set(key(name), raw));
    RAW_ITEMS_LIST.push(raw);
  }

  window.buildCatalogs = buildCatalogs = function buildCatalogsV10(rawItems) {
    RAW_ITEMS_BY_NAME.clear();
    RAW_ITEMS_LIST.length = 0;
    rawItems.forEach(addRawToIndex);
    const catalogs = PREVIOUS_BUILD_CATALOGS(rawItems);
    Object.values(catalogs).flat().forEach((item) => {
      item.parts = makeOwnedBlueprintList(item);
    });
    return catalogs;
  };

  function componentRawFor(item, framePart) {
    const base = key(item.name.replace(/ prime$/i, ""));
    const full = key(item.name);
    const part = key(framePart);
    const variants = [
      `${full} ${part}`,
      `${full} ${part} blueprint`,
      `${base} ${part}`,
      `${base} ${part} blueprint`,
      `${base} prime ${part}`,
      `${base} prime ${part} blueprint`
    ];

    for (const variant of variants) {
      const raw = RAW_ITEMS_BY_NAME.get(variant);
      if (raw?.components?.length) return raw;
    }

    return RAW_ITEMS_LIST.find((raw) => {
      const rawName = key(raw.name || "");
      return raw?.components?.length && rawName.includes(base) && rawName.includes(part);
    }) || null;
  }

  function mergeRequirements(requirements) {
    const merged = new Map();
    (requirements || []).forEach((req) => {
      if (!req?.name) return;
      const nested = req.requirements?.length ? mergeRequirements(req.requirements) : [];
      const reqKey = key(req.name);
      if (!merged.has(reqKey)) {
        merged.set(reqKey, {
          ...req,
          count: Number(req.count || 1),
          requirements: nested,
          drops: [...new Set(req.drops || [])],
          notes: clean(req.notes || "")
        });
      } else {
        const existing = merged.get(reqKey);
        existing.count = Number(existing.count || 1) + Number(req.count || 1);
        existing.requirements = mergeRequirements([...(existing.requirements || []), ...nested]);
        existing.drops = [...new Set([...(existing.drops || []), ...(req.drops || [])])];
        existing.notes = existing.notes || clean(req.notes || "");
      }
    });
    return [...merged.values()];
  }

  function recipeFromRaw(raw) {
    if (!raw?.components?.length) return [];
    return mergeRequirements(raw.components.map(normalizeRequirement).filter(Boolean));
  }

  window.frameComponentRequirements = frameComponentRequirements = function frameComponentRequirementsV10(component, item, framePart) {
    const raw = item && framePart ? componentRawFor(item, framePart) : null;
    const rawRecipe = recipeFromRaw(raw);
    if (rawRecipe.length) return rawRecipe;
    if (component?.requirements?.length) return mergeRequirements(component.requirements);
    return [];
  };

  window.mainBlueprintRequirements = mainBlueprintRequirements = function mainBlueprintRequirementsV10(item, trackable, resources) {
    if (item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory)) {
      return mergeRequirements([
        ...FRAME_PARTS.map((part) => ({ name: `Crafted ${part}`, count: 1, kind: "Crafted Component", requirements: [] })),
        { name: "Orokin Cell", count: 1, kind: "Resource", requirements: [] }
      ]);
    }

    return mergeRequirements([
      ...trackable.map((component) => ({ name: component.name, count: component.count || 1, kind: "Owned Part", requirements: [] })),
      ...resources
    ]);
  };

  window.makeOwnedBlueprintList = makeOwnedBlueprintList = function makeOwnedBlueprintListV10(item) {
    const direct = item.components.map(normalizeRequirement).filter(Boolean);
    const trackable = direct.filter((component) => isTrackableBlueprintComponent(component, item));
    const resources = direct.filter((component) => !trackable.includes(component));
    const parts = [{
      name: `${item.name} Blueprint`,
      displayName: `${item.name} Blueprint`,
      kind: "Blueprint",
      count: 1,
      notes: "Own this blueprint.",
      requirements: mainBlueprintRequirements(item, trackable, resources)
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
          requirements: frameComponentRequirements(component, item, framePart)
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
          requirements: mergeRequirements(component.requirements || [])
        });
      });
    }

    return parts.map((part) => ({
      ...part,
      requirements: mergeRequirements(part.requirements || []),
      key: `${item.id}::${clean(part.name).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`
    }));
  };

  function frameBossSource(item) {
    if (item.category !== "warframes" || !["warframes", "prime-warframes"].includes(item.subcategory)) return "";
    return FRAME_BOSS_SOURCES_V10[key(item.name.replace(/ prime$/i, ""))] || "";
  }

  window.partLabel = partLabel = function partLabelV10(part) {
    const count = Number(part.count || 1);
    return count > 1 ? `${part.name} x${count}` : part.name;
  };

  window.requirementList = requirementList = function requirementListV10(requirements) {
    const merged = mergeRequirements(requirements || []);
    if (!merged.length) {
      return `<p class="recipe-missing">Recipe not available from the API for this blueprint/part. Use the wiki link for exact materials.</p>`;
    }
    return `<ul>${merged.map((req) => `
      <li>
        ${escapeHtml(partLabel(req))}
        ${req.requirements?.length ? requirementList(req.requirements) : ""}
        ${req.drops?.length ? `<small>Drops: ${req.drops.map(escapeHtml).join(" · ")}</small>` : ""}
      </li>`).join("")}</ul>`;
  };

  window.partRow = partRow = function partRowV10(item, part) {
    const checked = Boolean(state.progress[item.id]?.parts?.[part.key]);
    const recipeCount = mergeRequirements(part.requirements || []).length;
    return `
      <details class="part-row recipe-row ${checked ? "is-checked" : ""}">
        <summary>
          <input type="checkbox" data-part-key="${escapeAttr(part.key)}" ${checked ? "checked" : ""} onclick="event.stopPropagation()">
          <span>
            <strong>${escapeHtml(partLabel(part))}</strong>
            <small>${escapeHtml(part.kind || "Blueprint")}${part.notes ? ` · ${escapeHtml(part.notes)}` : ""}</small>
          </span>
          <span class="recipe-arrow" aria-hidden="true">▾</span>
        </summary>
        <div class="inline-recipe">
          <strong>Recipe${recipeCount ? ` · ${recipeCount} items` : ""}</strong>
          ${requirementList(part.requirements)}
        </div>
      </details>`;
  };

  window.renderDetails = renderDetails = function renderDetailsV10() {
    const item = currentItems().find((candidate) => candidate.id === state.selected);
    if (!item) {
      el.details.className = "details-panel details-panel--empty";
      el.details.innerHTML = `<div class="empty-state"><h2>Select an item</h2><p>Choose a category and item to see owned blueprints, recipes, and mastery.</p></div>`;
      return;
    }

    item.parts = makeOwnedBlueprintList(item);
    const progress = itemProgress(item);
    const bossSource = frameBossSource(item);

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
      ${bossSource ? `<section class="boss-source-card"><strong>Frame boss source</strong><p>${escapeHtml(bossSource)}</p></section>` : ""}
      <div class="detail-progress-row">
        <div class="progress"><span style="width:${progress.percent}%"></span></div>
        <strong>${progress.done}/${progress.total} done · ${progress.percent}%</strong>
      </div>
      <button class="button button--primary button--wide" type="button" data-complete-toggle>${progress.buildComplete ? "Unmark owned blueprints" : "Mark all owned blueprints"}</button>
      <h3>Owned blueprints / parts</h3>
      <p class="details-help">Recipes are collapsed by default. Quantities are merged, e.g. Orokin Cell x2. Progress is saved locally in this browser.</p>
      <div class="checklist">${item.parts.map((part) => partRow(item, part)).join("")}${masteryRow(item)}</div>
      ${item.wikiaUrl ? `<a class="wiki-link" href="${escapeAttr(item.wikiaUrl)}" target="_blank" rel="noopener noreferrer">Open wiki</a>` : ""}`;

    const detailsImage = el.details.querySelector(".details-image");
    if (detailsImage) detailsImage.onerror = () => detailsImage.remove();
    el.details.querySelector("[data-complete-toggle]").addEventListener("click", () => toggleOwnedBlueprints(item));
    el.details.querySelectorAll("[data-part-key]").forEach((input) => input.addEventListener("change", () => setPart(item, input.dataset.partKey, input.checked)));
    el.details.querySelector("[data-mastered-key]").addEventListener("change", (event) => setMastered(item, event.target.checked));
  };

  if (state.loaded) {
    Object.values(state.catalogs).flat().forEach((item) => {
      item.parts = makeOwnedBlueprintList(item);
    });
    render();
  }
})();
