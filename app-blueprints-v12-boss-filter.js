// v12 patch: add a Boss Farmable filter for normal Warframes.
(() => {
  const BOSS_FRAME_SOURCES = {
    atlas: "Jordas Golem — Jordas Golem Assassination, Eris",
    ember: "General Sargas Ruk — Tethys, Saturn",
    equinox: "Tyl Regor — Titania, Uranus",
    excalibur: "Lieutenant Lech Kril — War, Mars",
    frost: "Captain Vor & Lieutenant Lech Kril — Exta, Ceres",
    hydroid: "Councilor Vay Hek — Oro, Earth",
    loki: "Hyena Pack — Psamathe, Neptune",
    mag: "The Sergeant — Iliad, Phobos",
    mesa: "Mutalist Alad V — Mutalist Alad V Assassination, Eris",
    nekros: "Lephantis — Magnacidium, Deimos",
    nova: "Raptors — Naamah, Europa",
    nyx: "Phorid — Infested Invasion Assassination",
    rhino: "Jackal — Fossa, Venus",
    saryn: "Kela De Thaym — Merrow, Sedna",
    trinity: "Ambulas — Hades, Pluto",
    valkyr: "Alad V — Themisto, Jupiter",
    wisp: "Ropalolyst — The Ropalolyst, Jupiter"
  };

  function bossKey(item) {
    return clean(item?.name || "").toLowerCase().replace(/ prime$/i, "");
  }

  function isBossFarmableFrame(item) {
    return item?.category === "warframes"
      && item.subcategory === "warframes"
      && Boolean(BOSS_FRAME_SOURCES[bossKey(item)]);
  }

  if (!CATEGORIES.warframes.subs.some(([id]) => id === "boss-farmable")) {
    const allIndex = CATEGORIES.warframes.subs.findIndex(([id]) => id === "all");
    CATEGORIES.warframes.subs.splice(allIndex + 1, 0, ["boss-farmable", "Boss Farmable"]);
  }

  window.visibleItems = visibleItems = function visibleItemsBossFilter() {
    let items = currentItems();
    const sub = state.sub[state.category];

    if (state.category === "warframes" && sub === "boss-farmable") {
      items = items.filter(isBossFarmableFrame);
    } else if (sub !== "all") {
      items = items.filter((item) => item.subcategory === sub);
    }

    if (state.query) items = items.filter((item) => item.search.includes(state.query));
    if (state.hideComplete) items = items.filter((item) => !itemProgress(item).mastered);

    return [...items].sort((a, b) => {
      if (state.sort === "progress") return itemProgress(b).percent - itemProgress(a).percent || a.name.localeCompare(b.name, "en");
      if (state.sort === "mastery") return (a.masteryReq ?? 999) - (b.masteryReq ?? 999) || a.name.localeCompare(b.name, "en");
      return a.name.localeCompare(b.name, "en");
    });
  };

  window.subCounts = subCounts = function subCountsBossFilter() {
    const counts = { all: currentItems().length };
    currentItems().forEach((item) => {
      counts[item.subcategory] = (counts[item.subcategory] || 0) + 1;
      if (isBossFarmableFrame(item)) counts["boss-farmable"] = (counts["boss-farmable"] || 0) + 1;
    });
    return counts;
  };

  window.renderSubTabs = renderSubTabs = function renderSubTabsBossFilter() {
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
  };

  renderSubTabs();
  render();
})();
