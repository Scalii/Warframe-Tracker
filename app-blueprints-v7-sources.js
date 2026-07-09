// v7 patch: unified blueprint/part rows for every category + source/farm hints from API drops.
(() => {
  const UNKNOWN_SOURCE = "Source not available in the API. Open wiki for exact farm/vendor.";

  function dropEntries(drops) {
    if (!Array.isArray(drops)) return [];
    return drops
      .map((drop) => {
        if (typeof drop === "string") return drop;
        const location = drop.location || drop.place || drop.mission || drop.node || "";
        const type = drop.type || drop.rarity || drop.rotation || "";
        const chance = drop.chance ? `${drop.chance}%` : "";
        return [location, type, chance].filter(Boolean).join(" · ");
      })
      .filter(Boolean)
      .slice(0, 6);
  }

  function sourceTextFromDrops(drops, item) {
    const entries = dropEntries(drops);
    const text = entries.length ? entries.join(" • ") : UNKNOWN_SOURCE;
    return item?.tradable ? `${text} • Tradable` : text;
  }

  function withSource(part, drops, item) {
    const entries = dropEntries(drops);
    return {
      ...part,
      sourceEntries: entries,
      sourceText: sourceTextFromDrops(drops, item),
    };
  }

  function mainBlueprintDrops(item) {
    return item.raw?.drops || item.raw?.drop || [];
  }

  function componentDrops(component) {
    return component?.drops || [];
  }

  window.makeOwnedBlueprintList = makeOwnedBlueprintList = function makeOwnedBlueprintListWithSources(item) {
    const direct = item.components.map(normalizeRequirement).filter(Boolean);
    const trackable = direct.filter((component) => isTrackableBlueprintComponent(component, item));
    const resources = direct.filter((component) => !trackable.includes(component));

    const parts = [withSource({
      name: `${item.name} Blueprint`,
      displayName: `${item.name} Blueprint`,
      kind: "Blueprint",
      count: 1,
      notes: "Own this blueprint.",
      requirements: mainBlueprintRequirements(item, trackable, resources),
    }, mainBlueprintDrops(item), item)];

    if (item.category === "warframes" && ["warframes", "prime-warframes"].includes(item.subcategory)) {
      FRAME_PARTS.forEach((framePart) => {
        const component = findFrameComponent(trackable, item, framePart);
        addOwnedPart(parts, withSource({
          name: `${framePart} Blueprint`,
          displayName: `${framePart} Blueprint`,
          kind: "Component Blueprint",
          count: 1,
          notes: `Own the ${framePart} blueprint.`,
          requirements: frameComponentRequirements(component),
        }, componentDrops(component), item));
      });
    } else {
      trackable.forEach((component) => {
        addOwnedPart(parts, withSource({
          name: blueprintName(component.name),
          displayName: blueprintName(component.name),
          kind: component.kind || "Part Blueprint",
          count: component.count || 1,
          notes: "Own this blueprint/part.",
          requirements: component.requirements || [],
        }, componentDrops(component), item));
      });
    }

    return parts.map((part) => ({
      ...part,
      key: `${item.id}::${clean(part.name).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
    }));
  };

  window.renderDetails = renderDetails = function renderDetailsWithSources() {
    const item = currentItems().find((candidate) => candidate.id === state.selected);
    if (!item) {
      el.details.className = "details-panel details-panel--empty";
      el.details.innerHTML = `<div class="empty-state"><h2>Select an item</h2><p>Choose a category and item to see owned blueprints, recipes, sources, and mastery.</p></div>`;
      return;
    }

    if (!item.parts?.some((part) => Object.prototype.hasOwnProperty.call(part, "sourceText"))) {
      item.parts = makeOwnedBlueprintList(item);
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
      <section class="source-card">
        <strong>Blueprint / part sources</strong>
        ${sourceList(item)}
      </section>
      <div class="detail-progress-row">
        <div class="progress"><span style="width:${progress.percent}%"></span></div>
        <strong>${progress.done}/${progress.total} done · ${progress.percent}%</strong>
      </div>
      <button class="button button--primary button--wide" type="button" data-complete-toggle>${progress.buildComplete ? "Unmark owned blueprints" : "Mark all owned blueprints"}</button>
      <h3>Owned blueprints / parts</h3>
      <p class="details-help">Works for Warframes, weapons, companions, Archwings, and class-specific parts. Recipes and source hints stay inside their row; progress is saved locally.</p>
      <div class="checklist">${item.parts.map((part) => partRow(item, part)).join("")}${masteryRow(item)}</div>
      ${item.wikiaUrl ? `<a class="wiki-link" href="${escapeAttr(item.wikiaUrl)}" target="_blank" rel="noopener noreferrer">Open wiki</a>` : ""}`;

    const detailsImage = el.details.querySelector(".details-image");
    if (detailsImage) detailsImage.onerror = () => detailsImage.remove();
    el.details.querySelector("[data-complete-toggle]").addEventListener("click", () => toggleOwnedBlueprints(item));
    el.details.querySelectorAll("[data-part-key]").forEach((input) => input.addEventListener("change", () => setPart(item, input.dataset.partKey, input.checked)));
    el.details.querySelector("[data-mastered-key]").addEventListener("change", (event) => setMastered(item, event.target.checked));
  };

  function sourceList(item) {
    return `<ul>${item.parts.map((part) => `
      <li>
        <span>${escapeHtml(part.displayName || part.name)}</span>
        <small>${escapeHtml(part.sourceText || UNKNOWN_SOURCE)}</small>
      </li>`).join("")}</ul>`;
  }

  window.partRow = partRow = function partRowWithSourceAndRecipe(item, part) {
    const checked = Boolean(state.progress[item.id]?.parts?.[part.key]);
    return `
      <label class="part-row inline-recipe-row ${checked ? "is-checked" : ""}">
        <input type="checkbox" data-part-key="${escapeAttr(part.key)}" ${checked ? "checked" : ""}>
        <span>
          <strong>${escapeHtml(partLabel(part))}</strong>
          <small>${escapeHtml(part.kind || "Blueprint")}${part.notes ? ` · ${escapeHtml(part.notes)}` : ""}</small>
          <small class="part-source"><strong>Source:</strong> ${escapeHtml(part.sourceText || UNKNOWN_SOURCE)}</small>
          <span class="inline-recipe"><strong>Recipe</strong>${requirementList(part.requirements)}</span>
        </span>
      </label>`;
  };

  if (state.loaded) {
    Object.values(state.catalogs).flat().forEach((item) => {
      item.parts = makeOwnedBlueprintList(item);
      item.buildRequirements = typeof makeBuildRequirements === "function" ? makeBuildRequirements(item) : item.buildRequirements;
    });
    render();
  }
})();
