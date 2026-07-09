// v11 patch: make item details a dedicated page instead of a right-side panel.
(() => {
  const originalSelect = select;
  const originalRenderDetails = renderDetails;
  const originalSwitchCategory = switchCategory;
  const originalSwitchSub = switchSub;

  function openDetailPage(id) {
    state.selected = id;
    document.body.classList.add("detail-page-mode");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeDetailPage() {
    document.body.classList.remove("detail-page-mode");
    render();
    const selectedCard = document.querySelector(`[data-id="${CSS.escape(state.selected || "")}"]`);
    if (selectedCard) {
      selectedCard.scrollIntoView({ block: "center" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  window.select = select = function selectDedicatedPage(id) {
    openDetailPage(id);
  };

  window.switchCategory = switchCategory = function switchCategoryDedicatedPage(category) {
    document.body.classList.remove("detail-page-mode");
    originalSwitchCategory(category);
  };

  window.switchSub = switchSub = function switchSubDedicatedPage(sub) {
    document.body.classList.remove("detail-page-mode");
    originalSwitchSub(sub);
  };

  window.renderDetails = renderDetails = function renderDetailsDedicatedPage() {
    originalRenderDetails();
    if (!document.body.classList.contains("detail-page-mode")) return;

    const item = currentItems().find((candidate) => candidate.id === state.selected);
    if (!item) return;

    const nav = document.createElement("div");
    nav.className = "detail-page-nav";
    nav.innerHTML = `
      <button class="button" type="button" data-back-to-list>← Back to ${escapeHtml(CATEGORIES[state.category].label)}</button>
      <span>${escapeHtml(subLabel(item.category, item.subcategory))}</span>
    `;
    el.details.prepend(nav);
    nav.querySelector("[data-back-to-list]").addEventListener("click", closeDetailPage);
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("detail-page-mode")) {
      closeDetailPage();
    }
  });

  render();
})();
