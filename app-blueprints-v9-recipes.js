// v9 patch: resolve component recipes from the full items database, merge duplicate resources, and use a boss fallback map for frames.
(() => {
  const ITEM_INDEX = new Map();
  const ORIGINAL_BUILD_CATALOGS = buildCatalogs;
  const ORIGINAL_NORMALIZE = normalize;

  const FRAME_BOSS_SOURCES = {
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
    "wisp": "Ropalolyst — The Ropalolyst, Jupiter",
  };

  window.buildCatalogs = buildCatalogs = function buildCatalogsWithItemIndex(rawItems) {
    ITEM_INDEX.clear();
    rawItems.forEach((raw) => {
      const item = ORIGINAL_NORMALIZE(raw);
      if (!item) return;
      ITEM_INDEX.set(item.name.toLowerCase(), item);
      ITEM_INDEX.set(item.name.toLowerCase().replace(/ blueprint$/i, ""), item);
    });
    return ORIGINAL_BUILD_CATALOGS(rawItems);
  };

  function componentItem(item, partName) {
    const base = item.name.toLowerCase();
    const part = partName.toLowerCase();
    return ITEM_INDEX.get(`${base} ${part}`)
      || ITEM_INDEX.get(`${base} ${part} blueprint`)
      || ITEM_INDEX.get(`${base} prime ${part}`)
      || ITEM_INDEX.get(`${base} prime ${part} blueprint`);
  }

  function normalizeComponentRecipe(componentRaw) {
    if (!componentRaw?.components?.length) return [];
    return mergeRequirements(componentRaw.components.map(normalizeRequirement).filter(Boolean));
  }

  function mergeRequirements(requirements) {
    const merged = new Map();
    requirements.forEach((req) => {
      const nested = req.requirements?.length ? mergeRequirements(req.requirements) : [];
      const key = req.name.toLowerCase();
      if (!merged.has(key)) {
        merged.set(key, { ...req, count: Number(req.count || 1), requirements: nested });
      } else {
        const current = merged.get(key);
        current.count = Number(current.count || 1) + Number(req.count || 1);
        current.requirements = mergeRequirements([...(current.requirements || []), ...nested]);
        current.drops = [...new Set([...(current.drops || []), ...(req.drops || [])])];
        current.notes = current.notes || req.notes || "";
      }
    });
    return [...merged.values()];
  }

  window.frameComponentRequirements = frameComponentRequirements = function frameComponentRequirementsResolved(component, item, framePart) {
    const componentFromIndex = item && framePart ? componentItem(item, framePart) : null;
    let requirements = normalizeComponentRecipe(componentFromIndex?.raw || componentFromIndex) || [];

    if (!requirements.length && component?.requirements?.length) {
      requirements = mergeRequirements(component.requirements);
    }

    if (!requirements.length) {
      requirements = [{
        name: "Orokin Cell",
        kind: "Resource",
        count: 1,
        notes: "Fallback: exact component recipe was not available in the API data.",
        drops: [],
        requirements: [],
      }];
    }

    return mergeRequirements(requirements);
  };

  window.mainBlueprintRequirements = mainBlueprintRequirements = function mainBlueprintRequirementsDeduped(item, trackable, resources) {
    if (item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory)) {
      return mergeRequirements([
        ...FRAME_PARTS.map((part) => ({ name: `Crafted ${part}`, count: 1, kind: "Crafted Component", requirements: [] })),
        { name: "Orokin Cell", count: 1, kind: "Resource", requirements: [] },
      ]);
    }

    return mergeRequirements([
      ...trackable.map((component) => ({ name: component.name, count: component.count || 1, kind: "Owned Part", requirements: [] })),
      ...resources,
    ]);
  };

  window.makeOwnedBlueprintList = makeOwnedBlueprintList = function makeOwnedBlueprintListResolved(item) {
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
          requirements: frameComponentRequirements(component, item, framePart),
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
          requirements: mergeRequirements(component.requirements || []),
        });
      });
    }

    return parts.map((part) => ({
      ...part,
      key: `${item.id}::${clean(part.name).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
    }));
  };

  function frameBossSourceManual(item) {
    const normalized = item.name.toLowerCase().replace(/ prime$/i, "");
    return FRAME_BOSS_SOURCES[normalized] || "";
  }

  window.partLabel = partLabel = function partLabelXSuffixMerged(part) {
    const count = Number(part.count || 1);
    return count > 1 ? `${part.name} x${count}` : part.name;
  };

  window.requirementList = requirementList = function requirementListMerged(requirements) {
    const merged = mergeRequirements(requirements || []);
    if (!merged.length) return `<p>No recipe found in the API.</p>`;
    return `<ul>${merged.map((req) => `
      <li>
        ${escapeHtml(partLabel(req))}
        ${req.notes ? `<small>${escapeHtml(req.notes)}</small>` : ""}
        ${req.requirements?.length ? requirementList(req.requirements) : ""}
      </li>`).join("")}</ul>`;
  };

  window.renderDetails = renderDetails = function renderDetailsResolvedRecipes() {
    const item = currentItems().find((candidate) => candidate.id === state.selected);
    if (!item) {
      el.details.className = "details-panel details-panel--empty";
      el.details.innerHTML = `<div class="empty-state"><h2>Select an item</h2><p>Choose a category and item to see owned blueprints, recipes, and mastery.</p></div>`;
      return;
    }

    item.parts = makeOwnedBlueprintList(item);
    const progress = itemProgress(item);
    const bossSource = item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory) ? frameBossSourceManual(item) : "";

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
      <p class="details-help">Recipes are resolved from component items when available. Duplicate resources are combined, e.g. Orokin Cell x2.</p>
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
