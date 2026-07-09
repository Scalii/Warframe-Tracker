// v6 patch: stable local progress + inline recipes inside each blueprint row.
(() => {
  const STABLE_PROGRESS_KEY = "wf-tracker:progress";
  const LEGACY_PROGRESS_KEYS = [
    "wf-tracker:progress:v5",
    "wf-tracker:progress:v4",
    "wf-tracker:progress:v3",
    "wf-tracker:progress:v2",
    "wf-tracker:progress:v1",
  ];

  function readStoredProgress() {
    for (const key of [STABLE_PROGRESS_KEY, ...LEGACY_PROGRESS_KEYS]) {
      try {
        const value = localStorage.getItem(key);
        if (value) return JSON.parse(value) || {};
      } catch {
        // Ignore broken legacy payloads.
      }
    }
    return {};
  }

  function writeStoredProgress(progress) {
    localStorage.setItem(STABLE_PROGRESS_KEY, JSON.stringify(progress));
  }

  try {
    const stored = readStoredProgress();
    if (typeof state !== "undefined") {
      state.progress = stored;
      writeStoredProgress(state.progress);
    }
  } catch (error) {
    console.warn("Could not migrate Warframe Tracker progress:", error);
  }

  window.saveProgress = saveProgress = function saveProgressStable() {
    try {
      writeStoredProgress(state.progress);
    } catch (error) {
      setStatus(`Progress could not be saved: ${error.message}`, "warning");
    }
  };

  window.exportProgress = exportProgress = function exportProgressStable() {
    const blob = new Blob([
      JSON.stringify({ exportedAt: new Date().toISOString(), version: 6, progress: state.progress }, null, 2),
    ], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "warframe-tracker-progress.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  window.renderDetails = renderDetails = function renderDetailsInlineRecipes() {
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
      <div class="detail-progress-row">
        <div class="progress"><span style="width:${progress.percent}%"></span></div>
        <strong>${progress.done}/${progress.total} done · ${progress.percent}%</strong>
      </div>
      <button class="button button--primary button--wide" type="button" data-complete-toggle>${progress.buildComplete ? "Unmark owned blueprints" : "Mark all owned blueprints"}</button>
      <h3>Owned blueprints / parts</h3>
      <p class="details-help">Crafting recipes are shown inside their blueprint/part row. Your checks are saved locally in this browser.</p>
      <div class="checklist">${item.parts.map((part) => partRow(item, part)).join("")}${masteryRow(item)}</div>
      ${item.wikiaUrl ? `<a class="wiki-link" href="${escapeAttr(item.wikiaUrl)}" target="_blank" rel="noopener noreferrer">Open wiki</a>` : ""}`;

    const detailsImage = el.details.querySelector(".details-image");
    if (detailsImage) detailsImage.onerror = () => detailsImage.remove();
    el.details.querySelector("[data-complete-toggle]").addEventListener("click", () => toggleOwnedBlueprints(item));
    el.details.querySelectorAll("[data-part-key]").forEach((input) => input.addEventListener("change", () => setPart(item, input.dataset.partKey, input.checked)));
    el.details.querySelector("[data-mastered-key]").addEventListener("change", (event) => setMastered(item, event.target.checked));
  };

  window.partRow = partRow = function partRowInlineRecipe(item, part) {
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

  window.requirementList = requirementList = function requirementListInline(requirements) {
    if (!requirements?.length) return `<p>No recipe found in the API.</p>`;
    return `<ul>${requirements.map((req) => `
      <li>
        ${escapeHtml(partLabel(req))}
        ${req.notes ? `<small>${escapeHtml(req.notes)}</small>` : ""}
        ${req.requirements?.length ? requirementList(req.requirements) : ""}
        ${req.drops?.length ? `<small>Drops: ${req.drops.map(escapeHtml).join(" · ")}</small>` : ""}
      </li>`).join("")}</ul>`;
  };

  window.setPart = setPart = function setPartStable(item, key, checked) {
    state.progress[item.id] ||= { parts: {}, mastered: false };
    state.progress[item.id].parts ||= {};
    state.progress[item.id].parts[key] = checked;
    saveProgress();
    render();
  };

  window.setMastered = setMastered = function setMasteredStable(item, checked) {
    state.progress[item.id] ||= { parts: {}, mastered: false };
    state.progress[item.id].mastered = checked;
    saveProgress();
    render();
  };

  window.toggleOwnedBlueprints = toggleOwnedBlueprints = function toggleOwnedBlueprintsStable(item) {
    const next = !itemProgress(item).buildComplete;
    state.progress[item.id] ||= { parts: {}, mastered: false };
    state.progress[item.id].parts ||= {};
    item.parts.forEach((part) => {
      state.progress[item.id].parts[part.key] = next;
    });
    saveProgress();
    render();
  };

  render();
})();
