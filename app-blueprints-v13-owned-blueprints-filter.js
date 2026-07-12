// v13 patch: add a toolbar filter for items where every blueprint/part checkbox is done.
(() => {
  state.onlyBlueprintsComplete = false;

  function ensureBlueprintsCompleteFilter() {
    const filters = document.querySelector(".filters");
    if (!filters || document.querySelector("#blueprintsCompleteInput")) return;

    const label = document.createElement("label");
    label.className = "checkbox-pill";
    label.title = "Show only items where all blueprint/part checkboxes are checked. Max Level 30 is ignored.";
    label.innerHTML = `<input id="blueprintsCompleteInput" type="checkbox"> Blueprints complete`;

    const hideMastered = document.querySelector("#hideCompleteInput")?.closest("label");
    if (hideMastered?.parentNode === filters) {
      hideMastered.insertAdjacentElement("afterend", label);
    } else {
      filters.appendChild(label);
    }

    label.querySelector("input").addEventListener("change", (event) => {
      state.onlyBlueprintsComplete = event.target.checked;
      resetList();
      render();
    });
  }

  function blueprintsComplete(item) {
    return Boolean(itemProgress(item).buildComplete);
  }

  window.visibleItems = visibleItems = function visibleItemsBlueprintsCompleteFilter() {
    let items = currentItems();
    const sub = state.sub[state.category];

    if (state.category === "warframes" && sub === "boss-farmable") {
      items = items.filter((item) => item?.category === "warframes" && item.subcategory === "warframes" && Boolean({
        atlas: true, ember: true, equinox: true, excalibur: true, frost: true, hydroid: true, loki: true,
        mag: true, mesa: true, nekros: true, nova: true, nyx: true, rhino: true, saryn: true,
        trinity: true, valkyr: true, wisp: true
      }[clean(item.name || "").toLowerCase().replace(/ prime$/i, "")]));
    } else if (sub !== "all") {
      items = items.filter((item) => item.subcategory === sub);
    }

    if (state.query) items = items.filter((item) => item.search.includes(state.query));
    if (state.hideComplete) items = items.filter((item) => !itemProgress(item).mastered);
    if (state.onlyBlueprintsComplete) items = items.filter(blueprintsComplete);

    return [...items].sort((a, b) => {
      if (state.sort === "progress") return itemProgress(b).percent - itemProgress(a).percent || a.name.localeCompare(b.name, "en");
      if (state.sort === "mastery") return (a.masteryReq ?? 999) - (b.masteryReq ?? 999) || a.name.localeCompare(b.name, "en");
      return a.name.localeCompare(b.name, "en");
    });
  };

  window.updateSummary = updateSummary = function updateSummaryBlueprintsCompleteFilter() {
    const items = visibleItems();
    const mastered = items.filter((item) => itemProgress(item).mastered).length;
    const blueprintsCompleteCount = items.filter(blueprintsComplete).length;
    const totals = items.reduce((acc, item) => {
      const progress = itemProgress(item);
      acc.done += progress.done;
      acc.total += progress.total;
      return acc;
    }, { done: 0, total: 0 });

    document.querySelector("#stat-total").textContent = state.loading && !state.loaded ? "…" : items.length.toLocaleString("en-US");
    document.querySelector("#stat-complete").textContent = state.onlyBlueprintsComplete ? blueprintsCompleteCount.toLocaleString("en-US") : mastered.toLocaleString("en-US");
    document.querySelector("#stat-parts").textContent = `${totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%`;
    document.querySelector("#stat-source").textContent = state.onlyBlueprintsComplete ? "Blueprints" : "Items API";
  };

  ensureBlueprintsCompleteFilter();
  render();
})();
